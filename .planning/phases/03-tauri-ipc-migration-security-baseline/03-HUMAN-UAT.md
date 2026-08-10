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

期间发现 3 个真 bug + 1 个 Phase 1 漏检(全已修),见 [Issues Found](#issues-found)。


## Current Test

[轮次 1 进行中 — UAT#3 pass;UAT#2 发现 Issue #4(streaming 预览永不渲染,Rust/JS wire shape 错配)已修,等待用户重测 streaming + Stop]

## Tests

### 1. API key flow — first launch + persistence (D-07 + SEC-06)

- **expected:** Navigate to Settings → 隐私与安全. First launch shows "Stored in OS keychain. Never written to app files." copy + "Save key" button. After saving and full app restart, copy swaps to "API key is set. Update below to replace." + "Update key" button — keychain persisted across restarts.
- **how to test:**
  1. Navigate to Settings → 隐私与安全 (Shield icon in left nav)
  2. Verify "Stored in OS keychain. Never written to app files." copy + "Save key" button label
  3. Paste a real Gemini API key (or test string) → click Save key
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
- **result:** issue (fixed, awaiting retest) — 2026-08-10 用户重测报"没有找到流式输出的位置"。诊断为 Issue #4:`api.ts` onmessage 读扁平 `msg.text`,而 Rust StreamChunk 序列化为嵌套 `{kind:'token', data:{text}}`(serde tag+content,Rust 单测 streamchunk_token_serializes_tagged 断言此形状)→ onToken 从未触发 → `streamedText` 恒空 → 实时生成预览条件渲染永不出现,但 invoke() 仍带完整 content resolve,所以"生成成功但看不到流"。修复:`api.ts` 改读 `msg.data?.text`(tsc clean)。等待用户重测 streaming 可见性 + Stop 行为。

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
issues: 4  (全已修,见 Issues Found)
pending: 29 (UAT#2 streaming 重测 1 项(Issue #4 已修);Wave 4 prod build 8 项 + 子项 ≈ 28 项)
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

### 债务清单(本轮 UAT 顺带发现,未修)
1. **工作树未提交积压:** Issues #1-#3 的修复(ProductManagementView AI 入口 / tokens.css+index.css token rename / Toast.tsx 色条 / 6 个 product tab polish / vite.config.ts)自 `80895e7` 后全部还在工作树未提交。
2. **存量 tsc 错误 5 处**(非本轮引入):`ProductGovernanceTab.tsx` 导入不存在的 `FileCheck`(@phosphor-icons/react 无此导出——**Wave 4 prod build 大概率被它卡住**,rollup 会报 missing export);`ProductManagementView/ProjectOverviewView/SettingsView` 给 Avatar 传了不存在的 `name` prop;`SettingsView` 给 Switch 传了不存在的 `defaultChecked`。

## Gaps

[UAT#1/#3 ✓;UAT#2 Issue #4 已修,等待重测 streaming/Stop;Wave 4 prod build 8 项待跑(注意债务清单 #2:FileCheck 缺失导出可能卡 prod build)]

---

_To resolve: continue 横向 UAT 轮次 1 剩余项 → 启动轮次 2 (npm run tauri:build)。_
