import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../tools/rndAdvanced';
import '../tools/knowledgeSearch';
import { executeTool, listToolNames, ToolArgError, toolRegistry } from '../registry';
import { useRndStore } from '../../stores/rndStore';

test('Phase 11 Plan 03 registers real Zod tools and returns bounded document/PRD drafts', async () => {
  for (const name of ['getProductDocumentContext', 'getPRDDraftContext', 'generateDeliverable', 'listKnowledgeArticles', 'searchKnowledgeBase']) {
    assert.equal(listToolNames().includes(name), true, `${name} should be registered`);
    assert.equal(toolRegistry.get(name)?.jsonSchema.type, 'object');
  }

  const documentContext = await executeTool('getProductDocumentContext', { productId: 'p1' }) as {
    documents: Array<{ content: string; contentTruncated: boolean }>;
    draftOnly: boolean;
  };
  assert.equal(documentContext.draftOnly, true);
  assert.equal(documentContext.documents.length > 0, true);
  assert.equal(documentContext.documents[0].content.length <= 6_000, true);
  assert.equal('canOverwrite' in documentContext, false);

  const prdContext = await executeTool('getPRDDraftContext', { productId: 'p1' }) as {
    prdMarkdown: string;
    draftOnly: boolean;
  };
  assert.equal(prdContext.draftOnly, true);
  assert.equal(prdContext.prdMarkdown.length <= 8_000, true);

  const missing = await executeTool('getPRDDraftContext', { productId: 'missing-product' }) as { ok: boolean; error: { code: string } };
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'PRODUCT_NOT_FOUND');

  await assert.rejects(
    executeTool('getPRDDraftContext', { productId: 'p1', unexpected: true }),
    (error: unknown) => error instanceof ToolArgError,
  );
});

test('generateDeliverable reads the store-backed content after the existing AI action', async () => {
  const originalDeliverables = useRndStore.getState().deliverables;

  try {
    const result = await executeTool('generateDeliverable', { productId: 'p1', code: 'DEL-REQ-01' }) as {
      productId: string;
      code: string;
      status: string;
      content: string;
    };
    assert.deepEqual({ productId: result.productId, code: result.code, status: result.status }, {
      productId: 'p1',
      code: 'DEL-REQ-01',
      status: 'ready',
    });
    assert.match(result.content, /# 标准产品需求规格说明书/);
    assert.match(result.content, /## 验收要点/);
    assert.equal(useRndStore.getState().deliverables.p1?.find((item) => item.code === 'DEL-REQ-01')?.content, result.content);
  } finally {
    useRndStore.setState({ deliverables: originalDeliverables });
  }
});

test('knowledge list and search are bounded lexical results scoped by product when requested', async () => {
  const listed = await executeTool('listKnowledgeArticles', { productId: 'p1', limit: 1 }) as {
    articles: Array<Record<string, unknown>>;
    truncated: boolean;
    retrieval: string;
  };
  assert.equal(listed.articles.length, 1);
  assert.equal(listed.truncated, true);
  assert.equal(listed.retrieval, 'bounded-store-list');
  assert.equal('content' in listed.articles[0], false);

  const search = await executeTool('searchKnowledgeBase', {
    productId: 'p1',
    query: 'AI',
    limit: 5,
  }) as {
    matches: Array<{ productId: string; score: number; matchedFields: string[] }>;
    retrieval: string;
  };
  assert.equal(search.retrieval, 'bounded-lexical');
  assert.equal(search.matches.every((match) => match.productId === 'p1'), true);
  assert.equal(search.matches.every((match) => match.score > 0), true);
  assert.equal(search.matches.every((match) => Array.isArray(match.matchedFields)), true);
});
