---
phase: 31-doc-workspace
plan: 08
subsystem: knowledge-base / doc-workspace
tags: [gap-closure, uat, search, panel-width]
requires: [31-06, 31-07]
provides: [SC-2.3, SC-7.5]
affects: [src/views/KnowledgeBaseView.tsx, src/components/workspace/DocWorkspaceShell.tsx]
tech-stack:
  added: []
  patterns: [inline style maxWidth clamp]
key-files:
  created: []
  modified:
    - src/views/KnowledgeBaseView.tsx
    - src/components/workspace/DocWorkspaceShell.tsx
decisions:
  - maxWidth 60vw 纯 CSS clamp,不做 resize 监听/persist 回写(视觉 clamp 足够)
metrics:
  duration: 10m
  completed: 2026-09-04
---

# Phase 31 Plan 08: UAT Gap Closure (SC-2.3 / SC-7.5) Summary

Two single-line fixes: KB global search results now open the doc in the workspace panel, and the doc panel width is CSS-capped at 60vw (covers both small-window and stale persisted-width cases).

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Search hit row onClick appends `openDoc(hit.docId)` (keeps `selectSearchHit` for left-pane preview) | c928a67 |
| 2 | `aside` inline style gains `maxWidth: '60vw'` in non-zen mode | 84d151c |

## Verification

- `npm run lint` (tsc --noEmit) passed
- grep assertions: `openDoc(hit.docId)` at KnowledgeBaseView.tsx:336, `maxWidth` at DocWorkspaceShell.tsx:90
- Real-device retest (UAT test 3 / 8.5) left to user per plan

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
