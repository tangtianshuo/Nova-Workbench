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

/* === Task 2: maybeGenerateTitle store trigger + sessionListVersion === */
import { ChatSession } from '../../ai/chatSession';
import { resetMemoryEventStore, getEventStore } from '../../ai/events/eventStore';
import { resetMemorySessionRepo, getMemorySessionRepo } from '../../ai/sessionRepo';
import { resetRestoreForTesting } from '../../ai/sessionRestore';
import { useChatConsoleStore } from '../chatConsoleStore';

async function seedTurn(sessionId: string, userText: string) {
  const session = new ChatSession({ sessionId });
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', userText);
  session.addMessage('assistant', '回答');
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 0 });
  await session.flushEvents();
}

function resetStoreState() {
  resetMemoryEventStore();
  resetMemorySessionRepo();
  resetRestoreForTesting();
  useChatConsoleStore.setState({ sessionListVersion: 0, activeSessionId: 'irrelevant' });
}

test('TITLE trigger: titled session -> no-op (no updateTitle, version unchanged)', async () => {
  resetStoreState();
  const repo = getMemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 'titled-s', workspaceId: null });
  await repo.updateTitle('titled-s', '已有标题', 'llm');
  const before = useChatConsoleStore.getState().sessionListVersion;

  await useChatConsoleStore.getState().maybeGenerateTitle('titled-s');

  assert.equal(useChatConsoleStore.getState().sessionListVersion, before);
  const meta = await repo.getSession('titled-s');
  assert.equal(meta?.title, '已有标题');
});

test('TITLE trigger: untitled session -> updateTitle with generated title, version +1', async () => {
  resetStoreState();
  const repo = getMemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 'untitled-s', workspaceId: null });
  await seedTurn('untitled-s', '帮我看看竞品数据');

  const before = useChatConsoleStore.getState().sessionListVersion;
  await useChatConsoleStore.getState().maybeGenerateTitle('untitled-s', async () => ({ content: '竞品数据分析', toolCalls: [] }));

  const meta = await repo.getSession('untitled-s');
  assert.equal(meta?.title, '竞品数据分析');
  assert.equal(meta?.titleSource, 'llm');
  assert.equal(useChatConsoleStore.getState().sessionListVersion, before + 1);
});

test('TITLE trigger: sessionId captured at trigger time, not global active', async () => {
  resetStoreState();
  const repo = getMemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 'session-a', workspaceId: null });
  await repo.upsertSessionMeta({ sessionId: 'session-b', workspaceId: null });
  await seedTurn('session-a', '问题A');
  useChatConsoleStore.setState({ activeSessionId: 'session-b' });

  await useChatConsoleStore.getState().maybeGenerateTitle('session-a', async () => ({ content: 'A的标题', toolCalls: [] }));

  assert.equal((await repo.getSession('session-a'))?.title, 'A的标题');
  assert.equal((await repo.getSession('session-b'))?.title, null);
});
