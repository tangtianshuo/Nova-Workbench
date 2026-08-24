// src-tauri/src/engine/scheduler.rs
// Phase 24 (24-01) — run concurrency gate: MAX_CONCURRENT=3 + FIFO queue.
// Explicit VecDeque (not a semaphore) because FIFO order and queue contents
// must be readable for the tray menu (24-02 snapshot()).
// Per-run DB connections made this possible: the old single-slot
// EngineDb take/restore ("engine busy") is gone.

use std::collections::VecDeque;
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
        Scheduler(Arc::new(Inner { state: Mutex::new(SchedState::default()) }))
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
                return Ok(Permit { inner: self.0.clone(), run_id: run_id.to_string() });
            }
            on_queued();
            state.queue.push_back(Waiter { run_id: run_id.to_string(), tx });
        }
        tokio::select! {
            _ = cancel.cancelled() => {
                let mut state = self.0.state.lock().unwrap();
                let was_queued = state.queue.iter().any(|w| w.run_id == run_id);
                state.queue.retain(|w| w.run_id != run_id);
                if !was_queued {
                    // Promotion raced the cancel — the permit leaked into
                    // active; release it so the slot is not stranded.
                    release(&mut state, run_id);
                }
                Err(Cancelled)
            }
            res = rx => match res {
                Ok(()) => Ok(Permit { inner: self.0.clone(), run_id: run_id.to_string() }),
                Err(_) => Err(Cancelled),
            }
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
        let mut state = self.inner.state.lock().unwrap();
        release(&mut state, &self.run_id);
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
}
