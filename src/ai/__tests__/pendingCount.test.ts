import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectPendingCount,
  shouldToastOnTransition,
} from '../pendingCount';

const emptyConsole = {
  pendingConfirmation: null,
  pendingDestructiveAction: null,
  pendingExecApproval: null,
  pendingFsWrite: null,
  pendingPmWrite: null,
  pendingMemory: null,
  pendingPrdDraft: null,
};

test('shouldToastOnTransition: 0→0 false', () => {
  assert.equal(shouldToastOnTransition(0, 0), false);
});

test('shouldToastOnTransition: 0→1 true (首卡到达)', () => {
  assert.equal(shouldToastOnTransition(0, 1), true);
});

test('shouldToastOnTransition: 1→2 false (已有卡再加)', () => {
  assert.equal(shouldToastOnTransition(1, 2), false);
});

test('shouldToastOnTransition: 2→0 false (清空)', () => {
  assert.equal(shouldToastOnTransition(2, 0), false);
});

test('selectPendingCount: 全空 = 0', () => {
  assert.equal(selectPendingCount(emptyConsole, []), 0);
});

test('selectPendingCount: 7 nullable 字段各算 1', () => {
  const state = {
    ...emptyConsole,
    pendingConfirmation: { id: 1 } as never,
    pendingPmWrite: { id: 2 } as never,
  };
  assert.equal(selectPendingCount(state, []), 2);
});

test('selectPendingCount: pendingDeliverables 算 length', () => {
  assert.equal(selectPendingCount(emptyConsole, [{}, {}, {}]), 3);
});
