// src/ai/tools/knowledgeSearch.ts
// Phase 15 (MEM-06/07): retrieval routes through knowledgeRepo (single source
// of truth — SQLite FTS5 hybrid on Tauri, FTS-equivalent memory impl in Node /
// web dev). No direct rndStore reads for search anymore.
import { z } from 'zod';
import { registerTool } from '../registry';
import { getKnowledgeRepo } from '../knowledgeRepo';

const MAX_ARTICLES = 50;
const MAX_SUMMARY_LENGTH = 400;
const MAX_QUERY_LENGTH = 200;

const knowledgeScopeSchema = z.object({
  productId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_ARTICLES).optional(),
}).strict();

export const listKnowledgeArticlesSchema = knowledgeScopeSchema;

registerTool({
  name: 'listKnowledgeArticles',
  description: 'List bounded product knowledge article summaries (current doc versions, newest first). Results are local store metadata and do not claim vector or filesystem retrieval.',
  schema: listKnowledgeArticlesSchema,
  execute: async (args) => {
    const docs = await getKnowledgeRepo().getCurrentDocs(args.productId);
    const limit = args.limit ?? MAX_ARTICLES;
    return {
      productId: args.productId ?? null,
      articles: docs.slice(0, limit).map((doc) => ({
        id: doc.docId,
        productId: doc.productId,
        title: doc.title,
        category: doc.category,
        tags: doc.tags.slice(0, 20),
        author: doc.author,
        updatedAt: doc.updatedAt,
        summary: doc.summary.slice(0, MAX_SUMMARY_LENGTH),
        summaryTruncated: doc.summary.length > MAX_SUMMARY_LENGTH,
        version: doc.version,
        sourceType: doc.sourceType,
      })),
      truncated: docs.length > limit,
      retrieval: 'fts5-hybrid',
    };
  },
});

const searchKnowledgeBaseSchema = z.object({
  query: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  productId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_ARTICLES).optional(),
}).strict();

export { searchKnowledgeBaseSchema };

registerTool({
  name: 'searchKnowledgeBase',
  description: 'Search product knowledge via FTS5 hybrid retrieval (keyword MATCH + product filter, current doc versions only, source metadata included). Chinese queries are per-char tokenized. No vector, embedding, semantic, or filesystem retrieval is performed.',
  schema: searchKnowledgeBaseSchema,
  execute: async (args) => {
    const limit = args.limit ?? MAX_ARTICLES;
    // Fetch limit+1 to detect overflow — the repo slices internally and
    // otherwise carries no "more results" signal.
    const hits = await getKnowledgeRepo().search(args.query, {
      productId: args.productId,
      limit: limit + 1,
    });
    const truncated = hits.length > limit;
    return {
      query: args.query,
      productId: args.productId ?? null,
      matches: hits.map((hit) => ({
        id: hit.docId,
        productId: hit.productId,
        title: hit.title,
        category: hit.category,
        tags: hit.tags.slice(0, 20),
        author: hit.author,
        updatedAt: hit.updatedAt,
        version: hit.version,
        sourceType: hit.sourceType,
        summary: hit.summary.slice(0, MAX_SUMMARY_LENGTH),
        score: hit.score,
      })),
      truncated,
      retrieval: 'fts5-hybrid',
    };
  },
});
