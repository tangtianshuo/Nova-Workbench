---
phase: 05-task-crud
plan: 03
subsystem: ui
tags: [task-dialog, combobox, popover, delete-confirm, radix-dialog]

# Dependency graph
requires:
  - phase: 05-task-crud
    plan: 01
    provides: taskStore CRUD actions (addTask/updateTask/deleteTask/setTaskProject) + Task.projectId? field
provides:
  - "TaskDialog component — create/edit dual-mode with Combobox product selector + nested delete confirm"
  - "TaskManagementView '新建任务' button entry → opens TaskDialog in create mode"
  - "Form state reset on open/task change (Pitfall P13 fix)"
affects: [05-task-crud (Plan 04 TaskKanban DotsMenu consumes TaskDialog edit mode)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Combobox = Popover + Input + filtered button list (Radix Combobox not installed — D-09)"
    - "Nested Dialog stacks via z-modal (delete confirm rendered as sibling to TaskDialog)"
    - "Direct useTaskStore selectors over useApp() (REQUIREMENTS Key Decision #2)"
    - "useEffect([open, mode, task?.id]) for form reset — avoids stale state when reopening"

key-files:
  created:
    - src/components/TaskDialog.tsx
  modified:
    - src/views/TaskManagementView.tsx

key-decisions:
  - "Combobox built from Popover primitives (not Radix Combobox) — Radix Combobox not installed, plan locked this in D-09"
  - "Delete confirm rendered as top-level sibling Dialog (not nested inside DialogContent) — relies on z-modal stacking"
  - "Status Select exposed in edit mode enables reopen (TASK-04) without dedicated button"
  - "setTaskProject only called when projectId actually changed — avoids redundant store writes"

patterns-established:
  - "Dual-mode dialog pattern: mode prop + task? prop + useEffect reset (reusable for ProductDialog/ScheduleDialog later)"
  - "Combobox composition: trigger button styled like SelectTrigger + PopoverContent with Input + filtered list"

requirements-completed: [TASK-02, TASK-03, TASK-04]

# Metrics
duration: 1min
completed: 2026-08-10
---

# Phase 5 Plan 03: TaskDialog + TaskManagementView Wiring Summary

**TaskDialog 组件交付创建/编辑双模式(D-08)+ Combobox 产品选择器(D-09)+ 嵌套删除确认(TASK-03);TaskManagementView 接入"新建任务"按钮触发 create 模式。**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-08-10T08:48:08Z
- **Completed:** 2026-08-10T08:49:19Z
- **Tasks:** 2
- **Files:** 2 (1 created, 1 modified)

## Accomplishments

- TaskDialog 双模式完整:create 模式字段清空 + autoFocus 标题;edit 模式从 task prop 同步所有字段
- Combobox 产品选择器基于 Popover + Input + filtered list,case-insensitive substring filter,X 清除按钮带 `aria-label`
- 嵌套删除确认 Dialog:title="删除任务?" + body 含 task.title,确认按钮 variant="danger"
- TASK-04 reopen:edit 模式下 status Select 暴露 '未开始'/'进行中'/'已完成',无需单独按钮
- crypto.randomUUID() 生成新任务 ID
- useEffect([open, mode, task?.id]) 在 dialog 打开或 task 切换时重置 form,消除 Pitfall P13
- 直接 useTaskStore selectors(REQUIREMENTS Key Decision #2),不通过 AppContext
- setTaskProject 仅在 projectId 实际变化时调用,store 自动镜像 task.project(D-10)
- TaskManagementView 顶部加"新建任务"按钮(Plus icon + primary variant),触发 create 模式
- `npm run lint` 通过,无类型错误

## Task Commits

Each task was committed atomically:

1. **Task 1: TaskDialog.tsx (双模式 + Combobox + 嵌套删除确认)** — `3982b3a` (feat)
2. **Task 2: TaskManagementView 接入新建任务按钮** — `090f273` (feat)

## Files Created/Modified

- `src/components/TaskDialog.tsx` (NEW, 298 lines) — Props: { open, onOpenChange, mode, task?, defaultCategoryId? };5 form fields + Combobox;edit 模式删除按钮(mr-auto)+ 嵌套删除确认 Dialog
- `src/views/TaskManagementView.tsx` — 加 "新建任务" Button + TaskDialog mount;editingTask state ready for Plan 04 DotsMenu wire

## Decisions Made

- **Combobox 用 Popover 而非 Radix Combobox:** Radix Combobox 未安装,D-09 已锁定此实现;Popover 已有 z-tooltip 修复(clears Dialog z-modal),与 Select 同源
- **删除确认作为顶层 sibling Dialog:** 而非嵌套在 DialogContent 内部。Radix Dialog 支持 z-modal 自动叠加,渲染更简洁
- **status Select 在 edit 模式暴露 '未开始':** 用户改 status='未开始' 即实现 reopen(TASK-04),不需要额外按钮。UI-SPEC §4 明确"status visible here in dialog (unlike card per D-04)"
- **setTaskProject 条件调用:** `(task.projectId ?? undefined) !== projectId` 判断,避免重复 store 写入;D-10 镜像由 store 自动处理

## Deviations from Plan

None - plan executed exactly as written. Plan provided complete skeleton; implemented verbatim with zero ad-hoc decisions.

## Issues Encountered

None. `npm run lint` passed on both tasks with no type errors.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 04 (TaskKanban DotsMenu) can now wire `editingTask` state: DotsMenu "在对话框中编辑" sets `setEditingTask(task)` + `setDialogOpen(true)`,TaskDialog enters edit mode automatically
- Plan 04 also wires DotsMenu "删除" + "重新打开" + "复制 ID"
- TaskDialog reuses Drawer from Plan 02? No — Drawer is for ProductSummary, separate concern

## Self-Check: PASSED

**Files (2/2 found):**
- FOUND: src/components/TaskDialog.tsx
- FOUND: src/views/TaskManagementView.tsx

**Commits (2/2 found):**
- FOUND: 3982b3a (feat(05-03): add TaskDialog with create/edit modes + Combobox + nested delete confirm)
- FOUND: 090f273 (feat(05-03): wire TaskManagementView to TaskDialog create entry)

**Lint:** `npm run lint` passes with zero errors.

---

*Phase: 05-task-crud*
*Completed: 2026-08-10*
