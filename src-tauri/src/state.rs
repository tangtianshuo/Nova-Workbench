//! AppState — Tauri-managed state shared across commands (RESEARCH.md §Pattern 2).
//!
//! Ponytail: `Mutex<HashMap<...>>` (not RwLock). The cancellation map is low-contention
//! — one insert at request start, one remove at request end, occasional cancel_generate_project
//! lookups. RwLock's reader/writer asymmetry buys nothing for a 3-key map.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::engine::scheduler::Scheduler;
use crate::llm::Provider;

pub struct AppState {
    /// request_id → cancellation token. Inserted by `generate_project` at request
    /// start, removed at request end (success OR error). `cancel_generate_project`
    /// looks up by request_id and fires `cancel()`.
    pub cancellations: Mutex<HashMap<String, tokio_util::sync::CancellationToken>>,
    /// Phase 22 (22-06) run registry: run_id → CancellationToken for `engine_run`.
    /// Same insert/remove lifecycle as `cancellations`; `engine_cancel` fires it.
    /// Idempotent: cancelling an already-removed run_id is Ok (run ended).
    pub engine_runs: Mutex<HashMap<String, tokio_util::sync::CancellationToken>>,
    /// Provider selected by Settings. API keys are intentionally not cached here.
    pub active_provider: Mutex<Provider>,
    /// Phase 24 (24-01) run scheduler: MAX_CONCURRENT=3 + FIFO queue.
    /// Shared handle (Arc inside) — engine_run acquires, engine_cancel's token
    /// dequeues via acquire's cancel branch.
    pub scheduler: Scheduler,
    /// 24-03 (SCHED-03): session id of the last background-notified run.
    /// Consumed by lib.rs on window focus → tray-open-session (click fallback).
    pub last_notified_session: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            cancellations: Mutex::new(HashMap::new()),
            engine_runs: Mutex::new(HashMap::new()),
            active_provider: Mutex::new(Provider::DeepSeek),
            scheduler: Scheduler::new(),
            last_notified_session: Mutex::new(None),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appstate_tracks_cancellation_tokens() {
        let state = AppState::new();
        let token = tokio_util::sync::CancellationToken::new();

        // Insert + lookup by request_id.
        state
            .cancellations
            .lock()
            .unwrap()
            .insert("req-1".to_string(), token.clone());

        assert!(
            state.cancellations.lock().unwrap().contains_key("req-1"),
            "request_id must be tracked after insert"
        );

        // Remove fires cancel.
        let removed = state.cancellations.lock().unwrap().remove("req-1");
        removed.expect("removed token must exist").cancel();
        assert!(token.is_cancelled(), "removed token must be fired");

        // Map is clean.
        assert!(
            state.cancellations.lock().unwrap().is_empty(),
            "map must be empty after remove"
        );
    }

    #[test]
    fn appstate_defaults_to_deepseek() {
        let state = AppState::new();
        assert_eq!(*state.active_provider.lock().unwrap(), Provider::DeepSeek);
    }
}
