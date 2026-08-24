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
