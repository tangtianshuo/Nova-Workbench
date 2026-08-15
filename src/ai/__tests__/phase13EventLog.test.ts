// Phase 13 Plan 01 — event store, pairing invariants, artifacts, CJK token estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMemoryEventStore,
  resetMemoryEventStore,
  setEventScopeProvider,
} from '../events/eventStore';
import { assertEventStreamValid, checkEventStream } from '../events/invariants';
import { ARTIFACT_THRESHOLD_CHARS, prepareToolResult } from '../events/artifacts';
import { estimateTokens } from '../tokenEstimate';
import type { AgentEvent, AgentEventType } from '../events/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mk(seq: number, eventType: AgentEventType, payload: Record<string, unknown> = {}): AgentEvent {
  return {
    eventId: crypto.randomUUID(),
    sessionId: 'inv',
    seq,
    eventType,
    createdAt: '2026-08-15T00:00:00.000Z',
    workspaceId: null,
    productId: null,
    projectId: null,
    correlationId: null,
    payload,
  };
}

test('memory event store assigns contiguous per-session seq and isolates sessions', async () => {
  resetMemoryEventStore();
  const store = getMemoryEventStore();

  await store.append({ sessionId: 's1', eventType: 'user_message', payload: { text: 'hello' } });
  await store.append({ sessionId: 's1', eventType: 'assistant_message', payload: { text: 'hi' } });
  await store.append({ sessionId: 's1', eventType: 'turn_ended', payload: {} });
  await store.append({ sessionId: 's2', eventType: 'user_message', payload: { text: 'other session' } });

  const s1 = await store.listEvents('s1');
  assert.deepEqual(s1.map((event) => event.seq), [1, 2, 3]);
  assert.deepEqual(
    s1.map((event) => event.eventType),
    ['user_message', 'assistant_message', 'turn_ended'],
  );
  for (const event of s1) {
    assert.match(event.eventId, UUID_REGEX);
  }

  const s2 = await store.listEvents('s2');
  assert.deepEqual(s2.map((event) => event.seq), [1]);
  for (const event of s2) {
    assert.match(event.eventId, UUID_REGEX);
  }
});

test('concurrent appends keep seq contiguous via the per-session chain', async () => {
  resetMemoryEventStore();
  const store = getMemoryEventStore();

  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      store.append({ sessionId: 'race', eventType: 'user_message', payload: { i } }),
    ),
  );

  const events = await store.listEvents('race');
  assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('scope provider stamps productId onto appended events', async () => {
  resetMemoryEventStore();
  const store = getMemoryEventStore();
  try {
    setEventScopeProvider(() => ({ workspaceId: null, productId: 'p1', projectId: null }));
    await store.append({ sessionId: 'scoped', eventType: 'user_message', payload: { text: 'scoped' } });
    const events = await store.listEvents('scoped');
    assert.equal(events.length, 1);
    assert.equal(events[0].productId, 'p1');
  } finally {
    setEventScopeProvider(null);
    resetMemoryEventStore();
  }
});

test('checkEventStream accepts a balanced stream and reports missing tool_result', () => {
  const balanced: AgentEvent[] = [
    mk(1, 'user_message', { text: 'list my tasks' }),
    mk(2, 'tool_call', { toolCallId: 'tc-1', toolName: 'listTasks', args: {} }),
    mk(3, 'tool_result', { toolCallId: 'tc-1', modelText: '[tool_result listTasks] {"ok":true}' }),
    mk(4, 'assistant_message', { text: 'here are your tasks' }),
    mk(5, 'turn_ended', {}),
  ];
  assert.deepEqual(checkEventStream(balanced), []);

  // Renumber after removal: in a real append-only log a tool_result that was never
  // written means the next event simply got the next seq — no hole. Filtering alone
  // would leave a seq gap and mask this test's target (the pairing violation).
  const missingResult = balanced
    .filter((event) => event.eventType !== 'tool_result')
    .map((event, index) => ({ ...event, seq: index + 1 }));
  const issues = checkEventStream(missingResult);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'MISSING_TOOL_RESULT');
  assert.equal(issues[0].toolCallId, 'tc-1');
});

test('checkEventStream reports duplicate tool_result and seq gaps', () => {
  const duplicateResult: AgentEvent[] = [
    mk(1, 'tool_call', { toolCallId: 'tc-1', toolName: 'listTasks', args: {} }),
    mk(2, 'tool_result', { toolCallId: 'tc-1', modelText: 'first' }),
    mk(3, 'tool_result', { toolCallId: 'tc-1', modelText: 'second' }),
  ];
  assert.ok(
    checkEventStream(duplicateResult).some((issue) => issue.code === 'DUPLICATE_TOOL_RESULT'),
    'duplicate tool_result must be reported',
  );

  const resultWithoutCall: AgentEvent[] = [
    mk(1, 'tool_result', { toolCallId: 'tc-x', modelText: 'orphan' }),
  ];
  assert.ok(
    checkEventStream(resultWithoutCall).some((issue) => issue.code === 'RESULT_BEFORE_CALL'),
    'tool_result without matching tool_call must be reported',
  );

  const gap: AgentEvent[] = [
    mk(1, 'user_message', { text: 'a' }),
    mk(3, 'assistant_message', { text: 'b' }),
  ];
  assert.ok(
    checkEventStream(gap).some((issue) => issue.code === 'SEQ_GAP'),
    'seq gap must be reported',
  );
});

test('assertEventStreamValid throws on violations and passes balanced streams', () => {
  const broken: AgentEvent[] = [
    mk(1, 'user_message', { text: 'list my tasks' }),
    mk(2, 'tool_call', { toolCallId: 'tc-1', toolName: 'listTasks', args: {} }),
    mk(3, 'assistant_message', { text: 'no result ever' }),
    mk(4, 'turn_ended', {}),
  ];
  assert.throws(() => assertEventStreamValid(broken), /invariant violation/);

  const balanced: AgentEvent[] = [
    mk(1, 'user_message', { text: 'list my tasks' }),
    mk(2, 'tool_call', { toolCallId: 'tc-1', toolName: 'listTasks', args: {} }),
    mk(3, 'tool_result', { toolCallId: 'tc-1', modelText: '[tool_result listTasks] {"ok":true}' }),
    mk(4, 'assistant_message', { text: 'here are your tasks' }),
    mk(5, 'turn_ended', {}),
  ];
  assert.doesNotThrow(() => assertEventStreamValid(balanced));
});

test('prepareToolResult inlines small results and artifact-izes oversized ones', async () => {
  const small = prepareToolResult({
    sessionId: 'art',
    toolCallId: 'tc-s',
    toolName: 'listTasks',
    value: { ok: 1 },
  });
  assert.equal(small.artifact, null);
  assert.ok(small.modelText.startsWith('[tool_result listTasks] '));
  assert.ok(small.modelText.includes('"ok":true'));

  const blob = 'x'.repeat(5000);
  const large = prepareToolResult({
    sessionId: 'art',
    toolCallId: 'tc-l',
    toolName: 'readFile',
    value: { blob },
  });
  assert.notEqual(large.artifact, null);
  assert.ok(large.artifact!.byteSize > ARTIFACT_THRESHOLD_CHARS);
  assert.ok(large.artifact!.byteSize > 4096);
  assert.ok(large.artifact!.content.includes(blob));
  assert.ok(large.modelText.includes(large.artifact!.artifactId));
  assert.ok(large.modelText.includes('"summary"'));
  assert.ok(large.modelText.includes('"head"'));
  assert.ok(large.modelText.length < large.artifact!.content.length);

  await getMemoryEventStore().saveArtifact(large.artifact!);
  const retrieved = await getMemoryEventStore().getArtifact(large.artifact!.artifactId);
  assert.notEqual(retrieved, null);
  assert.equal(retrieved!.content, large.artifact!.content);
});

test('estimateTokens counts CJK chars at >= 1 token each (length/4 undercount fixed)', () => {
  // Regression anchor: the old length/4 heuristic returned 2 here.
  assert.ok(estimateTokens('这是一个中文测试') === 8);
  assert.ok(estimateTokens('中文'.repeat(10)) >= 20);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('中文ab'), 3);
});

console.log('OK: Phase 13 Plan 01 event log foundation checks passed');
