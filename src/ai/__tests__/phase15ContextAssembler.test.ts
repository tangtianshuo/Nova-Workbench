// Phase 15 Plan 02 Task 2 — five-segment priority context assembler (MEM-08).
// Pure function with injected buildCore / searchKnowledge; segment quotas
// [600, 200, 500, 400, 300] (total 2000 hard cap = 25% of 8000, ratio
// 30/10/25/20/15); overflow drops oldest entries; FTS failure degrades to
// error:'unavailable' without breaking assembly; recent_dialog is budget
// reservation only — no message content re-injection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleInjectedContext, type SegmentAudit } from '../contextAssembler';
import { getMemoryMemoryStore, resetMemoryMemoryStore } from '../memoryStore';

const NO_SEARCH = async () => [] as Array<{ title: string; version: number; updatedAt: string; summary: string }>;

function find(audit: { segments: SegmentAudit[] }, name: SegmentAudit['name']): SegmentAudit {
  const segment = audit.segments.find((item) => item.name === name);
  assert.ok(segment, `segment ${name} must exist`);
  return segment;
}

test('empty stores: five segments present, core comes from injected buildCore', async () => {
  resetMemoryMemoryStore();
  const { coreContext, audit } = await assembleInjectedContext({
    buildCore: () => 'CORE_FACTS_MARKER',
    searchKnowledge: NO_SEARCH,
    userMessage: '普通消息',
  });
  assert.ok(coreContext.includes('CORE_FACTS_MARKER'));
  assert.equal(audit.segments.length, 5);
  assert.deepEqual(
    audit.segments.map((segment) => segment.name),
    ['core', 'pending', 'memories', 'fts_topk', 'recent_dialog'],
  );
});

test('pending candidates + rejected list render with a do-not-repropose section (MEM-02)', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  for (let i = 0; i < 3; i++) {
    await store.propose({ content: `待确认记忆 ${i}`, origin: 'model_inferred', scope: 'global' });
  }
  await store.propose({ content: '被拒记忆甲', origin: 'model_inferred', scope: 'global' });
  await store.propose({ content: '被拒记忆乙', origin: 'model_inferred', scope: 'global' });
  const pending = await store.listPending();
  for (const candidate of pending.filter((item) => item.content.startsWith('被拒'))) {
    await store.reject(candidate.candidateToken);
  }
  const { coreContext, audit } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: NO_SEARCH,
    userMessage: '消息',
  });
  const pendingSegment = find(audit, 'pending');
  assert.equal(pendingSegment.items, 3, '3 live pending candidates');
  assert.ok(coreContext.includes('待确认记忆 0'));
  assert.ok(coreContext.includes('不要再提出'), 'rejected section header (MEM-02)');
  assert.ok(coreContext.includes('被拒记忆甲') || coreContext.includes('被拒记忆乙'));
});

test('memory overflow past the 500-token quota drops oldest, keeps newest, truncated: true', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  // 30 confirmed memories, each ~20 tokens -> far above the 500-token quota.
  for (let i = 0; i < 30; i++) {
    await store.insertMemory({
      content: `确认记忆条目编号${String(i).padStart(3, '0')} 内容文本`,
      origin: 'user_directed',
      scope: 'global',
    });
  }
  const { coreContext, audit } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: NO_SEARCH,
    userMessage: '消息',
  });
  const memoriesSegment = find(audit, 'memories');
  assert.equal(memoriesSegment.truncated, true);
  assert.equal(memoriesSegment.items, 30, 'audit counts all active memories');
  assert.ok(!coreContext.includes('确认记忆条目编号000'), 'oldest dropped from injected text');
  assert.ok(coreContext.includes('确认记忆条目编号029'), 'newest kept');
});

test('FTS hits render one provenance line each (来源: title vN date, MEM-07)', async () => {
  resetMemoryMemoryStore();
  const hits = [
    { title: '需求评审规范', version: 2, updatedAt: '2026-08-01', summary: '摘要内容' },
    { title: 'API 协议', version: 1, updatedAt: '2026-08-02', summary: '摘要内容' },
    { title: '排障手册', version: 3, updatedAt: '2026-08-03', summary: '摘要内容' },
    { title: '上线检查单', version: 1, updatedAt: '2026-08-04', summary: '摘要内容' },
    { title: '踩坑记录', version: 5, updatedAt: '2026-08-05', summary: '摘要内容' },
  ];
  const { coreContext, audit } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: async () => hits,
    userMessage: '需求评审怎么做',
  });
  const ftsSegment = find(audit, 'fts_topk');
  assert.equal(ftsSegment.items, 5);
  assert.ok(coreContext.includes('需求评审规范'));
  assert.ok(coreContext.includes('来源: 需求评审规范 v2 2026-08-01'));
});

test('FTS search throwing degrades to error unavailable — assembly still succeeds', async () => {
  resetMemoryMemoryStore();
  const { audit } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: async () => {
      throw new Error('fts down');
    },
    userMessage: '需求评审怎么做',
  });
  const ftsSegment = find(audit, 'fts_topk');
  assert.equal(ftsSegment.items, 0);
  assert.equal(ftsSegment.error, 'unavailable');
});

test('symbol-only user message skips retrieval entirely (skipped: true)', async () => {
  resetMemoryMemoryStore();
  let searched = false;
  const { audit } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: async () => {
      searched = true;
      return [];
    },
    userMessage: '！！！？？？……——',
  });
  const ftsSegment = find(audit, 'fts_topk');
  assert.equal(ftsSegment.skipped, true);
  assert.equal(ftsSegment.items, 0);
  assert.equal(searched, false, 'searchKnowledge must not be called');
});

test('audit records per-segment {name, items, tokens, truncated} and total <= 2000 hard cap', async () => {
  resetMemoryMemoryStore();
  const { audit } = await assembleInjectedContext({
    buildCore: () => 'x'.repeat(4000), // way over the 600-token core quota
    searchKnowledge: NO_SEARCH,
    userMessage: '消息',
  });
  for (const segment of audit.segments) {
    assert.equal(typeof segment.items, 'number');
    assert.equal(typeof segment.tokens, 'number');
    assert.equal(typeof segment.truncated, 'boolean');
  }
  const coreSegment = find(audit, 'core');
  assert.equal(coreSegment.truncated, true, 'oversized core is truncated too');
  const total = audit.segments.reduce((sum, segment) => sum + segment.tokens, 0);
  assert.ok(total <= 2000, `segment token sum must stay <= 2000, got ${total}`);
});

test('recent_dialog reserves budget only — no message content injected', async () => {
  resetMemoryMemoryStore();
  const { coreContext, audit } = await assembleInjectedContext({
    buildCore: () => 'core',
    searchKnowledge: NO_SEARCH,
    userMessage: '用户刚刚说过的话',
  });
  const recentSegment = find(audit, 'recent_dialog');
  assert.equal(recentSegment.reservedTokens, 1200);
  assert.equal(recentSegment.items, 0);
  assert.ok(!coreContext.includes('用户刚刚说过的话'), 'recent dialog content must not be re-injected');
});

console.log('OK: Phase 15 Plan 02 context assembler passed');
