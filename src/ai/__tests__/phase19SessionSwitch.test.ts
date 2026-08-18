// Phase 19 Plan 01 — switch-restore suite (5 tests, SESS-03).
// restoreSession(sessionId): verbatim per-session restore, cross-session isolation,
// unknown-id null, per-session dedupe, orphan settlement idempotency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chatSession';
import { getEventStore, resetMemoryEventStore } from '../events/eventStore';
import {
  resetRestoreForTesting,
  restoreSession,
} from '../sessionRestore';

async function appendTurn(
  session: ChatSession,
  userText: string,
  assistantText: string,
) {
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', userText);
  session.addMessage('assistant', assistantText);
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 0 });
  await session.flushEvents();
}

function resetAll() {
  resetMemoryEventStore();
  resetRestoreForTesting();
}

/** Visible chat messages: user + plain assistant text (excluding tool-call stubs). */
function visibleMessages(session: ChatSession) {
  return session
    .getAllMessages()
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content !== ''))
    .map((m) => ({ role: m.role, content: m.content }));
}

test('verbatim restore: explicit sessionId restores original messages exactly', async () => {
  resetAll();
  const live = new ChatSession({ sessionId: 'session-a' });
  await appendTurn(live, '第一问', '第一答');
  await appendTurn(live, '第二问', '第二答');

  const expected = visibleMessages(live);
  assert.equal(expected.length, 4);

  const restored = await restoreSession('session-a');
  assert.ok(restored !== null);
  assert.equal(restored.sessionId, 'session-a');
  assert.deepEqual(visibleMessages(restored.session), expected);
});

test('independent sessions: restoreSession(B) returns B, not A', async () => {
  resetAll();
  const a = new ChatSession({ sessionId: 'session-a' });
  await appendTurn(a, 'A问题', 'A回答');
  const b = new ChatSession({ sessionId: 'session-b' });
  await appendTurn(b, 'B问题', 'B回答');

  const restored = await restoreSession('session-b');
  assert.ok(restored !== null);
  assert.equal(restored.sessionId, 'session-b');
  const contents = restored.session.getAllMessages().map((m) => m.content);
  assert.ok(contents.includes('B回答'));
  assert.ok(!contents.includes('A回答'), 'no cross-session bleed');
});

test('unknown sessionId resolves to null, does not throw', async () => {
  resetAll();
  const a = new ChatSession({ sessionId: 'session-a' });
  await appendTurn(a, '问题', '回答');

  assert.equal(await restoreSession('nonexistent'), null);
});

test('dedupe is per-session: same id shares a promise, different ids run independently', async () => {
  resetAll();
  const a = new ChatSession({ sessionId: 'session-a' });
  await appendTurn(a, 'A问题', 'A回答');
  const b = new ChatSession({ sessionId: 'session-b' });
  await appendTurn(b, 'B问题', 'B回答');

  const eventsBefore = (await getEventStore().listEvents('session-a')).length;

  const p1 = restoreSession('session-a');
  const p2 = restoreSession('session-a');
  assert.equal(p1, p2, 'concurrent same-session restores share one promise');

  const pb = restoreSession('session-b');
  assert.notEqual(pb, p1, 'different sessions restore independently');

  const [r1, rb] = await Promise.all([p1, pb]);
  assert.equal(r1!.sessionId, 'session-a');
  assert.equal(rb!.sessionId, 'session-b');

  const eventsAfter = (await getEventStore().listEvents('session-a')).length;
  assert.equal(eventsAfter, eventsBefore, 'no duplicate settlement appended');
});

test('orphan settlement on explicit path: marker appended, second restore idempotent', async () => {
  resetAll();
  const live = new ChatSession({ sessionId: 'orphan-a' });
  await appendTurn(live, '第一轮', '第一轮结论');

  // Crash tail: dangling tool_call with no tool_result
  const orphanCallId = crypto.randomUUID();
  live.setCorrelationId(crypto.randomUUID());
  live.addMessage('user', '帮我删除');
  live.addMessage('assistant', '', orphanCallId, 'deleteTask', { args: {} });
  await live.flushEvents();

  const first = await restoreSession('orphan-a');
  assert.ok(first !== null);
  assert.deepEqual(first.interruptedToolCallIds, [orphanCallId]);

  const marker = (await getEventStore().listEvents('orphan-a'))
    .find((e) => e.eventType === 'tool_result' && e.payload.toolCallId === orphanCallId);
  assert.ok(marker, 'interrupted marker appended on explicit path');
  assert.equal(marker!.payload.interrupted, true);

  resetRestoreForTesting();
  const second = await restoreSession('orphan-a');
  assert.ok(second !== null);
  assert.deepEqual(second.interruptedToolCallIds, [], 'second restore finds zero orphans');
});

console.log('OK: Phase 19 Plan 01 session switch restore checks passed');
