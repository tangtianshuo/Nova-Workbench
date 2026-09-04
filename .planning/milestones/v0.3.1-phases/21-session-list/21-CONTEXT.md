# Phase 21: Session 列表与快捷入口 + 自动命名 - Context

**Gathered:** 2026-08-18
**Status:** Ready for planning
**Mode:** Autonomous smart-discuss — 推荐方案已按用户指示自动采纳(无需逐项确认)

<domain>
## Phase Boundary

用户通过 Agent 页列表与 Ctrl+Shift+K 双下拉即可到达任意会话,标题自动生成无需手动管理。交付:AgentWorkspaceView 最近任务真实列表、ChatPanel 双下拉(scoped 模式)、LLM 自动标题(fire-and-forget + 回退)。不含:session 手动重命名、session 删除、跨工作区 strict 隔离(PROJECT.md out of scope)。

</domain>

<decisions>
## Implementation Decisions

### 最近任务列表(LIST-01/02)
- 数据源:sessionRepo.listSessionsByWorkspace(workspaceId)(已就绪,last_active_at DESC);沿用现 SQL 语义(含 NULL-workspace 历史行)
- 消息数:sessionRepo 新增聚合 SQL(COUNT over agent_events 的 user_message/llm_message 事件,一条 SQL 批量,避免 N+1)
- 相对时间:新增 formatRelativeTime helper(刚刚/X 分钟前/X 小时前/X 天前/落日期),放 src/lib/utils.ts
- 点击列表项 → switchSession(sessionId)(Phase 19 就绪,streaming 守卫内建);Agent 页切换对话区焦点
- 空态文案:引导开始新对话
- mock recentTasks(AgentWorkspaceView.tsx:27-33)删除,换真实数据

### ChatPanel 双下拉(QUICK-01/02/03)
- 模式区分:uiStore 新增 chatPanelMode: 'pure' | 'scoped';useCmdK 改造:Ctrl+Shift+K → scoped,Ctrl+K → pure(现状两个快捷键开同一面板,必须先区分)
- scoped 模式:DrawerHeader 下加一行 工作区 Select + session Select(ui/Select 原语);pure 模式头部完全不变(QUICK-03)
- 工作区下拉切换 → guarded setActiveWorkspaceId(Phase 19 streaming 守卫内建)→ session 下拉联动过滤
- session 下拉选择 → switchSession;新会话入口("新对话"项)→ startNewSession

### LLM 自动命名(TITLE-01/02)
- 触发点:chatConsoleStore submit finally 块(已有 void refreshForkable() fire-and-forget 先例);仅当 session 无 title 时触发
- LLM 路径:复制 defaultCompactionSummarizer 模式(chatWithTools 自定义 systemPrompt + tools: [])生成短标题(中文,≤ 20 字)
- 回退:LLM 失败/空返回 → 首条用户消息截断(20 字)
- 写库守卫:updateTitle 带 SQL 级 WHERE title IS NULL 条件(不覆盖已有 title,天然防并发双写);title_source 一并写入('llm'/'fallback',补 sessionRepo.updateTitle 现不写 source 的缺口)
- 静默更新:chatConsoleStore 新增 sessionListVersion 计数器,标题落库后 ++;AgentWorkspaceView 订阅它重查列表;不打断用户、无 toast
- 异步守卫:回调按生成时捕获的 sessionId 写库(该 id 由参数携带,不读全局 current)

### Claude's Discretion
Select 宽度/布局细节、SQL 具体写法、测试文件组织、下拉空态文案。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- sessionRepo.listSessionsByWorkspace(workspaceId)(sessionRepo.ts:27,SESSION_LIST_SQL L45-48)/ updateTitle(L28,缺 title_source)/ SessionMeta(title, titleSource, lastActiveAt, parentTitle)
- switchSession / startNewSession / activeSessionId(chatConsoleStore,Phase 19)
- getEventStore().listEvents(sessionId)(eventStore.ts)— 消息数聚合的事件类型源
- chatWithTools(src/lib/api.ts:85 → llm.rs:153)+ defaultCompactionSummarizer 模式(compaction.ts:109-120)
- ui/Select 原语;SegmentedControl(AgentWorkspaceView recent/scheduled tab);Badge;motion.div 列表项样式(AgentWorkspaceView.tsx:83-101)
- useCmdK(hooks/useCmdK.ts:18-29 — Ctrl+K/Ctrl+Shift+K 现开同一 isChatPanelOpen,需改造)
- formatMemoryTime(chatConsoleStore.ts:56)— 仅钟点,相对时间需新 helper

### Established Patterns
- fire-and-forget:submit finally 块 void refreshForkable()(chatConsoleStore.ts:481-486)
- streaming 守卫:{ success: false, reason }(Phase 19)
- turn 完成点:submit finally + 确认继续路径的多个 finally(L514/565/601)——标题触发只在 submit finally(首个 turn 语义已由 title IS NULL 守卫覆盖)

### Integration Points
- AgentWorkspaceView.tsx:27-33 mock recentTasks → 真实列表
- ChatPanel.tsx:20 DrawerHeader → scoped 模式加选择器行
- uiStore:chatPanelMode 新 state
- useCmdK.ts:快捷键分流

### 测试基线
phase18SessionRepo / phase19SessionSwitch / phase19Runtime / phase20Fork / fork.test.ts — 列表/命名逻辑新增 store+repo 层测试(node:test);UI 无测试框架,靠 UAT

</code_context>

<specifics>
## Specific Ideas

No specific requirements — ChatPanel 加下拉框、LLM 自动命名是 PROJECT.md 2026-08-18 用户锁定决策;Ctrl+K 保持纯净是明确约束。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope。

</deferred>
