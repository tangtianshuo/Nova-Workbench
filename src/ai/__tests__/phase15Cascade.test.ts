// Phase 15 Plan 03 — knowledgeSearch tool routes through knowledgeRepo
// (MEM-07 source metadata on hits) and deleteProduct cascades to memories +
// knowledge docs without touching agent_events. Memory impls (isTauri false).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import '../index';
import { executeTool } from '../registry';
import { getMemoryKnowledgeRepo, resetMemoryKnowledgeRepo } from '../knowledgeRepo';
import { getMemoryMemoryStore, resetMemoryMemoryStore } from '../memoryStore';
import { useProductStore } from '../../stores/productStore';

function seedDoc(overrides: Record<string, unknown> = {}) {
  return getMemoryKnowledgeRepo().upsertDoc({
    docId: 'cascade-doc-1',
    productId: 'cascade-p1',
    title: '需求评审流程规范',
    category: '业务规则',
    tags: ['评审'],
    summary: '描述需求评审的完整流程。',
    content: '需求评审需要三方参与。',
    author: 'Brandon (PM)',
    sourceType: 'seed',
    ...overrides,
  });
}

test('searchKnowledgeBase returns fts5-hybrid matches with source metadata (MEM-07)', async () => {
  resetMemoryKnowledgeRepo();
  await seedDoc();
  const result = await executeTool('searchKnowledgeBase', { query: '需求' }) as {
    retrieval: string;
    matches: Array<Record<string, unknown>>;
  };
  assert.equal(result.retrieval, 'fts5-hybrid');
  assert.ok(result.matches.length >= 1);
  for (const field of ['sourceType', 'version', 'updatedAt']) {
    assert.ok(field in result.matches[0], `match must carry ${field}`);
  }
  assert.equal(result.matches[0].sourceType, 'seed');
});

test('listKnowledgeArticles goes through getCurrentDocs, keeps bounded list semantics', async () => {
  resetMemoryKnowledgeRepo();
  await seedDoc();
  const result = await executeTool('listKnowledgeArticles', {}) as {
    articles: Array<Record<string, unknown>>;
    truncated: boolean;
  };
  assert.ok(Array.isArray(result.articles));
  assert.equal(result.truncated, false);
  assert.ok('version' in result.articles[0] && 'sourceType' in result.articles[0]);
  assert.ok(result.articles.some((a) => a.id === 'cascade-doc-1'));
});

test('deleteProduct cascades: product memories soft-deleted, knowledge docs removed', async () => {
  resetMemoryKnowledgeRepo();
  resetMemoryMemoryStore();
  await seedDoc();
  const store = getMemoryMemoryStore();
  const candidate = await store.propose({
    content: 'cascade 产品的发布节奏',
    origin: 'model_inferred',
    scope: 'product',
    productId: 'cascade-p1',
  });
  await store.confirm(candidate.candidateToken);
  await store.consumeIntoMemories(candidate.candidateToken);
  assert.ok((await store.listActiveMemories('cascade-p1')).length > 0, 'precondition: product memory exists');

  useProductStore.getState().deleteProduct('cascade-p1');
  // deleteProduct fire-and-forgets the cascade — let the microtasks settle.
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal((await store.listActiveMemories('cascade-p1')).length, 0, 'memories must be soft-deleted');
  assert.equal((await getMemoryKnowledgeRepo().getCurrentDocs('cascade-p1')).length, 0, 'knowledge docs must be deleted');
  assert.equal((await getMemoryKnowledgeRepo().search('需求', { productId: 'cascade-p1' })).length, 0);
});

test('cascade never touches agent_events (append-only audit locked decision)', async () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../stores/productStore.ts', import.meta.url)),
    'utf-8',
  );
  assert.equal(source.includes('eventStore'), false, 'cascade code must not import or reference eventStore');
});

console.log('OK: Phase 15 Plan 03 cascade checks passed');
