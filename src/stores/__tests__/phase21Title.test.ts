// Phase 21 Plan 02 — session auto-titling (TITLE-01/02).
// Part 1: generateSessionTitle LLM + fallback chain.
// Part 2 (appended in Task 2): maybeGenerateTitle store trigger + sessionListVersion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSessionTitle, TITLE_MAX_CHARS } from '../../ai/titleGenerator';

const LONG_USER_MESSAGE = '帮我分析一下BLCaptain在付费榜的表现以及…'; // > 20 chars

test('TITLE: LLM returns a title -> source llm', async () => {
  const result = await generateSessionTitle({
    firstUserMessage: LONG_USER_MESSAGE,
    transcript: 'user: ...',
    provider: 'deepseek',
    llm: async () => ({ content: '竞品扫描选品分析', toolCalls: [] }),
  } as Parameters<typeof generateSessionTitle>[0]);
  assert.deepEqual(result, { title: '竞品扫描选品分析', source: 'llm' });
});

test('TITLE: LLM throws -> fallback to first user message truncated to 20', async () => {
  const result = await generateSessionTitle({
    firstUserMessage: LONG_USER_MESSAGE,
    transcript: 'user: ...',
    provider: 'deepseek',
    llm: async () => { throw new Error('boom'); },
  } as Parameters<typeof generateSessionTitle>[0]);
  assert.equal(result.source, 'fallback');
  assert.equal(result.title, LONG_USER_MESSAGE.slice(0, TITLE_MAX_CHARS));
  assert.ok(result.title.length <= TITLE_MAX_CHARS);
});

test('TITLE: LLM returns empty string -> fallback path', async () => {
  const result = await generateSessionTitle({
    firstUserMessage: LONG_USER_MESSAGE,
    transcript: 'user: ...',
    provider: 'deepseek',
    llm: async () => ({ content: '   ', toolCalls: [] }),
  } as Parameters<typeof generateSessionTitle>[0]);
  assert.equal(result.source, 'fallback');
});

test('TITLE: LLM title longer than 20 chars is truncated', async () => {
  const result = await generateSessionTitle({
    firstUserMessage: '短问题',
    transcript: 'user: ...',
    provider: 'deepseek',
    llm: async () => ({ content: '这是一个非常非常非常非常非常非常长的标题', toolCalls: [] }),
  } as Parameters<typeof generateSessionTitle>[0]);
  assert.equal(result.source, 'llm');
  assert.equal(result.title.length, TITLE_MAX_CHARS);
});
