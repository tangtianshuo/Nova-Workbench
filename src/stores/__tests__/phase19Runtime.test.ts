// Phase 19 Plan 02 — runtime lifecycle + guard suite (6 tests, SESS-02/03/04).
// Store-level: startup fresh session, switch restores verbatim history,
// streaming guards on session switch and workspace switch, workspace switch
// ends session, unknown session not-found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../../ai/chatSession';
import { resetMemoryEventStore } from '../../ai/events/eventStore';
import { resetRestoreForTesting } from '../../ai/sessionRestore';
import { sessionRef, useChatConsoleStore } from '../chatConsoleStore';
import { useWorkspaceStore } from '../workspaceStore';

async function appendTurn(session: ChatSession, userText: string, assistantText: string) {
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', userText);
  session.addMessage('assistant', assistantText);
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 0 });
  await session.flushEvents();
}

async function seedSession(id: string, turns: Array<[string, string]>): Promise<string[]> {
  const session = new ChatSession({ sessionId: id });
  for (const [userText, assistantText] of turns) {
    await appendTurn(session, userText, assistantText);
  }
  return turns.flatMap(([u, a]) => [u, a]);
}

function resetAll() {
  resetMemoryEventStore();
  resetRestoreForTesting();
  useChatConsoleStore.setState({
    messages: [],
    loading: false,
    restoreComplete: false,
    pendingConfirmation: null,
    pendingDestructiveAction: null,
    pendingPrdDraft: null,
    pendingMemory: null,
    activeSessionId: sessionRef.current.sessionId,
  });
}

test('SESS-02 startup: restore() completes with a fresh session, no latest-session auto-restore', async () => {
  resetAll();
  // A persisted latest session exists — startup must NOT pull it into the conversation.
  await seedSession('startup-latest', [['旧问题', '旧回答']]);

  await useChatConsoleStore.getState().restore();
  const state = useChatConsoleStore.getState();
  assert.equal(state.restoreComplete, true);
  assert.deepEqual(state.messages, []);
  assert.equal(state.activeSessionId, sessionRef.current.sessionId);
  assert.notEqual(state.activeSessionId, 'startup-latest');
});

test('SESS-03 switch: switchSession restores persisted history verbatim', async () => {
  resetAll();
  const contents = await seedSession('sess-switch', [['第一问', '第一答'], ['第二问', '第二答']]);

  const result = await useChatConsoleStore.getState().switchSession('sess-switch');
  assert.deepEqual(result, { success: true });
  const state = useChatConsoleStore.getState();
  assert.equal(state.activeSessionId, 'sess-switch');
  assert.equal(sessionRef.current.sessionId, 'sess-switch');
  assert.deepEqual(state.messages.map((m) => m.content), contents);
  assert.deepEqual(state.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
});

test('SESS-04 guard: streaming blocks switchSession, state unchanged', async () => {
  resetAll();
  await seedSession('sess-guard', [['问题', '回答']]);
  const before = useChatConsoleStore.getState();
  useChatConsoleStore.setState({ loading: true });

  const result = await useChatConsoleStore.getState().switchSession('sess-guard');
  assert.deepEqual(result, { success: false, reason: 'streaming' });
  const after = useChatConsoleStore.getState();
  assert.equal(after.activeSessionId, before.activeSessionId);
  assert.deepEqual(after.messages, []);
  useChatConsoleStore.setState({ loading: false });
});

test('SESS-04 guard: streaming blocks setActiveWorkspaceId, workspace unchanged', () => {
  resetAll();
  useWorkspaceStore.setState({ activeWorkspaceId: 'ws-home' });
  useChatConsoleStore.setState({ loading: true });
  try {
    const result = useWorkspaceStore.getState().setActiveWorkspaceId('ws-other');
    assert.deepEqual(result, { success: false, reason: 'streaming' });
    assert.equal(useWorkspaceStore.getState().activeWorkspaceId, 'ws-home');
  } finally {
    useChatConsoleStore.setState({ loading: false });
  }
});

test('workspace switch ends session: new session id, empty messages', async () => {
  resetAll();
  await seedSession('sess-end', [['问题', '回答']]);
  assert.deepEqual(await useChatConsoleStore.getState().switchSession('sess-end'), { success: true });
  const previousSessionId = useChatConsoleStore.getState().activeSessionId;
  useWorkspaceStore.setState({ activeWorkspaceId: 'ws-home' });

  const result = useWorkspaceStore.getState().setActiveWorkspaceId('ws-other');
  assert.deepEqual(result, { success: true });
  assert.equal(useWorkspaceStore.getState().activeWorkspaceId, 'ws-other');
  const chat = useChatConsoleStore.getState();
  assert.deepEqual(chat.messages, []);
  assert.notEqual(chat.activeSessionId, previousSessionId);
  assert.equal(chat.activeSessionId, sessionRef.current.sessionId);
});

test('unknown session: switchSession returns not_found', async () => {
  resetAll();
  const result = await useChatConsoleStore.getState().switchSession('nope');
  assert.deepEqual(result, { success: false, reason: 'not_found' });
});

console.log('OK: Phase 19 Plan 02 runtime lifecycle + guard checks passed');
