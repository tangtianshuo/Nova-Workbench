---
phase: 26-mock-tab
plan: "03"
subsystem: rnd-tabs
tags: [tab-run, hitl, ui, mock-removal]
requires: ["26-01", "26-02"]
provides: ["TabRunPanel shared component", "requirements-tab engine-run pilot pattern"]
affects: [src/components/product/AIRequirementsTab.tsx, src/stores/tabRunStore.ts]
tech-stack:
  added: []
  patterns: [per-tab run panel + startTabRun wiring + global-queue HITL (D-05)]
key-files:
  created: [src/components/rnd/TabRunPanel.tsx]
  modified: [src/components/product/AIRequirementsTab.tsx, src/stores/tabRunStore.ts]
decisions:
  - Panel falls back to latest finished run record per tab (runsByTab entry is dropped on settle) so the collapsed summary row survives until next run/clear
  - Retry re-invokes startTabRun with userMessage/coreContext persisted verbatim on TabRunRecord
  - Candidate confirm chain stays single (global queue, D-05); tab reads back the committed prd deliverable slot instead of a second chain
metrics:
  duration: 25m
  completed: 2026-08-31
  tasks: 2
  files: 3
---

# Phase 26 Plan 03: TabRunPanel + 需求 tab 试点接线 Summary

Shared per-tab run panel (`TabRunPanel`) + requirements tab wired to a real `engine_run` (independent sessionId, batch priority, tab coreContext) replacing the mock generate flow — the pattern 26-04 mechanically copies to the remaining tabs.

## What Was Built

### Task 1: TabRunPanel shared component (5afda97)
- `src/components/rnd/TabRunPanel.tsx` — named export, props `{ tabId, className }`; renders the tab's latest `tabRunStore` run.
- Summary row: status badge (queued/running Spinner, waiting Badge warning + 「打开确认队列」link → `useUIStore.setActiveTab('agent')`, done CheckCircle + Badge success, error Badge danger), step one-liner (13px truncate), per-second elapsed, chevron toggle (CaretDown 14 rotate-180).
- Auto-expand on run start, auto-collapse ~2s after done/error (spring 350/30, height/opacity via AnimatePresence); cleanup on unmount.
- Event list: max-h-48 scroll, mono 11px timestamps, `bg-tertiary/50` rows, 「暂无事件」 empty state, no markdown rendering.
- Cancel: `Button variant="danger" size="sm"` 「取消生成」, tooltip 「已确认落槽的产物会保留」, direct call (no dialog).
- Error state: spec copy + retry (primary Button) re-running `startTabRun` with identical params.
- Store additions: `TabRunRecord.userMessage`/`coreContext` (retry inputs), `engineRun({ priority: 'batch' })` (TAB-06), `ACTIVE` exported.

### Task 2: Requirements tab pilot (a408cf5)
- `AIRequirementsTab.tsx`: generate button → `startTabRun({ tabId: 'requirement', kind: 'requirement', ... })` with `buildCoreContext` tab payload and sessionTitle 「{product} · 需求文档生成」.
- `<TabRunPanel tabId="requirement" />` mounted at tab content top; button disabled while a run is active (tooltip 「本 tab 已有生成任务进行中」).
- Web fallback: `!isTauri()` → disabled + tooltip 「此功能需要桌面引擎，请使用桌面版 Nova。」 (button wrapped in span so Radix Tooltip fires on disabled).
- Mock removal: `generateRequirementAI` no longer called; PRD markdown/copy/download now read the committed `prd` deliverable slot (`rndStore.deliverables`); when empty, tab shows the spec empty state 「还没有需求文档。点击上方生成按钮，AI 将生成候选供你确认。」.
- Candidate confirm chain stays the single global-queue chain from 26-01 (D-05) — queue confirm → `commitDeliverableDraft` refreshes the slot the tab reads; no second chain built.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Collapsed summary row vanished after run settle**
- **Found during:** Task 1
- **Issue:** `runsByTab` deletes its entry in the run's `finally`, so the panel returned null after done/error — spec requires the collapsed row to persist.
- **Fix:** Panel falls back to the latest run record for the tab by `startedAt`.
- **Files modified:** src/components/rnd/TabRunPanel.tsx
- **Commit:** 5afda97

**2. [Rule 3 - Blocking] Store fields needed for retry were missing**
- **Found during:** Task 1
- **Issue:** 26-01 did not persist `userMessage`/`coreContext` on the record (plan anticipated this); `startTabRun` also lacked `priority: 'batch'`.
- **Fix:** Added both fields + batch priority in tabRunStore.
- **Files modified:** src/stores/tabRunStore.ts
- **Commit:** 5afda97

## Verification

- `npx tsc --noEmit`: zero errors
- `npm run build`: success
- `npm test`: 222/222 pass
- Acceptance greps: 打开确认队列 / 暂无事件 / 取消生成 / startTabRun / TabRunPanel / 此功能需要桌面引擎 / priority:'batch' all present; no `generateRequirementAI` call; no hex/gray/white classes in TabRunPanel
- Desktop manual path deferred to 26-04 final checkpoint (per plan)

## Known Stubs

None. The PRD read-back is a real projection of the committed deliverable slot; sub-tab content beyond PRD (stories/use cases/etc.) still renders legacy fabricated shapes when a PRD exists — that data's mock removal is 26-04 scope, and the empty state covers the no-data path.

## Self-Check: PASSED

- src/components/rnd/TabRunPanel.tsx: FOUND
- Commits 5afda97, a408cf5: FOUND
