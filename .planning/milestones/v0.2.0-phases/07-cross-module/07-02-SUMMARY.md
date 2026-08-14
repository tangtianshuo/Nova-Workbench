---
phase: 07-cross-module
plan: 02
subsystem: task-schedule-ui
tags: [react, task-kanban, schedule, weak-links, badges]

requires:
  - phase: 07-cross-module
    provides: arrangeOnCalendar and cross-store status/link actions
provides:
  - TaskKanban arrange-to-calendar action, confirmation, and schedule badge
  - ScheduleView task/product association controls and completed-event styling
affects: [07-03, 07-05, 09-ai]
requirements-completed: [CROSS-01, CROSS-02, CROSS-04, CROSS-06]
---

# Phase 07 Plan 02: Task and Schedule UI Summary

## Accomplishments

- Added `安排到日历` to the task card menu and wired it to `arrangeOnCalendar`.
- Added success/error feedback, already-arranged confirmation, old-event replacement, and task-card schedule navigation badge.
- Added task and product association icons to calendar chips and agenda entries.
- Added task-tab navigation, `ProductSummaryDrawer` opening, task-type event coloring, and completed-event visual treatment.

## Files Modified

- `src/components/TaskKanban.tsx`
- `src/views/ScheduleView.tsx`

## Verification

- `npm run lint` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS
- `npm test` — PASS (6/6)
- Playwright smoke flow — PASS for task menu, first arrangement toast, rearrangement confirmation, and navigation to the schedule view.

The seeded task deadlines are in May 2025 while the calendar opens on the current month, August 2026. The smoke flow therefore confirms the state transition and toast but does not claim that the event is visible in the initially displayed month.

## Human UAT

Pending. The plan's manual checks for task/product association icon navigation and completed-event styling still require confirmation in the corresponding calendar month.

---
*Phase: 07-cross-module*
*Completed: 2026-08-10 (automated verification; human UAT pending)*
