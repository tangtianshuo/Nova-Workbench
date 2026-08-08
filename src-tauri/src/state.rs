//! AppState — Tauri-managed state shared across commands (RESEARCH.md §Pattern 2).
//!
//! Ponytail: `Mutex<HashMap<...>>` (not RwLock). The cancellation map is low-contention
//! — one insert at request start, one remove at request end, occasional cancel_generate_project
//! lookups. RwLock's reader/writer asymmetry buys nothing for a 3-key map.

use std::collections::HashMap;
use std::sync::Mutex;

pub struct AppState {
    /// request_id → cancellation token. Inserted by `generate_project` at request
    /// start, removed at request end (success OR error). `cancel_generate_project`
    /// looks up by request_id and fires `cancel()`.
    pub cancellations: Mutex<HashMap<String, tokio_util::sync::CancellationToken>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            cancellations: Mutex::new(HashMap::new()),
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
}
