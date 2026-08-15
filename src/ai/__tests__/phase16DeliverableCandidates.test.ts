// Phase 16 Plan 01 Task 1 — deliverable_draft candidate lifecycle (DELIV-01/02
// backend half): create/dedup/confirm/consume/reject + kind discrimination
// against knowledge_write, and KnowledgeDoc sourceEventId round-trip (DELIV-03).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetMemoryConfirmationStore } from '../confirmationStore';
import {
  createDeliverableDraftCandidate,
  createKnowledgeWriteCandidate,
  confirmDeliverableDraft,
  consumeDeliverableDraftConfirmation,
  rejectDeliverableDraft,
  listPendingDeliverableDrafts,
  listRejectedDeliverableDrafts,
} from '../confirmations';
import { getMemoryKnowledgeRepo, resetMemoryKnowledgeRepo } from '../knowledgeRepo';

const PRD_INPUT = {
  productId: 'p1',
  code: 'prd' as const,
  title: '智能助手 PRD',
  draft: '# PRD\n正文',
  sessionId: 'sess-1',
  eventId: 'corr-1',
};

test('createDeliverableDraftCandidate → listPendingDeliverableDrafts()[0] carries all fields', async () => {
  resetMemoryConfirmationStore();
  const candidate = await createDeliverableDraftCandidate(PRD_INPUT);
  const pending = await listPendingDeliverableDrafts();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].confirmationToken, candidate.confirmationToken);
  assert.equal(pending[0].productId, 'p1');
  assert.equal(pending[0].code, 'prd');
  assert.equal(pending[0].title, '智能助手 PRD');
  assert.equal(pending[0].draft, '# PRD\n正文');
  assert.equal(pending[0].sessionId, 'sess-1');
  assert.equal(pending[0].eventId, 'corr-1');
  assert.ok(pending[0].createdAt);
});

test('confirm → consume succeeds; consuming the same token again throws (already_settled)', async () => {
  resetMemoryConfirmationStore();
  const candidate = await createDeliverableDraftCandidate(PRD_INPUT);
  await confirmDeliverableDraft(candidate.confirmationToken);
  const consumed = await consumeDeliverableDraftConfirmation(candidate);
  assert.equal(consumed.confirmationToken, candidate.confirmationToken);
  await assert.rejects(() => consumeDeliverableDraftConfirmation(candidate));
});

test('rejectDeliverableDraft removes from pending and lands in listRejectedDeliverableDrafts(5)', async () => {
  resetMemoryConfirmationStore();
  const candidate = await createDeliverableDraftCandidate(PRD_INPUT);
  assert.equal(await rejectDeliverableDraft(candidate.confirmationToken), true);
  assert.equal((await listPendingDeliverableDrafts()).length, 0);
  const rejected = await listRejectedDeliverableDrafts(5);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].confirmationToken, candidate.confirmationToken);
});

test('kind discrimination: knowledge_write candidates never appear in deliverable lists', async () => {
  resetMemoryConfirmationStore();
  await createKnowledgeWriteCandidate({
    productId: 'p1',
    operation: 'created',
    title: '架构文章',
    category: '架构设计',
    tags: ['x'],
    content: 'c',
    summary: 's',
    author: 'a',
    readTime: '1 分钟',
  });
  await createDeliverableDraftCandidate(PRD_INPUT);
  assert.equal((await listPendingDeliverableDrafts()).length, 1, 'only the deliverable candidate');
  assert.equal((await listRejectedDeliverableDrafts(5)).length, 0);
});

test('paramsHash dedup: same {code, productId, title, draft} returns the same token; different draft gets a new one', async () => {
  resetMemoryConfirmationStore();
  const first = await createDeliverableDraftCandidate(PRD_INPUT);
  // Different sessionId/eventId (a later turn re-generating the same draft) —
  // dedup key is content only, so the original candidate is returned as-is.
  const second = await createDeliverableDraftCandidate({
    ...PRD_INPUT,
    sessionId: 'sess-2',
    eventId: 'corr-2',
  });
  assert.equal(second.confirmationToken, first.confirmationToken);
  assert.equal((await listPendingDeliverableDrafts()).length, 1);

  const third = await createDeliverableDraftCandidate({ ...PRD_INPUT, draft: '# PRD\n改过的正文' });
  assert.notEqual(third.confirmationToken, first.confirmationToken);
  assert.equal((await listPendingDeliverableDrafts()).length, 2);
});

test('MemoryKnowledgeRepo.upsertDoc round-trips sourceEventId (DELIV-03 event pointer)', async () => {
  resetMemoryKnowledgeRepo();
  const withEvent = await getMemoryKnowledgeRepo().upsertDoc({
    docId: 'deliverable-p1-DEL-REQ-01',
    productId: 'p1',
    title: 'PRD',
    category: 'deliverable',
    tags: ['prd'],
    summary: 's',
    content: 'c',
    author: 'AI 助手',
    sourceEventId: 'corr-1',
  });
  assert.equal(withEvent.sourceEventId, 'corr-1');
  const withoutEvent = await getMemoryKnowledgeRepo().upsertDoc({
    docId: 'deliverable-p1-DEL-REQ-02',
    productId: 'p1',
    title: 'PRD',
    category: 'deliverable',
    tags: ['prd'],
    summary: 's',
    content: 'c',
    author: 'AI 助手',
  });
  assert.equal(withoutEvent.sourceEventId, null);
});

console.log('OK: Phase 16 Plan 01 deliverable candidates passed');
