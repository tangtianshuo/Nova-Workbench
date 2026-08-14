# Phase 9 Plan 01 Summary

## Implementation

- Extended `src-tauri/src/llm.rs` with the provider-agnostic `Provider` enum, `ChatMessage`, `ChatResult`, `ToolCallInfo`, and `chat_with_tools`.
- Added concrete rig-core 0.41 dispatch for DeepSeek V4 Flash, OpenAI GPT-4o-mini, Anthropic Claude Sonnet 4.6, Gemini 2.5 Flash, and local Ollama Llama 3.2.
- Added shared streaming for text, complete `ToolCall`, and accumulated `ToolCallDelta` output. Tool calls are forwarded only; Rust does not execute tools.
- Converted direct `{name, description, parameters}` and OpenAI-style `{type: "function", function: {...}}` tool schemas to rig `ToolDefinition`.
- Extended `StreamChunk` with `tool_call`, added `chat`/`cancel_chat`, provider listing and selection commands, per-provider key commands, and registered them in `lib.rs`.
- Kept `generate_project` on its existing DeepSeek path. DeepSeek key reads fall back to the legacy `default` keychain account so existing users are not stranded; new provider writes use account = provider name.
- Added default `active_provider = DeepSeek` to `AppState` and unit coverage for provider serialization, tool schema conversion, stream chunk serialization, key names, and state default.

## Rig 0.41 API Findings

- `CompletionRequestBuilder` exposes `.tools(Vec<ToolDefinition>)`; the planned `.tools_vec(...)` API does not exist.
- `StreamedAssistantContent::ToolCall` is a struct variant whose data is at `tool_call.function.name` and `tool_call.function.arguments`.
- `ollama::Client::new` accepts an API key, not a URL. `Nothing` is used so rig's default `http://localhost:11434` endpoint remains active.

## Verification

- `cargo fmt --manifest-path src-tauri/Cargo.toml --all`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed using an isolated temporary target directory. The normal repository target was stale and referenced `D:\Projects\Nova\pm-workspace` permission artifacts.
- Strict `cargo clippy --all-targets -- -D warnings`: only fails on pre-existing `AppError::RateLimited` and `AppError::Truncated` dead-code warnings in `src-tauri/src/error.rs`, which is outside this plan's permitted files. New 09-01 code has no remaining clippy findings.
- `cargo test`: not completed in the available run. A parallel dependency build first failed while compiling `phf` without a Rust diagnostic; a single-job retry exceeded five minutes. No test failure from 09-01 logic was observed.
- No provider network UAT was run. API keys, endpoint availability, model availability, and real tool-call behavior remain runtime/UAT concerns.

## Runtime Contract Notes

- The Tauri command shape is `chat({ args: { messages, tools, systemPrompt, provider, requestId }, onToken })`; `onToken` is a separate `Channel<StreamChunk>` command argument because Tauri v2 `Channel<T>` is not `Deserialize`.
- `messages` must be non-empty and currently supports `system`, `user`, and `assistant` roles. The final message becomes the rig prompt; preceding messages become history.
- Stream chunks are nested tagged objects: `token`, `tool_call`, and `error` carry `data`; `done` is serialized with `kind` only.
- Ollama skips keychain lookup and requires a reachable local Ollama server/model. Other providers read their key fresh per call.
- Both `set_provider`/`get_provider` and the explicit `set_active_provider`/`get_active_provider` command names are registered to cover the plan/context naming mismatch.
