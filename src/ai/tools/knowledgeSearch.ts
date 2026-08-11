import { z } from 'zod';
import { registerTool } from '../registry';
import { useRndStore, type ProductKnowledgeItem } from '../../stores/rndStore';

const MAX_ARTICLES = 50;
const MAX_SUMMARY_LENGTH = 400;
const MAX_QUERY_LENGTH = 200;

const knowledgeScopeSchema = z.object({
  productId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_ARTICLES).optional(),
}).strict();

function scopedArticles(productId?: string): ProductKnowledgeItem[] {
  const knowledgeBase = useRndStore.getState().knowledgeBase;
  if (productId) return knowledgeBase[productId] ?? [];
  return Object.values(knowledgeBase).flat();
}

function articleSummary(article: ProductKnowledgeItem) {
  return {
    id: article.id,
    productId: article.productId,
    title: article.title,
    category: article.category,
    tags: article.tags.slice(0, 20),
    author: article.author,
    updatedAt: article.updatedAt,
    readTime: article.readTime,
    summary: article.summary.slice(0, MAX_SUMMARY_LENGTH),
    summaryTruncated: article.summary.length > MAX_SUMMARY_LENGTH,
  };
}

export const listKnowledgeArticlesSchema = knowledgeScopeSchema;

registerTool({
  name: 'listKnowledgeArticles',
  description: 'List bounded product knowledge article summaries. Results are local store metadata and do not claim vector or filesystem retrieval.',
  schema: listKnowledgeArticlesSchema,
  execute: (args) => {
    const articles = scopedArticles(args.productId);
    const limit = args.limit ?? MAX_ARTICLES;
    return {
      productId: args.productId ?? null,
      articles: articles.slice(0, limit).map(articleSummary),
      truncated: articles.length > limit,
      retrieval: 'bounded-store-list',
    };
  },
});

const searchKnowledgeBaseSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  productId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_ARTICLES).optional(),
}).strict();

export { searchKnowledgeBaseSchema };

function lexicalTerms(value: string): string[] {
  const normalized = value.toLocaleLowerCase().normalize('NFKC');
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  const cjkCharacters = normalized.match(/[\u3400-\u9fff]/g) ?? [];
  return [...new Set([...words, ...cjkCharacters])];
}

function scoreArticle(article: ProductKnowledgeItem, query: string): { score: number; fields: string[] } {
  const fields: Array<[string, string, number]> = [
    ['title', article.title, 8],
    ['category', article.category, 5],
    ['tags', article.tags.join(' '), 5],
    ['summary', article.summary, 3],
    ['content', article.content, 1],
  ];
  const normalizedQuery = query.toLocaleLowerCase().normalize('NFKC');
  const terms = lexicalTerms(query);
  let score = 0;
  const matchedFields = new Set<string>();

  for (const [field, value, weight] of fields) {
    const normalizedValue = value.toLocaleLowerCase().normalize('NFKC');
    if (normalizedValue.includes(normalizedQuery)) {
      score += weight * 2;
      matchedFields.add(field);
    }
    for (const term of terms) {
      if (normalizedValue.includes(term)) {
        score += weight;
        matchedFields.add(field);
      }
    }
  }

  return { score, fields: [...matchedFields] };
}

registerTool({
  name: 'searchKnowledgeBase',
  description: 'Search product knowledge with a bounded lexical store fallback only. No vector, embedding, semantic, or filesystem retrieval is performed.',
  schema: searchKnowledgeBaseSchema,
  execute: (args) => {
    const articles = scopedArticles(args.productId);
    const ranked = articles
      .map((article) => ({ article, ...scoreArticle(article, args.query) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.article.title.localeCompare(right.article.title));
    const limit = args.limit ?? MAX_ARTICLES;

    return {
      query: args.query,
      productId: args.productId ?? null,
      matches: ranked.slice(0, limit).map((item) => ({
        ...articleSummary(item.article),
        score: item.score,
        matchedFields: item.fields,
      })),
      truncated: ranked.length > limit,
      retrieval: 'bounded-lexical',
    };
  },
});
