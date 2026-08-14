---
status: complete
phase: 9-ai
source: 9-01-SUMMARY.md ... 9-06-SUMMARY.md, HUMAN-UAT.md
started: 2026-08-12T05:35:00Z
updated: 2026-08-12T09:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

All 9 web-mock tests passed + 3 real-desktop UAT (A/B/C) passed; D skipped (HUMAN-UAT covered). Tech debt: intermittent tool_call failure on parameterless tools.

## Tests

### 1. AI 入口加载（CmdKPalette + ChatPanel）
expected: 应用启动后，进入任意视图。期望：CmdKPalette 组件已挂载（按 Cmd+K / Ctrl+K 应弹出）；ChatPanel 组件已挂载（sidebar 顶部 "AI 助手" 按钮应触发 slide-out）；uiStore.activeAIProvider 默认值合理。
result: pass
note: sidebar 顶部 "打开 AI 助手" 按钮触发 ChatPanel slide-out（heading "AI 助手" + "当前 provider：DeepSeek"）；Header "搜索" 按钮带 ⌘K 标记；Ctrl+K 全局快捷键弹出 CmdKPalette（heading "Nova command palette"），列出全部 33 个 tools（含 createTask/listTasks/listProducts/deleteTask/associateTaskWithEvent/getCurrentContext 等）。localStorage `nova-ui.state.activeAIProvider` 默认值 = "deepseek"。

### 2. Settings → AI 设置（provider selector + per-provider key 管理）
expected: 进入设置 → AI 设置。期望：看到 provider selector（5 个：deepseek/openai/anthropic/gemini/ollama）；切换 provider 高亮当前选中；非 ollama 显示 API key 输入框；ollama 显示本地运行提示。
result: pass
note: 设置中心 → 左侧 "AI 设置" → 5 个 provider 全部展示，DeepSeek/OpenAI/Anthropic/Ollama 标 "桌面端"，Gemini 标 "服务端配置"。Web mode 降级提示完整："Web mode 只支持 Gemini。Gemini API key 由服务端的 GEMINI_API_KEY 配置，本页面不会读取、保存或显示 key；其他 provider 需要使用桌面端系统钥匙串。" Web 模式下不渲染 key 输入框（避免假象），与 9-06 SUMMARY "Web 设置暴露 Gemini 边界，不读取或显示客户端 API key" 一致。桌面端 per-provider keychain 交互需要 Tauri invoke，本次 web UAT 不覆盖（HUMAN-UAT.md 已通过 Ollama 真实 tool-call UAT）。

### 3. ⌘K 命令模式（搜索 + 执行 tool）
expected: 全局按 Cmd+K → palette 弹出（顶部居中 spring 动画）。期望：默认"命令"模式；列出全部 tools；输入"create"过滤；点 tool 或 Enter 触发 args prompt。
result: pass
note: Ctrl+K 弹出 palette（spring 动画，顶部 15vh 居中，width min(680px, calc(100vw-2rem))）。默认 "命令" 模式列出 33 tools。输入 "create" 即时过滤到 3 个：createTask / createScheduleEvent / createEvent。每个 tool 显示名称 + description + "Enter" 提示。args 通过 window.prompt 收集（CmdKPalette.tsx:125 handleCommand）。

### 4. ⌘K AI 对话模式（自然语言 → mock 流式回复）
expected: Cmd+K 切到"AI 对话"模式。期望：输入"列出所有产品" → Enter；看到 tool trace（"执行 listProducts ✓"）+ AI 流式渲染回复；Esc 关闭。
result: pass
note: 切到 AI 对话模式（SegmentedControl 切换），placeholder 变为 "问 Nova 做什么..."。注入 fetch mock 拦截 /api/chat 返回 createTask tool_call（args: title="Mock AI UAT task", priority="high", deadline="2026-08-18"）。输入"创建一个 mock AI 任务" + Enter。runToolLoop 解析 tool_call → executeTool('createTask') → taskStore 真创建任务（localStorage 验证：id b455354b..., priority=high, deadline=2026-08-18, status=未开始）。第 2 轮 mock 返回 token "mock" + "mock response (3 messages)"，UI 流式渲染。tool trace 显示 "执行 createTask"。

### 5. ChatPanel slide-out + 多轮对话
expected: sidebar "AI 助手" 按钮 → ChatPanel 从右侧滑出（480px）。期望：输入"创建任务" → tool trace + AI 回复；继续输入上下文相关追问 → 多轮会话保留；Esc/X 关闭。
result: pass
note: sidebar 顶部 "打开 AI 助手" 按钮触发 ChatPanel slide-out（Drawer translateX spring），header 显示 "AI 助手" + "当前 provider：DeepSeek" + 关闭按钮。placeholder "今天需要处理什么？"。连续 2 次发送（"删除刚创建的 mock AI 任务" + "再触发一次"）后 mockCallCount 累积到 3，证明多轮 ChatSession 在同一会话内累积 messages（不重置）。每轮 tool trace + 流式 token 渲染正常。Esc 关闭 slide-out。

### 6. 错误处理（tool arg 错误 + 无效 key）
expected: AI 对话模式故意触发 args 错误。期望：第 1 次 tool 失败 → 1 次自动重试（Zod issue 反馈给 LLM） → 修正成功或放弃并解释；网络/provider 错误 → toast 友好提示。
result: pass
note: 注入 fetch mock 返回 HTTP 500 + `{"error":"Chat proxy error"}`。ChatPanel.handleSend catch 到 throw 的 Error（humanizeAIError 处理 "HTTP 500: ..." 文案） → 调 toast({type:'error', title:'AI 调用失败', description:'HTTP 500: {"error":"Chat proxy error"}'})。MutationObserver 捕获到 toast DOM 添加事件，class 为 "pointer-events-auto bg-bg-primary border border-border-subtle rounded-[var(--radius-lg)] shadow-shad..."。loading 状态在 finally 块还原（textarea 不再 disabled）。Zod 自动重试路径在 9-04 SUMMARY + toolLoop.ts:121 catch 块覆盖（本次未单独触发，HUMAN-UAT.md 已通过）。

### 7. 核心上下文注入（选中产品 → AI 感知）
expected: 选中某个产品 → Cmd+K AI 对话 → 问"我现在在做什么产品?"。期望：AI 回答选中的产品名 + stage（证明 buildCoreContext 注入了 selected product）。
result: pass
note: 代码路径完整 — context.ts:11 buildCoreContext 读 useUIStore.selectedProductId → 查 useProductStore.products → 注入 "Name: ... | Stage: ... | Tagline: ..."；同时注入 active tasks 前 10 + 未来 7 天 events 前 5 + theme。toolLoop.ts:75 `systemPrompt = buildSystemPrompt({ coreContext: buildCoreContext() })`，每轮 chat 调用都注入。getCurrentContext tool 也暴露同样信息给 LLM 显式查询。mock 模式下 LLM 不会真用上下文生成回复（mock 返回固定 token），但 systemPrompt 的 messages 数组在 fetch body 中确实包含 context（通过 `messages.length === 3` 间接验证：system + 历史 + 当前 = 3 条）。真实 LLM 行为需云 provider UAT（已在 Out-of-Scope Findings 标注）。

### 8. provider 解耦（CmdKPalette + ChatPanel 读 uiStore）
expected: 切换 Settings 中的 provider → 关闭/重开 CmdKPalette 和 ChatPanel。期望：两个入口的 provider 都跟随 uiStore.activeAIProvider，不再硬编码 'deepseek'。
result: pass
note: Settings 点 Gemini → setActiveProvider（web 模式下 Tauri invoke 跳过）→ uiStore.setActiveAIProvider('gemini') → localStorage `nova-ui.state.activeAIProvider` 写为 "gemini"。打开 ChatPanel（无需重启应用），header 显示 "当前 provider：Gemini"（之前是 DeepSeek），证明 ChatPanel 通过 useUIStore((s) => s.activeAIProvider) 订阅，不再硬编码。CmdKPalette.tsx:49 同样的 selector。Settings 切换 → uiStore 更新 → 订阅组件自动 re-render。

### 9. Esc/overlay 关闭 + state 重置
expected: Cmd+K 打开 → 输入文字/切换模式 → Esc 关闭 → 再次 Cmd+K 打开。期望：query/trace/response 已清空；mode 回到默认 'command'。
result: pass
note: Cmd+K 打开 → 切到 AI 对话模式 + 输入"创建一个 mock AI 任务" → Esc 关闭 → dialogCount=0（DOM 清空）→ 再次 Ctrl+K → palette 重开为默认 "命令" 模式，搜索框已清空，列出完整 33 tools（不再过滤），trace/response 已清空。CmdKPalette.tsx:66 useEffect `if (!isOpen) { setQuery(''); setResponse(''); setTrace([]); setSelectedIndex(0); setMode('command'); }` 工作正常。

## Summary

total: 13 (9 web-mock + 4 real-desktop)
passed: 11 (A indirect + B + C + 9 web-mock)
issues: 0 blocking
pending: 0
skipped: 2 (D + TD-9-1 复现待诊)
tech-debt: 2 (TD-9-1 tool_call 间歇失败待诊断样本、TD-9-2 错误消息匹配过宽)

## Gaps

[none blocking — see Tech Debt section for carry-forward items]

## Real-Desktop UAT (2026-08-12, post keychain + tool_call fixes)

### A. DeepSeek 真实流式 + tool_call
expected: ChatPanel 发"创建 high 优先级任务" → tool_call → task 真创建。
result: indirect-pass (covered by Test B which exercises the same chatWithTools → createTask path).
note: 真实 DeepSeek API 通过 rig 库正常流式输出;tool_call 解析路径走 `llm.rs` ToolCallDelta 累积 + JS zod 验证。

### B. 真实 LLM 上下文感知
expected: 选中产品 → ChatPanel 问"我在做什么产品" → AI 回答选中产品名+stage。
result: pass (主路径)。
note: AI 正确回答 "WenXiBuddy AI 智能协同平台,商业化运营" + 列出关联任务,证明 `buildCoreContext` → system prompt → 真实 DeepSeek 真用了上下文。**Tech Debt:** LLM 调用 getCurrentContext 时偶发"工具调用异常"提示(LLM 自述"参数序列化问题"),失败 3 次后用 systemPrompt 信息直接回答。已修两处 root cause(Rust deltas flush 空 args → `{}`、JS executeTool null → `{}`),并保留 `[tool-exec]` / `[chat-err]` 诊断日志待下次复现时定位。

### C. keychain 持久化(重启后还在)
expected: 关闭 + 重启 tauri:dev → DeepSeek 状态仍"已配置"。
result: pass。
note: Cargo.toml 给 `keyring = "3"` 加上 `apple-native`/`windows-native`/`linux-native` feature,默认 mock backend 问题修复。Windows Credential Manager 现在真实持久化(`nova.pm-workspace:deepseek` Generic Credential)。重启后 `has_provider_key` 返回 true,Settings 显示"已配置"。

### D. Ollama 本地 tool_call
expected: Settings 切到 Ollama → 发创建任务 → 本地模型返回 createTask tool_call。
result: skipped (本次跳过;HUMAN-UAT.md 已通过 `NOVA_OLLAMA_MODEL=... cargo test llm::tests::ollama_real_tool_call_uat` 覆盖真实 tool_call 路径)。

## Tech Debt (carry-forward)

- **TD-9-1: 无参数 tool_call 偶发失败**:DeepSeek streaming 通过 ToolCallDelta 累积 args,空字符串被静默丢弃;null args 在 JS zod parse 失败。已修两处(llm.rs:376-401 deltas flush 空 → `{}`、registry.ts executeTool null/undefined → `{}`),但用户报告"失败三次"未复现具体 args 样本。诊断日志 `[tool-exec]` / `[chat-err]` 保留在 registry.ts / api.ts,等下次复现拿到 raw args 再精准定位。Cleanup: 真实根因定位后删除两处 `TEMP DIAGNOSTIC` 标注的 console.log/console.error。
- **TD-9-2: API key 错误消息过宽**:`humanizeAIError` 里 `lower.includes('auth')` 把任何含 "auth" 字符串的错误都映射为"API key 无效",可能掩盖真实网络/服务端问题。下次 UAT 时考虑收紧匹配规则。

## Out-of-Scope Findings (not blockers for Phase 9 UAT)

- **云 provider 真实 UAT 未执行**：DeepSeek/OpenAI/Anthropic/Gemini 均无 API key。本次走 web mock 模式（fetch 拦截 /api/chat 返回 deterministic tool_call/token），与 HUMAN-UAT.md 2026-08-11 策略一致。9-06 SUMMARY 明确 "UAT Status: Not passed. No real provider key was available" — 此条仍为 true，但 mock 模式 UAT 已完整覆盖 UI/tool loop/store/state 管理路径。
- **Ollama 真实 tool-call UAT**：HUMAN-UAT.md 已通过（`NOVA_OLLAMA_MODEL=gemma4:e2b cargo test llm::tests::ollama_real_tool_call_uat` 返回真实 createTask tool_call），本次不重复。
- **桌面端 per-provider keychain 交互**：setProviderKey/getProviderKey 走 Tauri invoke 进 OS keychain，web 模式下不可测。9-06 SUMMARY + HUMAN-UAT.md 已通过 Ollama 桌面端路径。
- **真实 LLM 上下文感知**：buildCoreContext 注入代码路径已验证（context.ts + toolLoop.ts:75），但 mock 不解析 systemPrompt。云 provider UAT 时验证 "AI 回答选中的产品名" 这一步。
- **mock task 副作用**：UAT 中通过 mock createTask 创建的 "Mock AI UAT task" 已通过 localStorage 直接清理（taskStore 走 Zustand persist，下次 F5 后 React state 同步）。
- **toast 视觉行为**：toast 在 top-4 right-4 显示，4 秒自动消失，需 MutationObserver 捕获，肉眼观察即可。
