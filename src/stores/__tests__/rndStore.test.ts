// src/stores/__tests__/rndStore.test.ts
// Run with: npm test
// Self-check per D-08. Asserts the INITIAL.p1 fallback bug (PERSIST-08) is fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useRndStore } from '../rndStore';

const UNKNOWN = 'definitely-unknown-id-xyz';

test('rndStore: unknown productId returns empty arrays, not INITIAL.p1', () => {
  const store = useRndStore.getState();

  assert.deepEqual(store.getKnowledgeForProduct(UNKNOWN), [],
    'getKnowledgeForProduct must return [] for unknown id');
  assert.deepEqual(store.getCodeScaffoldsForProduct(UNKNOWN), [],
    'getCodeScaffoldsForProduct must return [] for unknown id');
  assert.deepEqual(store.getTestCasesForProduct(UNKNOWN), [],
    'getTestCasesForProduct must return [] for unknown id');
});

test('rndStore: getDeliverablesForProduct returns [] AND does not mutate store', () => {
  const before = useRndStore.getState().deliverables;
  const result = useRndStore.getState().getDeliverablesForProduct(UNKNOWN);
  assert.deepEqual(result, [], 'must return [] for unknown id');
  assert.equal(useRndStore.getState().deliverables, before,
    'must NOT write to store on miss for unknown id');
});

test('rndStore: getCompetitorDataForProduct returns EMPTY object for unknown id', () => {
  const c = useRndStore.getState().getCompetitorDataForProduct(UNKNOWN);
  assert.equal(c.productId, '', 'productId must be empty');
  assert.deepEqual(c.radarData, [], 'radarData must be empty');
  assert.deepEqual(c.competitors, [], 'competitors must be empty');
  assert.deepEqual(c.swot.strengths, []);
  assert.deepEqual(c.swot.weaknesses, []);
  assert.deepEqual(c.swot.opportunities, []);
  assert.deepEqual(c.swot.threats, []);
  assert.deepEqual(c.gapAnalysis, []);
});

test('rndStore: getRequirementForProduct returns EMPTY for unknown id', () => {
  const r = useRndStore.getState().getRequirementForProduct(UNKNOWN);
  assert.equal(r.id, '');
  assert.equal(r.productId, '');
  assert.equal(r.title, '');
  assert.deepEqual(r.userStories, []);
  assert.deepEqual(r.useCases, []);
});

test('rndStore: getPrototypeForProduct returns EMPTY for unknown id', () => {
  const p = useRndStore.getState().getPrototypeForProduct(UNKNOWN);
  assert.equal(p.id, '');
  assert.equal(p.title, '');
  assert.deepEqual(p.sections, []);
});

test('rndStore: console.warn fires for unknown productId', () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.join(' ')); };
  try {
    useRndStore.getState().getKnowledgeForProduct(UNKNOWN);
    useRndStore.getState().getCompetitorDataForProduct(UNKNOWN);
  } finally {
    console.warn = orig;
  }
  assert.ok(warns.length >= 2, `expected at least 2 warns, got ${warns.length}`);
  assert.ok(warns.every(w => w.includes('[rndStore]')), 'all warns must be tagged [rndStore]');
});
