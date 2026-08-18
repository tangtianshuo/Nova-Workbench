---
phase: quick-260818-shc
plan: 01
subsystem: agent-workspace-ui
tags: [ui, restore, agent-workspace, layout]
key-files:
  modified: [src/views/AgentWorkspaceView.tsx]
decisions:
  - 右栏 mock 数据(recentTasks/agents)按用户要求从原型逐字复制,后续接真实数据时替换
  - 原型 mock 对话逻辑(messages/handleSubmit/addTask/addEvent)未恢复,由 AgentConsole 提供真实对话
metrics:
  duration: ~6 min
  completed: 2026-08-18
---

# Quick 260818-shc: Agent 工作区双栏 UIUX 还原 Summary

还原原型双栏布局:左栏 AgentConsole 真实对话 + header 按钮条(当前工作区 / DeepSeek Chat),右栏 380px 依次为 MorningReport、「最近任务/定时任务」SegmentedControl 卡(原型 mock 数据逐字复制)、「Agent 工作区」7 项 2 列 CardHover 网格。高度公式 `h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)]` 保留。AgentConsole / MorningReport 零改动。

## Verification

- `npm run lint` (tsc --noEmit) 通过
- Checkpoint human-verify: auto-approved (auto_advance=true)

## Known Stubs

- `recentTasks` / `agents` 为原型原样 mock 数据(src/views/AgentWorkspaceView.tsx),按任务约束保留,待后续接 taskStore / 真实 agent 注册表

## Self-Check: PASSED

- src/views/AgentWorkspaceView.tsx 存在且已提交
- Commit 768f569 存在于 git log
