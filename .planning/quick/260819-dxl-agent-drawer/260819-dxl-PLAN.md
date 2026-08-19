---
phase: quick-260819-dxl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/components/ChatPanel.tsx]
autonomous: true
requirements: [QUICK-DXL-01]
must_haves:
  truths:
    - "用户在右下角 Agent Drawer 中可以切换工作区（两种 mode 均可见）"
    - "streaming 中切换被拒绝并出现 error toast「无法切换工作区」"
    - "切换后进入新 session（store 编排，无需新代码）"
  artifacts:
    - path: "src/components/ChatPanel.tsx"
      provides: "Drawer 内的工作区切换入口"
      contains: "DropdownMenu"
  key_links:
    - from: "src/components/ChatPanel.tsx"
      to: "workspaceStore.setActiveWorkspaceId"
      via: "onSelect handler"
      pattern: "setActiveWorkspaceId"
---

<objective>
右下角 Agent Drawer（ChatPanel）补工作区切换入口。复用 AgentWorkspaceView 刚落地的 DropdownMenu 交互模式（quick-260819-df6），不做 session 切换（Drawer 保持轻量）。
Output: ChatPanel.tsx 内新增 WorkspaceSwitcherRow，全 mode 渲染。
</objective>

<context>
@.planning/STATE.md
@src/components/ChatPanel.tsx
@src/views/AgentWorkspaceView.tsx
</context>

<interfaces>
From src/stores/workspaceStore.ts:
```typescript
setActiveWorkspaceId(id: string): { success: boolean; reason?: 'streaming' }
workspaces: Workspace[]        // { id, name, ... }
activeWorkspaceId: string | null
```

From src/components/ui barrel: DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Button, useToast
Icons (@phosphor-icons/react): Folder, CaretDown — duotone, 12px；cn() from @/src/lib/utils
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Drawer header 加工作区切换 DropdownMenu</name>
  <files>src/components/ChatPanel.tsx</files>
  <action>
    在 ChatPanel.tsx 新增 `WorkspaceSwitcherRow` 组件（放 ScopedSelectorRow 旁）：
    - 订阅 `useWorkspaceStore` 的 workspaces / activeWorkspaceId / setActiveWorkspaceId，`useToast()`，`useUIStore` 的 isChatPanelOpen（保持现文件订阅风格）。
    - 交互模式逐字复刻 AgentWorkspaceView.tsx:102-124：DropdownMenu > DropdownMenuTrigger asChild > Button(variant="secondary" size="xs" gap-1)，内含 Folder(12, duotone, text-accent) + truncate(max-w-[160px]) 当前工作区名（activeWorkspace?.name ?? '当前工作区'）+ CaretDown(10)。DropdownMenuContent align="start"，每项 Folder icon + 名称，当前项 text-accent font-medium。
    - onSelect 调用与 AgentWorkspaceView 相同的守卫：`const r = setActiveWorkspaceId(id); if (!r.success && r.reason === 'streaming') toast({ type: 'error', title: '无法切换工作区', description: '请等待当前回复完成' })`。store 已编排 end-session + startNewSession，勿在此重复处理。
    - 在 ChatPanel 的 DrawerHeader 之后、ScopedSelectorRow 之前无条件渲染 `<WorkspaceSwitcherRow />`（纯 mode 也显示；scoped mode 会同时看到该行与 ScopedSelectorRow 的 Select —— 让 ScopedSelectorRow 的 workspace Select 与其共存即可，同一 store 状态天然同步，不做去重逻辑）。
    - 样式：外层 `flex px-4 py-2 border-b border-border-subtle` 对齐 ScopedSelectorRow。token 类名 only。
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>Drawer 两种 mode 均显示工作区下拉；切换成功进入新 session；streaming 时 toast 拒绝</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Drawer 工作区切换下拉</what-built>
  <how-to-verify>
    1. `npm run dev`，打开应用，Ctrl+K 打开右下角 Drawer
    2. header 下方可见工作区按钮（当前工作区名 + CaretDown）
    3. 点开选择另一工作区 → 对话清空进入新 session
    4. 发送一条消息，streaming 中尝试切换 → error toast「无法切换工作区」
    5. Ctrl+Shift+K（scoped mode）确认下拉仍显示且与 Select 状态一致
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
npm run lint 通过；npm test 不回归（无新增测试，纯视图胶水）。
</verification>

<success_criteria>
Drawer 内可切换工作区，行为与 Agent 工作区页一致（同一 store 编排），streaming 守卫生效。
</success_criteria>
