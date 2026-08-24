// Phase 24 Plan 03 (carry-in from 23-VERIFICATION) — exec_approval / fs_write
// candidates re-surface after a simulated restart via listPendingExecApprovals /
// listPendingFsWrites; expired (>24h TTL) and settled candidates are filtered.
// Runs in Node against the memory confirmation store (isTauri() === false).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listPendingExecApprovals,
  listPendingFsWrites,
} from '../confirmations';
import {
  getMemoryConfirmationStore,
  resetMemoryConfirmationStore,
} from '../confirmationStore';

test('pending exec_approval candidate restores; expired and other-session ones are filtered', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const live = await store.create({
    kind: 'exec_approval',
    params: { command: 'git', args: ['status'], cwd: '/tmp' },
    summary: 'git status',
    sessionId: 's1',
  });
  // Expired: created with a negative TTL (>24h-old equivalent).
  await store.create({
    kind: 'exec_approval',
    params: { command: 'npm', args: ['install'], cwd: '/tmp' },
    summary: 'npm install',
    sessionId: 's1',
    ttlMs: -1000,
  });
  // Different session — must not leak into s1's restore.
  await store.create({
    kind: 'exec_approval',
    params: { command: 'cargo', args: ['build'], cwd: '/tmp' },
    summary: 'cargo build',
    sessionId: 's2',
  });

  const pending = await listPendingExecApprovals('s1');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].confirmationToken, live.confirmationToken);
  assert.equal(pending[0].command, 'git');
  assert.deepEqual(pending[0].args, ['status']);
  assert.equal(pending[0].summary, 'git status');
  assert.equal(pending[0].sessionId, 's1');
});

test('pending fs_write candidate restores with card shape parity; settled ones disappear', async () => {
  resetMemoryConfirmationStore();
  const store = getMemoryConfirmationStore();
  const live = await store.create({
    kind: 'fs_write',
    params: { operation: 'write', path: 'docs/a.md', content: 'hello', root: '/w' },
    summary: 'write docs/a.md (5 bytes)',
    sessionId: 's1',
  });

  let pending = await listPendingFsWrites('s1');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].confirmationToken, live.confirmationToken);
  assert.equal(pending[0].operation, 'write');
  assert.equal(pending[0].path, 'docs/a.md');
  assert.equal(pending[0].content, 'hello');
  assert.equal(pending[0].summary, 'write docs/a.md (5 bytes)');

  // Settle (confirm + consume) → card no longer restores.
  await store.confirm(live.confirmationToken);
  const hash = await import('../paramsHash').then((m) => m.computeParamsHash(live.params as Record<string, unknown>));
  await store.consume(live.confirmationToken, hash);
  pending = await listPendingFsWrites('s1');
  assert.equal(pending.length, 0);
});
