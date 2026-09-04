---
phase: 19-session
plan: "03"
subsystem: agent-console
tags: [session, confirmations, memory, hitl]
requires: ["19-01", "19-02", "18 sessionId stamping"]
provides: ["session-scoped pending cards (SESS-05)"]
affects: [src/ai/confirmations.ts, src/ai/memoryStore.ts, src/stores/chatConsoleStore.ts]
tech-stack:
  added: []
  patterns: ["optional-arg backward-compat filter (no-arg = all)"]
key-files:
  created: []
  modified:
    - src/ai/confirmations.ts
    - src/ai/memoryStore.ts
    - src/stores/chatConsoleStore.ts
    - src/ai/__tests__/phase14Confirmations.test.ts
    - src/stores/__tests__/phase19Runtime.test.ts
decisions:
  - "JS filter after listActive (pending sets are small, capped) — no SQL change"
  - "Restore path filters restored arrays in chatConsoleStore, 19-01 sessionRestore.ts untouched"
metrics:
  duration: 12m
  completed: 2026-08-18
  tasks: 3
  files: 5
---

# Phase 19 Plan 03: Session-Scoped Pending Cards Summary

**One-liner:** All four HITL pending-card read paths (knowledge write, destructive action, memory, PRD draft) now filter by sessionId with no-arg backward compat; store refresh and restore paths pass activeSessionId — cards never bleed across sessions (SESS-05).

## What Was Built

- `src/ai/confirmations.ts`: `listPendingKnowledgeWrites / listPendingDestructiveActions / listPendingDeliverableDrafts` accept optional `sessionId` (JS filter after `listActive` — pending sets small). `KnowledgeWriteCandidate` and `DestructiveActionCandidate` now expose `sessionId: string | null` via `candidateFromRow` / `destructiveFromRow` / create-return paths.
- `src/ai/memoryStore.ts`: interface + both implementations (in-memory, SQLite) `listPending(sessionId?: string)`; `listRecentUserDirected` unchanged (informational, global).
- `src/stores/chatConsoleStore.ts`: `refreshMemoryCards`, `refreshPrdCard`, `confirmMemory`, `rejectMemory` all pass `get().activeSessionId`; `switchSession` filters restored `pendingKnowledgeWrites` / `pendingDestructiveActions` to `restored.sessionId` before taking the last element.

## Test Coverage

5 new tests (190 total, all green):
- Filtered `listPendingKnowledgeWrites(sessA)` isolation (Test 1)
- Same for destructive actions + deliverable drafts (Test 2)
- Candidate carries stamped sessionId (Test 3)
- Memory store `listPending(sessA)` isolation across both candidates (Test 4)
- Store-level: cross-session candidates leave `pendingMemory`/`pendingPrdDraft` null; same-session candidates surface (Test 5, in `phase19Runtime.test.ts`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] confirmMemory/rejectMemory also read unfiltered listPending**
- **Found during:** Task 3
- **Issue:** Plan called out refreshMemoryCards/refreshPrdCard, but the post-confirm/reject re-reads (chatConsoleStore.ts L451/L471) also set `pendingMemory` without a session filter — would resurface a cross-session card after any memory action.
- **Fix:** Pass `get().activeSessionId` there too.
- **Files:** src/stores/chatConsoleStore.ts
- **Commit:** 3412113

**2. [Rule 1 - Bug] test fixture knowledge_write params were minimal**
- **Found during:** Task 3 GREEN run
- **Issue:** `candidateFromRow → draftFromParams` requires full draft params (tags array etc.); initial fixture threw `p.tags is not iterable`.
- **Fix:** Full param shape in test fixtures.
- **Files:** src/ai/__tests__/phase14Confirmations.test.ts
- **Commit:** 3412113

## Known Stubs

None.

## Self-Check: PASSED

- Files: all 5 modified files exist.
- Commits: cec67aa, 3dff2fa, 1a6d35a, 3412113 all present.
