---
status: partial
phase: 03-tauri-ipc-migration-security-baseline
source: [03-03-PLAN.md]
started: 2026-08-08T00:00:00Z
updated: 2026-08-10T00:00:00Z
---

# Phase 3 Plan 3: UI Wiring (Streaming + API Key) — Human UAT

22 items deferred to user UAT per `--auto` mode (checkpoint:human-verify with
gate="blocking" was auto-deferred per orchestrator instructions; autonomous:true).
All code-level checks PASSED (zero tsc errors from ProjectCreateModal.tsx,
SettingsApiKeySection.tsx, SettingsView.tsx).

These items require a running Tauri desktop binary + human interaction (paste
real API key, type prompts, click Stop mid-stream, restart app for keychain
persistence check).

## 横向 UAT 策略(P3 收口采用)

不按 phase 逐项跑,改为 **2 轮**:
- **轮次 1 — dev mode 核心动线**:`npm run tauri:dev`,3 大项(API key / Streaming / 错误处理)
- **轮次 2 — prod build 工程验证**:`npm run tauri:build`,8 项(CSP / IPC / 127.0.0.1 / 生产 streaming)

期间发现 6 个问题(全已修,含 1 个 Phase 1 漏检 + 1 次 provider 切换),见 [Issues Found](#issues-found)。


## Current Test

[轮次 1 进行中 — UAT#3 pass;UAT#2 先后发现 Issue #4(streaming 预览永不渲染,wire shape 错配)、Issue #5(gemini-2.0-flash 已关停)、Issue #6(用户无 Gemini key,provider 整体切换 Gemini → DeepSeek),均已修,等待用户用 DeepSeek key 重测 streaming + Stop]

## Tests

### 1. API key flow — first launch + persistence (D-07 + SEC-06)

- **expected:** Navigate to Settings → 隐私与安全. First launch shows "Stored in OS keychain. Never written to app files." copy + "Save key" button. After saving and full app restart, copy swaps to "API key is set. Update below to replace." + "Update key" button — keychain persisted across restarts.
- **how to test:**
  1. Navigate to Settings → 隐私与安全 (Shield icon in left nav)
  2. Verify "Stored in OS keychain. Never written to app files." copy + "Save key" button label
  3. Paste a real DeepSeek API key (or test string) → click Save key
  4. Verify toast "API key 已保存 / 存储于系统钥匙串,重启后依然有效"
  5. Close Nova entirely, reopen, navigate back to Settings → 隐私与安全
  6. Verify "API key is set. Update below to replace." copy + "Update key" button label (keychain persisted)
- **result:** pass — 步骤 1/2/3/5/6 全部通过:首次文案 "Stored in OS keychain..." + "Save key" 按钮文字正确;Save 触发 success toast;关闭 Nova 重开后文案切换为 "API key is set. Update below to replace." + "Update key" 按钮,keychain 跨重启持久化(SEC-06 ✓)。**轮次中发现的 toast 视觉弱问题已修(见 [Issues Found](#issues-found) #2/#3)。**

### 2. Streaming + cancellation (IPC-03, IPC-04, IPC-05)

- **expected:** ProjectCreateModal streams tokens live into 实时生成预览 area; Stop button visible only during generation and halts stream within 1s; Generate button disabled mid-generation so no request stacking.
- **how to test:**
  7. Click "AI 智能创建" (ProductManagementView 顶部新增的次按钮,Sparkle 图标)
  8. Type a real prompt in the textarea (e.g. "Build a CRM for small businesses")
  9. Click "生成项目计划"
  10. Verify tokens stream LIVE into the 实时生成预览 area (not waiting for full response)
  11. Verify Generate button is disabled (cannot click again mid-generation — IPC-05)
  12. Click "停止生成" mid-stream
  13. Verify generation halts within 1 second
  14. Verify NO error toast (D-14: Cancelled is silent)
- **result:** issue (fixed, awaiting retest) — 2026-08-10 用户重测报"没有找到流式输出的位置"。诊断为 Issue #4:`api.ts` onmessage 读扁平 `msg.text`,而 Rust StreamChunk 序列化为嵌套 `{kind:'token', data:{text}}`(serde tag+content,Rust 单测 streamchunk_token_serializes_tagged 断言此形状)→ onToken 从未触发 → `streamedText` 恒空 → 实时生成预览条件渲染永不出现,但 invoke() 仍带完整 content resolve,所以"生成成功但看不到流"。修复:`api.ts` 改读 `msg.data?.text`(tsc clean)。重测时又撞 Issue #5(硬编码模型已下线,有效 key 也必挂)与 Issue #6(用户只有 DeepSeek key,provider 整体切换),一并修掉。等待用户用 DeepSeek key 重测 streaming 可见性 + Stop 行为。

### 3. Error handling (IPC-06 + D-14)

- **expected:** When API key is invalid, the generate flow surfaces a Chinese toast "API key 无效,请到 Settings 更新" mapped by the adapter's humanizeAIError function. Other errors (network, rate limit) get their own mapped messages.
- **how to test:**
  15. In Settings → 隐私与安全 → Update key → enter an INVALID key → Save
  16. Trigger generation again (ProductManagement → AI 智能创建 → prompt → 生成项目计划)
  17. Verify toast "API key 无效,请到 Settings 更新" (D-14 AuthError mapping)
- **result:** pass — 2026-08-10 用户以无效 key 触发生成,错误 toast 文案符合预期(humanizeAIError AuthError 映射,D-14 ✓)。

### 4. Dev parity — web fallback (IPC-02)

- **expected:** Running `npm run dev` (web mode) still works — adapter branches on isTauri() and falls back to Express fetch. Tokens are NOT streamed live in web mode (per Deferred D-16); the fetch replay synthesizes tokens at the end. The flow should complete without crashes.
- **how to test:**
  18. Stop tauri:dev, run `npm run dev` (web mode)
  19. Open http://localhost:3000
  20. Repeat step 7-9 in browser
  21. Verify generation completes (via Express fetch fallback, no live streaming tokens — that's expected per Deferred)
  22. Verify NO crashes (adapter branches on isTauri() correctly)
- **note:** Tauri desktop build is the production target. Web dev fallback is best-effort per D-21/D-16; "no live tokens in browser" is NOT a blocker.
- **result:** pass — `isTauri()` correctly returns `false` in web mode. Express `/api/generate-project` initially returned HTTP 500 when `GEMINI_API_KEY` unset (missing guard — fixed in commit `1d129de`, added early-return canned JSON matching siblings at server.ts:103/183/217). After fix: HTTP 200 with full canned project JSON matching responseSchema. Web mode Express fetch path now exercises cleanly.

## Phase 3 Production Build Smoke Test (Wave 4)

8 items deferred to user UAT per `--auto` mode.

### 1. ~~Verify capabilities/llm.json permission identifiers~~ — RESOLVED (commit `3960ad2`)
- **Resolution:** Capability file was unnecessary. Tauri 2.x capability permissions only cover plugin commands (core:*, shell:*, sql:*); custom `#[tauri::command]` fns are auto-callable from windows with `core:default` (granted by `default.json`). File deleted after build script rejected `generate-project:allow` as not-a-permission. SEC-03 satisfied by `default.json` + `invoke_handler!` registration.
- **Action required:** None. Proceed to step 2.

### 2. Run full production build
- **expected:** `npm run tauri:build` completes without error. First build may take 5-10 min (rig-core + tokio lto=true + opt-level=s — one-time cost). Output `.exe` (or `.app`/AppImage) in `src-tauri/target/release/bundle/`.
- **how to test:** `npm run tauri:build` — record total time + final artifact path.
- **result:** [pending]

### 3. Install + launch built artifact
- **expected:** Installer runs cleanly; Nova launches from Start Menu / Applications (NOT `npm run tauri:dev` — must be prod build to exercise CSP).
- **how to test:** Run installer, launch Nova, open DevTools (F12 or right-click → Inspect Element).
- **result:** [pending]

### 4. CSP verification across all views + modals (SEC-02)
- **expected:** DevTools Console shows ZERO red CSP violations during boot, while visiting every view (Product / Tasks / R&D / Schedule / Files / Knowledge / Settings), and while opening every modal (Create Product, Workspace Summary, Add Document).
- **how to test:** Visit each view + open each modal; watch DevTools console for CSP errors.
- **result:** [pending]

### 5. IPC reachability from production DevTools (SEC-04)
- **expected:** Each invoke returns successfully (no "permission denied", no silent rejection).
- **how to test:** In production DevTools console, paste each line and verify response:
  - `await window.__TAURI__.core.invoke('has_api_key')` → `true` or `false`
  - `await window.__TAURI__.core.invoke('set_api_key', { key: 'prod-test' })` → undefined
  - `await window.__TAURI__.core.invoke('has_api_key')` → `true`
  - `await window.__TAURI__.core.invoke('cancel_generate_project', { requestId: 'nope' })` → null/undefined (idempotent)
- **result:** [pending]

### 6. Streaming works in production (CSP connect-src ipc: verified)
- **expected:** Tokens stream into 实时生成预览 area in ProjectCreateModal. This confirms `connect-src ipc:` is allowing invoke in prod.
- **how to test:** ProjectCreateModal → fill prompt → 生成项目计划 → watch tokens arrive live.
- **result:** [pending]

### 7. Express bind to 127.0.0.1 (D-23)
- **expected:** Server log says "Dev-only server running at http://127.0.0.1:3000 (not for production)". From another LAN machine, `curl http://<this-machine-ip>:3000/` → connection refused.
- **how to test:** `npm run dev` → check log → from phone or second machine on same Wi-Fi, attempt curl.
- **result:** [pending]

### 8. Sign + date
- **expected:** User signs + dates the bottom of this section after all 7 steps pass (or describes failures).
- **how to test:** Replace [pending] with PASS/FAIL + actual DevTools output for each step.
- **result:** [pending]

## Summary

total: 35
passed: 3  (UAT#1 API key flow + UAT#3 error toast + UAT#4 Dev parity)
issues: 6  (全已修,见 Issues Found)
pending: 29 (UAT#2 streaming 重测 1 项(Issue #4/#5/#6 已修);Wave 4 prod build 8 项 + 子项 ≈ 28 项)
skipped: 0
blocked: 0

## Issues Found

横向 UAT 期间发现 3 个真 bug(均跨 phase,Ponytail 修复):

### #1. ProjectCreateModal 入口未接线(P3 实施遗漏)
- **现象:** 用户报"步骤 4 我没找到"。`ProjectOverviewView` 在 `App.tsx` 的 lazy import 里**根本没注册**,grep 全仓只有自引用。P3 写好的流式生成功能完全访问不到。
- **根因:** P3 实施 Plan 3 时,`ProjectCreateModal` 被放在 `ProjectOverviewView` 里,但没决定 ProjectOverviewView 该放哪个 nav tab。
- **修复:** `ProductManagementView.tsx` 顶部加 `✨ AI 智能创建` 次按钮(8 行净增),复用现有 `ProjectCreateModal`。`ProjectOverviewView` 暂不接入路由(其项目卡片网格与 ProductManagement 视图重复,v0.2.0 再决定)。
- **影响 phase:** P3。

### #2. semantic color token Tailwind v4 @theme self-reference(P1 漏检)
- **现象:** 用户报"toast 不是红色"。Playwright 验证 `border-l-success/danger/warning` 的 `borderLeftColor` 全是默认 `rgb(20,24,31)`(黑色),只有 `border-l-accent` 工作(蓝色)。
- **根因:** `tokens.css` 把裸 HSL channel 命名为 `--color-success`(line 39),`index.css` @theme 又写 `--color-success: hsl(var(--color-success))`(line 43)—— **self-reference 让 Tailwind v4 静默跳过 utility 生成**。`--color-accent` 工作是因为它引用 `var(--accent)`(不同名)。
- **影响范围:** 整个项目 20+ 处用了 `text-success/danger/warning`、`bg-success/danger/warning`、`bg-success-subtle` 等 class,**全部 fallback 到默认色**(Header.tsx、AIRequirementsTab.tsx、CompetitorAnalysisTab.tsx、CodeManagementTab.tsx 等都受影响)。Phase 1 暗色模式 wiring 漏检,因为没人做 toast 这种纯 token 依赖的 UAT。
- **修复:** `tokens.css` 把 `--color-success` 系列 rename 为 `--success`(去 `color-` 前缀,共 12 行:`:root` 6 行 + `.dark` 6 行);`index.css` @theme 引用更新(6 行)。Playwright 复测 4 种 type 全绿(success=rgb(41,163,106) / danger=rgb(220,40,40) / warning=rgb(245,159,10) / info=rgb(0,116,240))。
- **影响 phase:** P1(漏检)+ P3(暴露)。

### #3. Toast 视觉区分弱(design intent gap)
- **现象:** 用户报"toast 不是绿色"。即便 token 生成正确,Toast 容器原本只有 `bg-bg-primary` 中性背景 + 18px 彩色图标,success/error/warning/info 在视觉上几乎无差。
- **根因:** 设计意图与用户预期差距。Apple 风格 toast 通常用左色条做类型识别。
- **修复:** `Toast.tsx` 加 `border-l-[6px] border-l-{color}` 左色条。背景迭代回退:5%(太淡)→ 15%(用户反馈太重)→ 8%(还是嫌透明)→ 最终回到纯 `bg-bg-primary` 实心 + 6px 色条 + 彩色图标(无 alpha tint)。
- **影响 phase:** P3(暴露)+ UX 系统性。

### #4. Streaming 实时预览永不渲染 — Rust/JS StreamChunk wire shape 错配(P3 实施遗漏)
- **现象:** 用户报"没有找到流式输出的位置"。生成能正常完成(项目创建成功、modal 自动关闭),但"实时生成预览"区块从不出现;Stop 行为也因此无从验证。
- **根因:** `commands.rs` 的 StreamChunk 用 `#[serde(tag="kind", content="data")]`,token 实际序列化为 `{"kind":"token","data":{"text":"..."}}`(Rust 单测 `streamchunk_token_serializes_tagged` 断言了此形状);但 `api.ts` 的 `channel.onmessage` 按 D-02 扁平形状读 `msg.text` —— 永远 `undefined`,`onToken` 从未触发,`streamedText` 恒为 `''`,`{streamedText && ...}` 条件渲染永不成立。STATE.md 决策记录"frontend branches on msg.kind first so absence of data field is fine"只覆盖了 done variant(无 data),token variant 的嵌套 data 被漏掉。
- **修复:** `api.ts` StreamChunk interface 改为 `{ kind, data?: { text?, message? } }`,onmessage 读 `msg.data?.text`。tsc clean(api.ts 零错误;仓库存量 5 处类型错误见下方债务清单,与本修无关)。
- **影响 phase:** P3。

### #5. Rust 硬编码模型 gemini-2.0-flash 已被 Google 下线(P3 实施遗漏)
- **现象:** 用户换 key 重测 UAT#2 仍报"无效 Key",并追问"项目真的能接入 LLM 吗"。
- **根因:** `src-tauri/src/llm.rs` 硬编码 `gemini-2.0-flash` —— Google 已于 **2026-06-01 正式关停**该模型(Gemini API deprecations),即便持有有效 key 请求也必然失败;而 web 路径 `server.ts` 用的是 `gemini-3.6-flash`,两条 LLM 路径的模型名不一致。Phase 3 实施时 spike(example)与 llm.rs 抄的是当时的现役模型,之后未跟随 Google 的模型生命周期更新。
- **修复:** `llm.rs` + `examples/rig_stream_check.rs` 对齐到 `gemini-3.6-flash`(rig 按纯字符串传模型名,无需 provider 改动);两处加 ponytail 注释标注关停日期与"保持双调用点同步,多模型支持是 Phase 4"。
- **顺带结论(已答复用户):** "API key 无效" toast 本身证明 Tauri→rig-core→Google 链路是通的(该文案映射的是 Google 的真实拒绝响应);~~项目只认 Google Gemini key~~(此结论被 Issue #6 推翻——provider 已整体切到 DeepSeek);多厂商是 Phase 4;web dev 模式 Settings 存的 key 无效(Express 读 `.env` 的 `GEMINI_API_KEY`,而 `.env` 当前不存在,故 web 模式全走 canned fallback)。
- **影响 phase:** P3。

### #6. Provider 切换 Gemini → DeepSeek(用户只有 DeepSeek key)
- **现象/动因:** 用户明确表示"我没有 gemini 的 key 只有 deepseek 的"。UAT#2 重测需要真实 LLM,原 Gemini 接入对用户不可用,故将 Tauri 路径的 provider 整体切换为 DeepSeek。
- **修复:**
  1. `llm.rs`:`rig_core::providers::gemini::Client` → rig 原生 `providers::deepseek::Client`(OpenAI 兼容路径,base URL 固定 `https://api.deepseek.com`);模型用 `deepseek::DEEPSEEK_V4_FLASH`——旧名 `deepseek-chat`/`deepseek-reasoner` 已被 DeepSeek 于 **2026-07-24** 停用(rig 里标 `#[deprecated]`),v4-flash 是非思考模式的继任者。**流式循环零改动**:`StreamingCompletionResponse<R>` 是 provider-generic wrapper(`Item = Result<StreamedAssistantContent<R>, CompletionError>`),已在 registry 源码确认。
  2. `examples/rig_stream_check.rs`(仓内唯一 rig API 文档):重写为 DeepSeek 版,env 变量改 `DEEPSEEK_API_KEY`,VERIFIED 段落全部更新(含 401 错误文本 "Authentication Fails")。
  3. `SettingsApiKeySection.tsx`:文案 "Gemini API Key" → "DeepSeek API Key",placeholder `DeepSeek API key(sk-...)`。
  4. `api.ts` `humanizeAIError` **分支顺序修复**(切换中顺带发现的真 bug):原代码 `startsWith('network error')` 在 `includes('auth')` 之前,而 provider 401 经 `AppError::NetworkError` 包装后序列化为 `"network error: HTTP 401 ... Authentication Fails ..."` —— 会被误映射成"网络连接失败"。现 auth 标记(`auth` / `invalid api key` / `api key not valid`)优先匹配。
  5. `commands.rs` / `keychain.rs` 文档注释 Gemini → DeepSeek(keychain service 名 `nova.pm-workspace` 本就 provider 中立,无需迁移)。
- **验证:** `cargo check --all-targets` clean(仅存量 dead_code warning);`cargo test` 11/11 pass;`npm run lint` exit 0。
- **未动:** `server.ts`(web dev 路径)仍是 Gemini——web 模式本来就无 `.env` 走 canned fallback,且用户测试走 Tauri 模式;多厂商/多 provider 留 Phase 4。
- **重测指引更新:** Settings → 隐私与安全 现在要的是 DeepSeek key(`sk-...`,platform.deepseek.com/api_keys)。
- **影响 phase:** P3。

### 债务清单(本轮 UAT 顺带发现 — 2026-08-10 已全部清掉)
1. ~~工作树未提交积压~~ → 已分 5 批提交:`feae162`(tokens rename + z-index)/ `e47742d`(Toast 色条)/ `a269354`(AI 智能创建入口)/ `fbb14aa`(6 个 product tab polish)/ `cc056f7`(vite es2022 target)。
2. ~~存量 tsc 错误 5 处~~ → `7cb052d` 清零:FileCheck unused import 删除(该组件在主 bundle 图内,不修 Wave 4 rollup 直接失败);Avatar `name`→`fallback` ×3;SettingsView 桌面通知 Switch 改受控(motion thumb 依赖 checked prop,uncontrolled 下视觉不动)。`npm run lint` exit 0。

## Gaps

[UAT#1/#3 ✓;UAT#2 Issue #4/#5/#6 均已修(provider 已切 DeepSeek),等待用户用 DeepSeek key 重测 streaming/Stop;Wave 4 prod build 8 项待跑(债务清单已全清,无已知阻塞项)]

---

_To resolve: continue 横向 UAT 轮次 1 剩余项 → 启动轮次 2 (npm run tauri:build)。_
