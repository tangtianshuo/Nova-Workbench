// Phase 15 Plan 02 Task 1 — proposeMemory tool: never interrupts the dialog
// (no ConfirmationRequiredError), model_inferred -> pending candidate with all
// anti-flood markers, user_directed -> auto-confirmed straight into memories
// (locked decision second half). MEM-01 / MEM-02.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeTool, ToolArgError } from '../registry';
import { getMemoryMemoryStore, resetMemoryMemoryStore } from '../memoryStore';
import '../index';

type ProposeToolResult = {
  ok: boolean;
  candidateQueued: boolean;
  origin: 'model_inferred' | 'user_directed';
  deduplicated: boolean;
  reason?: string;
  evictedOldest: boolean;
  autoConfirmed?: boolean;
  memoryRowid?: number;
};

async function callPropose(args: Record<string, unknown>): Promise<ProposeToolResult> {
  return (await executeTool('proposeMemory', args)) as ProposeToolResult;
}

test('model_inferred propose queues a pending candidate (candidateQueued: true)', async () => {
  resetMemoryMemoryStore();
  const result = await callPropose({ content: '用户偏好简洁回复', scope: 'global' });
  assert.equal(result.ok, true);
  assert.equal(result.candidateQueued, true);
  assert.equal(result.deduplicated, false);
  assert.equal(result.evictedOldest, false);
  assert.equal((await getMemoryMemoryStore().listPending()).length, 1);
});

test('same content proposed twice -> deduplicated: true, pending stays 1', async () => {
  resetMemoryMemoryStore();
  await callPropose({ content: '用户偏好简洁回复', scope: 'global' });
  const second = await callPropose({ content: '用户偏好简洁回复', scope: 'global' });
  assert.equal(second.deduplicated, true);
  assert.equal(second.candidateQueued, false);
  assert.equal((await getMemoryMemoryStore().listPending()).length, 1);
});

test('rejected content re-proposed -> deduplicated with reason previously_rejected (MEM-02)', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const first = await callPropose({ content: '用户喜欢周五开周会', scope: 'global' });
  const pending = await store.listPending();
  assert.equal(pending.length, 1);
  assert.equal(await store.reject(pending[0].candidateToken), true);
  void first;
  const again = await callPropose({ content: '用户喜欢周五开周会', scope: 'global' });
  assert.equal(again.deduplicated, true);
  assert.equal(again.reason, 'previously_rejected');
});

test('proposeMemory never throws ConfirmationRequiredError (dialog continues)', async () => {
  resetMemoryMemoryStore();
  // assert.doesNotThrow does not await async fns — await the call directly.
  const result = await callPropose({ content: '用户在上海工作', scope: 'global' });
  assert.equal(result.ok, true);
  assert.equal((result as Record<string, unknown>).pendingConfirmation, undefined);
});

test('content longer than 500 chars is rejected by zod (ToolArgError path)', async () => {
  resetMemoryMemoryStore();
  await assert.rejects(
    callPropose({ content: '长'.repeat(501), scope: 'global' }),
    (error: unknown) => error instanceof ToolArgError,
  );
});

test('userDirected=true -> autoConfirmed, saved directly, never enters pending (locked decision)', async () => {
  resetMemoryMemoryStore();
  const result = await callPropose({ content: '记住我用深色主题', userDirected: true });
  assert.equal(result.autoConfirmed, true);
  assert.equal(result.candidateQueued, false);
  assert.equal(typeof result.memoryRowid, 'number');
  const store = getMemoryMemoryStore();
  assert.equal((await store.listPending()).length, 0);
  const active = await store.listActiveMemories();
  assert.ok(active.some((memory) => memory.content === '记住我用深色主题'));
});

console.log('OK: Phase 15 Plan 02 proposeMemory tool passed');
