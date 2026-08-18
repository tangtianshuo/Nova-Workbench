// src/ai/sessionSummaryProjection.ts
// Quick 260818-f3b — after each completed agent turn, project the session's
// rolling summary into the knowledge repo as a versioned doc (stable docId
// `session-summary-<sessionId>`; repeat projection = new version supersedes)
// and incrementally refresh the rndStore knowledgeBase projection bucket.
// React-free (getState only) so Node tests load it directly.
import { ChatSession } from './chatSession';
import { getKnowledgeRepo, type KnowledgeDocInput } from './knowledgeRepo';
import { useUIStore } from '@/src/stores/uiStore';
import { useProductStore } from '@/src/stores/productStore';
import { useRndStore, docToItem } from '@/src/stores/rndStore';

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Pure derivation: the whole summary comes from session.getAllMessages(), never the event table. */
export function deriveSummaryDoc(session: ChatSession, productId: string): KnowledgeDocInput {
  const messages = session.getAllMessages();
  const firstUser = messages.find((m) => m.role === 'user');
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const product = useProductStore.getState().products.find((p) => p.id === productId);
  const productName = product?.name ?? productId;

  const toolCounts = new Map<string, number>();
  for (const m of messages) {
    if (m.role === 'tool' && m.toolName) toolCounts.set(m.toolName, (toolCounts.get(m.toolName) ?? 0) + 1);
  }
  const toolLines = [...toolCounts.entries()]
    .map(([name, count]) => `- ${name} × ${count}`)
    .join('\n');
  const userTurns = messages.filter((m) => m.role === 'user').length;
  const startedAt = messages.length > 0 ? new Date(messages[0].timestamp).toISOString() : '—';

  const content = [
    `# ${productName} 会话纪要`,
    '',
    `- 会话时间: ${startedAt}`,
    `- 用户轮次: ${userTurns}`,
    `- 工具调用: ${toolLines || '无'}`,
    '',
    '## 最后回复',
    '',
    truncate(lastAssistant?.content ?? '', 500),
  ].join('\n');

  return {
    docId: `session-summary-${session.sessionId}`,
    productId,
    title: `${productName} 会话纪要: ${truncate(firstUser?.content ?? '', 20)}`,
    category: '经验沉淀',
    tags: ['会话纪要'],
    summary: truncate(lastAssistant?.content ?? '', 100),
    content,
    author: 'Nova Agent',
    sourceType: 'agent',
    sourceSessionId: session.sessionId,
  };
}

/**
 * Upsert the session summary doc + refresh the projection bucket.
 * Fire-and-forget by design: callers never await this on the critical path.
 * Skips silently when no product is selected (explicit param overrides the store).
 */
export async function projectSessionSummary(session: ChatSession, productIdOverride?: string): Promise<void> {
  const productId = productIdOverride ?? useUIStore.getState().selectedProductId;
  if (!productId) return;

  const doc = await getKnowledgeRepo().upsertDoc(deriveSummaryDoc(session, productId));
  useRndStore.setState((state) => ({
    knowledgeBase: {
      ...state.knowledgeBase,
      [productId]: [
        docToItem(doc),
        ...(state.knowledgeBase[productId] || []).filter((k) => k.id !== doc.docId),
      ],
    },
  }));
}
