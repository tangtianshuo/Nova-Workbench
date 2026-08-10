//! Phase 3 Wave 1 mandatory rig streaming spike (RESEARCH.md §Open Question 1, §Pitfall 3).
//! Originally written against the Gemini provider; switched to DeepSeek on
//! 2026-08-10 (UAT Issue #6 — the user holds a DeepSeek key, not a Gemini one).
//!
//! Run from src-tauri/ with `cargo run --example rig_stream_check` after exporting
//! DEEPSEEK_API_KEY. Verifies the exact rig 0.41 streaming API surface and prints
//! tokens to stdout as they arrive, so downstream `src/llm.rs` can hard-code the
//! method names with confidence.
//!
//! ---
//! ## VERIFIED rig 0.41 API surface (DeepSeek provider)
//!
//! - **Crate import path:** `rig_core::*` — NOT `rig::*`. The crate name is
//!   `rig-core` and Cargo exposes it under the snake_case identifier `rig_core`.
//! - **Provider client constructor:** `rig_core::providers::deepseek::Client::new(api_key)`
//!   returns `http_client::Result<Self>` (NOT `Self`). Must be `?`-propagated.
//!   The api_key can be `&str`, `String`, etc. — bearer auth, no prefix check.
//!   Base URL is fixed at `https://api.deepseek.com` (OpenAI-compatible path).
//! - **Model constants (providers/deepseek.rs):** `DEEPSEEK_V4_FLASH`,
//!   `DEEPSEEK_V4_PRO`. The legacy `DEEPSEEK_CHAT` / `DEEPSEEK_REASONER`
//!   ("deepseek-chat" / "deepseek-reasoner") are `#[deprecated]` — DeepSeek
//!   sunset them 2026-07-24; they alias v4-flash non-thinking / thinking modes.
//! - **Completion model:** `client.completion_model(model_name)` — synchronous,
//!   returns the model directly (no Result). Type is
//!   `openai::completion::GenericCompletionModel<DeepSeekExt>`.
//! - **Request builder pattern (canonical):**
//!   ```ignore
//!   CompletionRequestBuilder::new(model, prompt)
//!       .preamble(system.to_string())   // serialized as the `system` role message
//!       .stream()                        // returns Future
//!       .await?                          // -> StreamingCompletionResponse<Usage>
//!   ```
//!   - `.preamble(s)` becomes the SYSTEM message on the OpenAI-compatible wire
//!     (test deepseek_request_flattens_message_content_to_strings proves it).
//!   - There is NO `stream_prompt` method. The high-level entry point is
//!     `CompletionRequestBuilder::new(...).stream().await`.
//! - **Stream item shape:**
//!   - `StreamingCompletionResponse<R>` (src/streaming.rs) is provider-generic
//!     and impls `futures::Stream<Item = Result<StreamedAssistantContent<R>, CompletionError>>`.
//!     DeepSeek's `R = Usage` (prompt/completion/cache token counters).
//!   - Match `StreamedAssistantContent::Text(text_struct)` where
//!     `text_struct.text: String` is the token delta.
//!   - Other variants: `ToolCall`, `ToolCallDelta`, `Reasoning`, `ReasoningDelta`,
//!     `FinalResponse`. For PM use case we only need `Text`. Thinking-mode
//!     models (deepseek-reasoner lineage) interleave `Reasoning` items.
//! - **Errors:** a non-2xx (e.g. 401 invalid key) surfaces as
//!   `CompletionError::HttpError(InvalidStatusCodeWithMessage(status, body))`;
//!   DeepSeek's 401 body contains `"Authentication Fails"` — the frontend's
//!   humanizeAIError matches the 'auth' substring (see api.ts branch order).
//! - **StreamExt import:** `use futures::StreamExt;` — rig-core depends on
//!   `futures` but Cargo does not expose transitive deps; it is an explicit
//!   entry in our Cargo.toml. Do NOT reach for `tokio_stream::StreamExt`.
//!
//! ## Ponytail
//!
//! This is the ONLY rig API documentation that downstream tasks get. If
//! `src/llm.rs` needs to change the prompt-building strategy or the provider,
//! update the comments above AND re-run this spike.

use std::env;

use futures::StreamExt;
use rig_core::client::CompletionClient;
use rig_core::completion::CompletionRequestBuilder;
use rig_core::providers::deepseek;
use rig_core::streaming::StreamedAssistantContent;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = env::var("DEEPSEEK_API_KEY")
        .expect("DEEPSEEK_API_KEY must be set in env (e.g. load .env before running)");

    // ponytail: Client::new returns Result; ?-propagate. Bearer auth, no prefix check.
    let client = deepseek::Client::new(&api_key)?;

    // completion_model is synchronous — returns the model directly (not Result).
    // DEEPSEEK_V4_FLASH = successor of deepseek-chat (sunset 2026-07-24).
    // Keep in sync with llm.rs.
    let model = client.completion_model(deepseek::DEEPSEEK_V4_FLASH);

    let prompt = "Say one short sentence about Rust.";
    let system = "You are a terse assistant. Reply in one sentence.";

    // ponytail: canonical rig 0.41 pattern. CompletionRequestBuilder → .preamble(system) → .stream().await.
    // .preamble is the SYSTEM message on DeepSeek's OpenAI-compatible wire.
    let mut stream = CompletionRequestBuilder::new(model, prompt)
        .preamble(system.to_string())
        .stream()
        .await?;

    let mut full = String::new();
    while let Some(item) = stream.next().await {
        match item {
            Ok(StreamedAssistantContent::Text(text)) => {
                print!("{}", text.text);
                full.push_str(&text.text);
            }
            Ok(_) => {
                // ToolCall / Reasoning / FinalResponse variants — not needed for plain text gen.
            }
            Err(e) => {
                eprintln!("\n[stream error] {}", e);
                return Err(e.into());
            }
        }
    }
    println!();
    println!("--- DONE ---");
    println!("total chars streamed: {}", full.len());
    Ok(())
}
