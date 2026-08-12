//! Tauri IPC commands + the `StreamChunk` wire shape (RESEARCH.md §Pattern 1).
//!
//! Existing project generation commands and the Phase 9 provider-agnostic chat
//! command live at this IPC boundary. Rust forwards tool calls; JS executes them.

use tauri::ipc::Channel;
use tauri::State;

use crate::error::AppError;
use crate::keychain;
use crate::llm::{self, ChatMessage, ChatResult, Provider};
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
    #[serde(rename = "tool_call")]
    ToolCall {
        name: String,
        arguments: serde_json::Value,
    },
}

/// Final return value of `generate_project`. The full accumulated content is
/// returned once streaming completes; token-by-token updates flow through the
/// `on_token` `Channel<StreamChunk>` before this resolves (D-02).
#[derive(serde::Serialize)]
pub struct GenerateProjectResult {
    pub content: String,
}

/// Stream a DeepSeek project-generation completion through a `Channel<StreamChunk>`,
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

/// Whether a DeepSeek API key is stored in the OS keychain (D-08: returns bool,
/// never the key itself). The frontend calls this on SettingsView mount to
/// decide whether to show the input card or the "key set" message.
#[tauri::command]
pub async fn has_api_key() -> Result<bool, AppError> {
    Ok(keychain::has_api_key())
}

/// Persist a DeepSeek API key to the OS keychain (D-07). Overwrites any existing
/// entry — the user can update an expired/invalid key without uninstalling.
#[tauri::command]
pub async fn set_api_key(key: String) -> Result<(), AppError> {
    keychain::set_api_key(&key)
}

/// Arguments for the provider-agnostic Phase 9 chat command.
/// ponytail: rename_all camelCase — Tauri IPC convention is JS-side camelCase,
/// matches frontend chatWithTools invoke payload (systemPrompt, requestId).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatArgs {
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<serde_json::Value>,
    pub system_prompt: String,
    pub provider: Provider,
    pub request_id: String,
}

/// Stream a chat completion and pass tool-call requests through to the JS tool loop.
#[tauri::command]
pub async fn chat(
    args: ChatArgs,
    on_token: Channel<StreamChunk>,
    state: State<'_, AppState>,
) -> Result<ChatResult, AppError> {
    let api_key = if args.provider.requires_api_key() {
        keychain::get_provider_key(&args.provider)?
    } else {
        String::new()
    };
    let cancel_token = tokio_util::sync::CancellationToken::new();
    state
        .cancellations
        .lock()
        .unwrap()
        .insert(args.request_id.clone(), cancel_token.clone());

    let result = tokio::select! {
        response = llm::chat_with_tools(
            args.provider,
            &api_key,
            args.messages,
            args.tools,
            args.system_prompt,
            &on_token,
            &cancel_token,
        ) => {
            state.cancellations.lock().unwrap().remove(&args.request_id);
            match response {
                Ok(result) => {
                    let _ = on_token.send(StreamChunk::Done);
                    Ok(result)
                }
                Err(error) => {
                    let _ = on_token.send(StreamChunk::Error {
                        message: error.to_string(),
                    });
                    Err(error)
                }
            }
        }
        _ = cancel_token.cancelled() => {
            state.cancellations.lock().unwrap().remove(&args.request_id);
            let _ = on_token.send(StreamChunk::Error {
                message: AppError::Cancelled.to_string(),
            });
            Err(AppError::Cancelled)
        }
    };

    result
}

/// Cancel an in-flight `chat` call by request id. Cancellation is idempotent.
#[tauri::command]
pub async fn cancel_chat(request_id: String, state: State<'_, AppState>) -> Result<(), AppError> {
    if let Some(token) = state.cancellations.lock().unwrap().remove(&request_id) {
        token.cancel();
    }
    Ok(())
}

/// Return provider keys in their stable wire order.
#[tauri::command]
pub async fn list_providers() -> Result<Vec<String>, AppError> {
    Ok(Provider::ALL
        .into_iter()
        .map(|provider| provider.to_string())
        .collect())
}

#[tauri::command]
pub async fn set_active_provider(
    provider: Provider,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    *state.active_provider.lock().unwrap() = provider;
    Ok(())
}

#[tauri::command]
pub async fn get_active_provider(state: State<'_, AppState>) -> Result<Provider, AppError> {
    Ok(*state.active_provider.lock().unwrap())
}

// The context names these commands set_provider/get_provider, while the task
// behavior uses the more explicit active-provider names. Keep both wire names
// available until the settings adapter chooses its final spelling.
#[tauri::command]
pub async fn set_provider(provider: Provider, state: State<'_, AppState>) -> Result<(), AppError> {
    set_active_provider(provider, state).await
}

#[tauri::command]
pub async fn get_provider(state: State<'_, AppState>) -> Result<Provider, AppError> {
    get_active_provider(state).await
}

#[tauri::command]
pub async fn has_provider_key(provider: Provider) -> Result<bool, AppError> {
    Ok(keychain::has_provider_key(&provider))
}

#[tauri::command]
pub async fn set_provider_key(provider: Provider, key: String) -> Result<(), AppError> {
    keychain::set_provider_key(&provider, &key)
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
        assert_eq!(
            json,
            r#"{"kind":"error","data":{"message":"rate limited"}}"#
        );
    }

    #[test]
    fn streamchunk_tool_call_serializes_tagged() {
        let chunk = StreamChunk::ToolCall {
            name: "createTask".to_string(),
            arguments: serde_json::json!({"title": "Ship it"}),
        };
        let json = serde_json::to_string(&chunk).unwrap();
        assert_eq!(
            json,
            r#"{"kind":"tool_call","data":{"name":"createTask","arguments":{"title":"Ship it"}}}"#
        );
    }
}
