# Quick Task 260811-vg6: ScheduleView Agenda 高度对齐 Calendar

**Date:** 2026-08-11
**Status:** Complete
**Files:** src/views/ScheduleView.tsx (2 处 className)

## What Changed

两处 className 调整,无逻辑/结构变化:

1. **容器(line 177)**: `flex gap-5 h-full min-h-[700px]` → `flex gap-5 h-[calc(100vh-220px)] min-h-[400px]`
   - 复用 `TaskManagementView.tsx` 既有 fixed-height 模式
   - 删除 `h-full`(与 `min-h-[700px]` 配合会撑开容器,触发 main 页面级滚动)

2. **Agenda Card(line 305)**: `w-72 p-5 flex flex-col shrink-0` → `w-72 p-5 flex flex-col shrink-0 min-h-0`
   - `min-h-0` 让 flex column 子项的内部 `overflow-y-auto` 真正生效
   - 默认 `min-height: auto` 阻止子项收缩到内容以下,滚动条不触发

## Root Cause

- 容器 `min-h-[700px]` 是最小高度不是固定高度,Agenda 内容多时被撑开
- Agenda Card 没高度上限,内容能无限撑开,`overflow-y-auto` 不触发
- 整个 main 区域被撑高,触发 App.tsx `<main className="flex-1 overflow-auto">` 页面级滚动

## Verification

- `npm run lint` (tsc --noEmit) 通过
- 视觉验证留给 HUMAN-UAT:本月日程事件多时,侧栏内部出现独立滚动条;两侧 Card 等高;页面整体不被撑高

## Skipped

- 不加 `max-h`、固定 px、`ResizeObserver` 或任何 JS(待真正需要响应式高度时再考虑)
- 不改 Calendar Card(它会自动匹配容器高度)
- 不重构布局结构
