//! Tauri IPC commands + the `StreamChunk` wire shape (RESEARCH.md §Pattern 1).
//!
//! Wave 2 (plan 03-02) adds the four `#[tauri::command]` fns:
//! `generate_project`, `cancel_generate_project`, `has_api_key`, `set_api_key`.

use tauri::ipc::Channel;
use tauri::State;

use crate::error::AppError;
use crate::keychain;
use crate::llm;
use crate::state::AppState;

/// Streaming chunk sent from the Rust `generate_project` command to the JS
/// `Channel.onmessage` handler.
///
/// `#[serde(tag = "kind", content = "data")]` produces wire shape:
///   `{ "kind": "token", "data": { "text": "..." } }`
///   `{ "kind": "done",   "data": null }`
///   `{ "kind": "error",  "data": { "message": "..." } }`
///
/// Ponytail: enum-over-struct because `text` and `message` only make sense on
/// their own variant. The planner's D-02 spec was `{ kind, text, error }` flat;
/// the tag-and-content enum is the idiomatic Rust shape and the JS side branches
/// on `msg.kind` identically either way.
#[derive(serde::Serialize, Clone)]
#[serde(tag = "kind", content = "data")]
pub enum StreamChunk {
    #[serde(rename = "token")]
    Token { text: String },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { message: String },
}

/// Final return value of `generate_project`. The full accumulated content is
/// returned once streaming completes; token-by-token updates flow through the
/// `on_token` `Channel<StreamChunk>` before this resolves (D-02).
#[derive(serde::Serialize)]
pub struct GenerateProjectResult {
    pub content: String,
}

/// Stream a Gemini project-generation completion through a `Channel<StreamChunk>`,
/// racing the LLM stream against a per-`request_id` `CancellationToken` so the
/// frontend Stop button can halt mid-stream (D-03 + D-04 + D-05).
#[tauri::command]
pub async fn generate_project(
    prompt: String,
    files_context: String,
    request_id: String,
    on_token: Channel<StreamChunk>,
    state: State<'_, AppState>,
) -> Result<GenerateProjectResult, AppError> {
    // D-05 + RESEARCH.md §Pattern 2: register cancellation token before work begins.
    // ponytail: tokio_util::sync::CancellationToken — tokio-util dep was added in
    // Wave 1 for exactly this. `tokio::sync::CancellationToken` does not exist;
    // the plan's verbatim `tokio::sync::` is corrected here (03-02 instructions
    // Deviation 1).
    let cancel_token = tokio_util::sync::CancellationToken::new();
    state
        .cancellations
        .lock()
        .unwrap()
        .insert(request_id.clone(), cancel_token.clone());

    // D-08: fetch from keyring per-call. NEVER cache in AppState.
    // Pitfall 4: caching = stale key after user updates in Settings.
    let api_key = keychain::get_api_key()?;

    // Stream via Rig (D-10 + D-24). tokio::select! races stream against cancel.
    let result = tokio::select! {
        r = llm::stream_generate(&api_key, prompt, files_context, &on_token, &cancel_token) => {
            // ponytail: cleanup on BOTH branches (success + cancel) — defer-like.
            state.cancellations.lock().unwrap().remove(&request_id);
            match r {
                Ok(content) => {
                    // Deviation 2 from plan verbatim: Channel::send is synchronous
                    // (no .await). Discard the Result — a disconnected frontend
                    // shouldn't turn a successful stream into an error.
                    let _ = on_token.send(StreamChunk::Done);
                    Ok(GenerateProjectResult { content })
                }
                Err(e) => {
                    let _ = on_token.send(StreamChunk::Error {
                        message: e.to_string(),
                    });
                    Err(e)
                }
            }
        }
        _ = cancel_token.cancelled() => {
            state.cancellations.lock().unwrap().remove(&request_id);
            Err(AppError::Cancelled)
        }
    };

    result
}

/// Cancel an in-flight `generate_project` call by `request_id`. Idempotent —
/// returns Ok(()) whether or not the request_id was in the map (Pitfall: caller
/// may fire cancel after the stream already completed naturally).
#[tauri::command]
pub async fn cancel_generate_project(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    if let Some(token) = state.cancellations.lock().unwrap().remove(&request_id) {
        token.cancel();
    }
    // ponytail: no error if request_id not in map — idempotent cancel
    Ok(())
}

/// Whether a Gemini API key is stored in the OS keychain (D-08: returns bool,
/// never the key itself). The frontend calls this on SettingsView mount to
/// decide whether to show the input card or the "key set" message.
#[tauri::command]
pub async fn has_api_key() -> Result<bool, AppError> {
    Ok(keychain::has_api_key())
}

/// Persist a Gemini API key to the OS keychain (D-07). Overwrites any existing
/// entry — the user can update an expired/invalid key without uninstalling.
#[tauri::command]
pub async fn set_api_key(key: String) -> Result<(), AppError> {
    keychain::set_api_key(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn streamchunk_token_serializes_tagged() {
        let chunk = StreamChunk::Token {
            text: "hello".to_string(),
        };
        let json = serde_json::to_string(&chunk).unwrap();
        assert_eq!(json, r#"{"kind":"token","data":{"text":"hello"}}"#);
    }

    #[test]
    fn streamchunk_done_serializes_with_kind_only() {
        // serde omits the `data` field for unit variants even with
        // `content = "data"` (there's no content to serialize). JS branches
        // on msg.kind first, so the absence of `data` on the done variant is fine.
        let json = serde_json::to_string(&StreamChunk::Done).unwrap();
        assert_eq!(json, r#"{"kind":"done"}"#);
    }

    #[test]
    fn streamchunk_error_serializes_tagged() {
        let chunk = StreamChunk::Error {
            message: "rate limited".to_string(),
        };
        let json = serde_json::to_string(&chunk).unwrap();
        assert_eq!(json, r#"{"kind":"error","data":{"message":"rate limited"}}"#);
    }
}
