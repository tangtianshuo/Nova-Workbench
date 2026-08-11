---
phase: quick
plan: 260811-v3i
subsystem: task-schedule-linkage
tags: [task, schedule, auto-sync, deadline]
requires:
  - Phase 7 arrangeOnCalendar wrapper
  - scheduleStore CRUD (createEvent/updateEvent/deleteEvent)
  - taskStore.updateTask
provides:
  - AppContext.syncTaskSchedule wrapper
  - Auto-sync on TaskDialog create/edit
  - Auto-sync on TaskKanban inline deadline edit
affects:
  - src/store/AppContext.tsx
  - src/components/TaskDialog.tsx
  - src/components/TaskKanban.tsx
tech-stack:
  added: []
  patterns:
    - Cross-store orchestration via AppContext wrapper (per milestone decision)
    - Debounced autosave + delayed sync (500ms > 400ms)
key-files:
  created: []
  modified:
    - src/store/AppContext.tsx
    - src/components/TaskDialog.tsx
    - src/components/TaskKanban.tsx
decisions:
  - Reuse arrangeOnCalendar + scheduleStore CRUD instead of new store logic
  - 500ms debounce for sync (>scheduleSave 400ms) avoids store race
  - prevDeadline diff for edit branch prevents spurious updateEvent calls
  - No toast on auto-sync (Dialog already toasts; sync is implicit)
metrics:
  duration: ~10 min
  tasks_completed: 3
  files_modified: 3
  completed: 2026-08-11
---

# Quick 260811-v3i: Task Deadline Auto-Schedule Summary

Setting a task deadline (date + hour) now auto-creates/updates/removes the linked ScheduleEvent — zero-friction task→schedule linkage via a single `syncTaskSchedule` wrapper covering all deadline-change cases.

## What Was Built

**1. `syncTaskSchedule(taskId, prevDeadline?)` wrapper** (AppContext.tsx, ~30 lines after `arrangeOnCalendar`)
Covers 5 cases in one call:
- No deadline, no link → noop
- No deadline, but linked → `deleteEvent` + clear `scheduledEventId`
- Deadline, no link → delegate to `arrangeOnCalendar`
- Deadline + link, deadline changed → `updateEvent` (date/time/title)
- Deadline + link, deadline unchanged → noop (via `prevDeadline` diff)

Reuses `arrangeOnCalendar` for create + `scheduleStore.updateEvent`/`deleteEvent` for mutations. No new store fields, no persist migration, no breaking changes.

**2. TaskDialog.handleSubmit** (TaskDialog.tsx)
- Pre-generates `crypto.randomUUID()` in create branch, calls `syncTaskSchedule(newId)` right after `addTask`
- Captures `task.deadline` as `prevDeadline` before `updateTask` in edit branch, calls `syncTaskSchedule(task.id, prevDeadline)` after

**3. TaskKanban inline edit** (TaskKanban.tsx)
- New `scheduleScheduleSync` debounced helper (500ms, longer than `scheduleSave`'s 400ms so the `updateTask` has landed)
- Fires from both DatePickerInput and hour Select change handlers in `KanbanCard`
- Cleanup wired into the existing unmount `useEffect`

## Verification

- `npm run lint` (tsc --noEmit) passes after each task
- Pre-existing `arrangeOnCalendar` manual flow unchanged — when deadline is unchanged, `syncTaskSchedule` returns `noop`
- Phase 7 `completeTask` / `CROSS-07` status sync unaffected — `scheduledEventId` field semantics unchanged

Manual UAT deferred (not a checkpoint — desktop app testing).

## Deviations from Plan

None — plan executed as written. Three small clarifications:
- Hour Select branch in TaskKanban gates `scheduleScheduleSync` on `deadlineDate` (consistent with pre-existing `scheduleSave` gating on same line)
- Used `task.deadline` (pre-edit snapshot) as `prevDeadline` in inline edit — matches the plan's intent

## Commits

- `fc08090` feat(quick-260811-v3i): add syncTaskSchedule wrapper in AppContext
- `54e5e49` feat(quick-260811-v3i): auto-sync schedule in TaskDialog submit
- `3e63115` feat(quick-260811-v3i): auto-sync schedule on inline deadline edit

## Self-Check: PASSED

- `src/store/AppContext.tsx` — FOUND
- `src/components/TaskDialog.tsx` — FOUND
- `src/components/TaskKanban.tsx` — FOUND
- `fc08090` — FOUND
- `54e5e49` — FOUND
- `3e63115` — FOUND
