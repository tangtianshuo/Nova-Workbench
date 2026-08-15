// Phase 14 Plan 01 — confirmation store: params_hash, persistence, atomic consume,
// TTL expiry, kind discrimination. Runs in Node against the memory impl
// (isTauri() === false); Sqlite impl is exercised via Tauri on real DB boot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMemoryConfirmationStore,
  resetMemoryConfirmationStore,
  ConfirmationStoreError,
  CONFIRMATION_TTL_MS,
} from '../confirmationStore';
import { canonicalJsonStringify, computeParamsHash, sha256Hex } from '../paramsHash';

test('canonical params hash is key-order invariant and array-order sensitive', async () => {
  const a = await computeParamsHash({ a: 1, b: { x: 1, y: 2 } });
  const b = await computeParamsHash({ b: { y: 2, x: 1 }, a: 1 });
  assert.equal(a, b, 'key order must not affect hash at any depth');

  const c = await computeParamsHash({ tags: ['a', 'b'] });
  const d = await computeParamsHash({ tags: ['b', 'a'] });
  assert.notEqual(c, d, 'array order must be preserved (sameDraft parity)');

  assert.match(a, /^[0-9a-f]{64}$/, 'hash must be 64 lowercase hex chars');

  // Canonical form sanity: nested sorted, undefined dropped, array order preserved.
  assert.equal(canonicalJsonStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(canonicalJsonStringify({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canonicalJsonStringify({ a: [3, 1, 2] }), '{"a":[3,1,2]}');
  assert.equal(canonicalJsonStringify(null), 'null');
});

test('sha256Hex matches the known abc vector', async () => {
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('create → get roundtrip preserves params and metadata', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const params = { productId: 'p1', title: 't', tags: ['x'] };
  const row = await store.create({
    kind: 'knowledge_write',
    params,
    summary: 't',
    sessionId: null,
  });

  assert.equal(row.kind, 'knowledge_write');
  assert.equal(row.status, 'pending');
  assert.match(row.paramsHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(row.params, params);
  assert.equal(row.summary, 't');
  assert.equal(row.sessionId, null);
  assert.ok(row.expiresAt > row.createdAt, 'expiresAt must be after createdAt');
  assert.equal(row.confirmedAt, null);
  assert.equal(row.consumedAt, null);
  assert.equal(row.rejectedAt, null);

  const fetched = await store.get(row.confirmationToken);
  assert.ok(fetched);
  assert.deepEqual(fetched.params, params);
  assert.equal(fetched.paramsHash, row.paramsHash);
  // Mutation of returned object must not leak into the store.
  (fetched.params as { title: string }).title = 'MUTATED';
  const refetched = await store.get(row.confirmationToken);
  assert.equal((refetched?.params as { title: string }).title, 't');
});

test('confirm then consume transitions pending → confirmed → consumed', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const created = await store.create({
    kind: 'destructive_action',
    params: { toolName: 'delete', args: { id: '1' } },
    summary: 'delete item 1',
    sessionId: 's1',
  });

  const confirmed = await store.confirm(created.confirmationToken);
  assert.equal(confirmed.status, 'confirmed');
  assert.ok(confirmed.confirmedAt);
  const originalConfirmedAt = confirmed.confirmedAt;

  // Idempotent re-confirm must keep original confirmedAt.
  const reconfirmed = await store.confirm(created.confirmationToken);
  assert.equal(reconfirmed.status, 'confirmed');
  assert.equal(reconfirmed.confirmedAt, originalConfirmedAt);

  const consumed = await store.consume(created.confirmationToken, created.paramsHash);
  assert.equal(consumed.status, 'consumed');
  assert.ok(consumed.consumedAt);
});

test('atomic consume: concurrent double-consume succeeds exactly once', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const created = await store.create({
    kind: 'knowledge_write',
    params: { productId: 'p2', title: 'concurrent' },
    summary: null,
    sessionId: null,
  });
  await store.confirm(created.confirmationToken);

  const [a, b] = await Promise.allSettled([
    store.consume(created.confirmationToken, created.paramsHash),
    store.consume(created.confirmationToken, created.paramsHash),
  ]);

  const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
  const rejected = [a, b].filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one concurrent consume must succeed');
  assert.equal(rejected.length, 1, 'the other must be rejected');
  const reason = (rejected[0] as PromiseRejectedResult).reason as ConfirmationStoreError;
  assert.ok(reason instanceof ConfirmationStoreError);
  assert.equal(reason.code, 'already_settled');
});

test('consume failure modes: not_found / not_confirmed / params_mismatch', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();

  // not_found
  await assert.rejects(
    store.consume('missing-token', 'any-hash'),
    (err: ConfirmationStoreError) => err instanceof ConfirmationStoreError && err.code === 'not_found',
  );

  // not_confirmed (pending, never confirmed)
  const pending = await store.create({
    kind: 'knowledge_write',
    params: { productId: 'p3' },
    summary: null,
    sessionId: null,
  });
  await assert.rejects(
    store.consume(pending.confirmationToken, pending.paramsHash),
    (err: ConfirmationStoreError) => err instanceof ConfirmationStoreError && err.code === 'not_confirmed',
  );

  // params_mismatch (confirmed but with a different params hash)
  const confirmed = await store.create({
    kind: 'destructive_action',
    params: { toolName: 'delete', args: { id: 'x' } },
    summary: 'delete x',
    sessionId: null,
  });
  await store.confirm(confirmed.confirmationToken);
  const tamperedHash = await computeParamsHash({ toolName: 'delete', args: { id: 'x', extra: 'tampered' } });
  await assert.rejects(
    store.consume(confirmed.confirmationToken, tamperedHash),
    (err: ConfirmationStoreError) => err instanceof ConfirmationStoreError && err.code === 'params_mismatch',
  );
});

test('expired candidates cannot be confirmed, consumed, or listed', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const expired = await store.create({
    kind: 'knowledge_write',
    params: { productId: 'p4' },
    summary: null,
    sessionId: null,
    ttlMs: -1000,
  });

  await assert.rejects(
    store.confirm(expired.confirmationToken),
    (err: ConfirmationStoreError) => err instanceof ConfirmationStoreError && err.code === 'expired',
  );
  await assert.rejects(
    store.consume(expired.confirmationToken, expired.paramsHash),
    (err: ConfirmationStoreError) => err instanceof ConfirmationStoreError && err.code === 'expired',
  );

  const active = await store.listActive('knowledge_write');
  assert.equal(active.length, 0, 'expired rows must not appear in listActive');
});

test('reject settles a candidate and blocks later confirm/consume', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const row = await store.create({
    kind: 'destructive_action',
    params: { toolName: 'drop', args: {} },
    summary: 'drop',
    sessionId: null,
  });

  assert.equal(await store.reject(row.confirmationToken), true);
  assert.equal(await store.reject(row.confirmationToken), false, 'second reject must be no-op');

  await assert.rejects(
    store.confirm(row.confirmationToken),
    (err: ConfirmationStoreError) => err instanceof ConfirmationStoreError && err.code === 'already_settled',
  );
  await assert.rejects(
    store.consume(row.confirmationToken, row.paramsHash),
    (err: ConfirmationStoreError) => err instanceof ConfirmationStoreError && err.code === 'already_settled',
  );

  const active = await store.listActive('destructive_action');
  assert.equal(active.length, 0, 'rejected rows must not appear in listActive');
});

test('listActive filters by kind and orders by createdAt ASC', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();

  const k1 = await store.create({
    kind: 'knowledge_write',
    params: { productId: 'a' },
    summary: null,
    sessionId: null,
  });
  await store.create({
    kind: 'destructive_action',
    params: { toolName: 'x' },
    summary: null,
    sessionId: null,
  });
  // Ensure createdAt differs (ISO strings have ms precision; 2ms gap is safe).
  await new Promise((r) => setTimeout(r, 2));
  const k2 = await store.create({
    kind: 'knowledge_write',
    params: { productId: 'b' },
    summary: null,
    sessionId: null,
  });

  const kRows = await store.listActive('knowledge_write');
  assert.equal(kRows.length, 2);
  assert.equal(kRows[0].confirmationToken, k1.confirmationToken);
  assert.equal(kRows[1].confirmationToken, k2.confirmationToken);

  const dRows = await store.listActive('destructive_action');
  assert.equal(dRows.length, 1);
});

// Sanity: TTL constant matches the documented 24h window.
assert.equal(CONFIRMATION_TTL_MS, 24 * 60 * 60 * 1000);

console.log('OK: Phase 14 Plan 01 confirmation store checks passed');
