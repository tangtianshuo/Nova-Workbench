// Phase 14 Plan 02 — public-API suite: restart survival, atomic consume, tamper detection,
// both streams. Runs in Node against the memory confirmation store (isTauri() === false).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKnowledgeWriteCandidate,
  getKnowledgeWriteCandidate,
  confirmKnowledgeWrite,
  consumeKnowledgeWriteConfirmation,
  rejectKnowledgeWrite,
  createDestructiveActionCandidate,
  confirmDestructiveAction,
  consumeDestructiveActionConfirmation,
  listPendingKnowledgeWrites,
  listPendingDestructiveActions,
  ConfirmationRequiredError,
  type KnowledgeWriteDraft,
} from '../confirmations';
import {
  getMemoryConfirmationStore,
  resetMemoryConfirmationStore,
} from '../confirmationStore';
import { executeTool } from '../registry';
import '../tools/knowledgeWrite';

const knowledgeDraftFixture = (overrides: Partial<KnowledgeWriteDraft> = {}): KnowledgeWriteDraft => ({
  productId: 'p1',
  itemId: undefined,
  operation: 'created',
  title: 'Atomic',
  category: '业务规则',
  tags: ['a', 'b'],
  content: 'c',
  summary: 's',
  author: 'AI 助手',
  readTime: '待阅读',
  ...overrides,
});

test('knowledge candidate survives a simulated restart via listPendingKnowledgeWrites', async () => {
  resetMemoryConfirmationStore();
  let candidate: KnowledgeWriteDraft | undefined;
  let token = '';
  try {
    await executeTool('writeKnowledgeArticle', {
      productId: 'p1',
      title: 'Restart survival',
      category: '业务规则',
      tags: ['重启'],
      content: '内容',
      summary: 's',
      author: 'a',
      readTime: 'r',
    });
    assert.fail('unconfirmed write must be rejected');
  } catch (error) {
    assert.ok(error instanceof ConfirmationRequiredError);
    const c = (error as ConfirmationRequiredError).candidate;
    token = c.confirmationToken;
    candidate = {
      productId: c.productId,
      operation: c.operation,
      title: c.title,
      category: c.category,
      tags: c.tags,
      content: c.content,
      summary: c.summary,
      author: c.author,
      readTime: c.readTime,
    };
  }
  assert.ok(token);
  assert.ok(candidate);

  const pending = await listPendingKnowledgeWrites();
  assert.ok(pending.some((c) => c.confirmationToken === token));
  const located = pending.find((c) => c.confirmationToken === token)!;
  assert.equal(located.productId, 'p1');
  assert.deepEqual(located.tags, ['重启']);
  assert.equal(located.category, '业务规则');

  await confirmKnowledgeWrite(token);
  const stillListed = await listPendingKnowledgeWrites();
  assert.ok(stillListed.some((c) => c.confirmationToken === token), 'confirmed-not-consumed still listed after restart');

  await rejectKnowledgeWrite(token);
});

test('atomic consume at the public API: second consume gets invalid or expired', async () => {
  resetMemoryConfirmationStore();
  const draft = knowledgeDraftFixture();
  const candidate = await createKnowledgeWriteCandidate(draft);
  await confirmKnowledgeWrite(candidate.confirmationToken);
  const first = await consumeKnowledgeWriteConfirmation(candidate.confirmationToken, draft);
  assert.equal(first.confirmationToken, candidate.confirmationToken);

  await assert.rejects(
    consumeKnowledgeWriteConfirmation(candidate.confirmationToken, draft),
    /invalid or expired/,
  );
});

test('concurrent double-consume succeeds exactly once', async () => {
  resetMemoryConfirmationStore();
  const draft = knowledgeDraftFixture({ title: 'Concurrent' });
  const candidate = await createKnowledgeWriteCandidate(draft);
  await confirmKnowledgeWrite(candidate.confirmationToken);

  const [a, b] = await Promise.allSettled([
    consumeKnowledgeWriteConfirmation(candidate.confirmationToken, draft),
    consumeKnowledgeWriteConfirmation(candidate.confirmationToken, draft),
  ]);

  const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
  const rejected = [a, b].filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one concurrent consume must succeed');
  assert.equal(rejected.length, 1, 'the other must be rejected');
  const reason = (rejected[0] as PromiseRejectedResult).reason as Error;
  assert.match(reason.message, /invalid or expired/);
});

test('tampered draft at consume is rejected with the mismatch message', async () => {
  resetMemoryConfirmationStore();
  const draft = knowledgeDraftFixture({ title: 'Tamper test' });
  const candidate = await createKnowledgeWriteCandidate(draft);
  await confirmKnowledgeWrite(candidate.confirmationToken);

  await assert.rejects(
    consumeKnowledgeWriteConfirmation(candidate.confirmationToken, { ...draft, content: 'tampered' }),
    /do not match the confirmed candidate/,
  );

  await assert.rejects(
    consumeKnowledgeWriteConfirmation(candidate.confirmationToken, { ...draft, tags: ['b', 'a'] }),
    /do not match the confirmed candidate/,
  );

  const original = await consumeKnowledgeWriteConfirmation(candidate.confirmationToken, draft);
  assert.equal(original.confirmationToken, candidate.confirmationToken);
});

test('destructive candidate survives restart listing and consumes atomically', async () => {
  resetMemoryConfirmationStore();
  const candidate = await createDestructiveActionCandidate('deleteTask', { taskId: 'task-x' }, '删除任务后将无法恢复。');
  const pending = await listPendingDestructiveActions();
  assert.ok(pending.some((c) => c.confirmationToken === candidate.confirmationToken));
  const listed = pending.find((c) => c.confirmationToken === candidate.confirmationToken)!;
  assert.equal(listed.toolName, 'deleteTask');
  assert.deepEqual(listed.args, { taskId: 'task-x' });
  assert.equal(listed.summary, '删除任务后将无法恢复。');

  await confirmDestructiveAction(candidate.confirmationToken);
  const consumed = await consumeDestructiveActionConfirmation(candidate.confirmationToken, 'deleteTask', { taskId: 'task-x' });
  assert.equal(consumed.confirmationToken, candidate.confirmationToken);

  // Fresh candidate with different args: consume with wrong args must reject with mismatch message.
  const fresh = await createDestructiveActionCandidate('deleteTask', { taskId: 'task-y' }, '删除任务后将无法恢复。');
  await confirmDestructiveAction(fresh.confirmationToken);
  await assert.rejects(
    consumeDestructiveActionConfirmation(fresh.confirmationToken, 'deleteTask', { taskId: 'task-z' }),
    /do not match the confirmed action/,
  );

  // Unconfirmed candidate: consume must reject with not-been-explicitly-confirmed.
  const unconfirmed = await createDestructiveActionCandidate('deleteTask', { taskId: 'task-w' }, '删除任务后将无法恢复。');
  await assert.rejects(
    consumeDestructiveActionConfirmation(unconfirmed.confirmationToken, 'deleteTask', { taskId: 'task-w' }),
    /not been explicitly confirmed/,
  );
});

test('reject removes a candidate from the pending queue', async () => {
  resetMemoryConfirmationStore();
  const candidate = await createKnowledgeWriteCandidate(knowledgeDraftFixture({ title: 'Reject test' }));
  const before = await listPendingKnowledgeWrites();
  assert.ok(before.some((c) => c.confirmationToken === candidate.confirmationToken));

  const rejected = await rejectKnowledgeWrite(candidate.confirmationToken);
  assert.equal(rejected, true);

  const after = await listPendingKnowledgeWrites();
  assert.equal(after.some((c) => c.confirmationToken === candidate.confirmationToken), false);

  await assert.rejects(
    confirmKnowledgeWrite(candidate.confirmationToken),
    /invalid or expired/,
  );
});

test('expired candidate disappears from the pending queue', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const expired = await store.create({
    kind: 'knowledge_write',
    params: {
      productId: 'p1',
      itemId: undefined,
      operation: 'created',
      title: 'Expired',
      category: '业务规则',
      tags: ['expired'],
      content: 'content',
      summary: 'summary',
      author: 'author',
      readTime: 'readTime',
    },
    summary: 'Expired',
    sessionId: null,
    ttlMs: -1000,
  });

  const pending = await listPendingKnowledgeWrites();
  assert.equal(pending.some((c) => c.confirmationToken === expired.confirmationToken), false);
});

console.log('OK: Phase 14 Plan 02 confirmation public API checks passed');
