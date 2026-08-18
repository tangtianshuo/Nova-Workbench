---
phase: quick-260818-task-stats
plan: 01
subsystem: task-management
tags: [stats, zustand, taskStore]
key-files:
  modified: [src/components/StatsRow.tsx]
decisions:
  - deadline 安全解析用组件内本地 helper(与 17-03 reportSelectors 同语义:不可解析永不计入、不 throw)
duration: 3 min
completed: 2026-08-18
---

# Quick Task 260818-gec: 任务统计卡真实数据化 Summary

把 StatsRow 的硬编码 mock 统计(12/28/56/3 + 假 trend)替换为 `useTaskStore` categories useMemo 派生的真实计数,四卡布局/视觉结构不变。

## Changes

- `src/components/StatsRow.tsx`(commit 89069a4):
  - `useTaskStore((s) => s.categories)` → `useMemo` flatMap 派生:今日待办(deadline===今天 且未完成)、进行中、已完成、逾期(deadline<今天 且未完成)
  - 模块级 `parseDeadline()`:`/^(\d{4})-(\d{2})-(\d{2})$/` 校验后取本地零点;不匹配或 Invalid Date 返回 null,永不计入、不 throw
  - 删除 trend/isPositive/ArrowUpRight/ArrowDownRight,替换为 `text-xs text-text-tertiary` 真实副信息(共 X 项未完成 / 占未完成 Y% / 共 X 项任务);除零守卫(暂无未完成),`Math.round` 取整
  - 保持无 props、四卡 grid、CardHover、icon、badgeVariant、入场动画、subLabel

## Deviations from Plan

None — plan executed exactly as written。(Worktree 与 master 的 StatsRow/taskStore/TaskManagementView 仅行尾差异,内容一致,无需 sync commit。)

## Verification

- `npm run lint`(tsc --noEmit)通过

## Manual Verification (documented, not blocking)

1. `npm run dev` 打开 http://localhost:3000 → 任务管理页
2. 四卡数字与看板实际任务一致(今日待办按今天日期核对)
3. 勾选完成一个任务 → "已完成"+1,进行中/未完成相应减少,数字即时更新
4. 无 trend 假百分比行,副信息显示占比/总数

## Self-Check: PASSED

- src/components/StatsRow.tsx: FOUND (modified, contains useTaskStore)
- Commit 89069a4: FOUND
