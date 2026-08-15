// Phase 15 Plan 03 — knowledge repo: version chain (MEM-04), retrieval only
// returns current versions, Chinese 2-char hits (MEM-06), structural filters,
// source metadata (MEM-07). Runs in Node against the memory impl
// (isTauri() === false); Sqlite impl is exercised on real Tauri DB boot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MemoryKnowledgeRepo,
  getKnowledgeRepo,
  getMemoryKnowledgeRepo,
  resetMemoryKnowledgeRepo,
  searchKnowledgeHybrid,
} from '../knowledgeRepo';
import { toFtsMatchString } from '../ftsTokens';

function docInput(overrides: Record<string, unknown> = {}) {
  return {
    docId: 'd1',
    productId: 'p1',
    title: '需求评审流程规范',
    category: '业务规则',
    tags: ['评审', '流程'],
    summary: '描述需求评审的完整流程。',
    content: '需求评审需要产品、研发、测试三方参与。',
    author: 'Brandon (PM)',
    sourceType: 'seed' as const,
    ...overrides,
  };
}

test('MEM-04 version chain: second upsert creates version 2, v1 superseded but auditable', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput({ title: '旧版标题旧版' }));
  const v2 = await repo.upsertDoc(docInput({ title: '新版标题新版' }));
  assert.equal(v2.version, 2);

  const versions = await repo.listVersions('d1');
  assert.equal(versions.length, 2);
  assert.deepEqual(versions.map((v) => v.version), [1, 2]);
  assert.ok(versions[0].supersededAt, 'v1 row must have superseded_at stamped');

  const current = await repo.getCurrentDocs('p1');
  assert.equal(current.length, 1);
  assert.equal(current[0].version, 2, 'only v2 is the current version');
  assert.equal(current[0].supersededAt, null);
});

test('MEM-04 retrieval never returns superseded content', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput({ title: '独占旧标题关键词' }));
  await repo.upsertDoc(docInput({ title: '独占新标题关键词' }));

  assert.equal((await repo.search('旧标题')).length, 0, 'old-version-only keyword must not hit');
  assert.equal((await repo.search('新标题')).length, 1, 'new title must hit');
});

test('MEM-06 Chinese 2-char query hits via per-char token matching', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput());
  const hits = await repo.search('需求');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].docId, 'd1');
});

test('MEM-06 AND semantics matches toFtsMatchString: every quoted token must be present', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput({ docId: 'both', title: '需求评审流程' }));
  await repo.upsertDoc(docInput({ docId: 'partial', title: '内需市场规模分析', productId: 'p2' }));
  // toFtsMatchString('需求') === '"需" "求"' — implicit AND, so '内需' (需 without 求) must NOT match.
  assert.equal(toFtsMatchString('需求'), '"需" "求"');
  const hits = await repo.search('需求');
  assert.deepEqual(hits.map((h) => h.docId), ['both']);
});

test('MEM-06 structural filter: empty query + productId returns only that product, updated_at DESC', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput({ docId: 'a', updatedAt: '2025-01-01T00:00:00.000Z' }));
  await repo.upsertDoc(docInput({ docId: 'b', updatedAt: '2025-01-03T00:00:00.000Z' }));
  await repo.upsertDoc(docInput({ docId: 'c', productId: 'p2', updatedAt: '2025-01-02T00:00:00.000Z' }));

  const hits = await repo.search('', { productId: 'p1' });
  assert.deepEqual(hits.map((h) => h.docId), ['b', 'a'], 'filters-only mode must return p1 docs newest first');
});

test('MEM-07 every hit carries full source metadata', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput());
  const [hit] = await repo.search('评审');
  assert.ok(hit);
  for (const key of ['docId', 'version', 'title', 'category', 'tags', 'summary', 'productId', 'sourceType', 'updatedAt', 'author']) {
    assert.ok(key in hit, `hit must carry ${key}`);
  }
  assert.equal(hit.sourceType, 'seed');
  assert.equal(hit.version, 1);
});

test('time filter: since excludes older documents', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput({ docId: 'old', title: '需求旧文', updatedAt: '2024-01-01T00:00:00.000Z' }));
  await repo.upsertDoc(docInput({ docId: 'new', title: '需求新文' }));
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const hits = await repo.search('需求', { since });
  assert.deepEqual(hits.map((h) => h.docId), ['new']);
});

test('FTS rows never deleted: old versions stay auditable, rebuildFts keeps current searchable', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput({ title: '审计保留标题' }));
  await repo.upsertDoc(docInput({ title: '现行有效标题' }));
  assert.equal((await repo.listVersions('d1')).length, 2, 'full version array preserved after update');
  await repo.rebuildFts();
  assert.equal((await repo.search('现行')).length, 1, 'current version still searchable after rebuild');
  assert.equal((await repo.search('审计保留')).length, 0, 'superseded content must stay out of retrieval');
});

test('tag filter applies on the result set', async () => {
  const repo = new MemoryKnowledgeRepo();
  await repo.upsertDoc(docInput({ docId: 'x', tags: ['架构'] }));
  await repo.upsertDoc(docInput({ docId: 'y', tags: ['排障'] }));
  const hits = await repo.search('', { tag: '架构' });
  assert.deepEqual(hits.map((h) => h.docId), ['x']);
});

test('singleton: getKnowledgeRepo returns memory impl in Node; searchKnowledgeHybrid delegates', async () => {
  resetMemoryKnowledgeRepo();
  assert.ok(getKnowledgeRepo() === getMemoryKnowledgeRepo(), 'Node (isTauri false) must resolve the memory repo');
  await getMemoryKnowledgeRepo().upsertDoc(docInput({ docId: 'hybrid' }));
  const hits = await searchKnowledgeHybrid('需求', 10);
  assert.ok(hits.some((h) => h.docId === 'hybrid'));
  resetMemoryKnowledgeRepo();
});

console.log('OK: Phase 15 Plan 03 knowledge repo checks passed');
