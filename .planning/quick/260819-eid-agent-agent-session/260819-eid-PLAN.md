---
phase: quick-260819-eid
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/views/AgentWorkspaceView.tsx]
autonomous: true
requirements: [QUICK-EID-01]
must_haves:
  truths:
    - "点击右侧「Agent 工作区」卡片中的工作区磁贴，切换到该工作区并进入新 session"
    - "streaming 中点击磁贴弹出错误 toast「无法切换工作区」"
    - "当前激活工作区磁贴有 accent 高亮且可辨识"
  artifacts:
    - path: "src/views/AgentWorkspaceView.tsx"
      provides: "工作区磁贴可点击切换"
  key_links:
    - from: "AgentWorkspaceView 工作区磁贴 onClick"
      to: "workspaceStore.setActiveWorkspaceId"
      via: "已有 handleSelectWorkspace"
      pattern: "handleSelectWorkspace\\(ws\\.id\\)"
---

<objective>
Agent 工作区页右下角「Agent 工作区」卡片的工作区磁贴从纯展示改为可点击：点击 → 切换工作区（store 编排含 startNewSession），streaming 拒绝时 toast 提示。

Purpose: UAT 反馈 — 磁贴看起来可点但没反应。
Output: 修改后的 AgentWorkspaceView.tsx。
</objective>

<context>
@src/views/AgentWorkspaceView.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: 工作区磁贴接通 handleSelectWorkspace</name>
  <files>src/views/AgentWorkspaceView.tsx</files>
  <action>
只改 L239-263 的 workspaces.map 渲染，其余不动：

1. 把 a11y 属性和事件放到 `motion.div` 上（参照同文件 L167-176 最近任务行的写法）：
   - `role="button"`、`tabIndex={ws.id === activeWorkspaceId ? -1 : 0}`、`aria-current={ws.id === activeWorkspaceId || undefined}`
   - `onClick={() => ws.id !== activeWorkspaceId && handleSelectWorkspace(ws.id)}`
   - `onKeyDown` Enter 同 onClick（非激活时才触发）
   - className 加 `cursor-pointer outline-none focus-visible:bg-bg-secondary`（加在 motion.div 或传入 CardHover，取改动最小处）
2. 激活高亮：CardHover 的 className 追加 `ws.id === activeWorkspaceId && 'border-accent/60 bg-accent-subtle/40'`（用 cn()，token 类名，参考 DropdownMenu L117-118 的高亮语义）。
3. 复用已有 `handleSelectWorkspace`（L58-63，含 streaming toast），不新写逻辑；CardHover 内部结构（图标/名称/路径）不变。

禁止：改 store、加新依赖、加动画。
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>磁贴可点击/键盘 Enter 切换工作区并进入新 session；streaming 时点击弹错误 toast；激活磁贴 accent 高亮；lint 通过。</done>
</task>

</tasks>

<verification>
npm run lint 通过，无回归。
</verification>

<success_criteria>
点击右下角工作区磁贴 → 工作区切换 + 新 session；当前激活磁贴高亮。
</success_criteria>
