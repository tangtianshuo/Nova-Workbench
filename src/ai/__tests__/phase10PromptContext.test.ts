import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatSession } from '../chatSession';
import { buildDateContext } from '../dateContext';
import { buildSystemPrompt } from '../prompts';

test('date context resolves the current and next-week dates deterministically', () => {
  const context = buildDateContext(new Date(2026, 7, 10, 12));

  assert.match(context, /Today: 2026-08-10 \(Monday\)/);
  assert.match(context, /Tomorrow: 2026-08-11/);
  assert.match(context, /Next Monday: 2026-08-17/);
  assert.match(context, /Next Sunday: 2026-08-23/);
  assert.match(context, /下周三.*2026-08-19/);
  assert.match(context, /本周末.*2026-08-15.*2026-08-16/);
  assert.match(context, /Never pass raw/);
});

test('chat session keeps the newest eight turns and groups tool work with its exchange', () => {
  const session = new ChatSession('phase10-test');

  for (let index = 1; index <= 10; index += 1) {
    session.addMessage('user', `user-${index}`);
    session.addMessage('assistant', `assistant-${index}`);
  }

  const recent = session.getMessagesForLLM();
  assert.deepEqual(recent.map((message) => message.content), [
    'user-3', 'assistant-3',
    'user-4', 'assistant-4',
    'user-5', 'assistant-5',
    'user-6', 'assistant-6',
    'user-7', 'assistant-7',
    'user-8', 'assistant-8',
    'user-9', 'assistant-9',
    'user-10', 'assistant-10',
  ]);

  const toolSession = new ChatSession('tool-test');
  toolSession.addMessage('user', '安排任务');
  toolSession.addMessage('assistant', '我先查询任务', 'call-1', 'listTasks');
  toolSession.addMessage('tool', '{"taskId":"task-1"}', 'call-1', 'listTasks');
  toolSession.addMessage('assistant', '任务已找到');
  toolSession.addMessage('user', '改到明天');
  toolSession.addMessage('assistant', '已改到明天');

  assert.deepEqual(toolSession.getMessagesForLLM().map((message) => message.content), [
    '安排任务',
    '我先查询任务',
    '{"taskId":"task-1"}',
    '任务已找到',
    '改到明天',
    '已改到明天',
  ]);
  assert.equal(toolSession.getAllMessages()[1]?.toolCallId, 'call-1');
  assert.equal(toolSession.estimateTokens() > 0, true);
  toolSession.clear();
  assert.deepEqual(toolSession.getAllMessages(), []);
});

test('chat session applies its token budget while retaining the newest context', () => {
  const session = new ChatSession({ sessionId: 'budget-test', tokenBudget: 5 });
  session.addMessage('user', 'old '.repeat(10));
  session.addMessage('assistant', 'old answer '.repeat(10));
  session.addMessage('user', 'new');
  session.addMessage('assistant', 'new answer');

  assert.deepEqual(session.getMessagesForLLM().map((message) => message.content), ['new', 'new answer']);
});

test('system prompt retains Phase 9 context and adds Phase 10 operating rules', () => {
  const prompt = buildSystemPrompt({
    coreContext: 'selected product: Demo',
    now: new Date(2026, 7, 10, 12),
  });

  assert.match(prompt, /selected product: Demo/);
  for (const toolName of [
    'createTask',
    'updateTask',
    'deleteTask',
    'rescheduleTask',
    'associateTaskWithEvent',
    'bulkCompleteTasks',
    'listTasks',
    'getTaskDependencies',
    'listEvents',
  ]) {
    assert.match(prompt, new RegExp(toolName));
  }
  assert.match(prompt, /Destructive Confirmation/);
  assert.match(prompt, /Wait for user approval/);
  assert.match(prompt, /Today: 2026-08-10/);
});

console.log('OK: Phase 10 date context, chat session, and task/schedule prompt smoke checks passed');
