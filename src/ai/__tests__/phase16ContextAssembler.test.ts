// Phase 16 Plan 01 Task 3 — contextAssembler deliverable anti-repropose
// injection (DELIV-01, MEM-02 isomorphic): pending PRD candidates render as
// （待用户确认）lines, rejected ones land in a do-not-regenerate section, and
// the pending audit counts memory + deliverable candidates together.
// Existing phase15 assembler output must stay byte-identical when no
// deliverable candidates exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleInjectedContext, type SegmentAudit } from '../contextAssembler';
import { getMemoryMemoryStore, resetMemoryMemoryStore } from '../memoryStore';
import { resetMemoryConfirmationStore } from '../confirmationStore';
import {
  createDeliverableDraftCandidate,
  rejectDeliverableDraft,
  listPendingDeliverableDrafts,
} from '../confirmations';

const NO_SEARCH = async () => [] as Array<{ title: string; version: number; updatedAt: string; summary: string }>;

function find(audit: { segments: SegmentAudit[] }, name: SegmentAudit['name']): SegmentAudit {
  const segment = audit.segments.find((item) => item.name === name);
  assert.ok(segment, `segment ${name} must exist`);
  return segment;
}

test('no deliverable candidates: coreContext contains no 交付物草稿 section (zero drift)', async () => {
  resetMemoryMemoryStore();
  resetMemoryConfirmationStore();
  const { coreContext } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: NO_SEARCH,
    userMessage: '消息',
  });
  assert.ok(!coreContext.includes('交付物草稿'));
});

test('pending PRD candidate renders a （待用户确认）line', async () => {
  resetMemoryMemoryStore();
  resetMemoryConfirmationStore();
  await createDeliverableDraftCandidate({
    productId: 'p1', code: 'prd', title: '智能助手 PRD', draft: '# PRD',
    sessionId: null, eventId: null,
  });
  const { coreContext } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: NO_SEARCH,
    userMessage: '消息',
  });
  assert.ok(coreContext.includes('- （待用户确认）PRD 草稿《智能助手 PRD》'));
});

test('rejected PRD candidate lands in the do-not-regenerate section, not the pending line', async () => {
  resetMemoryMemoryStore();
  resetMemoryConfirmationStore();
  await createDeliverableDraftCandidate({
    productId: 'p1', code: 'prd', title: '智能助手 PRD', draft: '# PRD',
    sessionId: null, eventId: null,
  });
  const pending = await listPendingDeliverableDrafts();
  await rejectDeliverableDraft(pending[0].confirmationToken);
  const { coreContext } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: NO_SEARCH,
    userMessage: '消息',
  });
  assert.ok(coreContext.includes('不要再生成以下交付物草稿（用户已忽略）: PRD《智能助手 PRD》'));
  assert.ok(!coreContext.includes('（待用户确认）PRD'), 'rejected candidate must not appear as pending');
});

test('pending audit items = memory pending + deliverable pending', async () => {
  resetMemoryMemoryStore();
  resetMemoryConfirmationStore();
  const store = getMemoryMemoryStore();
  await store.propose({ content: '一条记忆候选', origin: 'model_inferred', scope: 'global' });
  await createDeliverableDraftCandidate({
    productId: 'p1', code: 'prd', title: 'PRD 甲', draft: '# A', sessionId: null, eventId: null,
  });
  await createDeliverableDraftCandidate({
    productId: 'p1', code: 'prd', title: 'PRD 乙', draft: '# B', sessionId: null, eventId: null,
  });
  const { audit } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: NO_SEARCH,
    userMessage: '消息',
  });
  assert.equal(find(audit, 'pending').items, 3);
});

console.log('OK: Phase 16 Plan 01 contextAssembler deliverable segment passed');
