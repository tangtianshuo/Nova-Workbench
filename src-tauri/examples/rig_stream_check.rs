//! Phase 3 Wave 1 mandatory rig streaming spike (RESEARCH.md §Open Question 1, §Pitfall 3).
//!
//! Run from src-tauri/ with `cargo run --example rig_stream_check` after exporting
//! GEMINI_API_KEY. Verifies the exact rig 0.41 streaming API surface and prints
//! tokens to stdout as they arrive, so downstream `src/llm.rs` can hard-code the
//! method names with confidence.
//!
//! ---
//! ## VERIFIED rig 0.41 API surface (filled in after first successful run)
//!
//! - **Crate import path:** `rig_core::*` — NOT `rig::*`. The crate name is
//!   `rig-core` and Cargo exposes it under the snake_case identifier `rig_core`.
//!   RESEARCH.md assumed `rig::*`; that was wrong.
//! - **Provider client constructor:** `rig_core::providers::gemini::Client::new(api_key)`
//!   returns `http_client::Result<Self>` (NOT `Self`). Must be `?`-propagated.
//!   The api_key can be `&str`, `String`, etc. — `impl Into<GeminiApiKey>`.
//! - **Completion model:** `client.completion_model(model_name)` — synchronous,
//!   returns `Self::CompletionModel` directly (no Result). The model name is
//!   `impl Into<String>`.
//! - **Request builder pattern (canonical):**
//!   ```ignore
//!   CompletionRequestBuilder::new(model, prompt)
//!       .preamble(system.to_string())   // system_instruction (D-24)
//!       .stream()                        // returns Future
//!       .await?                          // -> StreamingCompletionResponse<R>
//!   ```
//!   - `.preamble(s)` is the SYSTEM instruction (becomes `system_instruction`
//!     in the Gemini wire request — verified in
//!     `providers/gemini/completion.rs::create_request_body`).
//!   - There is NO `stream_prompt` method on CompletionModel. The trait method
//!     is `stream(request: CompletionRequest)`, but the high-level entry point
//!     is `CompletionRequestBuilder::new(...).stream().await`.
//! - **Stream item shape:**
//!   - `StreamingCompletionResponse<R>` impls `futures::Stream<Item = Result<StreamedAssistantContent<R>, CompletionError>>`.
//!   - Match `StreamedAssistantContent::Text(text_struct)` where
//!     `text_struct.text: String` is the token delta.
//!   - Other variants: `ToolCall`, `ToolCallDelta`, `Reasoning`, `ReasoningDelta`,
//!     `FinalResponse`. For PM use case we only need `Text`.
//! - **StreamExt import:** `use futures::StreamExt;` — `rig-core` re-exports
//!   `futures` transitively. Use `futures::StreamExt` for `.next()`. Do NOT
//!   reach for `tokio_stream::StreamExt` — that crate is not in our
//!   `[dependencies]` and would require an extra dep.
//!
//! ## Ponytail
//!
//! This is the ONLY rig API documentation that downstream tasks get. If
//! `src/llm.rs` needs to change the prompt-building strategy, update the
//! comments above AND re-run this spike.

use std::env;

use futures::StreamExt;
use rig_core::client::CompletionClient;
use rig_core::completion::CompletionRequestBuilder;
use rig_core::providers::gemini;
use rig_core::streaming::StreamedAssistantContent;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = env::var("GEMINI_API_KEY")
        .expect("GEMINI_API_KEY must be set in env (e.g. load .env before running)");

    // ponytail: Client::new returns Result; ?-propagate. api_key takes impl Into<GeminiApiKey>.
    let client = gemini::Client::new(&api_key)?;

    // completion_model is synchronous — returns the model directly (not Result).
    let model = client.completion_model("gemini-2.0-flash");

    let prompt = "Say one short sentence about Rust.";
    let system = "You are a terse assistant. Reply in one sentence.";

    // ponytail: canonical rig 0.41 pattern. CompletionRequestBuilder → .preamble(system) → .stream().await.
    // .preamble is the SYSTEM instruction per Gemini wire format (becomes system_instruction).
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
