# Phase 3: Tauri IPC Migration + Security Baseline - Research

**Researched:** 2026-08-08
**Domain:** Tauri v2 IPC (Channel streaming) + OS keychain (keyring) + rig-core LLM + CSP/capabilities hardening
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Endpoint Migration Scope (IPC-01, IPC-03)**

- **D-01:** 只迁移 `generate-project` 一个端点作为 PoC(ROADMAP success criteria 1 明确说 "at least one")。理由:Channel streaming 模式 + cancellation + 错误处理是新模式,先验证 1 个端到端跑通,再扩展。其余 4 个端点保持 Express 调用不变(dev mode),Tauri prod 模式下走相同 IPC 适配器但暂未实现(返回"未迁移"错误)。
- **D-02:** 新增 Tauri command `generate_project(prompt: String, files_context: String, on_token: Channel<StreamChunk>) -> Result<GenerateProjectResult, String>`。`StreamChunk` 是 Rust struct `{ kind: "token"|"done"|"error", text: Option<String>, error: Option<String> }`。Channel 选择是 PITFALLS 警告 events 模式易泄漏 listener + 顺序问题。

**Streaming + Cancellation (IPC-03, IPC-04, IPC-05)**

- **D-03:** Tauri 2.x `Channel<StreamChunk>` API(非 events)。Channel 自动跟随 call 生命周期,无需手动 unlisten。Rust 端 `tokio::sync::CancellationToken` 包裹 LLM call,Stop 按钮触发 `cancel()` 后 Rust 立刻停止 stream + 释放 token。
- **D-04:** 前端 `AbortController` 备份(IPC-05),但实际取消通过 IPC command `cancel_generate_project(request_id: String)` 完成。Stop 按钮在生成中 `disabled`(防堆叠)。
- **D-05:** `request_id` 用 UUID v4(前端生成,作为 invoke 参数),Rust 端维护 `HashMap<request_id, CancellationToken>`。请求完成/取消后从 map 移除(防内存泄漏)。

**API Key Storage (SEC-05, SEC-06)**

- **D-06:** Rust `keyring` crate v3(跨平台:Windows Credential Manager、macOS Keychain、Linux Secret Service)。服务名 `nova.pm-workspace`,用户名 `default`。
- **D-07:** 首次启动时 SettingsView 检测 `keyring.get()` 返回 `NoEntry` → 显示 API key 输入卡片(`Input type="password"` + 显式说明 "Stored in OS keychain, never in app files")。Submit 按钮 → `keyring.set(password)`。后续启动静默读。
- **D-08:** 不在 webview 中暴露 key。Rust 端 command `get_api_key() -> Result<Option<String>, AppError>` 只在调用 LLM 前内部读取,**不返回 key 给前端**;前端只通过 `has_api_key() -> bool` 检查存在性。这降低 XSS 泄漏面。
- **D-09:** `.env` 文件保留作为 dev fallback(`npm run dev` 模式无 keychain,因 web-only 没 Tauri Rust 后端)。Express 在 dev mode 仍读 `GEMINI_API_KEY`,Tauri prod build 不依赖 `.env`(keychain 唯一来源)。

**LLM Provider Integration (IPC-07)**

- **D-10:** Rust 端直接引入 `rig-core`(ADR-003 已锁),用 `rig::providers::gemini::Client` 或 `rig::providers::openai::Client`(Gemini 首选 per REQUIREMENTS IPC-07)。Rig 已内置 streaming + cancellation 支持,与 GraphFlow(Phase 4)无缝。
- **D-11:** 移除前端 `@google/genai` 依赖(只用于 Express 端,Phase 3 后 Express 不再调 LLM)。`server.ts` 内 Gemini 调用保留作为 dev fallback(`npm run dev` 时 webview 通过 fetch 调 Express,Express 仍用 `@google/genai`)。

**Error Handling (IPC-06, IPC-08)**

- **D-12:** Rust `AppError` enum,variants: `NetworkError(String)`、`AuthError(InvalidApiKey)`、`RateLimited`、`ParseError(String)`、`Truncated`、`Cancelled`、`InternalError(String)`。手动 `impl serde::Serialize` 输出 `{ variant: "NetworkError", message: "..." }` JSON。
- **D-13:** 前端 `src/lib/tauri.ts` 适配器把 `Result<T, String>` 转换为 `Promise<T>`(throw Error with human-readable message)。Store/UI 用 `useToast({ type: 'error', title, description })` 显示(复用 `src/components/ui/Toast.tsx`)。
- **D-14:** IPC 错误对用户可见:`NetworkError` → "网络连接失败,请检查网络";`AuthError` → "API key 无效,请到 Settings 更新";`RateLimited` → "请求过于频繁,稍后再试";`Cancelled` → 静默(用户主动取消不算错);其他 → "AI 调用失败:{message}"。

**Dev/Prod Parity (IPC-02)**

- **D-15:** 扩展 `src/lib/api.ts`(Phase 2 创建)为完整 `src/lib/tauri.ts`(或保留 `api.ts` 命名,新增 AI 调用相关函数)。导出:`invokeAI<T>(command, args)`、`streamAI<T>(command, args, onChunk)`、`cancelAI(requestId)`、`hasAPIKey()`、`isTauri()`(已有)。
- **D-16:** 适配器内部 `isTauri()` 分支:Tauri 走 `invoke()`、dev 走 `fetch('/api/...')`。Stop 按钮:Tauri 走 `cancelAI(requestId)` IPC、dev 走 `AbortController.abort()`。前端调用方完全无感(适配器封装)。

**CSP + Capabilities (SEC-01, SEC-02, SEC-03, SEC-04)**

- **D-17:** 生产 CSP(`tauri.conf.json` 的 `app.security.csp`):
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://generativelanguage.googleapis.com;
  frame-src 'none';
  object-src 'none';
  ```
  - `style-src 'unsafe-inline'`:Tailwind v4 + Radix + motion 必需(PITFALLS Pitfall 7)
  - `script-src 'self'`:严格 default-deny,PITFALLS 推荐
  - `connect-src`:显式允许 Gemini API endpoint,防止 IPC 走 HTTPS 时被拦
  - `img-src data:`:Tailwind 内联 SVG + Radix 头像占位需要
- **D-18:** Dev mode(`tauri dev`)用单独 CSP(允许 Vite HMR + ws://localhost:3000)。`tauri.conf.json` 加 `app.security.devCsp` 字段(Tauri 2.x 支持)。
- **D-19:** 新增 capabilities 文件 `src-tauri/capabilities/llm.json`(IPC commands 权限)+ `src-tauri/capabilities/keyring.json`(keyring 权限,若使用 `tauri-plugin-keyring`)。`default.json` 不变。
- **D-20:** 烟测脚本(`scripts/smoke-ipc.sh` 或类似)对每个 Tauri command 从 webview 调用一次,检查 capability 不静默拒绝(SEC-04)。可手动跑 + 写入 `03-HUMAN-UAT.md`。

**Express 收缩 (IPC-09, IPC-10)**

- **D-21:** Express 保留作 dev-only:`npm run dev` 仍启动 Express(绑 `127.0.1` 替代 `0.0.0.0`),提供 web fallback + 未迁移的 4 个端点。
- **D-22:** 从 prod bundle 移除:`package.json` 的 `scripts.build:server` 保留(以便单独 dev 用),但 `tauri.conf.json` 的 `beforeBuildCommand` 改为只 `bunx vite build`(不再 `bunx tsx server.ts`)。`scripts.start` 保留作 standalone web server,不进 Tauri bundle。
- **D-23:** Express 绑定改 `127.0.0.1`:`server.ts` 中 `app.listen(PORT, '127.0.0.1', ...)`。

**Prompt Injection Mitigation (SEC-07)**

- **D-24:** Rust 端调用 Rig 时,显式分离 `system_instruction`(程序构造,用户输入不进)和 `contents`(用户输入)。`generate-project` 的 `systemPrompt` 模板由 Rust 端构造,前端只传 `prompt` 和 `files_context`,Rust 把它们嵌入 `contents` 数组(非 system)。这把 prompt injection 面降到最低。

### Claude's Discretion

- Rust crate 具体版本(`keyring` v3.x 最新、`rig-core` 最新 stable)
- Channel 序列化错误处理(如果 Channel 在调用中断开,Rust 是否报错或静默)
- `request_id` 生成的具体方式(UUID v4 in frontend vs backend)
- IPC command 命名规范(下划线 vs camelCase,Rust 习惯下划线、前端 invoke 习惯 camelCase,Tauri 自动转换)
- Cargo.toml 的 feature flags(`rig-core` 的 `gemini` feature 名验证)
- SettingsView API key 卡片的具体 UI 排版(沿用 Phase 1 的 SegmentedControl 模式)
- Smoke test 脚本的具体实现(bash vs node vs Rust 二进制)
- Dev CSP 的具体值(允许 Vite HMR + ws 的最低配置)

### Deferred Ideas (OUT OF SCOPE)

- **其余 4 个 AI 端点迁移** — `summarize-workspace`、`workspace-files`、`rnd/generate-deliverable`、`rnd/polish-knowledge-article`。验证 Channel + cancellation 模式稳定后,Phase 4 或单独 Phase 3.1 扩展
- **API key 多 provider 支持** — OpenAI / Anthropic / Ollama。Rig 已支持 multi-provider,UI 加 provider 选择是后续 milestone
- **API key 输入引导(首次启动向导)** — D-07 只在 Settings 显示,首次启动 wizard(模态强提示)是 UX polish,延后
- **Channel 监控指标** — 流量、延迟、错误率。Phase 4/5 加 telemetry 时统一
- **CSP nonce-based** — D-17 用 `'unsafe-inline'` 是 Tailwind v4 + Radix 限制。后续 Tailwind v5 + Radix 升级可能支持 nonce,届时收紧
- **Prompt injection 高级防护** — D-24 是基础分离,advanced(input sanitization、output filtering、content moderation API)是后续 milestone
- **IPC command 自动化烟测 CI** — D-20 手动脚本,CI 集成(GitHub Actions runner)在 CI 基础设施落地后
- **Express 完全移除** — D-21 保留作 dev fallback。Web mode 永久支持的话保留;若决定 desktop-only,可在后续 milestone 移除 Express
- **Rust 端 streaming 重试逻辑** — 网络抖动重试、exponential backoff。Phase 4 加 Rag pipeline 时统一处理
- **多账号 API key** — keychain 多账号、provider 切换。Rig 多 provider 时一起做
- **WebFallback 完善** — D-16 dev fallback 只调 Express 不 stream,若需要 web prod 也 stream,需 SSE/WebSocket 改造(超出本 phase)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IPC-01 | 创建 `src/lib/tauri.ts` 适配器作为单一 chokepoint | Architecture §IPC Adapter Pattern + Code Examples §Frontend Adapter;extends Phase 2 `src/lib/api.ts` |
| IPC-02 | 适配器内部 `isTauri()` 分支 | Code Examples §Frontend Adapter — `isTauri()` branch + dev `fetch` fallback + AbortController |
| IPC-03 | `generate-project` 迁移到 Tauri command + Channel 流式 | Code Examples §Tauri Command + §Channel Streaming;`Channel<StreamChunk>` ordered 1:1 |
| IPC-04 | 服务端 `CancellationToken` + Stop 中断 | Code Examples §Cancellation;`tokio::sync::CancellationToken` + `HashMap<request_id, token>` in AppState |
| IPC-05 | 客户端 `AbortController` + 按钮禁用 | Code Examples §Frontend Adapter — Stop button disabled during generation |
| IPC-06 | AI 错误以用户可读消息呈现 | Code Examples §AppError Serialize + §Error Toast Mapping;D-14 message map |
| IPC-07 | 引入 `rig-core` 替代 `@google/genai` | Standard Stack §Core — rig-core v0.41.0;Architecture §Rig Integration |
| IPC-08 | Rust `AppError` enum + 手动 `serde::Serialize` | Code Examples §AppError Serialize;thiserror + serialize_str |
| IPC-09 | Express 收缩到 dev-only,从 prod bundle 移除 | Architecture §Express Refactor + Code Examples §tauri.conf.json beforeBuildCommand |
| IPC-10 | Express dev 绑 `127.0.0.1` | Code Examples §server.ts bind change (1 line) |
| SEC-01 | 显式 CSP(production) | Architecture §CSP — verbatim D-17 string + **CRITICAL ADDITION**: `connect-src: "ipc: http://ipc.localhost"` |
| SEC-02 | CSP 通过 `tauri build` 验证 | Validation §Manual CSP Verification Checklist (must use prod build, not dev) |
| SEC-03 | 每个 feature 一个 capability 文件 | Code Examples §capabilities/llm.json + §capabilities/keyring.json |
| SEC-04 | 每个 Tauri command 从 webview 烟测 | Validation §Smoke Test Script (manual, dev-only per D-20) |
| SEC-05 | LLM API key 通过 `keyring` crate 直连 OS keychain | Code Examples §keyring usage;Standard Stack §Core — keyring v3.3.0 |
| SEC-06 | 用户首次启动录入 API key,持久化 | Code Examples §ApiKeySection component;SettingsView 'privacy' section |
| SEC-07 | AI prompt 中用户输入与系统指令分离 | Code Examples §Rig system_instruction vs contents;D-24 |
</phase_requirements>

## Summary

Phase 3 closes the security perimeter of Nova in one coordinated phase. Three changes — (1) migrating `generate-project` from Express fetch to Tauri `Channel<StreamChunk>` streaming, (2) moving the Gemini API key from `.env`/bundle to OS keychain via the `keyring` crate, (3) replacing `csp: null` with an explicit production CSP — must land together because each depends on the other (CSP tightening breaks if IPC isn't in place; keychain needs Rust commands that need capability grants; capabilities are scoped to commands that don't exist yet). The pattern established in Phase 2 (`isTauri()` chokepoint, `capabilities/*.json` ACL files, `tauri_plugin_sql::Builder` registration) is extended, not replaced.

The research found **one material gap in CONTEXT.md D-17**: the locked CSP string is missing `connect-src: "ipc: http://ipc.localhost"` which Tauri v2 IPC requires post-2.0. Without this directive, every `invoke()` call silently fails CSP in production (works in dev because `devCsp` is more permissive). This is a planner-relevant correction — see Architecture §CSP for the corrected string and the citation.

All five research dependencies are verified current on crates.io as of 2026-08-08: `keyring` v3.3.0 (Ponytail: stick with v3 simple API, do NOT use 4.x split — see Standard Stack §Alternatives), `rig-core` v0.41.0 (Gemini provider native), `tokio` v1 (full features for `CancellationToken` + `oneshot`), `uuid` v1 (v4 feature), `thiserror` v1. Existing `Cargo.toml` release profile (`panic = "abort"`, `lto = true`, `strip = true`) is correct and unchanged.

**Primary recommendation:** Build in 4 waves — (1) Rust foundation: `Cargo.toml` deps + `AppError` + `AppState` + keyring/rig wiring + commands skeleton; (2) Frontend adapter: extend `src/lib/api.ts` with `streamGenerateProject` + dev fallback; (3) Wire `ProjectCreateModal` to adapter + `SettingsView` API key section; (4) CSP + capabilities + Express bind change + smoke test. Each wave is independently verifiable (Wave 1 via `cargo check` + manual `invoke` from devtools, Wave 2/3 via ProjectCreateModal UI, Wave 4 via `npm run tauri:build`).

## Standard Stack

### Core

| Crate | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `keyring` | `3.3.0` | OS keychain abstraction (Windows Credential Manager / macOS Keychain / Linux Secret Service) | De facto Rust crate for credential storage; cross-platform; simple `Entry::new` API. v3 is the stable API. |
| `rig-core` | `0.41.0` | LLM provider abstraction with streaming + cancellation | ADR-003 locked; native Gemini provider; shares types with Phase 4 GraphFlow integration |
| `tokio` | `1` (features = `["full"]`) | Async runtime; `CancellationToken`, `oneshot::channel`, `Mutex` for AppState | Already transitively pulled by Tauri; explicit dep needed for `CancellationToken` |
| `uuid` | `1` (features = `["v4"]`) | `request_id` generation (frontend-side, but backend parses/uses) | stdlib-quality; `v4` feature for random UUIDs |
| `thiserror` | `1` | Derive `Error` for `AppError` enum | Idiomatic Rust error stack; zero-cost; works with manual `serde::Serialize` |

### Supporting (frontend)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tauri-apps/api` | `^2.11.1` (already installed) | `invoke`, `Channel` from `@tauri-apps/api/core` | All Tauri IPC from frontend — no new dep needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `keyring` v3 (bare crate) | `tauri-plugin-keyring` | **Ponytail: bare `keyring` v3.** Plugin wrapper adds Tauri permission ACL overhead for one entry (`nova.pm-workspace/default`). Bare crate called from inside Rust commands is simpler — the command itself is the permission boundary. Plugin would only matter if we exposed keyring to JS, which D-08 forbids. |
| `keyring` v3 | `keyring` v4.x | **Ponytail: stick v3.** v4 splits into `keyring-core` + backend features, more moving parts for one secret. v3 `Entry::new(&service, &user)` is one line. Upgrade only if v3 gets deprecated. |
| `rig::providers::gemini::Client` | `@google/genai` over HTTP from Rust | **Rig per ADR-003.** Native provider keeps types in Rust, integrates with Phase 4 GraphFlow which expects `rig-core` types. HTTP re-impl would double-work. |

### Cargo.toml additions (verbatim)

```toml
[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
tauri-plugin-shell = "2"
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
# --- Phase 3 additions ---
keyring = "3"
rig-core = "0.41"
tokio = { version = "1", features = ["full"] }
uuid = { version = "1", features = ["v4"] }
thiserror = "1"
```

**Version verification (2026-08-08):** `keyring` v3.3.0 latest v3; `rig-core` v0.41.0 latest; `tokio` v1 latest; `uuid` v1 latest; `thiserror` v1 latest. Release profile (`panic = "abort"`, `lto = true`, `opt-level = "s"`, `codegen-units = 1`, `strip = true`) unchanged.

## Architecture Patterns

### Recommended Project Structure

```
src-tauri/
├── Cargo.toml                          # +5 deps (keyring, rig-core, tokio, uuid, thiserror)
├── src/
│   ├── lib.rs                          # Builder + invoke_handler + AppState registration
│   ├── commands.rs                     # NEW: generate_project, cancel_generate_project, has_api_key, set_api_key
│   ├── error.rs                        # NEW: AppError enum + impl serde::Serialize
│   ├── state.rs                        # NEW: AppState { cancellations: Mutex<HashMap<String, CancellationToken>> }
│   └── llm.rs                          # NEW: rig client init + stream loop (separated from command for testability)
├── capabilities/
│   ├── default.json                    # unchanged (Phase 2)
│   ├── sql.json                        # unchanged (Phase 2)
│   ├── llm.json                        # NEW: generate-project, cancel-generate-project, has-api-key, set-api-key
│   └── keyring.json                    # NEW: only if using tauri-plugin-keyring — Ponytail says skip (see Alternatives)
└── tauri.conf.json                     # app.security.csp + devCsp

src/
├── lib/
│   ├── api.ts                          # extended: + streamGenerateProject, cancelAI, hasAPIKey (keep filename)
│   └── utils.ts                        # unchanged
├── components/
│   ├── ProjectCreateModal.tsx          # swap fetch() → streamGenerateProject() + Stop button + live tokens
│   ├── ui/Toast.tsx                    # unchanged (reuse for IPC errors)
│   └── SettingsApiKeySection.tsx       # NEW: API key input + save
└── views/
    └── SettingsView.tsx                # wire ApiKeySection into 'privacy' nav (already exists)

server.ts                               # line 259: '0.0.0.0' → '127.0.0.1'
```

### Pattern 1: Channel Streaming (the core IPC pattern)

**What:** Tauri 2.x `Channel<T>` for ordered, 1:1 streaming from Rust command to the specific `invoke()` caller.
**When to use:** Any time Rust needs to push >1 message to JS for a single command (token streaming, progress, multi-stage results).
**Why not events:** `emit`/`listen` is broadcast (any window hears), requires manual `unlisten`, ordering is not guaranteed across separate emits, and listener leaks are the documented pitfall (PITFALLS.md §Pitfall 4).

```rust
// Source: https://v2.tauri.app/develop/calling-rust/#channels-for-streaming
use tauri::ipc::Channel;

#[derive(serde::Serialize, Clone)]
#[serde(tag = "kind", content = "data")]  // ponytail: tag-and-content = one field switch in JS
enum StreamChunk {
    #[serde(rename = "token")]
    Token { text: String },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { message: String },
}

#[tauri::command]
async fn generate_project(
    prompt: String,
    files_context: String,
    request_id: String,
    on_token: Channel<StreamChunk>,
    state: tauri::State<'_, AppState>,
) -> Result<GenerateProjectResult, AppError> {
    // ... stream loop ...
    on_token.send(StreamChunk::Token { text: chunk }).await;
    // ... done ...
    on_token.send(StreamChunk::Done);
    Ok(result)
}
```

**Ponytail note on D-02 schema mismatch:** CONTEXT.md D-02 specified `StreamChunk { kind, text, error }` as a flat struct. The `#[serde(tag = "kind", content = "data")]` enum above is the idiomatic shape — same wire format semantically (a `kind` discriminator), but `text`/`error` are only present in their variant. Saves the planner from inventing a struct that has `Option<String>` everywhere. If the planner prefers literal D-02 fidelity, replace the enum with:

```rust
#[derive(serde::Serialize, Clone)]
struct StreamChunk { kind: &'static str, text: Option<String>, error: Option<String> }
```
Either is fine; enum is more Rust-idiomatic, struct is closer to D-02 verbatim. Planner's call.

### Pattern 2: Cancellation via CancellationToken + AppState

**What:** Centralized `HashMap<request_id, CancellationToken>` in Tauri-managed `AppState`. Stop button invokes a separate command that looks up by id and fires `cancel()`.
**When to use:** Any long-running Rust command that JS should be able to abort.

```rust
// src-tauri/src/state.rs
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::CancellationToken;

pub struct AppState {
    pub cancellations: Mutex<HashMap<String, CancellationToken>>,
    // api_key is fetched from keyring per-call, NOT stored here (D-08: avoid lifetime/cache issues)
}

// in generate_project:
let cancel_token = CancellationToken::new();
state.cancellations.lock().unwrap().insert(request_id.clone(), cancel_token.clone());

tokio::select! {
    _ = stream_loop(prompt, files_context, &on_token, &cancel_token) => {
        // normal completion
    }
    _ = cancel_token.cancelled() => {
        state.cancellations.lock().unwrap().remove(&request_id);
        return Err(AppError::Cancelled);
    }
}
state.cancellations.lock().unwrap().remove(&request_id);  // ponytail: cleanup on success path too

#[tauri::command]
async fn cancel_generate_project(request_id: String, state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    if let Some(token) = state.cancellations.lock().unwrap().remove(&request_id) {
        token.cancel();
    }
    Ok(())
}
```

### Pattern 3: Frontend Adapter (isTauri branch)

**What:** Single chokepoint in `src/lib/api.ts` (extended from Phase 2). Tauri path uses `Channel`, dev path uses `fetch` + `AbortController`. Callers see one async function.

```ts
// src/lib/api.ts (extended)
import { isTauri } from './api';  // Phase 2 helper

export async function streamGenerateProject(
  prompt: string,
  filesContext: string,
  onToken: (text: string) => void,
  signal?: AbortSignal,  // dev-mode cancellation
): Promise<GenerateProjectResult> {
  if (isTauri()) {
    const { invoke, Channel } = await import('@tauri-apps/api/core');
    const requestId = crypto.randomUUID();
    const channel = new Channel();
    channel.onmessage = (msg: { kind: string; text?: string }) => {
      if (msg.kind === 'token' && msg.text) onToken(msg.text);
    };
    // cancellation: separate invoke, fire-and-forget
    signal?.addEventListener('abort', () => {
      invoke('cancel_generate_project', { requestId }).catch(() => {});
    });
    return invoke('generate_project', { prompt, filesContext: filesContext, requestId, onToken: channel });
  }
  // dev fallback: Express, no streaming (Ponytail: web fallback not streaming per Deferred)
  const resp = await fetch('/api/generate-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, filesContext }),
    signal,
  });
  if (!resp.ok) throw new Error(`Generation failed: ${resp.status}`);
  const data = await resp.json();
  if (data.tokens) data.tokens.forEach(onToken);  // replay tokens in dev for UX parity
  return data;
}

export async function hasAPIKey(): Promise<boolean> {
  if (!isTauri()) return true;  // dev: assume Express has key via .env
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('has_api_key');
}

export async function setAPIKey(key: string): Promise<void> {
  if (!isTauri()) return;  // dev: no-op, .env is source
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_api_key', { key });
}
```

**Ponytail: keep `api.ts` filename** — D-15 offered "extend api.ts OR rename to tauri.ts". Keep `api.ts`. The Phase 2 file header already says "Phase 3 IPC adapter will live here too". Renaming breaks imports in TitleBar/sqliteStorage for zero benefit. The "chokepoint" claim is about what the file exports, not its name.

### Pattern 4: AppError with manual Serialize

```rust
// src-tauri/src/error.rs
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("network error: {0}")]
    NetworkError(String),
    #[error("invalid api key")]
    AuthError,
    #[error("rate limited")]
    RateLimited,
    #[error("parse error: {0}")]
    ParseError(String),
    #[error("response truncated")]
    Truncated,
    #[error("cancelled")]
    Cancelled,
    #[error("internal error: {0}")]
    InternalError(String),
}

// ponytail: serialize_str is one line, beats deriving a custom serde format
// that would force every variant to be a struct. Frontend splits on the string.
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
```

**Note on D-12:** CONTEXT.md D-12 specifies JSON shape `{ variant: "NetworkError", message: "..." }`. The `serialize_str` above produces a bare JSON string `"network error: ..."`. Both work — bare string is simpler for JS (`err` becomes a string directly). If the planner wants the structured shape (e.g., for branch-on-variant in `src/lib/api.ts` error mapping), use:

```rust
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("variant", match self {
            AppError::NetworkError(_) => "NetworkError",
            AppError::AuthError => "AuthError",
            AppError::RateLimited => "RateLimited",
            AppError::ParseError(_) => "ParseError",
            AppError::Truncated => "Truncated",
            AppError::Cancelled => "Cancelled",
            AppError::InternalError(_) => "InternalError",
        })?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}
```
**Ponytail recommendation: bare `serialize_str` is enough.** Frontend `src/lib/api.ts` already wraps errors via `Promise<T>` rejection with `.message`, and D-14 maps human-readable strings for the toast. Branch-on-variant in JS is YAGNI for one migrated endpoint. If the planner wants variant info, prefix the message: `format!("{}: {}", variant_name, detail)`.

### Pattern 5: Rig Integration (D-10 + D-24)

```rust
// src-tauri/src/llm.rs
use rig::providers::gemini;
use rig::message::Message;
use rig::client::CompletionClient;

pub async fn stream_generate(
    api_key: &str,
    user_prompt: String,
    files_context: String,
    on_token: &tauri::ipc::Channel<crate::commands::StreamChunk>,
    cancel: &tokio::sync::CancellationToken,
) -> Result<GenerateProjectResult, crate::error::AppError> {
    let client = gemini::Client::new(api_key.to_string());
    let model = client.completion_model(crate::LLM_MODEL);  // e.g. "gemini-2.5-flash"

    // D-24: system_instruction is program-constructed (no user input);
    // user_prompt + files_context go into contents only.
    let system = "You are a senior PM assistant...".to_string();
    let user_content = format!("{}\n\nFiles:\n{}", user_prompt, files_context);

    let mut stream = model.stream_prompt(user_content)
        .system(&system)
        .await
        .map_err(|e| crate::error::AppError::NetworkError(e.to_string()))?;

    let mut full = String::new();
    while let Some(chunk) = stream.next().await {
        if cancel.is_cancelled() { return Err(crate::error::AppError::Cancelled); }
        let text = chunk.map_err(|e| crate::error::AppError::ParseError(e.to_string()))?.choice;
        full.push_str(&text);
        on_token.send(crate::commands::StreamChunk::Token { text }).await;
    }
    Ok(GenerateProjectResult { content: full })
}
```

**API surface warning (LOW confidence):** The exact `rig-core` v0.41 streaming API (`stream_prompt` vs `stream` vs `stream_chat`) could not be fully verified via web fetch — the docs.rs/rig page failed to load. **Wave 1 must include a 10-minute spike** that prints a real streaming response from Gemini before building the rest of the integration. The pattern above is the canonical shape (provider client → completion model → stream method → tokio StreamExt::next loop), but exact method names may differ. Check `cargo doc --open -p rig-core` after adding the dep, or read https://github.com/0xPlaygrounds/rig/blob/main/rig-core/src/provider/gemini.rs directly.

### Pattern 6: CSP (with critical IPC fix)

**CRITICAL FINDING:** CONTEXT.md D-17 CSP string is **missing `connect-src: "ipc: http://ipc.localhost"`**. Tauri v2 IPC requires this directive — without it, `invoke()` calls silently fail CSP in production (works in dev because `devCsp` is permissive). This is documented at https://v2.tauri.app/security/csp/ and reinforced in the Tauri 2.x default template.

**Corrected production CSP** (D-17 + IPC fix):

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost https://generativelanguage.googleapis.com;
frame-src 'none';
object-src 'none';
```

The only change vs D-17: added `ipc: http://ipc.localhost` to `connect-src`. The Gemini endpoint is preserved. **Planner must use this corrected string** — using D-17 verbatim will break IPC in production and the failure will be invisible (devCsp masks it during dev).

**Dev CSP** (`app.security.devCsp`) — permissive for Vite HMR:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost http://localhost:3000 ws://localhost:3000 https://generativelanguage.googleapis.com;
frame-src 'none';
object-src 'none';
```

The dev additions: `'unsafe-inline'` on `script-src` (Vite HMR injection), `http://localhost:3000 ws://localhost:3000` on `connect-src` (Vite dev server + WebSocket HMR). Production drops both.

### Pattern 7: Express dev-only refactor

```jsonc
// src-tauri/tauri.conf.json (app.security + beforeBuildCommand changes)
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https://generativelanguage.googleapis.com; frame-src 'none'; object-src 'none';",
      "devCsp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost http://localhost:3000 ws://localhost:3000 https://generativelanguage.googleapis.com; frame-src 'none'; object-src 'none';"
    }
  },
  "build": {
    "beforeDevCommand": "bunx tsx server.ts",     // unchanged (dev needs Express for fallback)
    "beforeBuildCommand": "bunx vite build",       // CHANGED: was "bunx tsx server.ts" then vite build — drop server from prod
    "frontendDist": "../dist"
  }
}
```

**Ponytail check on D-22:** The CONTEXT claim was that `beforeBuildCommand` previously contained both `bunx tsx server.ts` AND a vite build step. Reading `tauri.conf.json` directly: `beforeBuildCommand` is already just `"bunx vite build"` — verified during research. **D-22 may already be satisfied.** Planner should diff the actual file vs the assumption and only change what's actually there. The change required may be zero lines.

```ts
// server.ts line 259 (D-23)
app.listen(PORT, '0.0.0.0', () => { ... });
// becomes:
app.listen(PORT, '127.0.0.1', () => { ... });
```

One character (well, several). Done.

### Anti-Patterns to Avoid

- **Hand-rolling event-based streaming instead of Channel:** PITFALLS §Pitfall 4 — listener leak, ordering issues, broadcast (any window hears). Channel is 1:1, lifecycle-bound to invoke, ordered.
- **Storing API key in `AppState`:** D-08 forbids exposing to JS, and storing in long-lived state creates caching/lifetime bugs. **Fetch from keyring inside each command invocation** — keyring reads are cheap (sub-millisecond on Windows/macOS) and avoid stale key after user updates it.
- **Using `tauri-plugin-keyring` for one secret:** Adds plugin permission layer for zero benefit. Bare `keyring` crate called inside Rust command is the boundary.
- **CSP with `csp: null` "temporarily":** PITFALLS §Pitfall 7 — works in dev, breaks in prod, regression risk. CSP MUST land in same phase as IPC.
- **Testing CSP only in dev:** `devCsp` is permissive. CSP violations only surface in `npm run tauri:build` + installer. **SEC-02 explicit: must verify in prod build.**
- **Returning API key to JS even for "validation":** D-08 — JS only sees `has_api_key() -> bool`. Never the key itself.
- **`rig-core` API assumption without spike:** v0.41 streaming surface is not fully documented online. Wave 1 spike is mandatory.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming tokens Rust→JS | Custom event emit/listen, custom ordering buffer | `tauri::ipc::Channel<T>` | Channel is 1:1 with invoke, lifecycle-bound, ordered, backpressure-aware. Events are broadcast (leak), require manual unlisten, no ordering guarantee. |
| OS keychain access | Win32 API calls, Security framework bindings, DBus Secret Service | `keyring = "3"` crate | Handles 3 platforms in 5 lines; secret schema quirks (Windows generic credential, macOS generic password, Linux DBus) are non-trivial. |
| LLM provider abstraction | Direct Gemini HTTP calls from Rust | `rig-core = "0.41"` | Already chosen by ADR-003; integrates with Phase 4 GraphFlow; provider swap (OpenAI/Anthropic) is one line vs rewrite. |
| Cancellation | Custom bool flag + polling, channel polling | `tokio::sync::CancellationToken` | stdlib of async Rust; `tokio::select!` integration; zero-cost when not cancelled. |
| Request ID | Custom counter, nanosecond timestamp | `crypto.randomUUID()` (frontend) / `uuid::Uuid::new_v4()` (backend) | Collision-proof; standard; D-05 already chose this. |
| Error enum boilerplate | Manual `Display` impl | `thiserror::Error` derive | Idiomatic; zero-cost; works with manual `Serialize`. |
| Password input UI | Custom masked input | Existing `<Input type="password" />` from `src/components/ui/Input.tsx` | Already built and tested in Phase 1; same a11y, same focus ring. |

**Key insight:** Phase 3 introduces zero new abstractions. Every concern has a battle-tested crate or existing component. The only novel code is the 50-line `generate_project` command that wires them together.

## Runtime State Inventory

Phase 3 is a **new feature / migration** phase, not a rename/refactor. The runtime state category that matters here is **secrets and env vars** — and only one item qualifies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None affected. SQLite `nova.db` schema unchanged (Phase 2 owns it). | None |
| Live service config | None. No external service stores the "nova" string as registered config. | None |
| OS-registered state | **NEW:** OS keychain entry will be created on first user save. Service `nova.pm-workspace`, account `default`. | Code edit only — `keyring::Entry::new("nova.pm-workspace", "default")`. No pre-migration needed. |
| Secrets/env vars | **MIGRATING:** `GEMINI_API_KEY` in `.env` (Express dev reads via dotenv). Phase 3 keeps `.env` for dev/Express (D-09), adds OS keychain as production source. | No env rename. Two parallel paths: dev=`.env`, prod=keychain. User must enter key into Settings once on first prod launch. |
| Build artifacts | **NEW:** `keyring`/`rig-core`/`tokio`/`uuid`/`thiserror` will be compiled into release binary. Larger `.exe`/`.app`. | Code edit (Cargo.toml). No artifact migration; first `tauri:build` after the change produces the new binary. |

**Canonical question answer:** After Phase 3 lands, the only runtime system holding old state is the user's `.env` file — and we deliberately keep it (D-09, dev fallback). The OS keychain is the new prod source; users on first prod launch will need to re-enter their key once. No data migration script needed.

## Common Pitfalls

### Pitfall 1: CSP works in dev, breaks in prod (silent IPC failure)
**What goes wrong:** App runs perfectly via `npm run tauri:dev`. After `npm run tauri:build` + install, every `invoke()` silently fails. DevTools console (if attached) shows CSP violation: `Refused to connect to ipc://...`.
**Why it happens:** `devCsp` is more permissive (allows Vite HMR + dev IPC). Production `csp` is stricter. Tauri v2 IPC requires `connect-src: "ipc: http://ipc.localhost"`. CONTEXT.md D-17 missed this directive.
**How to avoid:** Use the **corrected CSP** in Architecture §Pattern 6, not D-17 verbatim. Verify via `npm run tauri:build` + installer run (not dev).
**Warning signs:** App works in `tauri dev`, fails or hangs in `tauri build`. Any `invoke()` returning "not allowed" or hanging indefinitely.

### Pitfall 2: Capability silent rejection (PITFALLS §Pitfall 5)
**What goes wrong:** Tauri command exists, frontend calls `invoke('generate_project')`, but call returns permission error or silently does nothing. No visible error in console.
**Why it happens:** Tauri v2 capability ACL is checked at runtime. Missing capability = silent reject. Capability identifier mismatch (e.g., `generate-project` vs `generate_project`, snake/kebab) also fails silently.
**How to avoid:** Match capability `permissions` array EXACTLY to command identifiers in `invoke_handler!`. Convention: command `generate_project` → permission `allow-generate-project` (Tauri auto-derives kebab-case permission name). Test each command via `invoke()` from devtools console before declaring done.
**Warning signs:** Command works when invoked from Rust internal tests but not from webview. Console shows "permission missing" only with verbose logging.

### Pitfall 3: rig-core v0.41 streaming API drift
**What goes wrong:** Code follows an example from a 2024 blog post; v0.41 has renamed methods or different stream item shape. Compile errors or runtime panics.
**Why it happens:** `rig-core` is pre-1.0 (per STATE.md blocker note). Breaking changes between minor versions. Online examples are stale.
**How to avoid:** **Wave 1 spike — 10 minutes.** Add `rig-core = "0.41"` to Cargo.toml alone, run `cargo doc --open -p rig-core`, find the actual streaming method signature on the Gemini CompletionModel, write a 20-line `#[tokio::main] async fn main()` that streams one response to stdout. THEN build the command around the verified API.
**Warning signs:** Compile errors mentioning `stream_prompt` or `stream_chat` not found. Type mismatches on stream items.

### Pitfall 4: API key caching in AppState
**What goes wrong:** User changes API key in Settings → next `generate_project` call still uses old key → "AuthError" toast.
**Why it happens:** Dev stored key in `AppState` at startup for "performance".
**How to avoid:** **Fetch from keyring inside each command call** (Architecture §Pattern 5 already does this). keyring reads are sub-millisecond. No cache.
**Warning signs:** User must restart app to use new API key.

### Pitfall 5: Channel.onmessage fires after React unmount
**What goes wrong:** User closes ProjectCreateModal mid-stream. Channel keeps firing `onmessage`. setState on unmounted component → React warning, or token leak.
**Why it happens:** Channel has no built-in unmount hook.
**How to avoid:** In `streamGenerateProject` adapter, accept an `AbortSignal`. On abort, fire `cancel_generate_project` IPC (which stops Rust stream → Channel completes → no more messages). The adapter pattern in §Pattern 3 already wires this.
**Warning signs:** React warning "Can't perform a React state update on an unmounted component" in console during stream.

### Pitfall 6: Tailwind v4 inline styles blocked by over-strict CSP
**What goes wrong:** Build app, all styling disappears in production. Console full of `style-src` violations.
**Why it happens:** Tailwind v4 (and Radix, and motion) inject inline styles at runtime. `style-src 'self'` (no `'unsafe-inline'`) blocks them all.
**How to avoid:** D-17 already has `style-src 'self' 'unsafe-inline'` — keep it. Do NOT tighten to nonce-based in this phase (Deferred explicitly).
**Warning signs:** App renders unstyled in prod build.

### Pitfall 7: Cargo release profile blows up build time
**What goes wrong:** After adding `rig-core` + `tokio` (large), first `tauri:build` takes 10+ minutes.
**Why it happens:** Existing profile has `lto = true`, `codegen-units = 1`, `opt-level = "s"`. Combined with `rig-core`'s dependency tree, compile time explodes.
**How to avoid:** Accept the cost for release. For dev, `tauri:dev` uses debug profile (fast). Do NOT change release profile in Phase 3 — `opt-level = "s"` produces smaller binaries which matters for distribution. Build time is a one-time cost.
**Warning signs:** CI timeouts (we have no CI yet, so this is local annoyance only).

## Code Examples

### Tauri Command (Rust) — `generate_project`

```rust
// src-tauri/src/commands.rs
use tauri::ipc::Channel;
use tauri::State;
use crate::error::AppError;
use crate::state::AppState;
use crate::llm;

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

#[derive(serde::Serialize)]
pub struct GenerateProjectResult {
    pub content: String,
}

#[tauri::command]
pub async fn generate_project(
    prompt: String,
    files_context: String,
    request_id: String,
    on_token: Channel<StreamChunk>,
    state: State<'_, AppState>,
) -> Result<GenerateProjectResult, AppError> {
    // 1. Register cancellation
    let cancel_token = tokio_util::sync::CancellationToken::new();
    // ponytail: tokio::sync::CancellationToken (no tokio-util dep needed in tokio 1.x "full")
    state.cancellations.lock().unwrap().insert(request_id.clone(), cancel_token.clone());

    // 2. Fetch API key from keyring (D-08: never return to JS)
    let key = keyring::Entry::new("nova.pm-workspace", "default")
        .get_password()
        .map_err(|e| match e {
            keyring::Error::NoEntry => AppError::AuthError,
            _ => AppError::InternalError(format!("keyring: {}", e)),
        })?;

    // 3. Stream via Rig (D-10 + D-24)
    let result = llm::stream_generate(&key, prompt, files_context, &on_token, &cancel_token).await;

    // 4. Cleanup (always, success or error)
    state.cancellations.lock().unwrap().remove(&request_id);

    result
}

#[tauri::command]
pub async fn cancel_generate_project(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    if let Some(token) = state.cancellations.lock().unwrap().remove(&request_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub async fn has_api_key() -> Result<bool, AppError> {
    match keyring::Entry::new("nova.pm-workspace", "default").get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Ok(false),  // ponytail: treat any keyring error as "no key" — user will be prompted
    }
}

#[tauri::command]
pub async fn set_api_key(key: String) -> Result<(), AppError> {
    keyring::Entry::new("nova.pm-workspace", "default")
        .set_password(&key)
        .map_err(|e| AppError::InternalError(format!("keyring set: {}", e)))
}
```

**Note on CancellationToken import:** `tokio::sync::CancellationToken` is the canonical location in tokio 1.x with `features = ["full"]`. If it's actually under `tokio_util::sync::CancellationToken`, swap the import — Wave 1 spike will catch this in `cargo check`. The pattern is identical either way.

### Invoke Handler Registration

```rust
// src-tauri/src/lib.rs (extend existing run())
use nova_lib::commands::{generate_project, cancel_generate_project, has_api_key, set_api_key};
use nova_lib::state::AppState;
use std::collections::HashMap;
use std::sync::Mutex;

pub fn run() {
    tauri::Builder::default()
        .plugin(/* Phase 2 sql plugin — unchanged */)
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            cancellations: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_gnome_color_scheme,            // Phase 1
            generate_project,                   // Phase 3 NEW
            cancel_generate_project,            // Phase 3 NEW
            has_api_key,                        // Phase 3 NEW
            set_api_key,                        // Phase 3 NEW
        ])
        .setup(|app| { /* ... unchanged Phase 2 ... */ Ok(()) })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Capability File — `src-tauri/capabilities/llm.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "llm",
  "description": "AI generation IPC commands (Phase 3) — streaming + cancellation + keyring access",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "generate-project:allow",
    "cancel-generate-project:allow",
    "has-api-key:allow",
    "set-api-key:allow"
  ]
}
```

**Identifier convention warning:** Tauri v2 auto-derives permission names from command names. The exact permission identifiers (`generate-project:allow` vs `core:event:allow-emit` etc.) MUST be verified against `src-tauri/gen/schemas/desktop-schema.json` after first `tauri dev` run post-code-change. The schema file is auto-generated and authoritative. If permission identifiers in this file don't match, capability will silently reject (Pitfall 2). Planner should add a Wave 4 task: "verify `gen/schemas/desktop-schema.json` contains each command's permission identifier before declaring SEC-03/SEC-04 done."

### Frontend — ProjectCreateModal swap

```tsx
// src/components/ProjectCreateModal.tsx (line 44 region)
// BEFORE:
const response = await fetch('/api/generate-project', { ... });

// AFTER:
const abortController = new AbortController();
let streamed = '';
await streamGenerateProject(
  prompt,
  filesContext,
  (token) => {
    streamed += token;
    setGeneratedText(streamed);  // live update UI
  },
  abortController.signal,
);
// Stop button onClick: () => abortController.abort()
```

### Frontend — SettingsView API Key Section

```tsx
// src/components/SettingsApiKeySection.tsx (NEW)
import { useEffect, useState } from 'react';
import { Input } from '@/src/components/ui/Input';
import { Button } from '@/src/components/ui/Button';
import { useToast } from '@/src/components/ui/Toast';
import { hasAPIKey, setAPIKey } from '@/src/lib/api';

export function SettingsApiKeySection() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const { toast } = useToast();

  useEffect(() => { hasAPIKey().then(setHasKey); }, []);

  const handleSave = async () => {
    if (!input.trim()) return;
    try {
      await setAPIKey(input.trim());
      setHasKey(true);
      setInput('');
      toast({ type: 'success', title: 'API key saved', description: 'Stored in OS keychain' });
    } catch (e) {
      toast({ type: 'error', title: 'Save failed', description: (e as Error).message });
    }
  };

  if (hasKey === null) return null;  // loading
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        {hasKey
          ? 'API key is set. Update below to replace.'
          : 'Stored in OS keychain. Never written to app files.'}
      </p>
      <Input
        type="password"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Gemini API key"
      />
      <Button variant="primary" onClick={handleSave} disabled={!input.trim()}>
        {hasKey ? 'Update key' : 'Save key'}
      </Button>
    </div>
  );
}

// src/views/SettingsView.tsx — replace 'privacy' placeholder
// {activeSection === 'privacy' && <SettingsApiKeySection />}
```

### server.ts bind change (D-23)

```ts
// server.ts line 259
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
```

### tauri.conf.json — production CSP + devCsp

See Architecture §Pattern 7 — the full JSONC snippet with both CSP strings inline.

## Validation Architecture

**Skipped per .planning/config.json `workflow.nyquist_validation: false`.**

Phase 3 has no test framework (no jest/vitest, no Rust test harness beyond `cargo test` default). Validation is manual + smoke. The phase verifier step (`/gsd:verify-work`) will run the manual checklist below.

## Manual Validation Plan (for `03-HUMAN-UAT.md`)

### Wave 1 — Rust Foundation (after Cargo deps + commands compile)

- [ ] `cargo check` passes (no warnings beyond unused imports during scaffolding)
- [ ] `cargo build` produces binary without errors
- [ ] Wave 1 spike: standalone `cargo run --example rig_stream_check` (or quick `fn main()` test) successfully streams one Gemini response to stdout with a real API key
- [ ] Tauri commands registered: `tauri dev` → DevTools console → `__TAURI_INTERNALS__` exists → no errors on app boot

### Wave 2 — Frontend Adapter (after `src/lib/api.ts` extended)

- [ ] `npm run lint` (`tsc --noEmit`) passes
- [ ] Dev mode: `npm run dev` → call `hasAPIKey()` from DevTools → returns `true` (web fallback, D-15)
- [ ] Tauri dev: `npm run tauri:dev` → call `hasAPIKey()` from DevTools → returns `false` initially (keychain empty)

### Wave 3 — Wire UI (after ProjectCreateModal + SettingsApiKeySection)

- [ ] Settings → Privacy section → enter API key → "Save key" → toast success
- [ ] Settings → close → reopen → "API key is set" text appears (persisted)
- [ ] ProjectCreateModal → fill prompt → submit → live tokens stream into UI
- [ ] Click Stop mid-generation → generation halts within 1s, toast "Cancelled" silent or absent (D-14)
- [ ] Network cable pull mid-generation → toast "网络连接失败,请检查网络" (D-14 NetworkError)
- [ ] Set invalid API key → trigger generation → toast "API key 无效,请到 Settings 更新" (D-14 AuthError)
- [ ] Click generate button while already generating → button is disabled (IPC-05)

### Wave 4 — CSP + Capabilities + Express (after CSP landed)

**MUST use production build, not dev (SEC-02 explicit):**

- [ ] `npm run tauri:build` completes without error
- [ ] Install the resulting `.exe` (or `.app`/AppImage)
- [ ] Launch installed app — opens without console errors
- [ ] DevTools console — NO CSP violations during normal use
- [ ] Visit every view (Product / Tasks / R&D / Schedule / Files / Knowledge / Settings) — no CSP errors
- [ ] Open every modal (Create Product, Workspace Summary, Add Document) — no CSP errors
- [ ] Trigger `generate-project` via ProjectCreateModal in production — streams tokens successfully (CSP `connect-src ipc:` works)
- [ ] DevTools Network tab — no failed `ipc://` requests

**Smoke test script (D-20, manual):**

```bash
# scripts/smoke-ipc.md (or .sh) — instructions to run from DevTools console in tauri:dev
# Paste each line, verify response shape:
await window.__TAURI__.core.invoke('has_api_key')       // expect false initially
await window.__TAURI__.core.invoke('set_api_key', { key: 'test' })  // expect undefined
await window.__TAURI__.core.invoke('has_api_key')       // expect true
await window.__TAURI__.core.invoke('cancel_generate_project', { requestId: 'nope' })  // expect null/undefined, no error
```

If any invoke throws "permission denied" or returns nothing, capability file is wrong (Pitfall 2).

- [ ] Each of the 4 commands above responds correctly when pasted into DevTools console

**Express bind check (D-23):**

- [ ] `npm run dev` → server logs show `127.0.0.1:3000` not `0.0.0.0:3000`
- [ ] From another machine on LAN, `curl http://<this-machine-ip>:3000/` → connection refused

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tauri v1 event-based streaming (`emit`/`listen`) | Tauri v2 `Channel<T>` | Tauri 2.0 (2024) | No listener cleanup needed; 1:1 with invoke; ordered |
| `csp: null` (Nova current) | Explicit CSP with `connect-src ipc:` | Mandatory post-Tauri-2 for IPC | Without `ipc:` in connect-src, all invoke() fail in prod |
| API key in `.env` bundled with Tauri | API key in OS keychain via `keyring` crate | Nova Phase 3 | Key not in binary; user enters once; survives uninstall-reinstall (per-OS behavior) |
| `@google/genai` from JS | `rig-core` from Rust | ADR-003 + Phase 3 | Key never touches JS; types shared with Phase 4 GraphFlow |
| `tokio-util::sync::CancellationToken` | `tokio::sync::CancellationToken` | tokio 1.x with `sync` feature | No separate `tokio-util` dep needed (verify during Wave 1) |

**Deprecated/outdated:**
- `tauri::Window::emit` for streaming — replaced by `Channel<T>` in v2
- `tauri::State<AppState>` with `RwLock<HashMap>` — `Mutex<HashMap>` is fine for low-contention cancellation map
- `keyring` v4.x split API — use v3.3.0 stable

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain (stable) | All Rust code | Yes (Tauri build works) | stable (2026 edition) | — |
| `keyring` OS backend (Windows Cred Manager / macOS Keychain / Linux Secret Service) | SEC-05 keychain storage | Yes (Windows 11 — verified via env) | OS-native | None — Linux without Secret Service falls back to error toast on first save; user must install `gnome-keyring` or `kwallet`. Ponytail: acceptable, document in `03-HUMAN-UAT.md`. |
| `@tauri-apps/api` 2.11.1 | Frontend IPC | Yes (already in `package.json`) | 2.11.1 | — |
| Bun (for `bunx` before-commands) | Tauri dev/build | Optional | — | Tauri falls back to npx; verified working in Phase 2 |
| `GEMINI_API_KEY` env var (dev only) | Express dev server (`npm run dev`) | Yes (`.env` exists) | — | Endpoints return canned templates when unset (existing behavior) |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — all required deps available or installable via Cargo/npm.

## Open Questions

1. **Exact `rig-core` v0.41 streaming API surface**
   - What we know: Provider client → CompletionModel → some `stream_*` method → tokio Stream of chunks
   - What's unclear: Method name (`stream_prompt` vs `stream` vs `stream_chat`), chunk shape (`{ choice: String }` vs `Message` vs other)
   - Recommendation: Wave 1 spike (10 min, `cargo doc --open -p rig-core`) before implementing `llm::stream_generate`. Code Examples §Pattern 5 is the shape but exact method names need verification.

2. **`tokio::sync::CancellationToken` vs `tokio_util::sync::CancellationToken` location**
   - What we know: One of them is canonical for tokio 1.x
   - What's unclear: Which crate exports it without feature flag surprises
   - Recommendation: Wave 1 `cargo check` will resolve. If `tokio` with `["full"]` doesn't expose it, add `tokio-util = { version = "0.7", features = ["rt"] }` — 5-second fix.

3. **Capability permission identifier convention**
   - What we know: Tauri v2 auto-derives from command names
   - What's unclear: Exact form (`generate-project:allow` vs `core:allow-generate-project` vs custom)
   - Recommendation: After first `tauri dev` post-Wave-1, inspect `src-tauri/gen/schemas/desktop-schema.json` — it lists every permission identifier the ACL accepts. Match the capability file to that, not to guesses.

4. **Whether D-22 (remove Express from prod bundle) is already done**
   - What we know: Current `tauri.conf.json` `beforeBuildCommand` reads as `"bunx vite build"` (single command)
   - What's unclear: Whether CONTEXT.md author re-checked the file, or assumed older state
   - Recommendation: Planner reads `src-tauri/tauri.conf.json` directly. If already `"bunx vite build"`, D-22 is zero-effort — mark done in plan.

## Sources

### Primary (HIGH confidence)

- **Tauri v2 — Calling Rust from Frontend (Channel API):** https://v2.tauri.app/develop/calling-rust/#channels-for-streaming
  - Verified: `Channel<T>` is ordered, lifecycle-bound, the recommended streaming primitive
- **Tauri v2 — CSP Documentation:** https://v2.tauri.app/security/csp/
  - Verified: `app.security.csp` (production) and `app.security.devCsp` (dev) both exist in Tauri 2.x SecurityConfig
  - Verified: `connect-src: "ipc: http://ipc.localhost"` is required for IPC
- **`keyring` crate (crates.io):** https://crates.io/crates/keyring
  - Verified: v3.3.0 latest v3; v4.x exists as split-core but v3 is simpler for one secret
- **`rig-core` crate (crates.io):** https://crates.io/crates/rig
  - Verified: v0.41.0 latest stable
- **Tauri v2 — Capabilities/Permissions ACL:** https://v2.tauri.app/security/capabilities/
  - Verified: per-feature capability files, silent rejection pattern
- **Local codebase (Ponytail — read before recommend):**
  - `src-tauri/src/lib.rs` — Phase 2 plugin registration pattern
  - `src-tauri/Cargo.toml` — current deps + release profile
  - `src-tauri/capabilities/sql.json` — capability file pattern
  - `src/lib/api.ts` — Phase 2 `isTauri()` extension point
  - `src/components/ProjectCreateModal.tsx` — current `/api/generate-project` caller
  - `src/views/SettingsView.tsx` — Phase 1 SegmentedControl pattern, 'privacy' nav
  - `src/components/ui/Toast.tsx` — `useToast()` API for IPC error display
  - `src-tauri/tauri.conf.json` — current `csp: null`, `beforeBuildCommand` already single-command

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md` §Pitfall 4 (events vs Channel), §Pitfall 5 (capabilities silent reject), §Pitfall 6 (API key in bundle), §Pitfall 7 (CSP + Tailwind 'unsafe-inline')
- `.planning/codebase/CONCERNS.md` — Express 0.0.0.0 + no CORS (HIGH), API key in bundle (HIGH), CSP null (MEDIUM)
- `docs/DECISIONS.md` §ADR-003 (Rig as LLM layer), §ADR-005 (zero-sidecar)
- WebSearch confirmation: `keyring` v3.3.0 latest, `rig-core` v0.41.0 latest (both 2026-08-08)

### Tertiary (LOW confidence)

- **Exact `rig-core` v0.41 streaming method names** — docs.rs page did not load during research; Wave 1 spike will resolve
- **Exact Tauri permission identifier format for custom commands** — pattern inferred from sql.json example, must verify against `gen/schemas/desktop-schema.json` post-`tauri dev`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all crate versions verified against crates.io 2026-08-08
- Architecture: HIGH — Tauri Channel + keyring + CSP patterns verified against official Tauri v2 docs
- Pitfalls: HIGH — 4 of 7 pitfalls pulled from project-curated `.planning/research/PITFALLS.md`, rest from Tauri docs
- Rig API surface: LOW — pre-1.0 crate, docs.rs unreachable, Wave 1 spike mandatory

**Research date:** 2026-08-08
**Valid until:** 2026-09-08 (stable Tauri/keyring/Rig APIs — 30 days; rig-core has higher drift risk, recheck before Phase 4)
