# Phase 3: Tauri IPC Migration + Security Baseline - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning
**Mode:** --auto (recommended defaults auto-selected, no interactive AskUserQuestion)

<domain>
## Phase Boundary

把 5 个 Gemini AI 端点中的 **至少 1 个**(`generate-project`)从 Express 迁移到 Tauri IPC commands,使用 `Channel<T>` 流式输出 token;API key 通过 `keyring` crate 直连 OS keychain 存储(从 `.env` 移出);生产 Tauri build 落地显式 CSP(`script-src 'self'`、`style-src 'self' 'unsafe-inline'`);Express 收缩到 dev-only、绑 `127.0.0.1`、从 prod bundle 移除。

**明确不在范围内:**
- 其余 4 个 AI 端点的 Tauri 迁移(summarize-workspace、workspace-files、rnd/generate-deliverable、rnd/polish-knowledge-article)— Phase 3 只迁移 1 个 PoC,验证模式后扩展
- GraphFlow + Rig PoC 本身(Phase 4)
- 第二大脑(LanceDB)
- AppContext.tsx 全量移除(PROJECT.md Out of Scope)

**强制前置:** Phase 2 的 `isTauri()` 在 `src/lib/api.ts` 已建立(IPC-02 复用);`capabilities/` 目录 + `sql.json` 模式已建立(Phase 2 SEC-03 复用)。

</domain>

<decisions>
## Implementation Decisions

### Endpoint Migration Scope (IPC-01, IPC-03)

- **D-01:** 只迁移 `generate-project` 一个端点作为 PoC(ROADMAP success criteria 1 明确说 "at least one")。理由:Channel streaming 模式 + cancellation + 错误处理是新模式,先验证 1 个端到端跑通,再扩展。其余 4 个端点保持 Express 调用不变(dev mode),Tauri prod 模式下走相同 IPC 适配器但暂未实现(返回"未迁移"错误)。
- **D-02:** 新增 Tauri command `generate_project(prompt: String, files_context: String, on_token: Channel<StreamChunk>) -> Result<GenerateProjectResult, String>`。`StreamChunk` 是 Rust struct `{ kind: "token"|"done"|"error", text: Option<String>, error: Option<String> }`。Channel 选择是 PITFALLS 警告 events 模式易泄漏 listener + 顺序问题。

### Streaming + Cancellation (IPC-03, IPC-04, IPC-05)

- **D-03:** Tauri 2.x `Channel<StreamChunk>` API(非 events)。Channel 自动跟随 call 生命周期,无需手动 unlisten。Rust 端 `tokio::sync::CancellationToken` 包裹 LLM call,Stop 按钮触发 `cancel()` 后 Rust 立刻停止 stream + 释放 token。
- **D-04:** 前端 `AbortController` 备份(IPC-05),但实际取消通过 IPC command `cancel_generate_project(request_id: String)` 完成。Stop 按钮在生成中 `disabled`(防堆叠)。
- **D-05:** `request_id` 用 UUID v4(前端生成,作为 invoke 参数),Rust 端维护 `HashMap<request_id, CancellationToken>`。请求完成/取消后从 map 移除(防内存泄漏)。

### API Key Storage (SEC-05, SEC-06)

- **D-06:** Rust `keyring` crate v3(跨平台:Windows Credential Manager、macOS Keychain、Linux Secret Service)。服务名 `nova.pm-workspace`,用户名 `default`。
- **D-07:** 首次启动时 SettingsView 检测 `keyring.get()` 返回 `NoEntry` → 显示 API key 输入卡片(`Input type="password"` + 显式说明 "Stored in OS keychain, never in app files")。Submit 按钮 → `keyring.set(password)`。后续启动静默读。
- **D-08:** 不在 webview 中暴露 key。Rust 端 command `get_api_key() -> Result<Option<String>, AppError>` 只在调用 LLM 前内部读取,**不返回 key 给前端**;前端只通过 `has_api_key() -> bool` 检查存在性。这降低 XSS 泄漏面。
- **D-09:** `.env` 文件保留作为 dev fallback(`npm run dev` 模式无 keychain,因 web-only 没 Tauri Rust 后端)。Express 在 dev mode 仍读 `GEMINI_API_KEY`,Tauri prod build 不依赖 `.env`(keychain 唯一来源)。

### LLM Provider Integration (IPC-07)

- **D-10:** Rust 端直接引入 `rig-core`(ADR-003 已锁),用 `rig::providers::gemini::Client` 或 `rig::providers::openai::Client`(Gemini 首选 per REQUIREMENTS IPC-07)。Rig 已内置 streaming + cancellation 支持,与 GraphFlow(Phase 4)无缝。
- **D-11:** 移除前端 `@google/genai` 依赖(只用于 Express 端,Phase 3 后 Express 不再调 LLM)。`server.ts` 内 Gemini 调用保留作为 dev fallback(`npm run dev` 时 webview 通过 fetch 调 Express,Express 仍用 `@google/genai`)。

### Error Handling (IPC-06, IPC-08)

- **D-12:** Rust `AppError` enum,variants: `NetworkError(String)`、`AuthError(InvalidApiKey)`、`RateLimited`、`ParseError(String)`、`Truncated`、`Cancelled`、`InternalError(String)`。手动 `impl serde::Serialize` 输出 `{ variant: "NetworkError", message: "..." }` JSON。
- **D-13:** 前端 `src/lib/tauri.ts` 适配器把 `Result<T, String>` 转换为 `Promise<T>`(throw Error with human-readable message)。Store/UI 用 `useToast({ type: 'error', title, description })` 显示(复用 `src/components/ui/Toast.tsx`)。
- **D-14:** IPC 错误对用户可见:`NetworkError` → "网络连接失败,请检查网络";`AuthError` → "API key 无效,请到 Settings 更新";`RateLimited` → "请求过于频繁,稍后再试";`Cancelled` → 静默(用户主动取消不算错);其他 → "AI 调用失败:{message}"。

### Dev/Prod Parity (IPC-02)

- **D-15:** 扩展 `src/lib/api.ts`(Phase 2 创建)为完整 `src/lib/tauri.ts`(或保留 `api.ts` 命名,新增 AI 调用相关函数)。导出:`invokeAI<T>(command, args)`、`streamAI<T>(command, args, onChunk)`、`cancelAI(requestId)`、`hasAPIKey()`、`isTauri()`(已有)。
- **D-16:** 适配器内部 `isTauri()` 分支:Tauri 走 `invoke()`、dev 走 `fetch('/api/...')`。Stop 按钮:Tauri 走 `cancelAI(requestId)` IPC、dev 走 `AbortController.abort()`。前端调用方完全无感(适配器封装)。

### CSP + Capabilities (SEC-01, SEC-02, SEC-03, SEC-04)

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

### Express 收缩 (IPC-09, IPC-10)

- **D-21:** Express 保留作 dev-only:`npm run dev` 仍启动 Express(绑 `127.0.0.1` 替代 `0.0.0.0`),提供 web fallback + 未迁移的 4 个端点。
- **D-22:** 从 prod bundle 移除:`package.json` 的 `scripts.build:server` 保留(以便单独 dev 用),但 `tauri.conf.json` 的 `beforeBuildCommand` 改为只 `bunx vite build`(不再 `bunx tsx server.ts`)。`scripts.start` 保留作 standalone web server,不进 Tauri bundle。
- **D-23:** Express 绑定改 `127.0.0.1`:`server.ts` 中 `app.listen(PORT, '127.0.0.1', ...)`。

### Prompt Injection Mitigation (SEC-07)

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level Decisions & Constraints
- `.planning/PROJECT.md` — Active B 部分列出 Phase 3 4 项关键任务(IPC 迁移、key 处理、127.0.0.1 绑定、CSP)
- `.planning/PROJECT.md` § Constraints — `Security` 约束:CSP 必须显式声明(当前 null 是 debt)、API key 不进客户端 bundle
- `.planning/PROJECT.md` § Key Decisions — "Tauri IPC 替代 Express AI 端点" Pending、"SQLite via Tauri SQL 插件" 已 Validated(Phase 2)

### Requirements
- `.planning/REQUIREMENTS.md` 行 34-43 — IPC-01..10 详细定义
- `.planning/REQUIREMENTS.md` 行 47-52 — SEC-01..07 详细定义
- `.planning/REQUIREMENTS.md` 行 137-153 — Phase 3 状态追踪表

### Architecture & ADRs
- `docs/DECISIONS.md` § ADR-001 — 混合架构(本地 + 云端 LLM),Phase 3 落地此架构
- `docs/DECISIONS.md` § ADR-003 — Rig 作为 LLM 集成层(D-10 直接上 rig-core 的依据)
- `docs/DECISIONS.md` § ADR-005 — 零 Sidecar 架构(IPC-09 收缩 Express 的依据)
- `docs/ARCHITECTURE.md` 行 60 — Rig LLM 调用层架构图
- `docs/ARCHITECTURE.md` 行 92 — "用户输入 → 前端 → Tauri IPC → Rig LLM → 流式响应 → 前端渲染" 数据流

### Pitfalls (Phase 3 相关)
- `.planning/research/PITFALLS.md` § Pitfall 5 — Capabilities 必须与 commands 同步落地
- `.planning/research/PITFALLS.md` § Pitfall 6 — API key bundled 或 silent mock 双重风险(D-06 keyring 解法)
- `.planning/research/PITFALLS.md` § Pitfall 7 — CSP 在 IPC 同 phase 落地(D-17 CSP 内容依据)
- `.planning/research/PITFALLS.md` 行 354-355 — Tauri streaming 用 Channel 而非 events(D-03 依据);CSP 必须 `tauri build` 测(D-20 smoke test 依据)
- `.planning/research/PITFALLS.md` 行 297-298 — Keyring 从 day 1 用,plaintext 迁移痛苦(D-06 依据);Tailwind + CSP 必须 `style-src 'unsafe-inline'`(D-17 依据)

### Concerns (Phase 3 相关)
- `.planning/codebase/CONCERNS.md` § 行 71-77 — Tauri CSP Disabled (MEDIUM) 当前 debt,Phase 3 清偿
- `.planning/codebase/CONCERNS.md` — Express 监听 0.0.0.0 + 无 CORS/auth(CONCERNS 中应已有,D-21 收缩依据)

### Existing Code Patterns
- `src/lib/api.ts` — Phase 2 已建 `isTauri()` SSR-safe(D-15 扩展点)
- `src-tauri/capabilities/sql.json` — Phase 2 已建 capability 文件模式(D-19 复用)
- `src-tauri/src/lib.rs` — Phase 2 已建 plugin 注册模式(`.plugin(tauri_plugin_sql::Builder::default()...)`)
- `src-tauri/migrations/0001_init.sql` — Phase 2 已建 migrations 模式
- `src/components/ui/Toast.tsx` — 已建 toast 组件(D-13 复用)
- `server.ts` 行 17/99/179/213 — 4 个 Express endpoints(D-21 dev 保留)
- `src/components/ProjectCreateModal.tsx` 行 22/44 — 现有 `/api/generate-project` 调用点(D-15 适配器替换点)
- `src/stores/rndStore.ts` 行 325/470 — 2 个 `/api/rnd/...` 调用点(Phase 3 不迁移)
- `src/components/WorkspaceSummaryModal.tsx` 行 30 — `/api/summarize-workspace` 调用点(Phase 3 不迁移)

### External Documentation
- Tauri v2 Channel API: https://v2.tauri.app/develop/calling-rust/#channels-for-streaming
- Tauri v2 CSP: https://v2.tauri.app/security/csp/
- `keyring` crate: https://crates.io/crates/keyring
- `rig-core` crate: https://crates.io/crates/rig + https://docs.rs/rig
- Rig streaming example: https://github.com/0xPlaygrounds/rig/tree/main/rig-core/examples

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/api.ts`(Phase 2 已建)— `isTauri()` 函数,带 SSR guard。Phase 3 扩展为完整 IPC 适配器
- `src-tauri/capabilities/sql.json`(Phase 2 已建)— capability 文件模板,新 llm.json/keyring.json 复用结构
- `src-tauri/src/lib.rs`(Phase 2 已扩展)— 已有 `tauri_plugin_sql` 注册 + `sql_migrations()` 工厂模式。Phase 3 加 `keyring`/`rig` 依赖、新 commands
- `src/components/ui/Toast.tsx` — `useToast()` hook,Phase 3 错误处理直接复用
- `src/components/ui/Input.tsx` — SettingsView API key 输入复用,`type="password"`
- `src/views/SettingsView.tsx`(Phase 1 已扩展)— 三态主题 SegmentedControl,Phase 3 加 API key section

### Established Patterns
- `isTauri()` 检测在 TitleBar 和 sqliteStorage 已用(Phase 2 统一到 api.ts)
- Tauri command 模式:`#[tauri::command] fn xxx() -> Result<T, E>` + `invoke_handler` 注册
- Capability 文件:`{ identifier, description, windows, permissions }` JSON
- 错误处理:Zustand store actions 返回 `{ success, ... }`(D-13 在 IPC 层 throw,store 层 catch 转 toast)

### Integration Points
- `src/components/ProjectCreateModal.tsx:44` — `fetch('/api/generate-project')` 替换为 `streamGenerateProject()`(适配器调用)
- `src/views/SettingsView.tsx` — 新增 API key section(per D-07)
- `src-tauri/src/lib.rs` — `invoke_handler![generate_project, cancel_generate_project, has_api_key, set_api_key]`
- `src-tauri/Cargo.toml` — 加 `keyring = "3"`,`rig-core = "..."`,`tokio = { version = "1", features = ["full"] }`,`uuid = { version = "1", features = ["v4"] }`
- `src-tauri/capabilities/default.json` — 加 `event:default`(Channel 内部用)、保留 sql
- `package.json` — 移除 prod 依赖 `@google/genai`(保留 devDep 供 Express dev 用)

</code_context>

<specifics>
## Specific Ideas

### 关键实现细节

1. **Channel streaming 模式** (D-02 + D-03):
   ```rust
   #[tauri::command]
   async fn generate_project(
       prompt: String,
       files_context: String,
       request_id: String,
       on_token: Channel<StreamChunk>,
       state: tauri::State<'_, AppState>,
   ) -> Result<GenerateProjectResult, AppError> {
       let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
       state.cancellations.insert(request_id.clone(), cancel_tx);
       
       let client = rig::providers::gemini::Client::new(&state.api_key);
       // ... stream loop, on_token.send(StreamChunk::Token(text)).await
       // ... on cancel_rx.recv() -> break + return Cancelled
   }
   ```

2. **AppError 序列化** (D-12):
   ```rust
   #[derive(Debug, thiserror::Error)]
   pub enum AppError {
       #[error("network error: {0}")]
       NetworkError(String),
       #[error("invalid api key")]
       AuthError,
       // ...
   }
   
   impl serde::Serialize for AppError {
       fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
       where S: serde::Serializer {
           serializer.serialize_str(&self.to_string())
       }
   }
   ```

3. **前端适配器** (D-15):
   ```ts
   // src/lib/tauri.ts (or extend src/lib/api.ts)
   export async function streamGenerateProject(
       prompt: string,
       filesContext: string,
       onToken: (text: string) => void,
   ): Promise<GenerateProjectResult> {
       const requestId = crypto.randomUUID();
       if (isTauri()) {
           const { invoke, Channel } = await import('@tauri-apps/api/core');
           const channel = new Channel<StreamChunk>();
           channel.onmessage = (msg) => {
               if (msg.kind === 'token' && msg.text) onToken(msg.text);
           };
           return invoke('generate_project', { prompt, filesContext, requestId, onToken: channel });
       }
       // dev fallback: fetch with AbortController (no streaming, just final result)
       const resp = await fetch('/api/generate-project', { /* ... */ });
       return resp.json();
   }
   ```

4. **首次启动 API key 设置** (D-07):SettingsView 加 `<ApiKeySection>` 组件,挂载时 `hasAPIKey()` 检查 → 若无显示输入卡片 + Save 按钮 → `setApiKey(key)` IPC → 写入 keychain。后续启动 silently 跳过(或显示 "API key 已设置" + 更新按钮)。

5. **CSP 验证**(D-17 + D-20):Phase 3 完成后,必须 `npm run tauri:build`(非 dev)+ 装上 installer + 跑应用 + 触发所有 UI 路径(打开所有 view、所有 modal),检查 console 无 CSP 违规。这写入 `03-HUMAN-UAT.md`。

### 强制前置条件

- Phase 2 已交付 `isTauri()` + capability 模式 + Tauri plugin 注册模式 — Phase 3 完全复用
- Phase 3 必须在 Phase 4(GraphFlow PoC)之前完成,因为 Phase 4 依赖 IPC + keychain + CSP 基线

### 范围控制

- 只迁移 1 个端点(D-01),其余 4 个保持 Express(Phase 3 不动)
- keyring 只用于 API key,不扩展到其他 secret(DB password 等,无)
- Rig 只用于 generate-project,不集成 GraphFlow(Phase 4)
- CSP 不收紧到 nonce-based(D-17 用 `'unsafe-inline'` 是 Tailwind v4 必需,PITFALLS 已注释)

</specifics>

<deferred>
## Deferred Ideas

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

### Reviewed Todos (not folded)
无 — STATE.md 中无 Phase 3 相关 pending todos

</deferred>

---

*Phase: 03-tauri-ipc-migration-security-baseline*
*Context gathered: 2026-08-08 via --auto mode (8 gray areas, all auto-selected recommended defaults)*
