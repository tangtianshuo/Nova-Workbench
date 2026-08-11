import { z } from 'zod';
import { useProductStore } from '../../stores/productStore';
import { useRndStore, type ProductKnowledgeItem } from '../../stores/rndStore';
import { registerTool } from '../registry';
import {
  ConfirmationRequiredError,
  consumeKnowledgeWriteConfirmation,
  createKnowledgeWriteCandidate,
  type KnowledgeWriteDraft,
} from '../confirmations';

const knowledgeCategories = [
  '架构设计',
  '领域字典',
  '技术协议',
  'FAQ与排障',
  '最佳实践',
  '经验沉淀',
  '业务规则',
  '架构约束',
  '踩坑指南',
] as const satisfies readonly ProductKnowledgeItem['category'][];

const writeKnowledgeArticleSchema = z.object({
  productId: z.string().min(1),
  itemId: z.string().min(1).optional(),
  title: z.string().min(1),
  category: z.enum(knowledgeCategories),
  tags: z.array(z.string().min(1)).max(20),
  content: z.string().min(1),
  summary: z.string().optional(),
  author: z.string().min(1).optional(),
  readTime: z.string().min(1).optional(),
  confirmationToken: z.string().min(1).optional(),
}).strict();

type WriteKnowledgeArticleArgs = z.infer<typeof writeKnowledgeArticleSchema>;

function findArticleOwner(itemId: string): string | undefined {
  const knowledgeBase = useRndStore.getState().knowledgeBase;
  for (const [productId, items] of Object.entries(knowledgeBase)) {
    if (items.some((item) => item.id === itemId)) return productId;
  }
  return undefined;
}

function resolveDraft(args: WriteKnowledgeArticleArgs): KnowledgeWriteDraft {
  const products = useProductStore.getState().products;
  if (!products.some((product) => product.id === args.productId)) {
    throw new Error(`Product not found: ${args.productId}`);
  }

  const store = useRndStore.getState();
  const items = store.knowledgeBase[args.productId] ?? [];
  const existing = args.itemId ? items.find((item) => item.id === args.itemId) : undefined;

  if (args.itemId && !existing) {
    const owner = findArticleOwner(args.itemId);
    if (owner && owner !== args.productId) {
      throw new Error(`Knowledge article ${args.itemId} belongs to another product.`);
    }
    throw new Error(`Knowledge article not found: ${args.itemId}`);
  }

  return {
    productId: args.productId,
    itemId: args.itemId,
    operation: existing ? 'updated' : 'created',
    title: args.title,
    category: args.category,
    tags: [...args.tags],
    content: args.content,
    summary: args.summary ?? existing?.summary ?? args.content.slice(0, 100),
    author: args.author ?? existing?.author ?? 'AI 助手',
    readTime: args.readTime ?? existing?.readTime ?? '待阅读',
  };
}

function writeConfirmedArticle(draft: KnowledgeWriteDraft): { articleId: string; operation: 'created' | 'updated' } {
  const store = useRndStore.getState();
  if (draft.operation === 'updated') {
    if (!draft.itemId || !(store.knowledgeBase[draft.productId] ?? []).some((item) => item.id === draft.itemId)) {
      throw new Error(`Knowledge article not found: ${draft.itemId ?? ''}`);
    }
    store.updateKnowledgeItem(draft.productId, draft.itemId, {
      title: draft.title,
      category: draft.category,
      tags: [...draft.tags],
      content: draft.content,
      summary: draft.summary,
      author: draft.author,
      readTime: draft.readTime,
    });
    const updated = useRndStore.getState().knowledgeBase[draft.productId]?.find((item) => item.id === draft.itemId);
    if (!updated || updated.content !== draft.content) {
      throw new Error('Knowledge article update was not persisted.');
    }
    return { articleId: updated.id, operation: 'updated' };
  }

  store.addKnowledgeItem(draft.productId, {
    title: draft.title,
    category: draft.category,
    tags: [...draft.tags],
    content: draft.content,
    summary: draft.summary,
    author: draft.author,
    readTime: draft.readTime,
  });
  const created = useRndStore.getState().knowledgeBase[draft.productId]?.find((item) =>
    item.title === draft.title
    && item.category === draft.category
    && item.content === draft.content
    && item.summary === draft.summary,
  );
  if (!created) throw new Error('Knowledge article create was not persisted.');
  return { articleId: created.id, operation: 'created' };
}

export { writeKnowledgeArticleSchema };

registerTool({
  name: 'writeKnowledgeArticle',
  description: 'Stage or persist a product knowledge article. The first call returns a candidate and requires explicit confirmation; only a confirmed matching token can write.',
  schema: writeKnowledgeArticleSchema,
  execute: (args) => {
    const draft = resolveDraft(args);
    if (!args.confirmationToken) {
      throw new ConfirmationRequiredError(createKnowledgeWriteCandidate(draft));
    }
    consumeKnowledgeWriteConfirmation(args.confirmationToken, draft);
    return writeConfirmedArticle(draft);
  },
});
