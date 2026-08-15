// Phase 13 Plan 02 — ChatSession as event-log projection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chatSession';
import { getMemoryEventStore, resetMemoryEventStore } from '../events/eventStore';

test('new session emits session_created then user/assistant events with contiguous seq', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'proj-1', tokenBudget: 8000 });

  // Constructor-zero emission: even though ChatPanel's useRef(new ChatSession(...))
  // evaluates every render, the constructor must never emit any event.
  await session.flushEvents();
  assert.deepEqual(await getMemoryEventStore().listEvents('proj-1'), []);

  session.addMessage('user', '帮我查任务');
  session.addMessage('assistant', '好的，正在查询');
  await session.flushEvents();

  const events = await getMemoryEventStore().listEvents('proj-1');
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['session_created', 'user_message', 'assistant_message'],
  );
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3]);
  assert.equal(events[1].payload.content, '帮我查任务');
});

test('tool_call and tool_result messages map to paired events with structured payload', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'proj-2', tokenBudget: 8000 });
  session.setCorrelationId('corr-turn-1');

  session.addMessage('user', '安排任务');
  session.addMessage('assistant', '我先查询', 'tc-uuid-1', 'listTasks', { args: { status: 'open' } });
  session.addMessage('tool', '[tool_result listTasks] {"ok":true}', 'tc-uuid-1', 'listTasks', { ok: true });
  await session.flushEvents();

  const events = await getMemoryEventStore().listEvents('proj-2');
  const toolCallEvent = events.find((e) => e.eventType === 'tool_call');
  const toolResultEvent = events.find((e) => e.eventType === 'tool_result');

  assert.ok(toolCallEvent, 'tool_call event must exist');
  assert.ok(toolResultEvent, 'tool_result event must exist');
  assert.equal(toolCallEvent.payload.toolCallId, 'tc-uuid-1');
  assert.equal((toolCallEvent.payload.args as Record<string, unknown>).status, 'open');
  assert.equal(toolCallEvent.payload.content, '我先查询');
  assert.equal(toolResultEvent.payload.modelText, '[tool_result listTasks] {"ok":true}');
  assert.equal((toolResultEvent.payload as Record<string, unknown>).ok, true);
  assert.equal(toolCallEvent.correlationId, 'corr-turn-1');
  assert.equal(toolResultEvent.correlationId, 'corr-turn-1');
});

test('projection collapses consecutive tool-call assistant rows into one LLM message', () => {
  const session = new ChatSession({ sessionId: 'proj-3', tokenBudget: 8000 });

  session.addMessage('user', '查两个工具');
  session.addMessage('assistant', 'thinking', 'tc-a', 'listTasks');
  session.addMessage('assistant', 'thinking', 'tc-b', 'listProducts');
  session.addMessage('tool', '[tool_result listTasks] {"ok":true,"data":[]}', 'tc-a', 'listTasks');
  session.addMessage('tool', '[tool_result listProducts] {"ok":true,"data":[]}', 'tc-b', 'listProducts');
  session.addMessage('assistant', '都查完了');

  const llmMessages = session.getMessagesForLLM();
  assert.deepEqual(llmMessages.map((m) => m.content), [
    '查两个工具',
    'thinking',
    '[tool_result listTasks] {"ok":true,"data":[]}',
    '[tool_result listProducts] {"ok":true,"data":[]}',
    '都查完了',
  ]);
  // The second 'thinking' (assistant with toolCallId 'tc-b') is collapsed.
  // Role sequence (excluding the final assistant) should be: user, assistant, tool, tool
  assert.deepEqual(
    llmMessages.slice(0, -1).map((m) => m.role),
    ['user', 'assistant', 'tool', 'tool'],
  );
});

test('fromEvents rebuilds an identical projection and never re-emits events', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'proj-4', tokenBudget: 8000 });

  session.addMessage('user', '帮我处理');
  session.addMessage('assistant', '调用工具', 'tc-1', 'listTasks', { args: { a: 1 } });
  session.addMessage('tool', '[tool_result listTasks] {"ok":true}', 'tc-1', 'listTasks');
  session.addMessage('assistant', '完成');
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 1 });
  await session.flushEvents();

  const events = await getMemoryEventStore().listEvents('proj-4');
  const lastEvent = events[events.length - 1];
  assert.equal(lastEvent.eventType, 'turn_ended');
  assert.equal((lastEvent.payload as Record<string, unknown>).outcome, 'completed');

  const rebuilt = ChatSession.fromEvents(events);
  const rebuiltAgain = ChatSession.fromEvents(events);

  // Live session and rebuilt session produce identical LLM projections.
  assert.deepEqual(rebuilt.getMessagesForLLM(), session.getMessagesForLLM());
  // Replay parity: rebuilding the same events twice yields identical projections.
  assert.deepEqual(rebuiltAgain.getMessagesForLLM(), rebuilt.getMessagesForLLM());
  // toolCallId preserved through the projection.
  assert.equal(rebuilt.getAllMessages()[1].toolCallId, 'tc-1');

  // Rebuilt session never re-emits events (including session_created).
  const countBefore = events.length;
  await rebuilt.flushEvents();
  const countAfter = await getMemoryEventStore().listEvents('proj-4');
  assert.equal(countAfter.length, countBefore);
});

test('CJK-aware budget drops oversized Chinese turns that length/4 would keep', () => {
  const session = new ChatSession({ sessionId: 'proj-5', tokenBudget: 20 });

  // 60 CJK chars → 60 tokens (estimateTokens); length/4 would have reported 15.
  session.addMessage('user', '中文'.repeat(30));
  session.addMessage('assistant', '好的');
  // Second exchange (kept by budget).
  session.addMessage('user', '新问题');
  session.addMessage('assistant', '回答');

  assert.deepEqual(session.getMessagesForLLM().map((m) => m.content), ['新问题', '回答']);
});

test('phase10 contract: eight-turn window, tool grouping and tiny budgets still hold', () => {
  // Eight-turn window: 10 turns added, only newest 8 returned.
  const session = new ChatSession('contract-window');
  for (let index = 1; index <= 10; index += 1) {
    session.addMessage('user', `user-${index}`);
    session.addMessage('assistant', `assistant-${index}`);
  }
  assert.deepEqual(session.getMessagesForLLM().map((m) => m.content), [
    'user-3', 'assistant-3',
    'user-4', 'assistant-4',
    'user-5', 'assistant-5',
    'user-6', 'assistant-6',
    'user-7', 'assistant-7',
    'user-8', 'assistant-8',
    'user-9', 'assistant-9',
    'user-10', 'assistant-10',
  ]);

  // Tool grouping: tool_call and tool_result stay with their exchange.
  const toolSession = new ChatSession('contract-tool');
  toolSession.addMessage('user', '安排任务');
  toolSession.addMessage('assistant', '我先查询任务', 'call-1', 'listTasks');
  toolSession.addMessage('tool', '{"taskId":"task-1"}', 'call-1', 'listTasks');
  toolSession.addMessage('assistant', '任务已找到');
  toolSession.addMessage('user', '改到明天');
  toolSession.addMessage('assistant', '已改到明天');

  assert.deepEqual(toolSession.getMessagesForLLM().map((m) => m.content), [
    '安排任务',
    '我先查询任务',
    '{"taskId":"task-1"}',
    '任务已找到',
    '改到明天',
    '已改到明天',
  ]);
  assert.equal(toolSession.getAllMessages()[1].toolCallId, 'call-1');

  // Tiny budget: old exchanges dropped, newest retained.
  const budgetSession = new ChatSession({ sessionId: 'contract-budget', tokenBudget: 5 });
  budgetSession.addMessage('user', 'old '.repeat(10));
  budgetSession.addMessage('assistant', 'old answer '.repeat(10));
  budgetSession.addMessage('user', 'new');
  budgetSession.addMessage('assistant', 'new answer');
  assert.deepEqual(budgetSession.getMessagesForLLM().map((m) => m.content), ['new', 'new answer']);
});

console.log('OK: Phase 13 Plan 02 ChatSession projection, replay, correlation, and CJK budget checks passed');
