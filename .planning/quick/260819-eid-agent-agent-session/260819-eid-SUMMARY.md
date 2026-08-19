---
phase: quick-260819-eid
plan: 01
subsystem: agent-workspace
tags: [ux, a11y, workspace]
requires: []
provides: ["工作区磁贴可点击切换 + 激活高亮"]
affects: [src/views/AgentWorkspaceView.tsx]
key-files:
  modified: [src/views/AgentWorkspaceView.tsx]
decisions:
  - a11y/事件放 motion.div(参照最近任务行写法),高亮放 CardHover className,最小 diff
metrics:
  duration: 6m
  completed: 2026-08-19
---

# Quick Task 260819-eid: 工作区磁贴可点击切换 Summary

Agent 工作区卡片的工作区磁贴接通 handleSelectWorkspace:点击/Enter 切换工作区(含 startNewSession 编排),streaming 拒绝时 toast「无法切换工作区」,当前激活磁贴 accent 高亮。

## Changes

- `src/views/AgentWorkspaceView.tsx` L240-263: motion.div 增加 `role="button"`、`tabIndex`(激活时 -1)、`aria-current`、`onClick`/`onKeyDown`(Enter) 均在非激活时触发;className 加 `cursor-pointer outline-none focus-visible:bg-bg-secondary`
- CardHover className 用 `cn()` 追加激活高亮 `border-accent/60 bg-accent-subtle/40`
- 复用既有 `handleSelectWorkspace`(含 streaming toast),未改 store、未加依赖、未加动画

## Verification

- `npm run lint`: 通过(0 错误)
- `npm test`: 217/217 pass, 0 fail

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- src/views/AgentWorkspaceView.tsx modified: FOUND
- Commit 2aa35c4: FOUND
