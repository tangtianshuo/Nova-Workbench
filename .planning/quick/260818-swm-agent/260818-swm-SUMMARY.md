---
phase: quick-260818-swm-agent
plan: 01
subsystem: agent-workspace
tags: [workspace, real-data, modal]
requires: [workspaceStore, AddWorkspaceModal]
provides: [AgentWorkspaceView 真实工作区网格]
affects: [src/views/AgentWorkspaceView.tsx]
tech-stack:
  added: []
  patterns: [direct Zustand store selector, conditional modal render]
key-files:
  created: []
  modified: [src/views/AgentWorkspaceView.tsx]
decisions:
  - 直连 useWorkspaceStore selector(项目 preferred pattern),不走 useApp
  - onSuccess 仅关闭 modal,addWorkspace+扫描由 modal 内部处理
metrics:
  duration: 6 min
  completed: 2026-08-18
---

# quick-260818-swm: Agent 工作区网格接入真实数据 Summary

右栏「Agent 工作区」网格从 7 个硬编码 mock agents 切换为 workspaceStore 真实 workspaces,「添加」按钮复用既有 AddWorkspaceModal 完整流程。

## Changes

- `src/views/AgentWorkspaceView.tsx`
  - 删除 mock `agents` 常量及 `Lightning, Cube, FileText` 图标导入
  - `const workspaces = useWorkspaceStore((s) => s.workspaces)` 直连 store
  - 网格渲染 `ws.name`(truncate)+ `ws.folderPath`(font-mono truncate),统一 Folder 图标 accent 色,`key={ws.id}`,CardHover p-3 / grid-cols-2 gap-2.5 / motion 入场动画保留
  - 「添加」Button `onClick` 打开 modal(`useState(false)` + 条件渲染,onClose/onSuccess 均关闭)
  - 空状态: `workspaces.length === 0` 显示居中 `text-text-tertiary` 提示
  - 左栏聊天、最近任务卡(mock recentTasks)、双栏布局、高度公式均未改动

## Verification

- `npm run lint`(tsc --noEmit)通过

## Deviations from Plan

- 执行环境:worktree 分支落后于 master,已 fast-forward 到 8d8d06e(plan 依赖的 shc 双栏版本)后再修改。期间误 pop 了一个陈旧 stash(冲突),已还原,stash 条目保留未动。

## Known Stubs

- `recentTasks` 仍为 mock — 计划明确保留(后续任务接入)。
