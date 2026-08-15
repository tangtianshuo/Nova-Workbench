// Phase 15 Plan 01 — shared CJK tokenizer for FTS5 index/query same-source
// segmentation (MEM-06). Pure functions; runs in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toFtsTokens, toFtsIndexedText, toFtsMatchString } from '../ftsTokens';

test('toFtsTokens splits pure CJK into single characters', () => {
  assert.deepEqual(toFtsTokens('需求评审'), ['需', '求', '评', '审']);
});

test('toFtsTokens keeps latin words whole plus per-char CJK, no mixed tokens', () => {
  const tokens = toFtsTokens('PRD 需求评审');
  assert.ok(tokens.includes('prd'), 'latin word lowercased and kept whole');
  assert.ok(tokens.includes('需'), 'CJK chars segmented per character');
  // No token may mix scripts (e.g. 'prd需').
  for (const t of tokens) {
    assert.ok(/^[a-z0-9]+$|^[㐀-鿿]$/.test(t), `unexpected mixed token: ${t}`);
  }
});

test('toFtsTokens dedupes repeated characters', () => {
  assert.equal(toFtsTokens('需求需求').length, 2);
});

test('toFtsIndexedText joins tokens with spaces', () => {
  assert.equal(toFtsIndexedText('需求评审 api'), '需 求 评 审 api');
});

test('toFtsMatchString emits only quoted tokens, stripping FTS5 syntax words', () => {
  const match = toFtsMatchString('需求"OR NEAR');
  assert.equal(match, '"需" "求" "or" "near"');
  assert.ok(!/(^|\s)OR(\s|$)/.test(match), 'no bare OR syntax word');
  assert.ok(!/(^|\s)NEAR(\s|$)/.test(match), 'no bare NEAR syntax word');
  for (const part of match.split(' ')) {
    assert.ok(/^"[^"]*"$/.test(part), `every token must be quoted: ${part}`);
  }
});

test('index/query same source: query tokens all appear in indexed text segmentation', () => {
  const queryTokens = toFtsTokens('需求');
  const indexed = toFtsIndexedText('需求评审').split(' ');
  for (const t of queryTokens) {
    assert.ok(indexed.includes(t), `query token ${t} must be present in indexed form`);
  }
});

console.log('OK: Phase 15 Plan 01 ftsTokens checks passed');
