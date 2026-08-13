---
phase: 11-ai-file-knowledge
plan: 260813-sdp
type: execute
quick_id: 260813-sdp
wave: 1
depends_on: []
files_modified:
  - src/ai/toolLoop.ts
autonomous: true
requirements:
  - UAT-11-Test5
user_setup: []

must_haves:
  truths:
    - "When writeKnowledgeArticle first call throws ConfirmationRequiredError, ChatPanel's tool trace shows ok (green ✓ 已完成), not error (red ⚠️ 失败)"
    - "Confirmation card (待确认的知识库写入) still appears after the throw"
    - "ConfirmationRequiredError still bubbles to the existing if-branch and returns pendingConfirmation"
    - "Existing knowledgeWrite unit tests still pass"
  artifacts:
    - path: "src/ai/toolLoop.ts"
      provides: "Catch block detects ConfirmationRequiredError and skips error arg in onToolEnd"
      contains: "isConfirmation"
  key_links:
    - from: "src/ai/toolLoop.ts catch block"
      to: "src/components/ChatPanel.tsx onToolEnd callback"
      via: "error arg (falsy → 'ok' status, truthy → 'error' status)"
      pattern: "isConfirmation \\? undefined : errorMessage"
---

<objective>
Fix Phase 11 UAT Test 5 blocker: `writeKnowledgeArticle` shows red "失败" trace marker before the confirmation card, misleading users into thinking the tool failed. The system is functioning as designed — the throw is the expected "needs user confirmation" flow.

Purpose: Make the UI trace reflect reality. Two confirmation flows (destructive returns a value; knowledge write throws) currently diverge in trace status. This aligns them.
Output: ~5-line change in `src/ai/toolLoop.ts` catch block.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/11-ai-file-knowledge/11-UAT.md
@src/ai/toolLoop.ts
@src/ai/confirmations.ts
@src/components/ChatPanel.tsx
@src/ai/__tests__/knowledgeWrite.test.ts

<interfaces>
<!-- The catch block at toolLoop.ts:121-146. Fix targets lines 121-125. -->

```typescript
// Current (buggy):
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  args.callbacks?.onToolEnd?.(call.name, null, errorMessage);   // <-- always passes error
  session.addMessage('tool', stringifyResult({ ok: false, error: errorMessage }), toolCallId, call.name);
  if (error instanceof ConfirmationRequiredError) {              // <-- double instanceof
    ...
  }
  ...
}
```

```typescript
// ConfirmationRequiredError shape (src/ai/confirmations.ts:29-34):
export class ConfirmationRequiredError extends Error {
  constructor(public readonly candidate: KnowledgeWriteCandidate) {
    super('Explicit confirmation is required before writing knowledge.');
    this.name = 'ConfirmationRequiredError';
  }
}
```

```typescript
// ChatPanel consumer (src/components/ChatPanel.tsx:144-155):
// Treats ANY truthy `error` arg as 'error' status. Falsy → 'ok'.
onToolEnd: (name, _result, error) => {
  ...
  next[index] = { ...next[index], status: error ? 'error' : 'ok' };
  ...
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Skip error arg in onToolEnd when catch block has ConfirmationRequiredError</name>
  <files>src/ai/toolLoop.ts</files>
  <action>
Edit the catch block (currently lines 121-134). Three coordinated changes — extract once, reuse twice:

1. **Before the `errorMessage` line**, compute the confirmation flag:
   ```ts
   const isConfirmation = error instanceof ConfirmationRequiredError;
   ```
   (`ConfirmationRequiredError` is already imported on line 8.)

2. **In the `onToolEnd` call**, pass `undefined` instead of `errorMessage` when it's a confirmation flow, so ChatPanel's trace shows `ok`:
   ```ts
   args.callbacks?.onToolEnd?.(
     call.name,
     null,
     isConfirmation ? undefined : errorMessage,
   );
   ```
   `ponytail:` comment above this line naming the ceiling:
   ```ts
   // ponytail: ConfirmationRequiredError is the expected "needs confirmation" flow, not an
   // error. Passing errorMessage flips ChatPanel's trace to red. Skip the error arg so trace shows ok.
   ```

3. **On the existing `if (error instanceof ConfirmationRequiredError)` line** (currently line 125), replace the redundant `instanceof` check with the already-computed flag:
   ```ts
   if (isConfirmation) {
   ```

Leave everything else in the catch block unchanged — `session.addMessage` keeps recording the `{ ok: false, error: errorMessage }` payload (correct: the tool call genuinely did not complete, the LLM history should reflect that), the `onConfirmationRequired` callback still fires, and the early `return` with `pendingConfirmation` is untouched.

Do NOT modify:
- `src/ai/confirmations.ts` (error class definition)
- `src/ai/tools/knowledgeWrite.ts` (tool implementation)
- `src/components/ChatPanel.tsx` (UI consumer — fix is in the loop, not the consumer)
- Any test file

Net diff: ~5 lines (1 added var, 1 comment block, 1 ternary in onToolEnd, 1 instanceof → flag swap).
  </action>
  <verify>
    <automated>cd "D:\Projects\Nova\nova-pm-workspace" && node --test src/ai/__tests__/knowledgeWrite.test.ts && npm run lint</automated>
  </verify>
  <done>
    - All 6 tests in knowledgeWrite.test.ts pass (assertion behavior unchanged — the throw still happens, this fix only changes what the *loop* does with it).
    - `npm run lint` (tsc --noEmit) passes.
    - Catch block has exactly one `instanceof ConfirmationRequiredError` check (reused via `isConfirmation`), not two.
    - `onToolEnd` call uses `isConfirmation ? undefined : errorMessage`.
  </done>
</task>

</tasks>

<verification>
- `node --test src/ai/__tests__/knowledgeWrite.test.ts` — all 6 existing tests pass (the throw contract is unchanged; only the loop's reaction to it changes).
- `npm run lint` — tsc --noEmit clean.
- Manual UAT (left for Phase 11 re-test, NOT this quick task): open ChatPanel, ask AI to create a knowledge article → trace should show `writeKnowledgeArticle 已完成` (green ✓), then the 待确认 card appears, no red ⚠️.
</verification>

<success_criteria>
- Phase 11 UAT Test 5 root cause fixed at the source (the loop), not the symptom (the UI consumer).
- Net diff ≤ 8 lines, single file.
- Existing unit tests green; no new tests added (per constraints — UI trace verification is manual UAT).
- Ponytail comment documents the deliberate ceiling (LLM history still records the error payload; only the UI-facing callback is filtered).
</success_criteria>

<output>
After completion, create `.planning/quick/260813-sdp-phase-11-test-5-toolloop-ts-catch-confir/260813-sdp-SUMMARY.md` following the quick-task summary template. Then update `.planning/STATE.md` Quick Tasks Completed table with this entry.
</output>
