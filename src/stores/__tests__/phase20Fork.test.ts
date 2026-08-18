// Phase 20 Plan 02 — forkFromMessage guards + happy path (FORK-02).
// Store-level: streaming guard, store-only ack not forkable, fork creates a
// child session row + marker event and jumps with verbatim prefix history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../../ai/chatSession';
import { resetMemoryEventStore, getEventStore } from '../../ai/events/eventStore';
import { resetRestoreForTesting } from '../../ai/sessionRestore';
import { resetMemorySessionRepo } from '../../ai/sessionRepo';
import { sessionRef, useChatConsoleStore } from '../chatConsoleStore';

async function appendTurn(session: ChatSession, userText: string, assistantText: string) {
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', userText);
  session.addMessage('assistant', assistantText);
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 0 });
  await session.flushEvents();
}

function resetAll() {
  resetMemoryEventStore();
  resetMemorySessionRepo();
  resetRestoreForTesting();
  useChatConsoleStore.setState({
    messages: [],
    loading: false,
    restoreComplete: false,
    pendingConfirmation: null,
    pendingDestructiveAction: null,
    pendingPrdDraft: null,
    pendingMemory: null,
    forkableIds: new Set<number>(),
    parentSessionId: null,
    parentTitle: null,
    activeSessionId: sessionRef.current.sessionId,
  });
}

test('FORK guard: streaming blocks forkFromMessage, no session created', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'fork-guard' });
  await appendTurn(session, '问题', '回答');
  await useChatConsoleStore.getState().switchSession('fork-guard');
  useChatConsoleStore.setState({ loading: true });

  await useChatConsoleStore.getState().forkFromMessage(useChatConsoleStore.getState().messages[1].id);
  assert.equal(useChatConsoleStore.getState().activeSessionId, 'fork-guard');
});

test('FORK: store-only ack message is not forkable (no backing event)', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'fork-ack' });
  await appendTurn(session, '问题', '回答');
  await useChatConsoleStore.getState().switchSession('fork-ack');
  // Simulate a store-only ack injection (confirm/reject action message).
  useChatConsoleStore.setState((state) => ({
    messages: [...state.messages, { id: 9999, role: 'assistant' as const, content: '已取消本次删除操作。' }],
  }));

  await useChatConsoleStore.getState().forkFromMessage(9999);
  assert.equal(useChatConsoleStore.getState().activeSessionId, 'fork-ack');
});

test('FORK: forkFromMessage creates child, jumps, history is the parent prefix', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'fork-parent' });
  await appendTurn(session, '第一问', '第一答');
  await appendTurn(session, '第二问', '第二答');
  await useChatConsoleStore.getState().switchSession('fork-parent');
  const firstAssistant = useChatConsoleStore.getState().messages[1];
  const forkableBefore = new Set(useChatConsoleStore.getState().forkableIds);
  assert.ok(forkableBefore.has(firstAssistant.id), 'event-backed assistant message is forkable');

  await useChatConsoleStore.getState().forkFromMessage(firstAssistant.id);

  const state = useChatConsoleStore.getState();
  assert.notEqual(state.activeSessionId, 'fork-parent');
  // Child conversation = parent prefix cut at the FIRST turn only.
  assert.deepEqual(
    state.messages.map((m) => m.content),
    ['第一问', '第一答'],
  );
  // Child has its own marker event row (restoreSession non-null guarantee).
  const childEvents = await getEventStore().listEvents(state.activeSessionId);
  assert.ok(childEvents.some((e) => e.eventType === 'session_forked'));
  // Parent untouched.
  const parentEvents = await getEventStore().listEvents('fork-parent');
  assert.ok(parentEvents.every((e) => e.eventType !== 'session_forked'));
});
