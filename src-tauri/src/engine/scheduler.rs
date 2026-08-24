// src-tauri/src/engine/scheduler.rs
// Phase 24 (24-01) — run concurrency gate: MAX_CONCURRENT=3 + FIFO queue.
// Explicit VecDeque (not a semaphore) because FIFO order and queue contents
// must be readable for the tray menu (24-02 snapshot()).
// Per-run DB connections made this possible: the old single-slot
// EngineDb take/restore ("engine busy") is gone.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

/// Concurrent run cap (24-CONTEXT 并发决策: 上限 3 + FIFO 排队).
pub const MAX_CONCURRENT: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunStatus {
    Queued,
    Running,
}

/// One tray-menu row (24-02): run identity + session jump target + display title.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunEntry {
    pub run_id: String,
    pub session_id: String,
    pub title: String,
    pub status: RunStatus,
}

impl RunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            RunStatus::Queued => "queued",
            RunStatus::Running => "running",
        }
    }
}

/// acquire() failure when the run was cancelled before a slot was granted.
#[derive(Debug)]
pub struct Cancelled;

struct Waiter {
    run_id: String,
    tx: oneshot::Sender<()>,
}

#[derive(Default)]
struct SchedState {
    active: Vec<String>,
    queue: VecDeque<Waiter>,
}

struct Inner {
    state: Mutex<SchedState>,
    /// run_id → (session_id, session_title) — tray jump/display data (24-02).
    meta: Mutex<HashMap<String, (String, String)>>,
    /// Tray rebuild hook (24-02): fired with a fresh snapshot after every
    /// lifecycle change. Tests leave this unset.
    on_change: Mutex<Option<Box<dyn Fn(&[RunEntry]) + Send>>>,
}

/// Shared run scheduler. Clone is cheap (Arc inside); hang one off AppState.
#[derive(Clone)]
pub struct Scheduler(Arc<Inner>);

/// Drop releases the slot and promotes the FIFO head (if any).
pub struct Permit {
    inner: Arc<Inner>,
    run_id: String,
}

/// Promote queue heads while capacity allows; skips waiters whose receiver is
/// already gone (cancel raced the promotion — their acquire task cleans up).
fn promote(state: &mut SchedState) {
    while state.active.len() < MAX_CONCURRENT {
        let Some(waiter) = state.queue.pop_front() else { break };
        state.active.push(waiter.run_id.clone());
        if waiter.tx.send(()).is_ok() {
            break;
        }
        state.active.pop();
    }
}

/// Remove a run from active (slot released) and promote the queue.
fn release(state: &mut SchedState, run_id: &str) {
    state.active.retain(|id| id != run_id);
    promote(state);
}

impl Scheduler {
    pub fn new() -> Self {
        Scheduler(Arc::new(Inner {
            state: Mutex::new(SchedState::default()),
            meta: Mutex::new(HashMap::new()),
            on_change: Mutex::new(None),
        }))
    }

    /// Queue-position read for the tray menu (24-02) and tests.
    pub fn snapshot(&self) -> Vec<(String, RunStatus)> {
        let state = self.0.state.lock().unwrap();
        state
            .active
            .iter()
            .map(|id| (id.clone(), RunStatus::Running))
            .chain(state.queue.iter().map(|w| (w.run_id.clone(), RunStatus::Queued)))
            .collect()
    }

    /// Tray-facing snapshot (24-02): same order as snapshot() but with session
    /// jump target and display title. Runs without registered meta (raw invoke
    /// callers) fall back to empty strings — still listed, still jumpable by
    /// run_id prefix display only.
    pub fn snapshot_detailed(&self) -> Vec<RunEntry> {
        self.0.snapshot_detailed()
    }

    /// Attach the run's (session_id, title) before acquire; engine_run pairs
    /// this with unregister on every exit path.
    pub fn register(&self, run_id: &str, session_id: String, title: String) {
        self.0.meta.lock().unwrap().insert(run_id.to_string(), (session_id, title));
    }

    pub fn unregister(&self, run_id: &str) {
        self.0.meta.lock().unwrap().remove(run_id);
    }

    /// Tray rebuild hook (24-02). lib.rs setup installs a closure that calls
    /// tray::rebuild with the passed snapshot.
    pub fn set_on_change(&self, cb: Box<dyn Fn(&[RunEntry]) + Send>) {
        *self.0.on_change.lock().unwrap() = Some(cb);
    }

    /// Fire on_change with a fresh snapshot. MUST be called with no scheduler
    /// lock held (the callback re-enters snapshot_detailed).
    fn notify(&self) {
        self.0.notify();
    }

    /// Acquire a run slot. Returns immediately while under cap; otherwise the
    /// run is enqueued (on_queued fires so the caller can push a "queued"
    /// lifecycle event) and the future resolves when a slot frees (FIFO) —
    /// or fails with Cancelled when the token fires first.
    pub async fn acquire(
        &self,
        run_id: &str,
        cancel: CancellationToken,
        on_queued: impl FnOnce(),
    ) -> Result<Permit, Cancelled> {
        let (tx, rx) = oneshot::channel();
        {
            let mut state = self.0.state.lock().unwrap();
            if state.active.len() < MAX_CONCURRENT {
                state.active.push(run_id.to_string());
                drop(state);
                self.notify();
                return Ok(Permit { inner: self.0.clone(), run_id: run_id.to_string() });
            }
            on_queued();
            state.queue.push_back(Waiter { run_id: run_id.to_string(), tx });
        }
        self.notify();
        tokio::select! {
            _ = cancel.cancelled() => {
                {
                    let mut state = self.0.state.lock().unwrap();
                    let was_queued = state.queue.iter().any(|w| w.run_id == run_id);
                    state.queue.retain(|w| w.run_id != run_id);
                    if !was_queued {
                        // Promotion raced the cancel — the permit leaked into
                        // active; release it so the slot is not stranded.
                        release(&mut state, run_id);
                    }
                }
                self.notify();
                Err(Cancelled)
            }
            res = rx => match res {
                Ok(()) => Ok(Permit { inner: self.0.clone(), run_id: run_id.to_string() }),
                Err(_) => Err(Cancelled),
            }
        }
    }
}

impl Inner {
    fn snapshot_detailed(&self) -> Vec<RunEntry> {
        let state = self.state.lock().unwrap();
        let meta = self.meta.lock().unwrap();
        let row = |id: &String, status: RunStatus| {
            let (session_id, title) = meta.get(id).cloned().unwrap_or_default();
            RunEntry { run_id: id.clone(), session_id, title, status }
        };
        state
            .active
            .iter()
            .map(|id| row(id, RunStatus::Running))
            .chain(state.queue.iter().map(|w| row(&w.run_id, RunStatus::Queued)))
            .collect()
    }

    fn notify(&self) {
        let cb = self.on_change.lock().unwrap();
        if let Some(cb) = cb.as_ref() {
            cb(&self.snapshot_detailed());
        }
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for Permit {
    fn drop(&mut self) {
        {
            let mut state = self.inner.state.lock().unwrap();
            release(&mut state, &self.run_id);
        }
        self.inner.notify();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
    }

    #[test]
    fn cap_three_then_fifo_promotion() {
        let sched = Scheduler::new();
        rt().block_on(async {
            let p1 = sched.acquire("r1", CancellationToken::new(), || {}).await.unwrap();
            let _p2 = sched.acquire("r2", CancellationToken::new(), || {}).await.unwrap();
            let _p3 = sched.acquire("r3", CancellationToken::new(), || {}).await.unwrap();

            // 4th run queues (Test 1).
            let queued = Arc::new(AtomicBool::new(false));
            let flag = queued.clone();
            let handle = tokio::spawn({
                let sched = sched.clone();
                async move { sched.acquire("r4", CancellationToken::new(), move || flag.store(true, Ordering::SeqCst)).await }
            });
            while !queued.load(Ordering::SeqCst) {
                tokio::task::yield_now().await;
            }
            assert_eq!(
                sched.snapshot(),
                vec![
                    ("r1".into(), RunStatus::Running),
                    ("r2".into(), RunStatus::Running),
                    ("r3".into(), RunStatus::Running),
                    ("r4".into(), RunStatus::Queued),
                ]
            );

            drop(p1); // FIFO: r4 promoted (Test 1).
            let p4 = handle.await.unwrap().expect("r4 promoted");
            assert_eq!(
                sched.snapshot(),
                vec![
                    ("r2".into(), RunStatus::Running),
                    ("r3".into(), RunStatus::Running),
                    ("r4".into(), RunStatus::Running),
                ]
            );
            drop(p4);
        });
    }

    #[test]
    fn cancel_queued_dequeues_without_consuming_slot() {
        let sched = Scheduler::new();
        rt().block_on(async {
            let p1 = sched.acquire("r1", CancellationToken::new(), || {}).await.unwrap();
            let _p2 = sched.acquire("r2", CancellationToken::new(), || {}).await.unwrap();
            let _p3 = sched.acquire("r3", CancellationToken::new(), || {}).await.unwrap();

            let cancel4 = CancellationToken::new();
            let handle = tokio::spawn({
                let sched = sched.clone();
                let cancel = cancel4.clone();
                async move { sched.acquire("r4", cancel, || {}).await.is_err() }
            });
            // Wait until r4 is parked in the queue, then cancel it.
            while sched.snapshot().iter().all(|(id, _)| id != "r4") {
                tokio::task::yield_now().await;
            }
            cancel4.cancel();
            assert!(handle.await.unwrap(), "queued run cancels immediately");
            assert!(sched.snapshot().iter().all(|(id, _)| id != "r4"), "dequeued");

            // Cancel consumed no slot: after one permit drops, r5 starts
            // immediately (no phantom active entry, no stale queue head).
            drop(p1);
            let p5 = sched.acquire("r5", CancellationToken::new(), || {}).await.unwrap();
            assert_eq!(sched.snapshot(), vec![
                ("r2".into(), RunStatus::Running),
                ("r3".into(), RunStatus::Running),
                ("r5".into(), RunStatus::Running),
            ]);
            drop(p5);
        });
    }

    #[test]
    fn cancel_running_releases_slot_via_permit_drop() {
        let sched = Scheduler::new();
        rt().block_on(async {
            let cancel = CancellationToken::new();
            let p1 = sched.acquire("r1", cancel.clone(), || {}).await.unwrap();
            cancel.cancel(); // engine_cancel semantics: token fires
            drop(p1); // permit drop releases the slot (cancel itself doesn't)
            assert!(sched.snapshot().is_empty());
        });
    }

    /* === 24-04 SCHED-04: cancel full-chain integration (fake LLM + WAL file DB
       + scheduler + engine_cancel_inner — the engine_run lifecycle minus the
       Tauri shell: registry insert → register → acquire → blocking-thread loop
       → registry remove + unregister + permit drop on every exit path). === */

    use crate::engine::db::testing::{file_conn, open_file};
    use crate::engine::event_log;
    use crate::engine::exec;
    use crate::engine::chat_session::LlmMessage;
    use crate::engine::loop_runner::{self, BoxLlmFuture, Llm, LlmToolCall, LlmTurn, LoopContext};
    use crate::state::AppState;

    struct FakeLlm(Mutex<std::collections::VecDeque<LlmTurn>>);
    impl FakeLlm {
        fn new(turns: Vec<LlmTurn>) -> Self {
            FakeLlm(Mutex::new(turns.into_iter().collect()))
        }
    }
    impl Llm for FakeLlm {
        fn chat(&mut self, _m: Vec<LlmMessage>, _s: String, _t: loop_runner::TokenSink) -> BoxLlmFuture {
            let turn = self.0.lock().unwrap().pop_front().expect("scripted turn");
            Box::pin(async move { Ok(turn) })
        }
    }

    /// engine_run's blocking-thread half: per-run Connection + current-thread
    /// runtime + run_tool_loop. Returns the loop result for the join.
    fn spawn_run(
        db_path: std::path::PathBuf,
        session: String,
        turns: Vec<LlmTurn>,
        cancel: CancellationToken,
        workspace_root: Option<std::path::PathBuf>,
    ) -> std::thread::JoinHandle<Result<crate::engine::channel::EngineRunResult, loop_runner::LoopError>> {
        std::thread::spawn(move || {
            let conn = open_file(&db_path);
            let ctx = LoopContext {
                conn: &conn,
                session_id: session,
                user_message: "跑一下".into(),
                workspace_id: None,
                product_id: None,
                provider: "deepseek".into(),
                ollama_model: None,
                workspace_root,
                core_context: "核心事实".into(),
                llm: Box::new(FakeLlm::new(turns)),
                summarizer: None,
            };
            let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
            rt.block_on(loop_runner::run_tool_loop(ctx, cancel, Arc::new(|_| {})))
        })
    }

    /// Long-running whitelisted command (23-02 cancel/timeout pair).
    fn sleep_pair() -> (&'static str, Vec<String>) {
        if cfg!(windows) {
            ("ping", vec!["-n".into(), "15".into(), "127.0.0.1".into()])
        } else {
            ("sleep", vec!["15".into()])
        }
    }

    fn cancel_run(state: &AppState, run_id: &str) {
        crate::engine::commands::engine_cancel_inner(state, run_id).unwrap();
    }

    #[test]
    fn cancel_running_run_kills_exec_stream_stays_clean_siblings_unaffected() {
        let db = file_conn("cancel_chain_running");
        let db_path = std::path::PathBuf::from(db.path().expect("file-backed").to_string());
        let (sleep_cmd, sleep_args) = sleep_pair();
        exec::add_command_to_whitelist(&db, sleep_cmd).unwrap();
        let state = AppState::new();
        let sched = Scheduler::new();

        rt().block_on(async move {
            // runA (running, exec long command) — engine_run lifecycle shape.
            let cancel_a = CancellationToken::new();
            state.engine_runs.lock().unwrap().insert("runA".into(), cancel_a.clone());
            sched.register("runA", "sA".into(), "A".into());
            let permit_a = sched.acquire("runA", cancel_a.clone(), || {}).await.unwrap();
            // runB (running, pure reply turn) — must be unaffected by A's cancel.
            let cancel_b = CancellationToken::new();
            state.engine_runs.lock().unwrap().insert("runB".into(), cancel_b.clone());
            sched.register("runB", "sB".into(), "B".into());
            let permit_b = sched.acquire("runB", cancel_b.clone(), || {}).await.unwrap();
            // filler takes the 3rd slot so runC genuinely queues.
            let permit_f = sched.acquire("filler", CancellationToken::new(), || {}).await.unwrap();
            // runC queued.
            let cancel_c = CancellationToken::new();
            state.engine_runs.lock().unwrap().insert("runC".into(), cancel_c.clone());
            sched.register("runC", "sC".into(), "C".into());
            let c_handle = tokio::spawn({
                let sched = sched.clone();
                let cancel = cancel_c.clone();
                async move { sched.acquire("runC", cancel, || {}).await }
            });
            while sched.snapshot().iter().all(|(id, _)| id != "runC") {
                tokio::task::yield_now().await;
            }
            assert_eq!(sched.snapshot().iter().find(|(id, _)| id == "runC").unwrap().1, RunStatus::Queued);

            let a_turns = vec![
                LlmTurn {
                    content: String::new(),
                    tool_calls: vec![LlmToolCall {
                        name: "exec".into(),
                        arguments: serde_json::json!({"command": sleep_cmd, "args": sleep_args}),
                    }],
                },
                // Unreached: the cancel check at iteration top fires first.
                LlmTurn { content: "unreached".into(), tool_calls: vec![] },
            ];
            let handle_a = spawn_run(db_path.clone(), "sA".into(), a_turns, cancel_a.clone(), Some(std::env::temp_dir()));
            let handle_b = spawn_run(db_path.clone(), "sB".into(), vec![LlmTurn { content: "done-B".into(), tool_calls: vec![] }], cancel_b, None);

            // Wait until A is inside the exec subprocess (its tool_call landed).
            loop {
                let queued_a = event_log::list_events(&db, "sA").unwrap().into_iter().any(|e| e.event_type == "tool_call");
                if queued_a { break; }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            std::thread::sleep(std::time::Duration::from_millis(100)); // inside spawn_core

            // Cancel A through the engine_cancel seam (token cancel + dequeue path).
            cancel_run(&state, "runA");
            let result_a = handle_a.join().unwrap();
            assert!(matches!(result_a, Err(loop_runner::LoopError::Cancelled)), "A unwound as Cancelled, got {result_a:?}");
            // engine_run exit-path cleanup (registry remove + unregister + permit drop).
            state.engine_runs.lock().unwrap().remove("runA");
            sched.unregister("runA");
            drop(permit_a);

            // runC (FIFO head) promoted into the freed slot.
            let permit_c = c_handle.await.unwrap().expect("C promoted after A's cancel");

            // B unaffected: completes its own turn normally.
            let result_b = handle_b.join().unwrap().expect("B unaffected by A's cancel");
            assert_eq!(result_b.content, "done-B");
            state.engine_runs.lock().unwrap().remove("runB");
            sched.unregister("runB");
            drop(permit_b);
            drop(permit_f);

            // No residue: scheduler snapshot and engine_runs registry both clean.
            drop(permit_c);
            state.engine_runs.lock().unwrap().remove("runC");
            sched.unregister("runC");
            assert!(sched.snapshot().is_empty(), "scheduler has no residue: {:?}", sched.snapshot());
            assert!(state.engine_runs.lock().unwrap().is_empty(), "engine_runs registry empty");

            // PORT-01: A's event log has no orphan tool_call — the cancelled
            // exec landed a Failed tool_result before the loop unwound.
            let events_a = event_log::list_events(&db, "sA").unwrap();
            assert!(event_log::check_event_stream(&events_a).is_ok(), "sA stream balanced");
            let cancelled_result = events_a.iter().find(|e| e.event_type == "tool_result").expect("cancelled exec settled");
            assert_eq!(cancelled_result.payload["ok"], false);
            assert_eq!(cancelled_result.payload["error"], "cancelled");
            // sB finished cleanly too.
            assert!(event_log::check_event_stream(&event_log::list_events(&db, "sB").unwrap()).is_ok());
        });
    }

    #[test]
    fn cancel_queued_run_dequeues_immediately_and_frees_no_slot() {
        let state = AppState::new();
        let sched = Scheduler::new();
        rt().block_on(async move {
            let _p1 = sched.acquire("r1", CancellationToken::new(), || {}).await.unwrap();
            let _p2 = sched.acquire("r2", CancellationToken::new(), || {}).await.unwrap();
            let _p3 = sched.acquire("r3", CancellationToken::new(), || {}).await.unwrap();
            let cancel_c = CancellationToken::new();
            state.engine_runs.lock().unwrap().insert("runC".into(), cancel_c.clone());
            sched.register("runC", "sC".into(), "C".into());
            let handle = tokio::spawn({
                let sched = sched.clone();
                let cancel = cancel_c.clone();
                async move { sched.acquire("runC", cancel, || {}).await }
            });
            while sched.snapshot().iter().all(|(id, _)| id != "runC") {
                tokio::task::yield_now().await;
            }

            // engine_cancel seam → acquire's cancel branch dequeues immediately.
            cancel_run(&state, "runC");
            assert!(handle.await.unwrap().is_err(), "queued run cancels immediately");
            assert!(sched.snapshot().iter().all(|(id, _)| id != "runC"), "no scheduler residue");
            assert!(state.engine_runs.lock().unwrap().is_empty(), "registry entry removed");
            sched.unregister("runC");

            // Cancel took no slot: after every permit drops, snapshot is empty.
            drop(_p1);
            drop(_p2);
            drop(_p3);
            assert!(sched.snapshot().is_empty());
        });
    }

    // 24-02: tray-facing detailed snapshot + on_change rebuild hook.
    #[test]
    fn detailed_snapshot_carries_meta_and_notifies_on_lifecycle() {
        let sched = Scheduler::new();
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        sched.set_on_change(Box::new(move |runs: &[RunEntry]| {
            sink.lock().unwrap().push(runs.to_vec());
        }));
        rt().block_on(async {
            sched.register("r1", "s1".into(), "写周报".into());
            let _p1 = sched.acquire("r1", CancellationToken::new(), || {}).await.unwrap();
            // Fill the cap, then r4 enqueues.
            let _p2 = sched.acquire("r2", CancellationToken::new(), || {}).await.unwrap();
            let _p3 = sched.acquire("r3", CancellationToken::new(), || {}).await.unwrap();
            let handle = tokio::spawn({
                let sched = sched.clone();
                async move { sched.acquire("r4", CancellationToken::new(), || {}).await }
            });
            while sched.snapshot().iter().all(|(id, _)| id != "r4") {
                tokio::task::yield_now().await;
            }
            let detailed = sched.snapshot_detailed();
            assert_eq!(detailed.len(), 4);
            assert_eq!(
                detailed[0],
                RunEntry { run_id: "r1".into(), session_id: "s1".into(), title: "写周报".into(), status: RunStatus::Running }
            );
            assert_eq!(detailed[3].status, RunStatus::Queued);
            assert_eq!(detailed[3].title, ""); // unregistered raw caller
            drop(_p1);
            drop(handle.await.unwrap().unwrap());
        });
        // on_change fired: start r1, enqueue r4, promote r4, drop r4, drops r2/r3.
        let fired = events.lock().unwrap();
        assert!(fired.len() >= 4, "lifecycle changes fired the tray hook");
        assert!(fired.iter().any(|runs| runs.len() == 4 && runs[3].status == RunStatus::Queued));
        assert!(fired.last().unwrap().is_empty(), "final state empty");
    }
}
