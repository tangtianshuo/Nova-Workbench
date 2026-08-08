//! Rig LLM streaming — the heart of the Phase 3 IPC migration (RESEARCH.md §Pattern 5).
//!
//! This module is the ONLY caller of rig in the crate. Wave 2's `commands.rs`
//! `generate_project` calls `stream_generate(...)`, hands it the `Channel<StreamChunk>`
//! from the IPC boundary, and lets llm.rs own the prompt construction (D-24:
//! system_instruction is program-constructed, user input never enters it).

use futures::StreamExt;
use rig_core::client::CompletionClient;
use rig_core::completion::CompletionRequestBuilder;
use rig_core::streaming::StreamedAssistantContent;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

use crate::commands::StreamChunk;
use crate::error::AppError;

// D-24: system_instruction is program-constructed (no user input).
// user_prompt + files_context go ONLY into the user message. This is the basic
// prompt-injection mitigation called out in CONTEXT.md SEC-07.
const SYSTEM_INSTRUCTION: &str = "You are a senior PM assistant. Generate a structured project plan with milestones and tasks as JSON matching the requested schema. Output only JSON, no markdown fences.";

/// Stream a Gemini completion for the user's project-generation prompt.
///
/// Each text token is pushed through `on_token` as `StreamChunk::Token`. On
/// cancellation, returns `AppError::Cancelled` immediately. On any provider /
/// parse error, returns the mapped `AppError` variant.
///
/// `api_key` is fetched fresh by the caller (D-08 — never cached in AppState).
/// `model_name` is fixed at the call site for now; multi-model is a Phase 4
/// concern.
pub async fn stream_generate(
    api_key: &str,
    user_prompt: String,
    files_context: String,
    on_token: &Channel<StreamChunk>,
    cancel: &CancellationToken,
) -> Result<String, AppError> {
    // ponytail: api_key clones into the rig client builder (it needs 'static).
    // One clone per request is cheap; we don't cache the client because api_key
    // can change between calls (Pitfall 4).
    let client = rig_core::providers::gemini::Client::new(api_key.to_string())
        .map_err(|e| AppError::InternalError(format!("rig client init: {}", e)))?;
    let model = client.completion_model("gemini-2.0-flash");

    // D-24: system instruction goes via `.preamble(...)` (rig maps it to
    // Gemini's `system_instruction` field — verified in
    // providers/gemini/completion.rs::create_request_body). User input is
    // concatenated into the single user message and never enters the preamble.
    let user_content = if files_context.is_empty() {
        user_prompt
    } else {
        format!("{}\n\nFiles context:\n{}", user_prompt, files_context)
    };

    // ponytail: rig 0.41 API verified by examples/rig_stream_check.rs spike.
    // CompletionRequestBuilder::new(model, prompt).preamble(system).stream().await
    // yields StreamingCompletionResponse<R> which impls futures::Stream.
    let mut stream = CompletionRequestBuilder::new(model, user_content)
        .preamble(SYSTEM_INSTRUCTION.to_string())
        .stream()
        .await
        .map_err(|e| AppError::NetworkError(e.to_string()))?;

    let mut full = String::new();
    while let Some(item) = stream.next().await {
        // Cancellation is honored mid-stream — Stop button fires `cancel()`
        // and we return immediately on the next chunk boundary.
        if cancel.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        match item {
            Ok(StreamedAssistantContent::Text(text)) => {
                full.push_str(&text.text);
                // ponytail: Channel::send is infallible from the call site's
                // perspective (it returns a Result but the only failure mode is
                // a disconnected frontend, in which case we want to stop sending
                // anyway). We log-and-continue — a single send failure should
                // not abort an otherwise-healthy stream.
                let _ = on_token.send(StreamChunk::Token { text: text.text });
            }
            // ToolCall / Reasoning / FinalResponse variants — ignored for plain
            // text generation. If Phase 4 needs them, branch here.
            Ok(_) => continue,
            Err(e) => {
                let _ = on_token.send(StreamChunk::Error {
                    message: e.to_string(),
                });
                return Err(AppError::ParseError(e.to_string()));
            }
        }
    }
    Ok(full)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The system instruction must be a compile-time constant (D-24). This test
    /// guards against accidentally interpolating user input into it during a
    /// future refactor.
    #[test]
    fn system_instruction_is_const_and_mentions_json() {
        // Compile-time check: SYSTEM_INSTRUCTION is &'static str.
        const _IS_STATIC: &'static str = SYSTEM_INSTRUCTION;
        // The PM contract requires JSON output — the prompt must say so.
        assert!(
            SYSTEM_INSTRUCTION.to_lowercase().contains("json"),
            "SYSTEM_INSTRUCTION must request JSON output"
        );
        // Prompt-injection guardrail: no {user_input}-shaped format hole.
        assert!(
            !SYSTEM_INSTRUCTION.contains("{user") && !SYSTEM_INSTRUCTION.contains("{}"),
            "SYSTEM_INSTRUCTION must not have format placeholders"
        );
    }

    /// Cancellation flag flips true on `cancel()` and we can observe it from
    /// the stream loop. This is a behavioral check on the contract that
    /// `stream_generate` relies on — it does NOT exercise rig (no network).
    #[tokio::test]
    async fn cancellation_token_observed() {
        let token = tokio_util::sync::CancellationToken::new();
        assert!(!token.is_cancelled());
        token.cancel();
        assert!(token.is_cancelled());
    }
}
