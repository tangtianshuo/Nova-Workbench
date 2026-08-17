# Phase 17: Agent UX + 架构文档 - Context

**Gathered:** 2026-08-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Agent 成为一等入口：AgentWorkspaceView 真实可用（复用 ChatPanel 能力）、⌘K 携带当前视图上下文唤起、每日首次进入工作区呈现结构化晨报、任务/知识库右键快捷 AI 动作（选区快照携带）；docs/ARCHITECTURE.md 全文重写为「事件日志 + tool loop + FTS5」新真相源，ADR 含 harness MIT 归属。

多 agent 形态、多会话管理器（UX-05..08）、inline 视图内 agent 操作均不在本期（v2 已划出）。

</domain>

<decisions>
## Implementation Decisions

### AgentWorkspaceView 形态（UX-01）
- 抽 `AgentConsole` 共享组件：ChatPanel 663 行的会话主体（流式/tools/HITL 卡片/恢复）抽出，Drawer 壳与 View 双宿主，「功能一致」由同构保证
- 晨报卡片在 AgentWorkspaceView 顶部常驻区：无会话时占据主视觉，会话开始后折叠为顶部横条（可展开）
- 信息架构最小化：单会话 + 晨报，不做会话列表/多会话管理（UX-05/07 属 v2）
- 现有 309 行 mock 全部删除重写（mock 深度耦合 useApp 假动作，清理成本高于重写）

### ⌘K 上下文携带（UX-02）
- 加裸 `⌘K/Ctrl+K`（Tauri webview 无 URL 栏冲突），保留现有 Shift+K 作为 web dev fallback
- 上下文注入扩展 `contextAssembler`「业务事实」段（已注入 selectedProductId，补任务/日程选中态，经 uiStore）— 与 Phase 15 五段投影同构，不开第二路径
- ChatPanel 输入区上方显示「已携带：{产品/任务/日程名}」chip，可点 × 临时移除
- 三视图携带：产品→选中产品卡；任务→选中任务（无选中则当前列表过滤器）；日程→今日日程窗口

### 晨报主动建议（UX-03）
- 触发：启动后首次进入 Agent 工作区时呈现（「每日首次启动」按打开工作区首次计）
- 去重：localStorage 日期戳 `morning-report:last-shown=yyyy-MM-dd`（纯 UI 行为，不入事件流）
- 数据源：今日日程（scheduleStore）+ 过期未完成任务（taskStore）+ 待确认记忆候选（Phase 15 候选队列）— 纯数据查询零 LLM
- 交互：条目可点击跳转（日程→日程视图、任务→任务管理、记忆候选→打开 ChatPanel 确认卡片），无批量操作；无内容时不渲染晨报区

### 右键快捷动作（UX-04）
- 清单：任务区 3 个（总结此任务 / AI 拆解子任务 / 安排到日程）；知识库区 3 个（总结文档 / 存为记忆 / 相关问题追问）；触发 = 打开 ChatPanel 并预填指令
- `@radix-ui/react-context-menu`（需新安装，UX-04 指定）
- 选区快照：触发时读 `window.getSelection()` 快照作为 ChatPanel 首条消息引用前缀；`e.target.isContentEditable`（MDXEditor 内）不注册菜单，原生菜单照常

### 架构文档（ARCH-01/02）
- docs/ARCHITECTURE.md 全文重写：按「事件日志 + tool loop + FTS5 + HITL + Tauri 壳」新叙事，GraphFlow/Rig/LanceDB 正式出局，AGENT_MEMORY_REFERENCE.md 纳入真相源索引
- `docs/adr/` 新增：ADR-0001 架构切换（事件日志取代 GraphFlow/Rig/LanceDB）+ ADR-0002 harness 纯函数复用 MIT 归属；ARCHITECTURE.md 索引引用

### Claude's Discretion
AgentConsole 抽取的具体切面、chip 组件实现、晨报卡片视觉细节、右键菜单注册的挂载方式、ARCHITECTURE.md 章节编排等实现层决策。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ChatPanel.tsx`（663 行）— 真实 agent 面：Drawer 壳 + 流式输出 + tools + HITL 卡片（记忆/PRD）+ 会话恢复；AgentConsole 抽取源
- `src/ai/contextAssembler.ts` — Phase 15 五段投影组装器，「业务事实」段已注入 selectedProductId；⌘K 上下文扩展点
- `src/hooks/useCmdK.ts` — 全局快捷键（Shift+K/F/P + Esc），加裸 ⌘K 的落点
- `src/components/ui/`（20 个原语）— Card/Badge/Button/Dialog 等；右键菜单用 `@radix-ui/react-context-menu`（需安装，与既有 Radix 栈同族）
- Phase 15 记忆候选队列 + ChatPanel 内联确认卡片模式 — 晨报「待确认记忆候选」数据源与跳转目标
- `scheduleStore` / `taskStore` — 晨报日程/过期任务数据源

### Established Patterns
- 双实现模式（Node 测试/web 走内存，isTauri() 分支）— 测试必须在无 Tauri 环境可跑
- zustand 投影 + SQLite 真相源同构；事件 append-only
- UI token 纪律（bg-bg-primary 等语义类，禁 hex/白黑）
- Phosphor duotone 图标；motion/react 动画规范

### Integration Points
- `src/App.tsx` activeTab 路由 — AgentWorkspaceView 挂载点（重写后）
- `uiStore` — isChatPanelOpen/isCmdKOpen 既有开关 + 需补任务/日程选中态
- `MainLayout` — ChatPanel Drawer 全局挂载处；右键菜单 Provider 挂载层

</code_context>

<specifics>
## Specific Ideas

- 晨报「每日一次」的语义：同一天内再次进入工作区不重复出现；跨天首次进入才重新呈现
- 右键动作触发是「预填指令」而非静默执行 — 用户在 ChatPanel 里看到即将发送的内容再确认

</specifics>

<deferred>
## Deferred Ideas

- 多会话管理器（恢复历史任意会话）、inline 视图内 agent 嵌入、多 agent 形态、OS 原生通知 — UX-05..08，v2
- 晨报批量操作（一键确认全部记忆候选）— 交互成本高，留待真实使用反馈

</deferred>
