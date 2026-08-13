---
phase: quick
plan: 260813-sdp
subsystem: ai
tags: [ai, tool-loop, ux, uat-fix, phase-11]
dependency_graph:
  requires: []
  provides: [toolloop-confirmation-trace-ok]
  affects: [src/ai/toolLoop.ts]
tech_stack:
  added: []
  patterns: [error-class-discrimination-in-catch]
key_files:
  created: []
  modified:
    - src/ai/toolLoop.ts
decisions:
  - "Discriminate ConfirmationRequiredError in catch before calling onToolEnd; pass undefined as error arg so ChatPanel trace shows ok instead of error"
  - "Reuse single isConfirmation flag for both onToolEnd ternary and the if-branch (drop redundant instanceof)"
  - "Keep session.addMessage payload as { ok: false } — LLM history should still record that the tool call did not complete"
metrics:
  duration: ~5m
  completed: 2026-08-13
  tasks_completed: 1
  files_changed: 1
---

# Quick Task 260813-sdp: toolLoop ConfirmationRequiredError Trace Fix Summary

Phase 11 UAT Test 5 reported `writeKnowledgeArticle` as "失败" because ChatPanel's tool trace showed a red ⚠️ marker before the confirmation card appeared. The system was functioning as designed — the throw IS the "needs user confirmation" flow — but the UI misled users.

## What Changed

**`src/ai/toolLoop.ts`** (~5-line patch in catch block, lines 121-135):

1. Extracted `const isConfirmation = error instanceof ConfirmationRequiredError` at the top of the catch block.
2. Changed `args.callbacks?.onToolEnd?.(call.name, null, errorMessage)` → conditional error arg via ternary: `isConfirmation ? undefined : errorMessage`.
3. Replaced the redundant `if (error instanceof ConfirmationRequiredError)` check on the next line with `if (isConfirmation)` — single source of truth.
4. Added `ponytail:` comment naming the deliberate ceiling (LLM history keeps the `{ ok: false }` payload; only the UI-facing callback is filtered).

**What was NOT changed:**
- `src/ai/confirmations.ts` — error class definition untouched
- `src/ai/tools/knowledgeWrite.ts` — tool still throws as designed
- `src/components/ChatPanel.tsx` — UI consumer untouched (root cause was in the loop, not the consumer)
- Any test file

## Why This Fix

Two confirmation flows diverged in trace status:
- **Destructive actions** (`isDestructiveConfirmation`) return a value → trace shows `ok`
- **Knowledge writes** throw `ConfirmationRequiredError` → catch block unconditionally passed `errorMessage` to `onToolEnd` → ChatPanel flipped trace to `error`

The fix aligns the throw-path with the return-path: when the error is the expected "needs confirmation" signal, treat it as `ok` from the UI's perspective. The LLM-facing session history still records the call as incomplete, which is correct — the tool genuinely didn't produce a result, the user just needs to confirm first.

## Verification

- `npx tsx --test src/ai/__tests__/knowledgeWrite.test.ts` → **6/6 pass** (throw contract unchanged; only the loop's reaction to it changes)
- `npm run lint` (tsc --noEmit) → **clean**
- Catch block now has exactly one `instanceof ConfirmationRequiredError` check, reused via `isConfirmation`
- `onToolEnd` call uses `isConfirmation ? undefined : errorMessage`

Manual UAT (left for Phase 11 Test 5 re-test, not this quick task): open ChatPanel, ask AI to create a knowledge article → trace should show `writeKnowledgeArticle 已完成` (green ✓), then the 待确认 card appears, no red ⚠️.

## Ponytail Notes

- **Skipped:** new unit tests for the trace-flag logic. The throw behavior is already covered by existing tests; UI trace status is a manual-UAT concern.
- **Add when:** if the trace-status logic grows beyond a single ternary (e.g., distinct "pending" status for confirmation flows), introduce a test that asserts the callback contract.
