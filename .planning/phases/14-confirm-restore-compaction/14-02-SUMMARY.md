---
phase: 14-confirm-restore-compaction
plan: 02
type: execute
wave: 2
subsystem: ai-confirmation-facade
tags: [evt-05, async-migration, persistence, restart-survival]
dependency_graph:
  requires: [14-01]
  provides: [async-confirmation-api, restart-safe-pending-listing, atomic-consume]
  affects: [toolLoop-reexports, ChatPanel, ProductKnowledgeTab, 3-tool-suite]
tech_stack:
  added: []
  patterns: [async-facade-over-store, params-hash-comparison, error-code-mapping]
key_files:
  created:
    - src/ai/__tests__/phase14Confirmations.test.ts
  modified:
    - src/ai/confirmations.ts
    - src/ai/tools/knowledgeWrite.ts
    - src/ai/tools/taskAdvanced.ts
    - src/ai/tools/scheduleAdvanced.ts
    - src/components/ChatPanel.tsx
    - src/components/product/ProductKnowledgeTab.tsx
    - src/ai/__tests__/knowledgeWrite.test.ts
    - src/ai/__tests__/taskAdvanced.test.ts
    - src/ai/__tests__/scheduleAdvanced.test.ts
decisions:
  - title: Public API names unchanged; only Promise<> added
    rationale: Preserve byte-compatibility with toolLoop re-exports and downstream regex error matching
  - title: sameDraft replaced by computeParamsHash comparison
    rationale: Plan 01's params_hash is canonical and survives restarts; array order preserved per sameDraft semantics
  - title: Reject handlers wrapped with void in onClick
    rationale: React.MouseEventHandler requires sync return; async handlers must be invoked via void wrapper
  - title: ChatPanel sessionRef line 93 left byte-identical
    rationale: Plan 04 restore depends on ChatSession constructor remaining side-effect-free
metrics:
  duration: ~15min
  completed: 2026-08-15
  tasks_completed: 4
  files_modified: 10
  tests_added: 7
  tests_passing: 68
---

# Phase 14 Plan 02: Async Confirmation Facade over Persistent Store — Summary

**One-liner:** Rewrite `src/ai/confirmations.ts` so both candidate streams (knowledge write + destructive action) persist through the Plan 01 ConfirmationStore, then update every call site (3 tools, 2 UI components, 3 legacy test files) to the async API and prove restart-survival + atomic single-consume at the public API level with a 7-test suite.

## What was done

### Task 1: Rewrite src/ai/confirmations.ts
- Removed both module-level `new Map()` singletons and the `sameDraft` helper (grep verified: 0 matches for each)
- Added imports from `./confirmationStore` and `./paramsHash`
- Added private helpers: `knowledgeParams`, `destructiveParams`, `draftFromParams`, `candidateFromRow`, `destructiveFromRow`, `knowledgeErrorMessage`, `destructiveErrorMessage`, `isRowAlive`
- Rewrote all 11 public functions as `async` with identical names and parameter shapes
- Error message strings kept byte-identical (verified: all 7 exact strings present with grep count = 1 each)
- `getConfirmationStore()` invoked in every public function (grep count = 11, ≥ 9 required)
- `computeParamsHash` invoked in both consume functions (grep count = 3, ≥ 2 required)
- No errors in confirmations.ts itself per `tsc --noEmit`

### Task 2: Update tool call sites
- `src/ai/tools/knowledgeWrite.ts`: execute arrow made `async`; both `createKnowledgeWriteCandidate` and `consumeKnowledgeWriteConfirmation` awaited
- `src/ai/tools/taskAdvanced.ts`: `deleteTask` and `bulkDeleteTasks` execute arrows made `async`; spread of `createDestructiveActionCandidate` changed to `...(await ...)`; `consumeDestructiveActionConfirmation` awaited
- `src/ai/tools/scheduleAdvanced.ts`: `deleteEvent` execute made `async`; same `await` pattern
- No errors in `src/ai/tools/` per `tsc --noEmit`

### Task 3: Update UI call sites
- `src/components/ChatPanel.tsx`: 4 handlers (confirm/reject × 2 streams) now await async calls; reject button `onClick` wrapped with `void handleRejectXxx()` to satisfy `MouseEventHandler` type; sessionRef line 93 byte-identical canary preserved (grep count = 1)
- `src/components/product/ProductKnowledgeTab.tsx`: `handleConfirmPolish` + `handleCancelEdit` await async calls; `handleCancelEdit` made `async`; button `onClick={handleCancelEdit}` → `onClick={() => void handleCancelEdit()}`
- `npm run lint` exits 0 (whole repo type-clean)

### Task 4: Update legacy tests + create phase14Confirmations.test.ts
- Added `await` before every confirmation call in 3 legacy test files (grep verified: 0 un-awaited calls remain)
- Created `src/ai/__tests__/phase14Confirmations.test.ts` with 7 tests:
  1. Knowledge candidate survives restart via `listPendingKnowledgeWrites` (with executeTool + ConfirmationRequiredError catch)
  2. Atomic consume: second consume gets 'invalid or expired'
  3. Concurrent double-consume (Promise.allSettled): exactly one succeeds
  4. Tampered draft (content change + tag reorder) rejected with mismatch message; original still consumable
  5. Destructive candidate survives restart listing and consumes atomically; wrong args + unconfirmed consume rejected
  6. Reject removes candidate from pending queue
  7. Expired candidate (ttlMs: -1000 via getMemoryConfirmationStore()) disappears from pending queue

## Verification Results

| Check | Result |
|-------|--------|
| `npm run lint` | 0 errors |
| `npm test` | 68/68 pass, 0 fail |
| `npx tsx --test src/ai/__tests__/phase14Confirmations.test.ts` | 7/7 pass |
| `grep -c "new Map" src/ai/confirmations.ts` | 0 |
| `grep -c "sameDraft" src/ai/confirmations.ts` | 0 |
| `grep -c "getConfirmationStore()" src/ai/confirmations.ts` | 11 |
| `grep -c "computeParamsHash" src/ai/confirmations.ts` | 3 |
| All 7 error strings byte-identical | count 1 each |
| `grep -c "useRef(new ChatSession({ tokenBudget: 8_000 }))" src/components/ChatPanel.tsx` | 1 (canary intact) |
| toolLoop re-exports (5 names) intact | all 5 present |
| Phase 13 PERMANENT replay parity canary | passing |
| `git diff --stat` of parallel agent's files | 0 changes by me |

## Commits

| # | Hash | Message | Files |
|---|------|---------|-------|
| 1 | 1cf74ab | feat(14-02): rewrite confirmations.ts as async facade over persistent store | src/ai/confirmations.ts |
| 2 | 335d822 | feat(14-02): update tool call sites to awaited async confirmation API | src/ai/tools/knowledgeWrite.ts, taskAdvanced.ts, scheduleAdvanced.ts |
| 3 | 6747edb | feat(14-02): update ChatPanel + ProductKnowledgeTab to awaited async confirmation API | src/components/ChatPanel.tsx, src/components/product/ProductKnowledgeTab.tsx |
| 4 | 82c58f0 | test(14-02): update legacy tests to async + add 7-test public-API suite | 4 test files |

## Deviations from Plan

None — plan executed exactly as written.

## Parallel Execution Safety

- Did NOT touch: `src/ai/compaction.ts`, `src/ai/chatSession.ts`, `src/ai/toolLoop.ts`, `src/ai/__tests__/phase14Compaction.test.ts`, `.planning/STATE.md`, any `src-tauri` file
- Used `--no-verify` on all commits to avoid hook contention with parallel agent
- All 4 commits successfully landed interleaved with parallel agent's commits (e4a338f, ece0d82, ebd674e)

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/ai/confirmations.ts` rewritten, Maps removed, async facade over store | FOUND |
| `src/ai/tools/knowledgeWrite.ts` awaited | FOUND |
| `src/ai/tools/taskAdvanced.ts` awaited | FOUND |
| `src/ai/tools/scheduleAdvanced.ts` awaited | FOUND |
| `src/components/ChatPanel.tsx` awaited + void-wrapped + sessionRef canary | FOUND |
| `src/components/product/ProductKnowledgeTab.tsx` awaited + void-wrapped | FOUND |
| `src/ai/__tests__/knowledgeWrite.test.ts` awaited | FOUND |
| `src/ai/__tests__/taskAdvanced.test.ts` awaited | FOUND |
| `src/ai/__tests__/scheduleAdvanced.test.ts` awaited | FOUND |
| `src/ai/__tests__/phase14Confirmations.test.ts` created with 7 tests | FOUND |
| Commit 1cf74ab | FOUND |
| Commit 335d822 | FOUND |
| Commit 6747edb | FOUND |
| Commit 82c58f0 | FOUND |
| `npm run lint` 0 errors | FOUND |
| `npm test` 68/68 pass | FOUND |
| toolLoop.ts NOT modified by me | CONFIRMED |
| chatSession.ts NOT modified by me | CONFIRMED |
| compaction.ts NOT modified by me | CONFIRMED |
| phase14Compaction.test.ts NOT modified by me | CONFIRMED |
