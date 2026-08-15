// Phase 13 Plan 03 — toolLoop event emission semantics (simulated write path;
// the live loop needs an LLM provider and is covered by UAT).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chatSession';
import { getEventStore, getMemoryEventStore, resetMemoryEventStore } from '../events/eventStore';
import { prepareToolResult } from '../events/artifacts';
import { assertEventStreamValid, checkEventStream } from '../events/invariants';

test('a tool turn lands as a paired, contiguous, correlated event sequence', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'loop-1' });
  const correlationId = crypto.randomUUID();
  session.setCorrelationId(correlationId);
  session.addMessage('user', '帮我建个任务');
  const toolCallId = crypto.randomUUID();
  session.addMessage('assistant', '好的,先查询上下文', toolCallId, 'createTask', { args: { title: '写周报' } });
  const prepared = prepareToolResult({ sessionId: 'loop-1', toolCallId, toolName: 'createTask', value: { taskId: 't-1' } });
  session.addMessage('tool', prepared.modelText, toolCallId, 'createTask', { ok: true, artifactId: null });
  session.addMessage('assistant', '任务已创建');
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 1, correlationId });
  await session.flushEvents();

  const events = await getMemoryEventStore().listEvents('loop-1');
  // eventType sequence: session_created → user → tool_call → tool_result → assistant → turn_ended
  assert.deepEqual(
    events.map((event) => event.eventType),
    ['session_created', 'user_message', 'tool_call', 'tool_result', 'assistant_message', 'turn_ended'],
  );
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4, 5, 6]);
  // correlationId stamped on every event from user_message (seq 2) onward (seq 1 is session_created, no correlation).
  for (const event of events.slice(1)) {
    assert.equal(event.correlationId, correlationId);
  }
  // tool_call ↔ tool_result toolCallId pairing preserved.
  const toolCallEvent = events.find((event) => event.eventType === 'tool_call');
  const toolResultEvent = events.find((event) => event.eventType === 'tool_result');
  assert.equal(toolCallEvent?.payload.toolCallId, toolCallId);
  assert.equal(toolResultEvent?.payload.toolCallId, toolCallId);
  // Invariant checker accepts the stream as balanced.
  assert.deepEqual(checkEventStream(events), []);
});

test('confirmation WAIT outcome lands as a normal balanced tool_result with ok:false semantics', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'loop-2' });
  const correlationId = crypto.randomUUID();
  session.setCorrelationId(correlationId);
  session.addMessage('user', '写一篇知识文章');
  const toolCallId = 'tc-wait';
  session.addMessage('assistant', '准备写入知识', toolCallId, 'writeKnowledgeArticle', { args: { title: '草稿' } });
  // Key order matches the ConfirmationRequiredError branch of toolLoop ({ ok, awaitingConfirmation, error }).
  const waitModelText = `[tool_result writeKnowledgeArticle] ${JSON.stringify({ ok: false, awaitingConfirmation: true, error: 'Explicit confirmation is required before writing knowledge.' })}`;
  session.addMessage('tool', waitModelText, toolCallId, 'writeKnowledgeArticle', { ok: false, awaitingConfirmation: true });
  session.recordTurnEnd({ outcome: 'awaiting_confirmation', iterations: 1, toolCallsExecuted: 0, correlationId });
  await session.flushEvents();

  const events = await getMemoryEventStore().listEvents('loop-2');
  // Balanced pairing: tool_call + tool_result both present with ok:false.
  assert.deepEqual(checkEventStream(events), []);
  assertEventStreamValid(events);
  const toolResultEvent = events.find((event) => event.eventType === 'tool_result');
  assert.equal((toolResultEvent?.payload as Record<string, unknown>).ok, false);
  assert.equal((toolResultEvent?.payload as Record<string, unknown>).awaitingConfirmation, true);
  const turnEndEvent = events.find((event) => event.eventType === 'turn_ended');
  assert.equal((turnEndEvent?.payload as Record<string, unknown>).outcome, 'awaiting_confirmation');
});

test('oversized tool results leave only summary + artifact reference in model history', async () => {
  resetMemoryEventStore();
  const toolCallId = 'tc-big';
  const prepared = prepareToolResult({
    sessionId: 'loop-3',
    toolCallId,
    toolName: 'getProductDocumentContext',
    value: { document: 'P'.repeat(6000) },
  });
  assert.ok(prepared.artifact !== null, 'prepared result must produce an artifact for 6000-char content');
  await getEventStore().saveArtifact(prepared.artifact!);
  // Model-visible text bounded (prefix + summary + artifactId + 512-char head).
  assert.ok(prepared.modelText.length < 2000, `modelText should stay under 2000 chars, got ${prepared.modelText.length}`);

  const session = new ChatSession({ sessionId: 'loop-3' });
  session.addMessage('user', '读取产品文档');
  session.addMessage('assistant', '正在读取', toolCallId, 'getProductDocumentContext', { args: {} });
  session.addMessage('tool', prepared.modelText, toolCallId, 'getProductDocumentContext', {
    ok: true,
    artifactId: prepared.artifact!.artifactId,
  });
  session.addMessage('assistant', '文档已读取');
  await session.flushEvents();

  const events = await getMemoryEventStore().listEvents('loop-3');
  const derivedTexts = session.getMessagesForLLM().map((message) => message.content);
  const allDerived = derivedTexts.join('\n');
  // Threshold > ARTIFACT_HEAD_CHARS=512: 1000 passes head (~481 contiguous 'P') but blocks full-text leak.
  assert.ok(!allDerived.includes('P'.repeat(1000)), 'full 6000-char text must not enter LLM history');
  assert.ok(allDerived.includes(prepared.artifact!.artifactId), 'artifact reference must be in history');
  assert.ok(allDerived.includes('"summary"'), 'reference summary field must be in history');

  // Replay parity: rebuilt session derives the same projection.
  const rebuilt = ChatSession.fromEvents(events);
  assert.deepEqual(rebuilt.getMessagesForLLM(), session.getMessagesForLLM());

  // Full content retrievable from the artifacts store (positive anchor).
  const stored = await getEventStore().getArtifact(prepared.artifact!.artifactId);
  assert.ok(stored?.content.includes('P'.repeat(6000)), 'artifact must contain the full original content');
});

test('audit reports a turn whose tool_result never arrived (never silent pass)', async () => {
  // Hand-rolled event stream: tool_call without matching tool_result.
  const events = [
    {
      eventId: 'e-1',
      sessionId: 'loop-4',
      seq: 1,
      eventType: 'user_message',
      createdAt: new Date().toISOString(),
      workspaceId: null,
      productId: null,
      projectId: null,
      correlationId: null,
      payload: { content: 'do something' },
    },
    {
      eventId: 'e-2',
      sessionId: 'loop-4',
      seq: 2,
      eventType: 'tool_call',
      createdAt: new Date().toISOString(),
      workspaceId: null,
      productId: null,
      projectId: null,
      correlationId: null,
      payload: { toolCallId: 'tc-orphan', toolName: 'someTool', args: {} },
    },
    {
      eventId: 'e-3',
      sessionId: 'loop-4',
      seq: 3,
      eventType: 'turn_ended',
      createdAt: new Date().toISOString(),
      workspaceId: null,
      productId: null,
      projectId: null,
      correlationId: null,
      payload: { outcome: 'completed', iterations: 1, toolCallsExecuted: 0 },
    },
  ];
  const issues = checkEventStream(events);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'MISSING_TOOL_RESULT');
  assert.equal(issues[0].toolCallId, 'tc-orphan');
  assert.throws(() => assertEventStreamValid(events), /invariant violation/);
});

console.log('OK: Phase 13 Plan 03 toolLoop event emission semantics passed');
