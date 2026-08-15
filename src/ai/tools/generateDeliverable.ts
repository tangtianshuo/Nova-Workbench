// src/ai/tools/generateDeliverable.ts
// Phase 16 (DELIV-01..04) — two-phase PRD pipeline tool. First call (no
// confirmationToken) only QUEUES a candidate and returns — never throws
// ConfirmationRequiredError (proposeMemory red line: interrupting the turn
// kills the dialog). The confirmed + user-edited draft is committed by a
// second call carrying the token (ChatPanel executes it directly): atomic
// consume BEFORE any write (Phase 14 invariant), then versioned slot write
// via the knowledgeRepo single write API, rndStore slot projection with AI
// provenance, and an auditable immediate FTS hit check.
import { z } from 'zod';
import { useUIStore } from '@/src/stores/uiStore';
import { useProductStore } from '@/src/stores/productStore';
import { useRndStore } from '@/src/stores/rndStore';
import { registerTool } from '../registry';
import { getKnowledgeRepo } from '../knowledgeRepo';
import { getActiveAgentScope } from '../agentScope';
import {
  confirmDeliverableDraft,
  consumeDeliverableDraftConfirmation,
  createDeliverableDraftCandidate,
  getDeliverableDraftCandidate,
  type DeliverableCode,
} from '../confirmations';

// 本期只验证 PRD 路径(DELIV-01 锁定决策);DELIV-05 推广时在此表加行即可。
const SLOT_BY_CODE: Record<DeliverableCode, string> = { prd: 'DEL-REQ-01' };

const generateDeliverableSchema = z.object({
  code: z.enum(['prd']),
  title: z.string().min(1),
  draft: z.string().min(1),
  confirmationToken: z.string().min(1).optional(),
}).strict();

export { generateDeliverableSchema };

async function commitConfirmedDraft(
  token: string,
  args: { code: DeliverableCode; title: string; draft: string },
): Promise<Record<string, unknown>> {
  const candidate = await getDeliverableDraftCandidate(token);
  if (!candidate) throw new Error('PRD 草稿候选已失效,请重新生成。');
  // Identity guard: only code/title identify the candidate — draft IS expected
  // to differ (user edited it in the MDXEditor before committing).
  if (args.code !== candidate.code || args.title !== candidate.title) {
    throw new Error('确认的草稿与候选不一致,请重新生成。');
  }
  await confirmDeliverableDraft(token); // idempotent
  await consumeDeliverableDraftConfirmation(candidate); // atomic, exactly-once

  const slotCode = SLOT_BY_CODE[candidate.code];
  const scope = {
    sessionId: candidate.sessionId ?? '',
    eventId: candidate.eventId ?? '',
    generatedAt: new Date().toISOString(),
  };
  const doc = await getKnowledgeRepo().upsertDoc({
    docId: `deliverable-${candidate.productId}-${slotCode}`, // stable docId: repeated commits = new version supersede
    productId: candidate.productId,
    title: candidate.title,
    category: 'deliverable',
    tags: ['prd'], // CONTEXT locked: category 'deliverable' + tag 'prd'
    summary: args.draft.slice(0, 100),
    content: args.draft, // user-edited final draft
    author: 'AI 助手',
    sourceType: 'agent',
    sourceSessionId: candidate.sessionId,
    sourceEventId: candidate.eventId,
  });
  // CONTEXT「卡槽只存指针 + 当前版本投影」:docId/version 即真相源显式指针。
  const aiSource = { ...scope, docId: doc.docId, version: doc.version };
  useRndStore.getState().commitDeliverableDraft(candidate.productId, slotCode, args.draft, aiSource);
  // DELIV-04 auditable "index immediately retrievable": search right after the
  // commit; the hit count goes into the return value (Plan 02 writes it into
  // the deliverable_committed event payload).
  const hits = await getKnowledgeRepo().search(candidate.title, { productId: candidate.productId, limit: 50 });
  const ftsHitCount = hits.filter((h) => h.docId === doc.docId).length;
  return { ok: true, docId: doc.docId, version: doc.version, slotCode, ftsImmediateHit: ftsHitCount > 0, ftsHitCount, aiSource };
}

registerTool({
  name: 'generateDeliverable',
  description:
    'Generate a deliverable draft (currently PRD only) for the currently selected product. You produce the full draft content yourself in the `draft` parameter. The first call only queues a candidate for user confirmation — the user will review and edit it in the chat panel; do not call again for the same deliverable.',
  schema: generateDeliverableSchema,
  execute: async (args) => {
    if (args.confirmationToken) {
      return commitConfirmedDraft(args.confirmationToken, args);
    }
    const productId = useUIStore.getState().selectedProductId;
    const products = useProductStore.getState().products;
    if (!productId || !products.some((p) => p.id === productId)) {
      throw new Error('请先选择一个产品,再生成 PRD。');
    }
    const scope = getActiveAgentScope();
    const candidate = await createDeliverableDraftCandidate({
      productId,
      code: args.code,
      title: args.title,
      draft: args.draft,
      sessionId: scope?.sessionId ?? null,
      eventId: scope?.correlationId ?? null,
    });
    return {
      ok: true,
      candidateQueued: true,
      confirmationToken: candidate.confirmationToken,
      code: args.code,
      title: args.title,
      note: 'PRD 草稿已进入待确认队列;用户将在对话面板中确认并编辑,不要重复生成同一份草稿。',
    };
  },
});
