# Phase 3: Tauri IPC Migration + Security Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-08
**Phase:** 03-tauri-ipc-migration-security-baseline
**Mode:** --auto (recommended defaults auto-selected, no interactive AskUserQuestion)
**Areas discussed:** Endpoint scope, Streaming mechanism, Cancellation, API key storage, LLM provider, Error handling, Dev/Prod parity, CSP strictness, Capabilities, Express strategy, Prompt injection

---

## Endpoint Migration Scope (IPC-01, IPC-03)

| Option | Description | Selected |
|--------|-------------|----------|
| 仅迁移 `generate-project` (PoC) | ROADMAP success criteria 1 明确说 "at least one"。验证模式后扩展 | ✓ |
| 迁移全部 5 个 endpoints | 工作量 5x,且 5 个都涉及 streaming 模式风险高 | |
| 迁移最简单的 `workspace-files` | 无 streaming 价值(纯文件列表),不能验证 Channel 模式 | |

**Auto-choice:** 仅 `generate-project` PoC — 最小验证面、最大模式覆盖(streaming + LLM 调用 + cancellation)。
**Captured as:** D-01 + D-02

---

## Streaming Mechanism (IPC-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri 2.x `Channel<StreamChunk>` | 自动跟 call 生命周期,无 listener 泄漏,顺序保证 | ✓ |
| Tauri events (`emit`/`listen`) | PITFALLS 警告:listener 易泄漏、顺序问题 | |
| Long polling (multiple invoke) | 无 stream 体验,延迟高 | |
| SSE over HTTP | 需要 Express 一直存在,违背零 Sidecar | |

**Auto-choice:** Channel<T> — PITFALLS 明确推荐,Phase 3 落地标准。
**Captured as:** D-03

---

## Cancellation Design (IPC-04, IPC-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Rust `tokio::sync::CancellationToken` + 前端 `cancel_generate_project(request_id)` IPC | Rust 端真停(节省 token 费用),前端 stop button 立即响应 | ✓ |
| 前端 AbortController 单边取消 | Rust 端继续跑,浪费 token,只是 UI 不接收 stream | |
| 无 cancel(等生成完) | UX 差,长 prompt 卡死 | |
| WebSocket 双向 | 超工程,Channel 已足够 | |

**Auto-choice:** Rust CancellationToken + 前端 IPC cancel command — 双向干净取消。
**Captured as:** D-04 + D-05

---

## API Key Storage (SEC-05, SEC-06)

| Option | Description | Selected |
|--------|-------------|----------|
| `keyring` crate 直连 OS keychain | Windows Credential Manager/macOS Keychain/Linux Secret Service,跨平台一致 | ✓ |
| `tauri-plugin-stronghold` | 加密文件存储,与 OS 解耦,但需要 master password | |
| Plaintext config file | 安全风险高,PITFALLS 明确反对 | |
| 仍用 `.env` (dev only) | 已是当前状态,但 prod 必须 keychain | |
| Environment variable at launch | 用户不便,且 .env 仍存在 | |

**Auto-choice:** keyring crate — PITFALLS 推荐,OS 集成最浅,无额外 UX friction。
**Captured as:** D-06 + D-07 + D-08 + D-09

---

## LLM Provider Integration (IPC-07)

| Option | Description | Selected |
|--------|-------------|----------|
| `rig-core`(ADR-003 已锁)+ Gemini provider 首选 | 多 provider 支持、与 Phase 4 GraphFlow 无缝、streaming 原生 | ✓ |
| 直接 `google-gemini-rs` crate | 单 provider 锁死,Phase 4 切 Rig 重复工作 | |
| FFI 桥回 Node `@google/genai` | 违背零 Sidecar 原则 | |
| Rust 端手写 HTTP + SSE | 重复造轮子,容易出错 | |

**Auto-choice:** rig-core — ADR-003 锁定 + Phase 4 复用 + 多 provider option。
**Captured as:** D-10 + D-11

---

## Error Handling (IPC-06, IPC-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Rust `AppError` enum + 手动 Serialize + 前端 Toast | 类型安全、错误分类明确、用户可见消息友好 | ✓ |
| String error(简单 throw) | 无分类,前端难以差异化处理 | |
| anyhow::Error | 太通用,前端无法 match variant | |
| 静默 fallback 到 mock 数据 | PITFALLS Pitfall 6 明确反对(silent mock 体验差) | |

**Auto-choice:** AppError enum + 手动 Serialize + Toast — 类型安全 + 复用 Phase 6 Toast 组件。
**Captured as:** D-12 + D-13 + D-14

---

## Dev/Prod Parity (IPC-02)

| Option | Description | Selected |
|--------|-------------|----------|
| 扩展 `src/lib/api.ts`(Phase 2 已建)为完整 IPC 适配器 | 复用现有 isTauri() + SSR guard,加 streamAI/invokeAI/cancelAI 导出 | ✓ |
| 新建 `src/lib/tauri.ts` 单独文件 | 与 api.ts 职责重叠,维护混乱 | |
| 直接在 view 里 invoke() | IPC-01 明确反对(views 不出现 invoke) | |
| 高阶 hook `useAI()` 封装 | 抽象过早(YAGNI),适配器足够 | |

**Auto-choice:** 扩展 api.ts — 复用 Phase 2 资产、单一 chokepoint。
**Captured as:** D-15 + D-16

---

## CSP Strictness (SEC-01, SEC-02)

| Option | Description | Selected |
|--------|-------------|----------|
| `script-src 'self'`、`style-src 'self' 'unsafe-inline'`、`connect-src` 显式 LLM | ROADMAP + PITFALLS Pitfall 7 推荐 | ✓ |
| 极严(nonce-based style) | Tailwind v4 不支持 nonce,会 break 全部 UI | |
| 保持 `csp: null` | SEC-01 明确反对,debt 累积 | |
| 只 default-src 'self'(其他 inherit) | connect-src 不允许 LLM 端点会 break 调用 | |

**Auto-choice:** 显式 CSP(7 个 directive) — ROADMAP + PITFALLS 双重锁定。
**Captured as:** D-17 + D-18

---

## Capabilities Strategy (SEC-03, SEC-04)

| Option | Description | Selected |
|--------|-------------|----------|
| 每 feature 一个 capability 文件(sql.json / llm.json / keyring.json)+ 烟测脚本 | SEC-03 明确要求 + 烟测验证不静默拒绝 | ✓ |
| 全部加到 default.json | 范围扩散、违反最小权限 | |
| 全开 `core:allow-all` | 安全风险高 | |
| 无烟测,靠用户报告 | SEC-04 明确反对 | |

**Auto-choice:** 分文件 capability + smoke test — SEC-03 + SEC-04 双重锁定。
**Captured as:** D-19 + D-20

---

## Express Strategy (IPC-09, IPC-10)

| Option | Description | Selected |
|--------|-------------|----------|
| 保留 dev-only(`127.0.0.1`),从 prod bundle 移除 | dev mode web 仍可用、prod 零 Sidecar | ✓ |
| 完全移除 Express | dev mode web 不可用,UX 差 | |
| 保留 Express 进 prod(双后端) | 违背零 Sidecar,IPC-09 明确反对 | |
| Express 监听 0.0.0.0(当前) | 安全风险高,IPC-10 明确反对 | |

**Auto-choice:** dev-only + 127.0.0.1 + prod 移除 — IPC-09 + IPC-10 双重锁定。
**Captured as:** D-21 + D-22 + D-23

---

## Prompt Injection Mitigation (SEC-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Rig `system_instruction` vs `contents` 分离 | 基础防护,UI 输入不进 system,减小 injection 面 | ✓ |
| Input sanitization + output filtering | 复杂、易误伤,Phase 3 范围外 | |
| Content moderation API | 额外成本 + 延迟,后续 milestone | |
| 无防护 | SEC-07 明确要求 | |

**Auto-choice:** system_instruction 分离 — Rig 原生支持、最小工程量。
**Captured as:** D-24

---

## Claude's Discretion

- Rust crate 具体版本(`keyring` 3.x、`rig-core` 当前 stable)
- Channel serialization 细节
- request_id 生成方式(UUID v4)
- IPC command 命名规范
- Cargo.toml feature flags
- SettingsView API key 卡片排版
- Smoke test 脚本具体实现
- Dev CSP 具体值

## Deferred Ideas

- 其余 4 个 AI 端点迁移(Phase 4 或 3.1)
- API key 多 provider 支持(OpenAI/Anthropic/Ollama)
- API key 首次启动向导
- Channel 监控指标(telemetry)
- CSP nonce-based(Tailwind v5 + Radix 升级后)
- Prompt injection 高级防护(input sanitization、output filtering)
- IPC command CI 烟测
- Express 完全移除(若决定 desktop-only)
- Rust streaming 重试逻辑
- 多账号 API key
- WebFallback stream(SSE 改造)
