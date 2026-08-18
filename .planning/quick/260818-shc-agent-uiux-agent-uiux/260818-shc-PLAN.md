---
phase: quick-260818-shc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/views/AgentWorkspaceView.tsx]
autonomous: false
requirements: [QUICK-SHC-01]
must_haves:
  truths:
    - "Agent 工作区恢复双栏布局:左侧对话区(flex-1)+ 右侧栏 w-[380px]"
    - "左栏对话由 AgentConsole(layout=\"page\")驱动,流式对话/确认流/PRD/记忆功能完好"
    - "右栏含「最近任务/定时任务」卡(SegmentedControl + mock 列表 + 查看全部)"
    - "右栏含「Agent 工作区」2 列 CardHover 网格(mock agents + 添加按钮)"
    - "MorningReport 显示在右栏顶部,不被删除"
  artifacts:
    - path: "src/views/AgentWorkspaceView.tsx"
      provides: "双栏 Agent 工作区视图"
      contains: "AgentConsole, MorningReport, SegmentedControl, CardHover"
  key_links:
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "src/components/AgentConsole.tsx"
      via: "import + <AgentConsole layout=\"page\" />"
      pattern: "AgentConsole layout=\"page\""
    - from: "src/views/AgentWorkspaceView.tsx"
      to: "src/components/MorningReport.tsx"
      via: "import + 右栏顶部渲染"
      pattern: "<MorningReport />"
---

<objective>
把 AgentWorkspaceView 还原成原型的双栏 UIUX(commit 092e5de 之前),同时保留 AgentConsole 真实对话与 MorningReport。

Purpose: 用户要求还原被 17-01 重写掉的原型设计。
Output: 重写 src/views/AgentWorkspaceView.tsx(~150 行)。
</objective>

<context>
@.planning/quick/260818-shc-agent-uiux-agent-uiux/original-prototype-reference.tsx
@src/components/AgentConsole.tsx (只读,不改)
@src/components/MorningReport.tsx (只读,不改)
</context>

<tasks>

<task type="auto">
  <name>Task 1: 重写 AgentWorkspaceView 为原型双栏布局</name>
  <files>src/views/AgentWorkspaceView.tsx</files>
  <action>
以 original-prototype-reference.tsx 为权威参考重写 AgentWorkspaceView.tsx:

1. 根容器: `<div className="flex gap-4 h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)]">` (去掉当前 max-w-3xl 单栏)
2. 左栏: `<Card variant="glass" className="flex-1 flex flex-col min-w-0 overflow-hidden">` 内含:
   - 原 header 按钮条:「当前工作区」(Folder icon)与「DeepSeek Chat」(Cpu icon)两个 secondary xs 按钮,`border-b border-border-subtle bg-bg-primary/60` — 作为普通流内首行(非 absolute)
   - `<AgentConsole layout="page" />` 填充剩余空间。不恢复原型的 mock messages/handleSubmit/输入框 — AgentConsole 已提供
3. 右栏: `<div className="w-[380px] shrink-0 flex flex-col gap-4 overflow-y-auto">` 依次:
   - `<MorningReport />` (顶部,orchestrator 锁定决策)
   - 最近任务卡: SegmentedControl(最近任务/定时任务, activeTab state)+ 原型 recentTasks mock 数组原样复制 + scheduled tab 显示「暂无定时任务」+ Separator + 「查看全部」ghost 按钮
   - Agent 工作区卡: 标题 + 添加按钮(primary xs)+ 原型 agents mock 数组(7 项, 含 Lightning/Cube/FileText icons)原样复制, 2 列 CardHover 网格
4. 不导入 useApp/mock 对话逻辑;原型中的 motion 入场动画(右栏两卡)按原样保留
5. 不改 AgentConsole.tsx 与 MorningReport.tsx

所有 mock 数据、className、icon 用法从 original-prototype-reference.tsx 逐字复制(路径可改为 @/src 别名)。
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>双栏布局渲染,AgentConsole 对话功能可用,右栏三卡(晨报/最近任务/Agent 工作区)齐备,typecheck 通过</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Agent 工作区双栏 UIUX 还原(左: AgentConsole 真实对话,右: 晨报 + 最近任务 + Agent 网格)</what-built>
  <how-to-verify>
    1. npm run dev 打开 http://localhost:3000,进入 Agent 工作区 tab
    2. 对照 docs/screenshots/01-agent-workspace.png: 左侧对话区 + 右侧 380px 栏,视觉与原型一致
    3. 左栏发送一条消息,确认流式响应/工具链路仍工作
    4. 右栏切「最近任务/定时任务」tab,确认 SegmentedControl 切换正常;Agent 网格 7 项 hover 有反馈
    5. 晨报(如有数据)出现在右栏顶部,展开/收起正常
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>npm run lint 通过;视觉对照原型截图;对话功能回归正常</verification>

<success_criteria>双栏还原 + 真实对话保留 + MorningReport 保留</success_criteria>
