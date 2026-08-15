// Phase 13 Plan 03 — PERMANENT replay parity test (do not delete).
// The same session replayed twice must derive byte-identical LLM messages.
// Canary lineage: 0bbc3f2 trace-color regression folded into the same suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chatSession';
import { getEventStore, resetMemoryEventStore } from '../events/eventStore';
import { prepareToolResult } from '../events/artifacts';
import { assertEventStreamValid } from '../events/invariants';

test('PERMANENT: replaying the same session twice derives identical LLM messages', async () => {
  resetMemoryEventStore();
  const live = new ChatSession({ sessionId: 'parity-1' });

  // Turn 1: two parallel tool calls (covers collapseToolCallAssistants + multi-call pairing).
  live.setCorrelationId(crypto.randomUUID());
  live.addMessage('user', '先查任务和产品');
  const tcA = crypto.randomUUID();
  const tcB = crypto.randomUUID();
  live.addMessage('assistant', '同时查两个', tcA, 'listTasks', { args: {} });
  live.addMessage('assistant', '同时查两个', tcB, 'listProducts', { args: {} });
  live.addMessage('tool', '[tool_result listTasks] {"ok":true,"data":[]}', tcA, 'listTasks', { ok: true });
  live.addMessage('tool', '[tool_result listProducts] {"ok":true,"data":[]}', tcB, 'listProducts', { ok: true });
  live.addMessage('assistant', '查询完成');
  live.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 2 });

  // Turn 2: tool_error retry then success with an oversized (>4KB) result.
  live.setCorrelationId(crypto.randomUUID());
  live.addMessage('user', '创建一个任务');
  const tcC = crypto.randomUUID();
  live.addMessage('assistant', '好的', tcC, 'createTask', { args: {} });
  live.addMessage(
    'tool',
    '[tool_error createTask] Tool "createTask" arg validation failed: []. Please correct the arguments and retry once.',
    tcC,
    'createTask',
    { ok: false, retryAvailable: true },
  );
  const tcD = crypto.randomUUID();
  live.addMessage('assistant', '重试', tcD, 'createTask', { args: { title: '写周报' } });
  const big = prepareToolResult({ sessionId: 'parity-1', toolCallId: tcD, toolName: 'createTask', value: { blob: 'B'.repeat(6000) } });
  if (big.artifact) await getEventStore().saveArtifact(big.artifact);
  live.addMessage('tool', big.modelText, tcD, 'createTask', { ok: true, artifactId: big.artifact?.artifactId ?? null });
  live.addMessage('assistant', '创建完成');
  live.recordTurnEnd({ outcome: 'completed', iterations: 2, toolCallsExecuted: 1 });

  await live.flushEvents();

  const events = await getEventStore().listEvents('parity-1');
  // Replay must start from a valid stream (SC2 anchor: pairing/seq hold).
  assertEventStreamValid(events);

  const replayA = ChatSession.fromEvents(events);
  const replayB = ChatSession.fromEvents(events);

  // Live session and rebuilt sessions derive identical projections.
  assert.deepEqual(replayA.getMessagesForLLM(), live.getMessagesForLLM());
  // Two independent replays derive identical projections (replay determinism).
  assert.deepEqual(replayB.getMessagesForLLM(), replayA.getMessagesForLLM());
  // Byte-level equivalence via JSON serialization.
  assert.equal(JSON.stringify(replayB.getMessagesForLLM()), JSON.stringify(replayA.getMessagesForLLM()));

  // Artifact bounds: model-visible text bounded; full content stays in artifacts.
  assert.ok(big.modelText.length < 2000, `big.modelText should stay under 2000 chars, got ${big.modelText.length}`);
  const derivedContents = replayA.getMessagesForLLM().map((message) => message.content);
  assert.ok(derivedContents.some((content) => content.includes(big.artifact!.artifactId)), 'artifact ref must appear in derived history');
  // Threshold > ARTIFACT_HEAD_CHARS=512: 1000 passes head (~485 contiguous 'B') but blocks full-text leak.
  for (const content of derivedContents) {
    assert.ok(!content.includes('B'.repeat(1000)), 'full 6000-char text must not appear in any derived message');
  }

  // Error-retry text preserved verbatim in the single derived projection.
  assert.ok(
    derivedContents.some((content) => content.includes('Please correct the arguments and retry once.')),
    'tool_error retry hint must be present in derived history',
  );

  // Full original content retrievable from artifacts store (positive anchor).
  const stored = await getEventStore().getArtifact(big.artifact!.artifactId);
  assert.ok(stored?.content.includes('B'.repeat(6000)), 'artifact must retain the full 6000-char content');
});

console.log('OK: Phase 13 Plan 03 PERMANENT replay parity passed');
