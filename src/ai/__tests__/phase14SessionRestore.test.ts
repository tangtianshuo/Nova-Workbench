// Phase 14 Plan 04 — session restore suite (9 tests).
// EVT-04: after restart, the most recent session is restored with crash-tail cut,
// orphan tool_calls marked interrupted (never re-executed), and pending confirmations
// re-surfaced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chatSession';
import {
  getEventStore,
  resetMemoryEventStore,
} from '../events/eventStore';
import { checkEventStream } from '../events/invariants';
import {
  createKnowledgeWriteCandidate,
  createDestructiveActionCandidate,
} from '../confirmations';
import { resetMemoryConfirmationStore } from '../confirmationStore';
import {
  resetRestoreForTesting,
  restoreLatestSession,
} from '../sessionRestore';

async function appendTurn(
  session: ChatSession,
  userText: string,
  assistantText: string,
  opts?: { toolName?: string; endTurn?: boolean },
) {
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', userText);
  if (opts?.toolName) {
    const toolCallId = crypto.randomUUID();
    session.addMessage('assistant', '', toolCallId, opts.toolName, { args: {} });
    session.addMessage('tool', `[tool_result ${opts.toolName}] {"ok":true}`, toolCallId, opts.toolName, { ok: true });
  }
  session.addMessage('assistant', assistantText);
  if (opts?.endTurn !== false) {
    session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: opts?.toolName ? 1 : 0 });
  }
  await session.flushEvents();
}

function resetAll() {
  resetMemoryEventStore();
  resetMemoryConfirmationStore();
  resetRestoreForTesting();
}

test('returns null when no session exists', async () => {
  resetAll();
  assert.equal(await restoreLatestSession(), null);
});

test('restores the most recent of multiple sessions', async () => {
  resetAll();
  const sessionA = new ChatSession({ sessionId: 'session-a' });
  await appendTurn(sessionA, '问题A', '回答A');

  await new Promise((resolve) => setTimeout(resolve, 5));

  const sessionB = new ChatSession({ sessionId: 'session-b' });
  await appendTurn(sessionB, '问题B', '回答B');

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);
  assert.equal(restored.sessionId, 'session-b');

  const messages = restored.session.getAllMessages();
  const contents = messages.map((m) => m.content);
  assert.ok(contents.includes('问题B'), 'must include session-B content');
  assert.ok(contents.includes('回答B'), 'must include session-B content');
  assert.ok(!contents.includes('问题A'), 'must NOT include session-A content');
});

test('crash tail is cut to the last complete turn', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'cut-session' });
  await appendTurn(session, '第一轮', '第一轮结论');

  // CRASH TAIL: user message + unpaired tool_call (orphan), no turn_ended
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '继续处理');
  session.addMessage('assistant', '', crypto.randomUUID(), 'deleteTask', { args: {} });
  await session.flushEvents();

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);

  const events = await getEventStore().listEvents('cut-session');
  const firstTurnEndedSeq = events.find((e) => e.eventType === 'turn_ended')!.seq;
  assert.equal(restored.cutSeq, firstTurnEndedSeq);

  // The orphan tool_call gets an interrupted marker appended.
  // Original crash tail: 2 events (user + tool_call) + 1 marker = 3 trimmed events.
  assert.equal(restored.trimmedTailEventCount, 3);
  assert.equal(restored.interruptedToolCallIds.length, 1);

  const messages = restored.session.getAllMessages();
  const contents = messages.map((m) => m.content);
  assert.ok(contents.includes('第一轮结论'), 'complete turn content present');
  assert.ok(!contents.includes('继续处理'), 'crash-tail content excluded from projection');
});

test('orphan tool_call is marked interrupted — appended event, pairing restored', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'orphan-session' });
  await appendTurn(session, '第一轮', '第一轮结论');

  // Crash tail: user message + unpaired tool_call with known ID
  const orphanCallId = crypto.randomUUID();
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '帮我删除');
  session.addMessage('assistant', '', orphanCallId, 'deleteTask', { args: {} });
  await session.flushEvents();

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);
  assert.deepEqual(restored.interruptedToolCallIds, [orphanCallId]);

  const events = await getEventStore().listEvents('orphan-session');
  const marker = events.find((e) => e.eventType === 'tool_result' && e.payload.toolCallId === orphanCallId);
  assert.ok(marker, 'interrupted marker must exist');
  assert.equal(marker!.payload.ok, false);
  assert.equal(marker!.payload.interrupted, true);
  assert.equal(marker!.payload.reason, 'app-restart');

  // Stream is pairing-balanced after the marker.
  assert.deepEqual(checkEventStream(events), []);

  // Marker lives in the trimmed tail (seq > cutSeq).
  assert.ok(marker!.seq > restored.cutSeq, 'marker must be in the trimmed tail');
});

test('restore is idempotent — a second restore appends nothing', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'idempotent-session' });
  await appendTurn(session, '第一轮', '第一轮结论');

  const orphanCallId = crypto.randomUUID();
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '继续');
  session.addMessage('assistant', '', orphanCallId, 'deleteTask', { args: {} });
  await session.flushEvents();

  const first = await restoreLatestSession();
  assert.ok(first !== null);
  const eventsAfter1 = await getEventStore().listEvents('idempotent-session');

  resetRestoreForTesting();
  const second = await restoreLatestSession();
  assert.ok(second !== null);
  const eventsAfter2 = await getEventStore().listEvents('idempotent-session');

  assert.equal(eventsAfter2.length, eventsAfter1.length, 'no new events appended on second restore');
  assert.equal(
    eventsAfter2.filter((e) => e.payload.interrupted === true).length,
    1,
    'exactly one interrupted marker exists',
  );
  assert.deepEqual(second.interruptedToolCallIds, [], 'second restore finds no orphans (marker counts as result)');
});

test('restore never re-executes tools — only tool_result events are appended', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'no-reexec-session' });
  await appendTurn(session, '第一轮', '第一轮结论');

  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '删除');
  session.addMessage('assistant', '', crypto.randomUUID(), 'deleteTask', { args: {} });
  session.addMessage('assistant', '', crypto.randomUUID(), 'bulkDeleteTasks', { args: {} });
  await session.flushEvents();

  const eventsBefore = await getEventStore().listEvents('no-reexec-session');
  const crashedEventIds = new Set(eventsBefore.map((e) => e.eventId));

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);

  const eventsAfter = await getEventStore().listEvents('no-reexec-session');
  const newEvents = eventsAfter.filter((e) => !crashedEventIds.has(e.eventId));

  assert.equal(newEvents.length, restored.interruptedToolCallIds.length, 'one new event per orphan');
  assert.ok(newEvents.every((e) => e.eventType === 'tool_result'), 'all new events are tool_result');
  assert.ok(!newEvents.some((e) => e.eventType === 'tool_call'), 'no tool_call re-emitted');
});

test('no complete turn at all — cutSeq 0 and empty LLM projection', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'no-turn-session' });
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '第一个问题');
  session.addMessage('assistant', '', crypto.randomUUID(), 'listTasks', { args: {} });
  await session.flushEvents();

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);
  assert.equal(restored.cutSeq, 0);
  assert.deepEqual(restored.session.getAllMessages(), []);
  assert.deepEqual(restored.session.getMessagesForLLM(), []);
  assert.equal(restored.interruptedToolCallIds.length, 1, 'orphan still gets interrupted marker');
});

test('pending confirmation candidates re-surface after restore', async () => {
  resetAll();

  // Create pending candidates before the crash.
  const kw = await createKnowledgeWriteCandidate({
    productId: 'p1',
    operation: 'created',
    title: '重启候选',
    category: '业务规则',
    tags: ['重启'],
    content: '内容',
    summary: 's',
    author: 'a',
    readTime: 'r',
  });
  const da = await createDestructiveActionCandidate('deleteTask', { taskId: 'task-x' }, '删除任务后将无法恢复。');

  // One complete chat turn.
  const session = new ChatSession({ sessionId: 'candidate-session' });
  await appendTurn(session, '你好', '你好！');

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);
  assert.equal(restored.pendingKnowledgeWrites.length, 1);
  assert.equal(restored.pendingKnowledgeWrites[0].confirmationToken, kw.confirmationToken);
  assert.equal(restored.pendingKnowledgeWrites[0].title, '重启候选');
  assert.equal(restored.pendingDestructiveActions.length, 1);
  assert.equal(restored.pendingDestructiveActions[0].confirmationToken, da.confirmationToken);
  assert.equal(restored.pendingDestructiveActions[0].toolName, 'deleteTask');
});

test('tokenBudget is restored from the session_created payload', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'budget-session', tokenBudget: 4321 });
  await appendTurn(session, '问题', '回答');

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);
  assert.equal(restored.session.tokenBudget, 4321, 'tokenBudget round-trips from session_created payload');
});

console.log('OK: Phase 14 Plan 04 session restore checks passed');
