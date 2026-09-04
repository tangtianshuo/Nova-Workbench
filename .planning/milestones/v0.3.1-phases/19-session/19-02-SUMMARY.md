---
phase: 19-session
plan: "02"
subsystem: ai-runtime
tags: [session, stores, guards]
requires: ["19-01"]
provides:
  - "chatConsoleStore activeSessionId + startNewSession + switchSession (streaming-guarded)"
  - "workspaceStore guarded session-ending setActiveWorkspaceId"
affects: [src/stores/chatConsoleStore.ts, src/stores/workspaceStore.ts]
tech-stack:
  added: []
  patterns: ["store-level guard returning { success, reason }"]
key-files:
  created:
    - src/stores/__tests__/phase19Runtime.test.ts
  modified:
    - src/stores/chatConsoleStore.ts
    - src/stores/workspaceStore.ts
decisions:
  - "App entry = fresh session; restore() no longer auto-restores latest (restoreSession no-arg stays as crash-recovery API)"
  - "Workspace switch = end current session + startNewSession (CONTEXT locked)"
  - "Store guard is the SESS-04 bottom line; UI disable consumed by Phase 21 surfaces"
metrics:
  duration: 10m
  completed: 2026-08-18
---

# Phase 19 Plan 02: Multi-Session Runtime Wiring Summary

Wired multi-session runtime into stores: activeSessionId state with fresh-session startup (SESS-02), switchSession restoring verbatim history via the 19-01 restoreSession engine (SESS-03), and dual store-level streaming guards on session switch and workspace switch (SESS-04).

## What Was Done

### Task 1: chatConsoleStore runtime (commit 39540ed)
- Added `activeSessionId: string` state (initial: module-level sessionRef id, not persisted).
- `startNewSession()`: streaming guard, replaces sessionRef with new ChatSession(8k), clears messages + pending cards, refreshes memory/PRD cards.
- `switchSession(sessionId)`: streaming guard, `restoreSession(sessionId)`, not_found on null, rebuilds messages with the exact restore() filter/map (verbatim), restores latest pending confirmations.
- `restore()` simplified to fresh-session startup (SESS-02): sets restoreComplete + refreshes pending cards; dropped restoreLatestSession import.

### Task 2: workspaceStore guard (commit 9683357)
- `setActiveWorkspaceId` now returns `{ success, reason? }`: same-id short-circuit, streaming guard via `useChatConsoleStore.getState().loading`, then `set({ activeWorkspaceId })` + `startNewSession()`.
- persist partialize untouched. Verified the workspaceStore → chatConsoleStore → ai/index → toolLoop → workspaceStore module cycle is safe (all usages inside function bodies, ESM live bindings).

### Task 3: tests (commit 19ca130)
- 6 tests in `src/stores/__tests__/phase19Runtime.test.ts`, all green; full suite 185/185.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npm run lint` exits 0.
- `npx tsx --test src/stores/__tests__/phase19Runtime.test.ts` — 6/6 pass.
- `npm test` — 185/185 pass.

## Self-Check: PASSED
