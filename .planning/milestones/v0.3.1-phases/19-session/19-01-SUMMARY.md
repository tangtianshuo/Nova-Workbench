---
phase: 19-session
plan: "01"
subsystem: ai-session-restore
tags: [session, restore, sess-03, event-sourcing]
requires:
  - "Phase 14 sessionRestore + eventStore (listSessions/listEvents)"
provides:
  - "restoreSession(sessionId?) — parameterized restore engine for Plan 19-02 switchSession"
affects:
  - src/ai/sessionRestore.ts
  - src/ai/__tests__/phase19SessionSwitch.test.ts
tech-stack:
  added: []
  patterns:
    - "per-session promise dedupe Map (key: sessionId | '__latest__')"
key-files:
  created:
    - src/ai/__tests__/phase19SessionSwitch.test.ts
  modified:
    - src/ai/sessionRestore.ts
decisions:
  - "Explicit-sessionId path treats events.length === 0 as not-found → null (store has no dedicated exists check; matches no-arg behavior)"
  - "restoreLatestSession kept as thin alias calling restoreSession() — chatConsoleStore.ts keeps compiling; 19-02 migrates callers"
metrics:
  duration: 8m
  completed: 2026-08-18
---

# Phase 19 Plan 01: Parameterized Session Restore Summary

**One-liner:** restoreSession(sessionId?) restores any session verbatim via direct listEvents(sessionId) query, removing the sessions[0] assumption (P-B) while keeping the no-arg crash-recovery path byte-identical, with per-session promise dedupe.

## What Was Built

### Task 1: restoreSession(sessionId?) — parameterized restore (a72264c)
- `src/ai/sessionRestore.ts`: renamed entry to `restoreSession(sessionId?: string)`; `restoreLatestSession()` remains as a compat alias calling `restoreSession()`.
- Extracted `doRestore(sessionId?)`. Explicit-id path queries `store.listEvents(sessionId)` directly — never `listSessions()`, never `sessions[0]`. No-arg path keeps `listSessions()[0]` (the only remaining use, documented "latest" semantic).
- Both paths share the same settlement pipeline: orphan tool_result append, crash tail cut, tokenBudget rebuild from session_created, `ChatSession.fromEvents`, `resumeEventEmission()`, pending confirmations.
- Dedupe: `const activeRestores = new Map<string, Promise<...>>()` keyed by `sessionId ?? '__latest__'`; `resetRestoreForTesting()` clears the Map.
- Verified: `npm run lint` clean; phase14SessionRestore 9/9 unchanged.

### Task 2: switch-restore tests (c465f72)
- `src/ai/__tests__/phase19SessionSwitch.test.ts` — 5 tests:
  1. Verbatim restore: 2 complete turns, per-message `{role, content}` deep equality between live and restored.
  2. Cross-session isolation: restoreSession('session-b') returns B's messages, no A bleed.
  3. Unknown sessionId → resolves null, no throw.
  4. Per-session dedupe: concurrent same-id calls share one promise; different ids independent; no duplicate settlement.
  5. Orphan settlement on explicit path: interrupted marker appended; second restore finds zero orphans.
- Full suite `npm test`: 179/179 pass.

## Deviations from Plan

None — plan executed exactly as written. (TDD RED stage executed post-implementation since Task 1 landed first per plan order; all tests pass against the new API.)

## Verification

- `npm run lint` exit 0
- `npx tsx --test src/ai/__tests__/phase14SessionRestore.test.ts` — 9/9 (no-arg behavior preserved)
- `npx tsx --test src/ai/__tests__/phase19SessionSwitch.test.ts` — 5/5
- `npm test` — 179/179

## Known Stubs

None.

## Self-Check: PASSED
