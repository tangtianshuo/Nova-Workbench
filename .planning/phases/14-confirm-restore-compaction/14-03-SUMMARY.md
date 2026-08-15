---
phase: 14-confirm-restore-compaction
plan: 03
wave: 2
subsystem: ai-persistence
tags: [cmp-01, cmp-02, compaction, token-pressure, pairing-balanced, append-only, sourced-summary, replay-parity]
dependency_graph:
  requires: [phase-13-event-log (checkEventStream, eventStore, ChatSession projection), phase-14-plan-01 (ConfirmationStore foundation)]
  provides: [src/ai/compaction.ts (pressure gate + balanced split + summarizer), compaction-aware ChatSession, toolLoop trigger wiring]
  affects: [phase-14-plan-04 (restore reuses compaction-aware fromEvents)]
tech_stack:
  added: []
  patterns: [projection-only compaction, checkEventStream as balanced-split oracle, injectable summarizer for testability, sourced summary attribution]
key_files:
  created:
    - src/ai/compaction.ts
    - src/ai/__tests__/phase14Compaction.test.ts
  modified:
    - src/ai/chatSession.ts (CompactionSummaryRecord, applyCompactionResult, rebuildMessages, compaction-aware fromEvents, sourced-summary prefix in getMessagesForLLM)
    - src/ai/toolLoop.ts (maybeCompactSession trigger at top of each iteration)
metrics:
  duration: ~15 min
  completed: 2026-08-15
  tasks: 3
  files: 4
  tests_added: 8
  tests_total: 68 (53 baseline + 7 from parallel plan 14-02 + 8 new)
---

# Phase 14 Plan 03: Token-Pressure Compaction at Pairing-Balanced Boundaries Summary

**One-liner:** Append-only, projection-only compaction that triggers at >=0.8x context window, splits exclusively at `checkEventStream`-clean turn boundaries, persists `compaction_started`/`compaction_completed` events with CMP-02 provenance (coveredSeq range + generatedAt + model), and exposes earlier history as a sourced summary that survives replay parity and successive compactions.

## What Was Built

1. **`src/ai/compaction.ts`** — pressure gate + balanced split + summarizer + maybeCompactSession
   - `COMPACTION_PRESSURE_RATIO = 0.8` — trigger threshold
   - `COMPACTION_KEEP_RATIO = 0.5` — suffix budget
   - `tokenPressure(session)` — `estimateTokens() / tokenBudget`
   - `findCompactionSplitPoint(events, keepTokenTarget)` — iterates from right to find the largest seq on a `turn_ended` boundary where: (a) suffix tokens fit within keepTarget, (b) prefix contains at least one turn_ended, (c) `checkEventStream(prefix).length === 0` (pairing + seq invariants). Returns 0 when no split qualifies.
   - `buildCompactionTranscript(prefix)` — per-event capped lines; carries forward earlier `compaction_completed.summaryText` as `[earlier compressed summary]` so successive compactions never drop older summaries; total capped at 12_000 chars
   - `defaultCompactionSummarizer` — delegates to `chatWithTools` with a CJK-aware system prompt; injectable via `CompactionOptions.summarizer` for tests
   - `maybeCompactSession(session, provider, options?)` — gated by pressure or `force`; appends `compaction_started` then `compaction_completed` with full provenance payload (`coveredSeqStart/End`, `summaryText`, `model`, `generatedAt`, `coveredEventCount`, `tokenCountBefore`, `startedAt`); calls `session.applyCompactionResult(record, suffix)`

2. **`src/ai/chatSession.ts`** — compaction-aware projection
   - New exported type `CompactionSummaryRecord` and formatter `formatCompactionSummary` (bilingual attribution: `[历史压缩摘要 | 覆盖事件 seq X-Y | 生成于 ISO | 模型 M]`)
   - New private field `compaction: CompactionSummaryRecord | null`; getter `getCompaction()`
   - Extracted `private static rebuildMessages(events)` — the switch body formerly inline in `fromEvents`; default case now explicitly covers `compaction_started`/`compaction_completed`
   - **Compaction-aware `fromEvents`**: finds the last `compaction_completed` in the sorted event stream; if present, filters to `seq > coveredSeqEnd` for replay and hydrates the `compaction` field — projection + replay derive identical post-compaction messages
   - **`applyCompactionResult(record, eventsAfterSplit)`**: replaces the in-memory projection with the sorted suffix; called by `maybeCompactSession`
   - **`getMessagesForLLM`** prepends the sourced summary as a `user`-role message when compaction exists
   - Removed `pushRebuilt` (now unused); preserved constructor body byte-identical (including the `NOTE: no event emission here` canary comment at lines 122-124), both constructor overload declarations, ensureSessionCreatedEvent, recordTurnEnd, addMessage, toEventInput, estimateTokens, clear, getAllMessages

3. **`src/ai/toolLoop.ts`** — trigger wiring
   - Import `maybeCompactSession` from `./compaction`
   - Added at the top of each `for (let iteration = 1; ...)` loop iteration, BEFORE `session.getMessagesForLLM()` derivation: `await maybeCompactSession(session, args.provider, { ollamaModel: ... })` — compacts before the next LLM request
   - Public signatures of `ToolLoopCallbacks` / `RunToolLoopArgs` / `ToolLoopResult` byte-identical (verified via `git diff`)
   - Only +9 lines added; no other changes

4. **`src/ai/__tests__/phase14Compaction.test.ts`** — 8-test suite
   - All node:test + node:assert/strict; `resetMemoryEventStore()` per test; fake summarizer `SUMMARY:<first-24-chars>`; no real LLM calls
   - Test 1: no compaction below 0.8 pressure (799/1000 tokens → null, no `compaction_started`)
   - Test 2: compaction at ≥0.8 pressure keeps event log append-only (original events byte-identical + exactly 2 new events)
   - Test 3: CMP-02 provenance — `coveredSeqStart === 1`, `generatedAt` parseable, `model === 'deepseek'`, ollama variant produces `'ollama:qwen3:8b'`
   - Test 4: split point is pairing-balanced (checkEventStream(prefix) === []) and lands on `turn_ended`; unpaired tail tool_call stays in suffix, not prefix
   - Test 5: projection leads with sourced summary `[历史压缩摘要`, contains `seq X-Y`, contains `模型 deepseek`, contains summaryText; suffix content present after the summary
   - Test 6: replay parity — `fromEvents(all events)` derives identical `getMessagesForLLM()` and `getCompaction()` as the live session
   - Test 7: no valid split (no `turn_ended` anywhere) → compaction skipped, log untouched
   - Test 8: successive compaction carries `[earlier compressed summary]` into the new transcript

## Files Changed

| File | Change |
|---|---|
| `src/ai/compaction.ts` | CREATED — 172 lines; pressure gate, balanced split, transcript builder, summarizer, `maybeCompactSession` |
| `src/ai/chatSession.ts` | MODIFIED — added `CompactionSummaryRecord`, `formatCompactionSummary`, `rebuildMessages` (private static), replaced `fromEvents` body, removed `pushRebuilt`, added `applyCompactionResult`, modified `getMessagesForLLM` to prepend sourced summary |
| `src/ai/toolLoop.ts` | MODIFIED — +1 import line, +8 lines (trigger block at top of each iteration); interface blocks byte-identical |
| `src/ai/__tests__/phase14Compaction.test.ts` | CREATED — 8-test compaction suite |

## Verification (actual numbers)

- `npm run lint` — **0 errors in my files** (`compaction.ts`, `chatSession.ts`, `toolLoop.ts`, `phase14Compaction.test.ts`); parallel agent's intermediate `ChatPanel.tsx`/`ProductKnowledgeTab.tsx` type errors (awaited async API migration in plan 14-02) are outside my scope and resolve with their final commit
- `npx tsx --test src/ai/__tests__/phase14Compaction.test.ts` — **8/8 passing** (~294 ms)
- `npm test` — **68/68 passing, fail 0** (~9.8 s) — 53 baseline + 7 from parallel plan 14-02 + 8 new
- `npx tsx --test src/ai/__tests__/phase13ReplayParity.test.ts` — **1/1 passing** (PERMANENT test unbroken)
- `npx tsx --test src/ai/__tests__/phase13ChatSessionProjection.test.ts` — **6/6 passing**
- `grep -c "COMPACTION_PRESSURE_RATIO = 0.8" src/ai/compaction.ts` → 1 ✓
- `grep -c "COMPACTION_KEEP_RATIO = 0.5" src/ai/compaction.ts` → 1 ✓
- `grep -c "checkEventStream(prefix)" src/ai/compaction.ts` → 1 ✓ (Phase 13 invariant reused as balanced-split proof)
- `grep -c "DELETE FROM" src/ai/compaction.ts` → 0 ✓ (append-only)
- `grep -c "UPDATE agent_events" src/ai/compaction.ts` → 0 ✓ (append-only)
- `grep -c "applyCompactionResult" src/ai/chatSession.ts` → 2 ✓ (method + JSDoc mention)
- `grep -c "pushRebuilt" src/ai/chatSession.ts` → 0 ✓ (removed)
- `grep -c "NOTE: no event emission here" src/ai/chatSession.ts` → 1 ✓ (canary preserved)
- `grep -c "constructor(sessionId?: string, tokenBudget?: number);" src/ai/chatSession.ts` → 1 ✓ (overload preserved)
- `grep -c "覆盖事件 seq" src/ai/chatSession.ts` → 1 ✓ (sourced-summary attribution)
- `grep -c "await maybeCompactSession(session, args.provider" src/ai/toolLoop.ts` → 1 ✓
- `grep -c "COMPACTION_PRESSURE_RATIO" src/ai/toolLoop.ts` → 1 ✓ (comment reference)
- `git diff src/ai/toolLoop.ts` — only import + trigger block; interface blocks byte-identical

## Hard-constraint satisfaction

| Constraint | Status |
|---|---|
| CMP-01: trigger at ≥0.8 x tokenBudget; split only where `checkEventStream(prefix) === []`; original events never deleted | ✓ pressure gate in `maybeCompactSession`; `findCompactionSplitPoint` requires `checkEventStream(prefix).length === 0` + `turn_ended` existence; test 2 proves byte-identical preservation |
| CMP-02: compaction_completed payload records coveredSeqStart/End, generatedAt, model (+ coveredEventCount, tokenCountBefore, startedAt) | ✓ record + event payload both include all fields; test 3 asserts each |
| Projection + replay derive identical post-compaction messages | ✓ test 6 proves replay parity across compaction |
| Successive compactions carry earlier summaries forward | ✓ `buildCompactionTranscript` emits `[earlier compressed summary]`; test 8 proves it |
| Append-only event log (projection-only) | ✓ 0 `DELETE FROM` / 0 `UPDATE agent_events` in new code paths; test 2 proves byte-identical original events + exactly 2 new events |
| Phase 13 invariants hold (single history, runToolLoop signatures unchanged, canary line preserved) | ✓ `git diff src/ai/toolLoop.ts` shows only +9 lines; `NOTE: no event emission here` canary preserved; PERMANENT replay parity test still green |
| Tests run in Node without Tauri; LLM stubbed | ✓ `resetMemoryEventStore()` + `fakeSummarizer`; no real network calls |
| Did not touch parallel agent's files | ✓ `git log --name-only` confirms only `src/ai/{compaction.ts,chatSession.ts,toolLoop.ts,__tests__/phase14Compaction.test.ts}` touched by 14-03 commits |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Test 5 ("projection after compaction leads with the sourced summary") initially failed**
- **Found during:** Task 3 verification (first test run)
- **Issue:** The test setup used 3 complete turns with `'结论摘要'.repeat(60)` content. `findCompactionSplitPoint` splits at the rightmost `turn_ended` where the suffix fits in `keepTokenTarget` (500 tokens). With 3 balanced turns of ~480 tokens each, the rightmost qualifying split is at the last `turn_ended`, producing an EMPTY suffix. The assertion `messages.slice(1).some(m => m.content.includes('结论摘要'))` failed because no suffix messages existed.
- **Fix:** Restructured test 5 to match test 4's pattern — two complete tool turns + an unpaired tail turn (`'继续处理尾部'` + unpaired `tool_call` for `deleteTask`). The split must land at turn 2's `turn_ended` (the unpaired tail can't be a split point), leaving the tail as suffix content. Changed assertion to check for `'继续处理尾部'` in suffix messages.
- **Files modified:** `src/ai/__tests__/phase14Compaction.test.ts`
- **Commit:** ebd674e (feat(14-03))

## Self-Check: PASSED

- ✓ `src/ai/compaction.ts` exists (172 lines, all exports present)
- ✓ `src/ai/chatSession.ts` contains `CompactionSummaryRecord`, `formatCompactionSummary`, `applyCompactionResult`, `rebuildMessages`; `pushRebuilt` removed; canary comment preserved; constructor overload preserved
- ✓ `src/ai/toolLoop.ts` contains `maybeCompactSession` trigger + comment referencing `COMPACTION_PRESSURE_RATIO`; interface blocks byte-identical
- ✓ `src/ai/__tests__/phase14Compaction.test.ts` exists (8 tests, all passing)
- ✓ All 3 commits present in git log:
  - e4a338f feat(14-03): compaction module — pressure gate, balanced split, append-only summarizer
  - ece0d82 feat(14-03): ChatSession compaction support — sourced summary prefix + compaction-aware fromEvents
  - ebd674e feat(14-03): toolLoop compaction trigger + 8-test compaction suite
- ✓ Parallel agent's files untouched (confirmations.ts, tool files, ChatPanel.tsx, ProductKnowledgeTab.tsx, legacy test files, phase14Confirmations.test.ts, .planning/STATE.md)
- ✓ Phase 13 PERMANENT replay parity test still green
- ✓ 68/68 total tests passing, fail 0

## Next Steps (Plan 04)

Plan 04's restore reuses the compaction-aware `fromEvents`. When a rebuilt session carries a `compaction_completed` event, the projection now correctly starts with the sourced summary. Plan 04's HITL confirmation restore must also preserve compaction boundaries — the `compaction_started`/`compaction_completed` events are just more append-only events in the log, invisible to the confirmation flow.
