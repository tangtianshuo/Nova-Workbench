// src/ai/tools/proposeMemory.ts
// Phase 15 Plan 02 (MEM-01/MEM-02) — memory proposal tool. Red line
// (RESEARCH Pattern 4): NEVER import or throw ConfirmationRequiredError —
// that path endTurn('awaiting_confirmation') kills the dialog. model_inferred
// proposals land in the pending queue for UI confirmation; user_directed
// (user explicitly said 记住) auto-confirms INSIDE memoryStore.propose
// (confirm+consume chain from 15-01 T3) — the tool only passes the result
// through. No writes to agent_confirmation_candidates either (Pitfall 2).
// sessionId stays undefined: candidate restore reads listPending /
// listRecentUserDirected in full, no session filter needed.
import { z } from 'zod';
import { registerTool } from '../registry';
import { getMemoryStore } from '../memoryStore';
import { useUIStore } from '@/src/stores/uiStore';

const proposeMemorySchema = z.object({
  content: z.string().trim().min(1).max(500),
  scope: z.enum(['global', 'product']).optional(),
  // 用户显式说"记住"时模型置 true → origin='user_directed' → store 内自动
  // confirm+consume 直接入库（锁定决策后半句）
  userDirected: z.boolean().optional(),
}).strict();

registerTool({
  name: 'proposeMemory',
  description:
    'Propose a long-term memory from this conversation. Use userDirected=true ONLY when the user explicitly said to remember something — the memory is then saved immediately with no further confirmation. Otherwise (userDirected false/omitted) the memory is only a candidate and the user must approve it in the UI; never fabricate user confirmation for model-inferred memories.',
  schema: proposeMemorySchema,
  execute: async (args) => {
    const store = getMemoryStore();
    const productId = args.scope === 'product' ? useUIStore.getState().selectedProductId : undefined;
    const result = await store.propose({
      content: args.content,
      origin: args.userDirected ? 'user_directed' : 'model_inferred',
      scope: args.scope ?? 'global',
      productId,
    });
    return {
      ok: true,
      candidateQueued: !result.deduplicated && !result.autoConfirmed,
      ...result,
      note: result.autoConfirmed
        ? 'Saved to long-term memory (the user explicitly asked to remember this).'
        : 'The user will see this candidate in the chat panel; do not re-propose the same content.',
    };
  },
});
