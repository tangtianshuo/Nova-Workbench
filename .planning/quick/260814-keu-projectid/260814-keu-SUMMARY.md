---
phase: quick
plan: 260814-keu-projectid
subsystem: workspace-store
tags: [product-delete, cascade-cleanup, weak-link, workspaces]
requires: [CROSS-03 unlink pattern]
provides: [unlinkProjectWorkspaces action, workspace dangling projectId fix]
affects: [src/stores/workspaceStore.ts, src/store/AppContext.tsx]
key-files:
  modified:
    - src/stores/workspaceStore.ts
    - src/store/AppContext.tsx
decisions:
  - Single map-set unlink (not per-workspace updateWorkspace) to mirror taskStore unlinkProjectTasks
  - Workspace unlink is silent — not added to getDeleteProductImpact confirmation counts
duration: ~2 min
completed: 2026-08-14
---

# Quick Task 260814-keu: Product delete detaches workspaces

**One-liner:** Added `unlinkProjectWorkspaces` to workspaceStore and wired it into `doDeleteProduct` cascade so deleted products leave no dangling `projectId`/`projectName` on workspaces.

## What Changed

1. **src/stores/workspaceStore.ts** (+12 lines)
   - `WorkspaceState` interface: added `unlinkProjectWorkspaces: (projectId: string) => void`
   - Implementation after `deleteWorkspace`: single `set` with `map` clearing `projectId`/`projectName` on matching workspaces — same structure as `unlinkProjectTasks` (CROSS-03).

2. **src/store/AppContext.tsx** (+2 lines)
   - `doDeleteProduct`: inserted step 2.5 between schedule detach (step 2) and rnd cleanup (step 3):
     `useWorkspaceStore.getState().unlinkProjectWorkspaces(productId)`
   - `useWorkspaceStore` import already existed.

## Deviations from Plan

None - plan executed exactly as written. (Note: the PLAN.md was located in the main repo at `D:/Projects/Nova/nova-pm-workspace/.planning/quick/260814-keu-projectid/`; it was not present in this worktree. Summary created in the worktree path per executor constraints.)

## Verification

- `npm run lint` (tsc --noEmit): PASS, zero errors
- grep: `unlinkProjectWorkspaces` defined in workspaceStore.ts and called in AppContext.tsx doDeleteProduct
- Commit: 86ea6e5

## Known Stubs

None.
