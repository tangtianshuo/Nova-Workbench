---
phase: 9-ai
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
  - src-tauri/src/llm.rs
  - src-tauri/src/commands.rs
  - src-tauri/src/keychain.rs
  - src-tauri/src/state.rs
  - src-tauri/src/lib.rs
autonomous: true
requirements: [AI-01, AI-07]

must_haves:
  truths:
    - "Rust llm.rs 暴露 provider-agnostic chat_stream() 函数,接受 Provider enum + messages + tools schema"
    - "新增 chat Tauri command 接受 messages + tools + provider 参数,通过 Channel<StreamChunk> 流式返回 token"
    - "StreamChunk 新增 ToolCall { name, arguments } variant 透传 LLM 的 tool_call 请求到前端"
    - "keychain 扩展支持 per-provider API key (service 'nova.pm-workspace', account = provider name)"
    - "list_providers / set_provider / get_provider 三个 Tauri command 暴露 provider 切换给 Settings UI"
    - "provider 默认 deepseek,rig-core 的 deepseek/openai/anthropic/gemini/ollama 客户端都可用 (编译通过)"
  artifacts:
    - path: "src-tauri/src/llm.rs"
      provides: "provider-agnostic chat_stream + chat_with_tools,基于 rig-core 多 provider 抽象"
      contains: "pub enum Provider"
    - path: "src-tauri/src/commands.rs"
      provides: "chat / list_providers / set_provider / get_provider / has_provider_key / set_provider_key Tauri commands"
      contains: "pub async fn chat"
    - path: "src-tauri/src/keychain.rs"
      provides: "per-provider key get/set/has,account = provider name"
      contains: "pub fn get_provider_key"
  key_links:
    - from: "src-tauri/src/commands.rs"
      to: "src-tauri/src/llm.rs"
      via: "chat command 调用 llm::chat_with_tools,传入 messages + tools JSON + provider"
      pattern: "llm::chat_with_tools"
    - from: "src-tauri/src/commands.rs"
      to: "src-tauri/src/keychain.rs"
      via: "chat command 用 provider 名查 keychain 拿对应 provider key"
      pattern: "keychain::get_provider_key"
    - from: "src-tauri/src/lib.rs"
      to: "src-tauri/src/commands.rs"
      via: "invoke_handler 注册 chat / list_providers / set_provider / get_provider / has_provider_key / set_provider_key"
      pattern: "commands::chat"
---

<objective>
把 src-tauri/src/llm.rs 从 DeepSeek-only 扩展为 provider-agnostic,新增 chat Tauri command 支持 tool use 协议,扩展 keychain 支持 per-provider API key。

Purpose: Phase 9 所有 AI 调用都走这个 Rust 入口 (D-15)。Tauri 不做 tool execution,只做 LLM passthrough + tool_call 透传 (D-05)。前端拿到 tool_call 后在 JS webview 内执行 tool。
Output: provider-agnostic llm.rs + chat/list_providers/set_provider commands + per-provider keychain
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/9-ai/9-CONTEXT.md

@src-tauri/src/llm.rs
@src-tauri/src/commands.rs
@src-tauri/src/keychain.rs
@src-tauri/src/error.rs
@src-tauri/src/state.rs
@src-tauri/src/lib.rs
@src-tauri/Cargo.toml

<interfaces>
<!-- 现有 llm.rs stream_generate 签名 (DeepSeek-only,Phase 3) -->
```rust
pub async fn stream_generate(
    api_key: &str,
    user_prompt: String,
    files_context: String,
    on_token: &Channel<StreamChunk>,
    cancel: &CancellationToken,
) -> Result<String, AppError>
```

<!-- 现有 commands.rs StreamChunk (需扩展 ToolCall variant) -->
```rust
#[derive(serde::Serialize, Clone)]
#[serde(tag = "kind", content = "data")]
pub enum StreamChunk {
    Token { text: String },
    Done,
    Error { message: String },
    // 新增 (Plan 01): ToolCall { name, arguments } — 透传 LLM 的 tool_call 请求
}
```

<!-- 现有 keychain (single-account,SERVICE/ACCOUNT 常量) -->
```rust
pub const SERVICE: &str = "nova.pm-workspace";
pub const ACCOUNT: &str = "default";  // 扩展为 per-provider: account = provider name
pub fn get_api_key() -> Result<String, AppError>;
pub fn set_api_key(key: &str) -> Result<(), AppError>;
pub fn has_api_key() -> bool;
```

<!-- rig-core 0.41 CompletionClient / CompletionRequestBuilder (现有用法) -->
```rust
use rig_core::client::CompletionClient;
use rig_core::completion::CompletionRequestBuilder;
use rig_core::streaming::StreamedAssistantContent;
// rig 已支持多 provider:rig_core::providers::{deepseek, openai, anthropic, gemini, ollama}
```

<!-- 现有 Cargo.toml Phase 3 deps (rig-core 0.41 已在) -->
```toml
rig-core = "0.41"
futures = "0.3"
tokio = { version = "1", features = ["full"] }
tokio-util = { version = "0.7", features = ["rt"] }
```
</interfaces>

<risks>
- **rig-core 多 provider API 差异:** rig 0.41 不同 provider 的 client builder / model name 略有差异。本 plan 先实现 deepseek + openai + anthropic + gemini + ollama,如果有 provider 的 rig 接口差异大,标记 TODO 而非硬塞。
- **tool_call 解析:** rig 的 StreamedAssistantContent::ToolCall variant 是否暴露完整 arguments JSON,需在实现时验证;如不完整,降级到非流式 chat_with_tools 调用拿 tool_call。
- **Ollama 无 API key:** Ollama 走本地 (http://localhost:11434),keychain 不存 key。Provider enum 的 Ollama variant 不走 keychain。
</risks>
</context>

<tasks>

<task type="auto">
  <name>Task 1: llm.rs provider-agnostic + chat_with_tools + StreamChunk ToolCall variant</name>
  <files>src-tauri/src/llm.rs, src-tauri/src/commands.rs, src-tauri/Cargo.toml</files>
  <read_first>
    - src-tauri/src/llm.rs (现有 stream_generate 实现)
    - src-tauri/src/commands.rs (StreamChunk enum 定义 L26-35)
    - src-tauri/Cargo.toml (rig-core 0.41 依赖)
    - .planning/phases/9-ai/9-CONTEXT.md (D-05 Rust 不做 tool execution,D-15 provider-agnostic)
  </read_first>
  <behavior>
    - Provider enum 序列化为字符串 ("deepseek" | "openai" | "anthropic" | "gemini" | "ollama"),用 serde rename_all lower
    - chat_with_tools(provider, api_key, messages, tools_json, on_token, cancel) 返回 full text + 可能的 tool_calls 列表
    - 流式 token 通过 Channel<StreamChunk::Token> 推送 (复用现有 pattern)
    - StreamedAssistantContent::ToolCall 时,通过 Channel<StreamChunk::ToolCall> 推送 { name, arguments: serde_json::Value }
    - chat_with_tools 内部按 provider 分支构造 rig client + model:
      - DeepSeek: rig_core::providers::deepseek::Client::new(api_key).completion_model(DEEPSEEK_V4_FLASH)
      - OpenAI: rig_core::providers::openai::Client::new(api_key).completion_model("gpt-4o-mini")
      - Anthropic: rig_core::providers::anthropic::Client::new(api_key).completion_model("claude-3-5-sonnet-20241022")
      - Gemini: rig_core::providers::gemini::Client::new(api_key).completion_model("gemini-1.5-flash")
      - Ollama: rig_core::providers::ollama::Client::new("http://localhost:11434").completion_model("llama3.1")
    - 工具 schema 通过 CompletionRequestBuilder.tools_vec(...) 注入 (rig 0.41 API;若不可用,fallback 到文档化 TODO + 临时省略 tools 让 chat 命令仍可用)
    - 如果 rig 的某个 provider 接口差异大 (e.g. gemini tool schema 格式不同),实现 TODO 注释 + 编译通过即可,生产可用性留给 Plan 06 UAT 验证
  </behavior>
  <action>
1. 编辑 `src-tauri/Cargo.toml`:确认 `rig-core = "0.41"` 已存在 (是);如果 rig 0.41 不包含某 provider (e.g. anthropic 单独 feature),按 cargo build 错误指引加 features。

2. 重写 `src-tauri/src/llm.rs`:
   - 顶部加 `use serde::{Deserialize, Serialize};` 和 provider 相关 imports:
     ```rust
     use rig_core::providers::{deepseek, openai, anthropic, gemini, ollama};
     ```
   - 定义 Provider enum:
     ```rust
     #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
     #[serde(rename_all = "lowercase")]
     pub enum Provider { DeepSeek, OpenAI, Anthropic, Gemini, Ollama }
     ```
   - 保留现有 `stream_generate` (legacy generate_project 还要用);新增:
     ```rust
     pub async fn chat_with_tools(
         provider: Provider,
         api_key: &str,           // Ollama 忽略,传 ""
         messages: Vec<ChatMessage>,
         tools_json: Vec<serde_json::Value>,  // JSON Schema array
         system_prompt: String,
         on_token: &Channel<StreamChunk>,
         cancel: &CancellationToken,
     ) -> Result<ChatResult, AppError>
     ```
   - 定义 `ChatMessage { role: String, content: String }` (Deserialize,从 JS 传入) 和 `ChatResult { content: String, tool_calls: Vec<ToolCallInfo> }`、`ToolCallInfo { name: String, arguments: serde_json::Value }` (Serialize,返回给 JS)
   - 内部用 match provider 分支构造 model,然后 `CompletionRequestBuilder::new(model, last_user_content).preamble(system_prompt).stream().await` 走流式
   - 流循环里 branch on `StreamedAssistantContent`:
     - `Text(t)` → push Token
     - `ToolCall(tc)` → push StreamChunk::ToolCall { name: tc.name, arguments: tc.arguments };同时累积到 tool_calls Vec
     - 其他 → continue
   - Provider 分支用 helper `fn build_model(provider, api_key) -> Box<dyn CompletionModel>` 或 enum dispatch;如果 rig trait object 复杂,直接 match 内 inline 创建 + 用 macro 避免重复样板代码 ( Ponytail:复用现有 CompletionRequestBuilder pattern)
   - Ollama 分支:`ollama::Client::new("http://localhost:11434".to_string())`,api_key 忽略
   - 注意:rig 0.41 不同 provider 的 CompletionModel 类型可能不同,CompletionRequestBuilder 是泛型 <M: CompletionModel>,所以 match 分支返回不同类型的策略 — 写 5 个独立 async fn (chat_deepseek / chat_openai / chat_anthropic / chat_gemini / chat_ollama),主 fn match provider 后 dispatch;每个 sub-fn 共享一个 inner_stream_loop helper (泛型) 处理流
   - 顶部加 module 注释解释 "Phase 9: provider-agnostic + tool use 协议"

3. 编辑 `src-tauri/src/commands.rs`:
   - StreamChunk enum 加新 variant:
     ```rust
     #[serde(rename = "tool_call")]
     ToolCall { name: String, arguments: serde_json::Value },
     ```
   - 新增 `#[derive(serde::Deserialize)]` 的 `ChatRequest`:
     ```rust
     #[derive(serde::Deserialize)]
     pub struct ChatMessage { pub role: String, pub content: String }

     #[derive(serde::Deserialize)]
     pub struct ChatArgs {
         pub messages: Vec<ChatMessage>,
         pub tools: Vec<serde_json::Value>,  // JSON Schema array
         pub system_prompt: String,
         pub provider: crate::llm::Provider,
         pub request_id: String,
         pub on_token: Channel<StreamChunk>,
     }
     ```
   - 新增 `#[tauri::command] pub async fn chat(args: ChatArgs, state: State<'_, AppState>) -> Result<ChatResult, AppError>`:
     - 复用现有 generate_project 的 cancellation token 模式 (state.cancellations.insert / tokio::select!)
     - 通过 `crate::llm::Provider` 反查 keychain: `let api_key = if args.provider == Provider::Ollama { String::new() } else { keychain::get_provider_key(&args.provider)? };`
     - 调用 `llm::chat_with_tools(args.provider, &api_key, args.messages, args.tools, args.system_prompt, &args.on_token, &cancel).await`
     - 成功: on_token.send(StreamChunk::Done) + Ok(result)
     - 失败: on_token.send(StreamChunk::Error { message }) + Err(e)
   - 导出 `pub use llm::{ChatResult, ChatMessage, Provider};` 或在 ChatResult struct 上加 `#[derive(serde::Serialize)]`
   - 新增 `cancel_chat` command (与 cancel_generate_project 同模式,接受 request_id)

4. 测试:
   - commands.rs 加单元测试验证 StreamChunk::ToolCall 序列化为 `{"kind":"tool_call","data":{"name":"x","arguments":{...}}}`
   - llm.rs 加测试验证 Provider enum 序列化 "deepseek"/"openai"/"anthropic"/"gemini"/"ollama" ( lowercase )
   - 不写网络测试 (rig 集成测试在 Plan 06 UAT 验证)
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace/src-tauri && cargo check</automated>
  </verify>
  <done>
    cargo check 通过,llm.rs 暴露 Provider enum + chat_with_tools,commands.rs 暴露 chat Tauri command + StreamChunk::ToolCall variant。chat 命令尚未在 invoke_handler 注册 (Task 2 做)。
  </done>
</task>

<task type="auto">
  <name>Task 2: keychain per-provider + 注册 6 个新 Tauri commands</name>
  <files>src-tauri/src/keychain.rs, src-tauri/src/state.rs, src-tauri/src/commands.rs, src-tauri/src/lib.rs</files>
  <read_first>
    - src-tauri/src/keychain.rs (现有 single-account pattern)
    - src-tauri/src/commands.rs (Task 1 完成后)
    - src-tauri/src/lib.rs (现有 invoke_handler 注册模式)
  </read_first>
  <behavior>
    - keychain 暴露 get_provider_key(provider: &Provider) / set_provider_key(provider, key) / has_provider_key(provider) 三个函数,account 字段 = provider.to_string()
    - 保留现有 get_api_key/set_api_key/has_api_key (legacy generate_project 还要用,keychain module 内部委托到 get_provider_key(Provider::DeepSeek) 等)
    - 新增 list_providers / set_active_provider / get_active_provider 三个 Tauri command:set/get 写到 state.active_provider
    - AppState 新增 active_provider: Mutex<Provider>,默认 DeepSeek
    - lib.rs invoke_handler 注册 6 个新命令:chat / cancel_chat / list_providers / set_active_provider / get_active_provider / has_provider_key / set_provider_key
  </behavior>
  <action>
1. 编辑 `src-tauri/src/keychain.rs`:
   - 顶部加 `use crate::llm::Provider;`
   - 加 `use std::fmt;` 并 impl `fmt::Display for Provider { write!(f, "{:?}", self).to_lowercase() }` (或加 method `fn key(&self) -> &str` 返回 "deepseek"/"openai"/...;二选一,Display 更整洁)
   - 保留 SERVICE 常量;新加:
     ```rust
     pub fn get_provider_key(provider: &Provider) -> Result<String, AppError> {
         keyring::Entry::new(SERVICE, &provider.to_string())
             .and_then(|e| e.get_password())
             .map_err(|e| match e {
                 keyring::Error::NoEntry => AppError::AuthError,
                 other => AppError::InternalError(format!("keyring get: {}", other)),
             })
     }
     pub fn set_provider_key(provider: &Provider, key: &str) -> Result<(), AppError> { /* same pattern */ }
     pub fn has_provider_key(provider: &Provider) -> bool { matches!(get_provider_key(provider), Ok(_)) }
     ```
   - 修改现有 get_api_key: 内部委托 `get_provider_key(&Provider::DeepSeek)` (D-15 backward compat)
   - 单元测试:验证 Provider::DeepSeek.to_string() == "deepseek" 等

2. 编辑 `src-tauri/src/state.rs`:
   - 加 `use crate::llm::Provider;`
   - AppState 新增字段:`pub active_provider: Mutex<Provider>`
   - `AppState::new()` 初始化 `active_provider: Mutex::new(Provider::DeepSeek)` (D-13 默认 DeepSeek V4 Flash)
   - 测试:new() 后 active_provider == DeepSeek

3. 编辑 `src-tauri/src/commands.rs`:
   - 新增 4 个 commands:
     ```rust
     #[tauri::command]
     pub async fn list_providers() -> Result<Vec<String>, AppError> {
         Ok(vec!["deepseek".into(), "openai".into(), "anthropic".into(), "gemini".into(), "ollama".into()])
     }
     #[tauri::command]
     pub async fn set_active_provider(provider: Provider, state: State<'_, AppState>) -> Result<(), AppError> {
         *state.active_provider.lock().unwrap() = provider;
         Ok(())
     }
     #[tauri::command]
     pub async fn get_active_provider(state: State<'_, AppState>) -> Result<Provider, AppError> {
         Ok(state.active_provider.lock().unwrap().clone())
     }
     #[tauri::command]
     pub async fn has_provider_key(provider: Provider) -> Result<bool, AppError> {
         Ok(keychain::has_provider_key(&provider))
     }
     #[tauri::command]
     pub async fn set_provider_key(provider: Provider, key: String) -> Result<(), AppError> {
         keychain::set_provider_key(&provider, &key)
     }
     ```

4. 编辑 `src-tauri/src/lib.rs`:
   - invoke_handler! 加 6 个新命令 (chat, cancel_chat, list_providers, set_active_provider, get_active_provider, has_provider_key, set_provider_key):
     ```rust
     .invoke_handler(tauri::generate_handler![
         get_gnome_color_scheme,
         commands::generate_project,
         commands::cancel_generate_project,
         commands::has_api_key,
         commands::set_api_key,
         commands::chat,
         commands::cancel_chat,
         commands::list_providers,
         commands::set_active_provider,
         commands::get_active_provider,
         commands::has_provider_key,
         commands::set_provider_key,
     ])
     ```
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace/src-tauri && cargo test && cargo check</automated>
  </verify>
  <done>
    cargo test 通过,cargo check 0 errors。Provider enum + 7 个新 Tauri command 全部注册。keychain 支持 per-provider。下一步 Plan 02 可以从 JS 调用 invoke('chat', ...)。
  </done>
</task>

</tasks>

<verification>
- `cd src-tauri && cargo check` 通过
- `cd src-tauri && cargo test` 通过 (含新增 StreamChunk::ToolCall 序列化测试 + Provider enum 测试)
- grep 验证: llm.rs 包含 `pub enum Provider` + `pub async fn chat_with_tools`
- grep 验证: commands.rs 包含 `pub async fn chat` + `StreamChunk::ToolCall`
- grep 验证: keychain.rs 包含 `pub fn get_provider_key`
- grep 验证: lib.rs invoke_handler 包含 `commands::chat`
</verification>

<success_criteria>
1. Rust llm.rs 从 DeepSeek-only 扩展为 provider-agnostic (D-15) (AI-01 ✓)
2. chat Tauri command 支持 messages + tools + provider 参数 (AI-07 ✓)
3. StreamChunk 新增 ToolCall variant 透传 LLM tool_call 给前端
4. keychain 支持 per-provider API key (account = provider name)
5. 6 个新 Tauri command 注册 (chat / cancel_chat / list_providers / set_active_provider / get_active_provider / has_provider_key / set_provider_key)
6. 所有现有 cargo test 仍通过 (backward compat)
</success_criteria>

<output>
After completion, create `.planning/phases/9-ai/9-01-SUMMARY.md`
</output>
