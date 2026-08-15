// Phase 16 Plan 01 Task 2 — generateDeliverable tool: two-phase PRD pipeline
// (queue candidate, never interrupt the turn) + atomic consume → versioned
// slot write (knowledgeRepo) + rndStore slot projection with AI provenance
// (DELIV-01..04 backend).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../index';
import { executeTool, ToolArgError } from '../registry';
import { setActiveAgentScope } from '../agentScope';
import {
  confirmDeliverableDraft,
  listPendingDeliverableDrafts,
} from '../confirmations';
import { resetMemoryConfirmationStore } from '../confirmationStore';
import { getMemoryKnowledgeRepo, resetMemoryKnowledgeRepo } from '../knowledgeRepo';
import { useUIStore } from '../../stores/uiStore';
import { useRndStore, buildInitialDeliverables } from '../../stores/rndStore';

type GenResult = {
  ok: boolean;
  candidateQueued?: boolean;
  confirmationToken?: string;
  code?: string;
  title?: string;
  docId?: string;
  version?: number;
  slotCode?: string;
  ftsImmediateHit?: boolean;
  ftsHitCount?: number;
  aiSource?: { sessionId: string; eventId: string; generatedAt: string; docId: string; version: number };
};

async function callGen(args: Record<string, unknown>): Promise<GenResult> {
  return (await executeTool('generateDeliverable', args)) as GenResult;
}

function resetAll(): void {
  resetMemoryConfirmationStore();
  resetMemoryKnowledgeRepo();
  useUIStore.setState({ selectedProductId: 'p1' });
  setActiveAgentScope({ sessionId: 'test-session', correlationId: 'corr-16' });
  useRndStore.setState({
    deliverables: { p1: buildInitialDeliverables({ id: 'p1', name: 'P1' } as never) },
  });
}

test.afterEach(() => {
  useUIStore.setState({ selectedProductId: null });
  setActiveAgentScope(null);
});

test('no selected product → error 请先选择一个产品,再生成 PRD。 and no candidate is created', async () => {
  resetAll();
  useUIStore.setState({ selectedProductId: null });
  await assert.rejects(
    callGen({ code: 'prd', title: 'PRD 标题', draft: '# PRD' }),
    (error: unknown) => error instanceof Error && error.message === '请先选择一个产品,再生成 PRD。',
  );
  assert.equal((await listPendingDeliverableDrafts()).length, 0);
});

test('first call only queues a candidate — no doc written, turn not interrupted', async () => {
  resetAll();
  const result = await callGen({ code: 'prd', title: '智能助手 PRD', draft: '# PRD\n正文' });
  assert.equal(result.ok, true);
  assert.equal(result.candidateQueued, true);
  assert.ok(result.confirmationToken);
  assert.equal((await listPendingDeliverableDrafts()).length, 1);
  const docs = await getMemoryKnowledgeRepo().getCurrentDocs('p1');
  assert.equal(docs.filter((d) => d.category === 'deliverable').length, 0, 'no write before confirmation');
});

test('confirm → commit with edited draft lands versioned doc + FTS immediate hit', async () => {
  resetAll();
  const queued = await callGen({ code: 'prd', title: '智能助手 PRD', draft: '# PRD\n正文' });
  await confirmDeliverableDraft(queued.confirmationToken!);
  const result = await callGen({
    code: 'prd',
    title: '智能助手 PRD',
    draft: '# PRD\nEDITED 正文',
    confirmationToken: queued.confirmationToken,
  });
  assert.equal(result.ok, true);
  assert.equal(result.slotCode, 'DEL-REQ-01');
  assert.equal(result.ftsImmediateHit, true);
  assert.ok(result.ftsHitCount! >= 1);

  const docs = await getMemoryKnowledgeRepo().getCurrentDocs('p1');
  const doc = docs.find((d) => d.docId === 'deliverable-p1-DEL-REQ-01');
  assert.ok(doc, 'slot doc exists in knowledge repo');
  assert.equal(doc!.category, 'deliverable');
  assert.equal(doc!.sourceType, 'agent');
  assert.equal(doc!.sourceSessionId, 'test-session');
  assert.equal(doc!.sourceEventId, 'corr-16');
  assert.equal(doc!.version, 1);
  assert.equal(doc!.content, '# PRD\nEDITED 正文', 'edited draft is the committed content');
  assert.deepEqual(doc!.tags, ['prd']);
});

test('rndStore slot projection: status ready, edited content, full aiSource pointer', async () => {
  resetAll();
  const queued = await callGen({ code: 'prd', title: '智能助手 PRD', draft: '# PRD\n正文' });
  await confirmDeliverableDraft(queued.confirmationToken!);
  const result = await callGen({
    code: 'prd',
    title: '智能助手 PRD',
    draft: '# PRD\nEDITED 正文',
    confirmationToken: queued.confirmationToken,
  });

  const slot = useRndStore.getState().deliverables.p1.find((d) => d.code === 'DEL-REQ-01');
  assert.ok(slot);
  assert.equal(slot!.status, 'ready');
  assert.ok(slot!.content.includes('EDITED'));
  assert.equal(slot!.aiSource!.sessionId, 'test-session');
  assert.equal(slot!.aiSource!.eventId, 'corr-16');
  assert.equal(slot!.aiSource!.docId, result.docId);
  assert.equal(slot!.aiSource!.version, 1);
  assert.ok(slot!.aiSource!.generatedAt);
});

test('consuming the same token twice throws (Phase 14 atomic invariant)', async () => {
  resetAll();
  const queued = await callGen({ code: 'prd', title: '智能助手 PRD', draft: '# PRD\n正文' });
  await confirmDeliverableDraft(queued.confirmationToken!);
  await callGen({
    code: 'prd', title: '智能助手 PRD', draft: 'EDITED',
    confirmationToken: queued.confirmationToken,
  });
  await assert.rejects(
    callGen({
      code: 'prd', title: '智能助手 PRD', draft: 'EDITED',
      confirmationToken: queued.confirmationToken,
    }),
  );
});

test('re-generate + re-commit same slot → version 2 supersedes version 1 (audit chain)', async () => {
  resetAll();
  // First commit (version 1)
  const first = await callGen({ code: 'prd', title: '智能助手 PRD', draft: '# PRD v1' });
  await confirmDeliverableDraft(first.confirmationToken!);
  await callGen({ code: 'prd', title: '智能助手 PRD', draft: '# PRD v1', confirmationToken: first.confirmationToken });
  // Second commit (version 2)
  const second = await callGen({ code: 'prd', title: '智能助手 PRD v2', draft: '# PRD v2' });
  await confirmDeliverableDraft(second.confirmationToken!);
  const committed = await callGen({
    code: 'prd', title: '智能助手 PRD v2', draft: '# PRD v2',
    confirmationToken: second.confirmationToken,
  });
  assert.equal(committed.version, 2);

  const versions = await getMemoryKnowledgeRepo().listVersions('deliverable-p1-DEL-REQ-01');
  assert.equal(versions.length, 2);
  assert.equal(versions[1].supersededAt, null, 'version 2 is current');
  assert.ok(versions[0].supersededAt, 'version 1 superseded');
});

test('code api is rejected by zod enum (ToolArgError)', async () => {
  resetAll();
  await assert.rejects(
    callGen({ code: 'api', title: 'T', draft: 'D' }),
    (error: unknown) => error instanceof ToolArgError,
  );
});

test('consume call with mismatched title → 确认的草稿与候选不一致,请重新生成。', async () => {
  resetAll();
  const queued = await callGen({ code: 'prd', title: '智能助手 PRD', draft: '# PRD\n正文' });
  await confirmDeliverableDraft(queued.confirmationToken!);
  await assert.rejects(
    callGen({ code: 'prd', title: '被篡改的标题', draft: 'D', confirmationToken: queued.confirmationToken }),
    (error: unknown) => error instanceof Error && error.message === '确认的草稿与候选不一致,请重新生成。',
  );
});

console.log('OK: Phase 16 Plan 01 generateDeliverable tool passed');
