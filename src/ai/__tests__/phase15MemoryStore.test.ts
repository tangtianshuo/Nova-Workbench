// Phase 15 Plan 01 — memory store: anti-flood trio (dedup / cap / TTL), atomic
// conditional consume, supersedes version chain, user_directed auto-confirm.
// Runs in Node against the memory impl (isTauri() === false); Sqlite impl is
// exercised via Tauri on real DB boot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMemoryMemoryStore,
  resetMemoryMemoryStore,
  MemoryStoreError,
  MEMORY_CANDIDATE_TTL_MS,
  MEMORY_CANDIDATE_CAP,
} from '../memoryStore';

test('MEM-03 dedup: same content twice -> second propose deduplicated, one pending', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const input = { content: '用户偏好深色主题', origin: 'model_inferred' as const, scope: 'global' as const };
  const first = await store.propose(input);
  const second = await store.propose(input);
  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.candidateToken, first.candidateToken, 'dedup must return the existing token');
  assert.equal((await store.listPending()).length, 1);
});

test('MEM-03 cap: 21st distinct propose evicts oldest pending, listPending stays <= 20', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const tokens: string[] = [];
  for (let i = 0; i < 21; i++) {
    const r = await store.propose({
      content: `记忆候选内容编号 ${i}`,
      origin: 'model_inferred',
      scope: 'global',
    });
    tokens.push(r.candidateToken);
  }
  const pending = await store.listPending();
  assert.ok(pending.length <= MEMORY_CANDIDATE_CAP, `pending must be <= cap, got ${pending.length}`);
  const oldest = await store.get(tokens[0]);
  assert.ok(oldest, 'oldest candidate row must still be readable');
  assert.ok(oldest.expiresAt <= new Date().toISOString(), 'oldest pending must have expiresAt forced to past');
  const notOldest = await store.get(tokens[1]);
  assert.ok(notOldest && notOldest.expiresAt > new Date().toISOString(), 'second-oldest must survive');
});

test('MEM-02 rejected content is never re-proposed: dedup hit with previously_rejected', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const input = { content: '用户讨厌弹窗提醒', origin: 'model_inferred' as const, scope: 'global' as const };
  const first = await store.propose(input);
  assert.equal(await store.reject(first.candidateToken), true);
  const again = await store.propose(input);
  assert.equal(again.deduplicated, true);
  assert.equal(again.reason, 'previously_rejected');
  assert.equal((await store.listPending()).length, 0, 'no new pending row may appear');
  const rejectedList = await store.listRejected();
  assert.equal(rejectedList.length, 1);
});

test('MEM-01 confirm -> consumeIntoMemories lands a memory; repeat consume throws already_settled', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const p = await store.propose({ content: '上线窗口是每周四', origin: 'model_inferred', scope: 'global' });
  await store.confirm(p.candidateToken);
  const record = await store.consumeIntoMemories(p.candidateToken);
  assert.equal(record.content, '上线窗口是每周四');
  assert.equal(record.sourceCandidateToken, p.candidateToken);
  const active = await store.listActiveMemories();
  assert.ok(active.some((m) => m.content === '上线窗口是每周四'));
  const candidate = await store.get(p.candidateToken);
  assert.equal(candidate?.status, 'consumed');
  await assert.rejects(
    store.consumeIntoMemories(p.candidateToken),
    (err: MemoryStoreError) => err instanceof MemoryStoreError && err.code === 'already_settled',
  );
});

test('MEM-05 supersedes chain: old row marked superseded, history preserved, only v2 active', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const v1 = await store.insertMemory({ content: 'v1 事实', origin: 'model_inferred', scope: 'global' });
  const v2 = await store.insertMemory({
    content: 'v2 事实',
    origin: 'model_inferred',
    scope: 'global',
    memoryId: v1.memoryId,
    supersedesRowid: v1.memoryRowid,
  });
  assert.equal(v2.version, 2, 'version must increment per memory_id');
  const all = await store.listAllMemories();
  assert.equal(all.length, 2, 'history rows must be preserved');
  const v1Row = all.find((m) => m.memoryRowid === v1.memoryRowid);
  assert.ok(v1Row?.supersededAt, 'v1 supersededAt must be set');
  const active = await store.listActiveMemories();
  assert.equal(active.length, 1);
  assert.equal(active[0].content, 'v2 事实');
});

test('MEM-03 derived expiry: expired candidate hidden from listPending but still readable via get', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const p = await store.propose({
    content: '即将过期的候选',
    origin: 'model_inferred',
    scope: 'global',
    ttlMs: -1000,
  });
  assert.equal((await store.listPending()).length, 0, 'expired pending must not be listed');
  const row = await store.get(p.candidateToken);
  assert.ok(row, 'get must still read the row (derived expiry, no status write)');
  assert.equal(row.status, 'pending', 'expiry is derived — status must stay pending');
});

test('stats observable: dedupHits and evictions counted, pendingCount live', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  await store.propose({ content: '种子候选 A', origin: 'model_inferred', scope: 'global' });
  await store.propose({ content: '种子候选 A', origin: 'model_inferred', scope: 'global' }); // dedup hit
  // Fill to cap: A + 19 more = 20 pending, then the 21st distinct evicts A.
  for (let i = 0; i < 20; i++) {
    await store.propose({ content: `填充候选 ${i}`, origin: 'model_inferred', scope: 'global' });
  }
  const stats = await store.stats();
  assert.equal(stats.dedupHits, 1);
  assert.equal(stats.evictions, 1);
  assert.equal(stats.pendingCount, MEMORY_CANDIDATE_CAP);
});

test('cascade: deleteByProduct soft-deletes product memories, global survives', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const p = await store.propose({
    content: '产品 P1 的发布节奏是双周',
    origin: 'model_inferred',
    scope: 'product',
    productId: 'p1',
  });
  await store.confirm(p.candidateToken);
  await store.consumeIntoMemories(p.candidateToken);
  await store.insertMemory({ content: '全局记忆', origin: 'model_inferred', scope: 'global' });

  await store.deleteByProduct('p1');
  const active = await store.listActiveMemories();
  assert.ok(!active.some((m) => m.productId === 'p1'), 'product memories must leave active list');
  assert.ok(active.some((m) => m.content === '全局记忆'), 'global memories must survive');
  const all = await store.listAllMemories();
  const productRow = all.find((m) => m.productId === 'p1');
  assert.ok(productRow?.deletedAt, 'soft delete must stamp deleted_at, row preserved');
});

test('MEM-01 locked decision: user_directed propose auto-confirms straight into memories', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const r = await store.propose({
    content: '记住我用深色主题',
    origin: 'user_directed',
    scope: 'global',
  });
  assert.equal(r.ok, true);
  assert.equal(r.autoConfirmed, true, 'user explicit 记住 must bypass pending queue');
  assert.equal(typeof r.memoryRowid, 'number');
  const candidate = await store.get(r.candidateToken);
  assert.equal(candidate?.status, 'consumed');
  assert.equal((await store.listPending()).length, 0, 'auto-consumed candidate must not occupy pending cap');
  const active = await store.listActiveMemories();
  const memory = active.find((m) => m.content === '记住我用深色主题');
  assert.ok(memory, 'memory must be active');
  assert.equal(memory?.sourceCandidateToken, r.candidateToken, 'audit chain: source_candidate_token preserved');
  const recent = await store.listRecentUserDirected();
  assert.equal(recent.length, 1);
});

test('user_directed revives a previously rejected candidate (explicit instruction beats history)', async () => {
  resetMemoryMemoryStore();
  const store = getMemoryMemoryStore();
  const first = await store.propose({ content: '别记这条', origin: 'model_inferred', scope: 'global' });
  await store.reject(first.candidateToken);
  const revived = await store.propose({ content: '别记这条', origin: 'user_directed', scope: 'global' });
  assert.equal(revived.autoConfirmed, true);
  const active = await store.listActiveMemories();
  assert.ok(active.some((m) => m.content === '别记这条'));
});

// Sanity: locked constants.
assert.equal(MEMORY_CANDIDATE_TTL_MS, 7 * 24 * 60 * 60 * 1000);
assert.equal(MEMORY_CANDIDATE_CAP, 20);

console.log('OK: Phase 15 Plan 01 memory store checks passed');
