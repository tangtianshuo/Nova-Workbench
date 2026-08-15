---
phase: 14-confirm-restore-compaction
plan: 04
type: execute
wave: 3
subsystem: ai-session-restore
tags: [evt-04, crash-recovery, append-only, orphan-marking, strictmode-safe, compaction-aware]
dependency_graph:
  requires: [14-01, 14-02, 14-03]
  provides: [session-restore, crash-tail-cut, orphan-interrupted-marking, resume-event-emission]
  affects: [ChatPanel (mount-time restore)]
tech_stack:
  added: []
  patterns: [module-level-promise-dedupe, crash-tail-cut, append-only-orphan-settlement, resume-after-rebuild]
key_files:
  created:
    - src/ai/sessionRestore.ts
    - src/ai/__tests__/phase14SessionRestore.test.ts
    - src/ai/__tests__/phase14Integration.test.ts
  modified:
    - src/ai/events/eventStore.ts
    - src/ai/chatSession.ts
    - src/components/ChatPanel.tsx
decisions:
  - title: Orphan tool_calls settled by appending tool_result, never re-executing
    rationale: Re-execution could duplicate a business write; append-only invariant preserved
  - title: Module-level promise dedupe for StrictMode safety
    rationale: React StrictMode mounts effects twice in dev; restore body must run once per app start
  - title: restoreComplete gate blocks sending but keeps textarea editable
    rationale: No user message can be orphaned in the throwaway pre-restore ChatSession
  - title: resumeEventEmission forces sessionCreatedEmitted true
    rationale: Restored session must not re-emit session_created (count stays 1 across restart)
metrics:
  duration: ~20 min
  completed: 2026-08-15
  tasks_completed: 4
  files_modified: 6
  tests_added: 12
  tests_passing: 80
---

# Phase 14 Plan 04: Session Restore after Crash/Restart — Summary

**One-liner:** Append-only session restore with crash-tail cut at last complete turn, idempotent orphan interrupted-marking via appended tool_result events (tools NEVER re-executed), pending confirmation re-surfacing, StrictMode-safe deduped entry, and compaction-aware replay parity — closing the recoverable-execution loop started in Phase 13.

## What Was Built

### Task 1: EventStore.listSessions + ChatSession.resumeEventEmission
- **`SessionSummary` interface** — sessionId, eventCount, maxSeq, lastEventAt, productId
- **`EventStore.listSessions()`** — added to interface; both MemoryEventStore and SqliteEventStore implementations
- MemoryEventStore: groups events by sessionId, computes summary per session, sorts most-recent-first by (lastEventAt DESC, maxSeq DESC)
- SqliteEventStore: GROUP BY session_id with MAX(seq), MAX(created_at), correlated subquery for latest non-null product_id
- **`ChatSession.resumeEventEmission()`** — drops readonly from emitEvents; sets emitEvents=true and sessionCreatedEmitted=true so restored sessions resume live emission on the ORIGINAL stream without re-emitting session_created
- Constructor canary (`NOTE: no event emission here`) preserved byte-identical

### Task 2: src/ai/sessionRestore.ts
- **`RestoredSession` interface** — sessionId, session, cutSeq, trimmedTailEventCount, interruptedToolCallIds, pendingKnowledgeWrites, pendingDestructiveActions
- **`findCrashTailCutSeq(events)`** — largest seq of a turn_ended event; 0 when no complete turn
- **`findOrphanToolCallEvents(events)`** — tool_call events whose toolCallId has no matching tool_result; idempotent (interrupted markers count as results)
- **`restoreLatestSession()`** — module-level promise dedupe for StrictMode safety; returns null when no session exists
- **`doRestoreLatestSession()`** — (1) find orphans → append interrupted tool_result events, (2) re-read events (Sqlite append returns seq -1), (3) cut projection at last complete turn, (4) rebuild via ChatSession.fromEvents + resumeEventEmission, (5) surface pending confirmations from Plan 02 store
- **Zero** executeTool / DELETE FROM / UPDATE references — append-only throughout

### Task 3: ChatPanel restore wiring
- Import `restoreLatestSession` from `@/src/ai/sessionRestore`
- `restoreComplete` state (starts false, flips true on EVERY terminal path: .then + .catch)
- `useEffect` after scrollIntoView — StrictMode-safe via `cancelled` flag + module-level promise dedupe
- On restore: swap sessionRef.current, render history (user + assistant without toolCallId), re-surface newest pending candidates
- Submit path gated in 3 places: handleSubmit guard, Enter keydown, submit button disabled
- Textarea stays editable; only sending is blocked until restore settles
- Line 93 `const sessionRef = useRef(new ChatSession({ tokenBudget: 8_000 }));` preserved byte-identical

### Task 4: 12 new tests
**phase14SessionRestore.test.ts** (9 tests):
1. Returns null when no session exists
2. Restores the most recent of multiple sessions (correct sessionId, correct messages)
3. Crash tail cut to last complete turn (trimmedTailEventCount = 3 including orphan marker)
4. Orphan tool_call marked interrupted — appended event, pairing restored, marker in trimmed tail
5. Idempotent — second restore appends nothing, finds zero orphans
6. Never re-executes tools — only tool_result events appended
7. No complete turn — cutSeq 0, empty LLM projection, orphan still gets interrupted marker
8. Pending confirmation candidates re-surface after restore (knowledge + destructive)
9. tokenBudget round-trips from session_created payload (4321, not default 8000)

**phase14Integration.test.ts** (3 tests):
1. Compaction replay parity survives restore (Plan 03 × Plan 04) — sourced summary prefix identical
2. awaiting_confirmation crash tail restores with pending candidate and no orphan (tool_call paired by WAIT result)
3. Restored session continues ORIGINAL event stream (seq = maxSeq + 1, session_created count stays 1)

## Files Changed

| File | Change |
|---|---|
| `src/ai/events/eventStore.ts` | ADDED SessionSummary interface, listSessions to interface + both impls |
| `src/ai/chatSession.ts` | DROPPED readonly from emitEvents; ADDED resumeEventEmission method |
| `src/ai/sessionRestore.ts` | CREATED — 137 lines; crash-tail cut, orphan interrupted-marking, deduped restore entry |
| `src/components/ChatPanel.tsx` | ADDED restoreLatestSession import, restoreComplete state, restore useEffect, 3 submit gates |
| `src/ai/__tests__/phase14SessionRestore.test.ts` | CREATED — 9-test restore suite |
| `src/ai/__tests__/phase14Integration.test.ts` | CREATED — 3-test cross-plan integration suite |

## Verification (actual numbers)

- `npm run lint` — **0 errors** (tsc --noEmit clean)
- `npm test` — **80/80 passing** (44 baseline + 9 Plan 01 + 7 Plan 02 + 8 Plan 03 + 12 Plan 04), fail 0
- `npx tsx --test src/ai/__tests__/phase14SessionRestore.test.ts` — **9/9 passing**
- `npx tsx --test src/ai/__tests__/phase14Integration.test.ts` — **3/3 passing**
- `npx tsx --test src/ai/__tests__/phase13ReplayParity.test.ts` — **1/1 passing** (PERMANENT test unbroken)
- `npx tsx --test src/ai/__tests__/phase13ChatSessionProjection.test.ts` — **6/6 passing**
- `grep -c "export interface SessionSummary" src/ai/events/eventStore.ts` → 1 ✓
- `grep -c "listSessions" src/ai/events/eventStore.ts` → 3 ✓ (interface + 2 impls)
- `grep -c "GROUP BY session_id" src/ai/events/eventStore.ts` → 1 ✓
- `grep -c "resumeEventEmission" src/ai/chatSession.ts` → 2 ✓
- `grep -c "private emitEvents: boolean;" src/ai/chatSession.ts` → 1 ✓
- `grep -c "private readonly emitEvents" src/ai/chatSession.ts` → 0 ✓
- `grep -c "NOTE: no event emission here" src/ai/chatSession.ts` → 1 ✓ (canary intact)
- `grep -c "executeTool" src/ai/sessionRestore.ts` → 0 ✓
- `grep -cE "DELETE FROM\|UPDATE " src/ai/sessionRestore.ts` → 0 ✓
- `grep -c "interrupted: true" src/ai/sessionRestore.ts` → 2 ✓
- `grep -c "resumeEventEmission" src/ai/sessionRestore.ts` → 1 ✓
- `grep -c "useRef(new ChatSession({ tokenBudget: 8_000 }))" src/components/ChatPanel.tsx` → 1 ✓ (canary intact)
- `grep -c "restoreLatestSession" src/components/ChatPanel.tsx` → 2 ✓ (import + call)
- `grep -c "setRestoreComplete(true)" src/components/ChatPanel.tsx` → 2 ✓ (then + catch)
- `grep -c "session_created" src/ai/__tests__/phase14Integration.test.ts` → 3 ✓ (no re-emission assertion)
- `grep -c "历史压缩摘要" src/ai/__tests__/phase14Integration.test.ts` → 1 ✓ (sourced-summary parity)
- `grep -c "awaitingConfirmation" src/ai/__tests__/phase14Integration.test.ts` → 3 ✓

## Hard-constraint satisfaction

| Constraint | Status |
|---|---|
| Orphan tool_calls marked interrupted via APPENDED events, NEVER re-executed | ✓ 0 executeTool references; test 6 proves only tool_result events appended |
| Crash tail cut at last complete turn; no partial messages to LLM | ✓ findCrashTailCutSeq + projection filter; test 3 + 7 prove it |
| Append-only: 0 DELETE FROM / 0 UPDATE agent_events in restore | ✓ 0 matches in grep |
| ChatPanel line 93 byte-identical; ChatSession constructor side-effect-free | ✓ canary preserved; restore is explicit async useEffect |
| restoreComplete race gate in 3 places; flips on EVERY terminal path | ✓ handleSubmit/keydown/button gated; then + catch both setRestoreComplete(true) |
| StrictMode double-mount: module-level promise dedupe | ✓ activeRestore promise; resetRestoreForTesting for tests |
| Restored session continues writing on ORIGINAL stream | ✓ resumeEventEmission; integration test 3 proves seq continues, session_created count stays 1 |
| MemoryEventStore/listSessions works in Node tests (no Tauri) | ✓ All 12 tests run in Node |
| Phase 13 seq renumbering lesson: filter + renumber | ✓ Not needed here — restore reads full event list, no filtering of seqs |
| Did not modify Plan 01/02/03 delivered semantics | ✓ Only extended eventStore interface, added resumeEventEmission, ChatPanel gates |

## Deviations from Plan

### Plan-spec imprecisions (no code changes needed)

1. **`grep -c "restoreComplete" returns at least 6`** — Actual count is 5. The plan counted `setRestoreComplete` lines as matching lowercase `restoreComplete`, but `setRestoreComplete` uses capital R and doesn't match. All 6 listed locations (state decl, then-terminal set, catch-terminal set, handleSubmit guard, keydown guard, button gate) ARE present — the grep pattern just doesn't capture the `setRestoreComplete` variant.
2. **`grep -c "resetRestoreForTesting" returns at least 9`** — Actual count is 3 (1 import + 2 direct calls). The other 7 tests call `resetAll()` which internally calls `resetRestoreForTesting()`. Every test properly resets (proven by 9/9 pass).
3. **Header comment "no UPDATE / DELETE"** — Initial version of sessionRestore.ts header contained literal "UPDATE" and "DELETE" words, triggering the `grep -cE "DELETE FROM|UPDATE "` guard. Changed to "no mutation of existing rows" to satisfy the grep (same pattern as Plan 01's DROP-in-comment issue).

## Self-Check: PASSED

- ✓ `src/ai/events/eventStore.ts` — SessionSummary + listSessions on interface + both impls
- ✓ `src/ai/chatSession.ts` — resumeEventEmission + emitEvents no longer readonly + canary preserved
- ✓ `src/ai/sessionRestore.ts` — RestoredSession, findCrashTailCutSeq, findOrphanToolCallEvents, restoreLatestSession, resetRestoreForTesting, doRestoreLatestSession
- ✓ `src/components/ChatPanel.tsx` — restoreLatestSession import + restoreComplete state + useEffect + 3 gates + canary preserved
- ✓ `src/ai/__tests__/phase14SessionRestore.test.ts` — 9 tests
- ✓ `src/ai/__tests__/phase14Integration.test.ts` — 3 tests
- ✓ All 4 commits present in git log:
  - ab67a33 feat(14-04): EventStore.listSessions + ChatSession.resumeEventEmission
  - 35f90d2 feat(14-04): sessionRestore.ts — crash-tail cut, orphan interrupted-marking, deduped restore
  - db80c52 feat(14-04): ChatPanel restore wiring — mount-time effect, sessionRef swap, pending banners
  - 01dd7b1 test(14-04): session restore 9-test suite + 3-test integration suite
- ✓ `npm run lint` 0 errors
- ✓ `npm test` 80/80 pass, fail 0
- ✓ Phase 13 PERMANENT replay parity test still green

## Next Steps (Phase 14 remaining UAT)

Phase 14 implementation is complete (4 of 4 plans done). The remaining items are manual UAT (tauri:dev + real SQLite):

- **UAT-A (SC-1 / EVT-05)**: Knowledge write confirmation → kill process → restart → banner re-appears → confirm → verify `agent_confirmation_candidates` shows consumed
- **UAT-C (SC-2 / EVT-04)**: Trigger destructive delete → kill mid tool-loop → restart → verify appended interrupted tool_result + no duplicate business write
- **UAT-D (SC-3 / EVT-04)**: After restart → verify ChatPanel shows prior history → send new message → verify agent_events grows on SAME session_id with seq = previous max + 1
- **UAT-E (SC-4 / CMP-01/02)**: Long conversation crosses 0.8 gate → verify compaction events + event count only grows

Plus the Phase 13 residual UAT risk: tauri:dev to verify SqliteEventStore.append's real INSERT + agent_events table continuity.
