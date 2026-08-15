// Phase 14 Plan 03 — compaction suite (8 tests).
// CMP-01/CMP-02: token-pressure-triggered LLM summarization that splits only at
// pairing-balanced turn boundaries, never mutates the append-only event log, and
// records covered event range + generation time + model so earlier history enters
// context as a sourced summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chatSession';
import {
  COMPACTION_PRESSURE_RATIO,
  maybeCompactSession,
  findCompactionSplitPoint,
  type CompactionSummarizer,
} from '../compaction';
import { getEventStore, resetMemoryEventStore } from '../events/eventStore';
import { checkEventStream } from '../events/invariants';

const fakeSummarizer: CompactionSummarizer = async ({ transcript }) => `SUMMARY:${transcript.slice(0, 24)}`;

async function appendTurn(session: ChatSession, userText: string, assistantText: string, toolName?: string) {
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', userText);
  if (toolName) {
    const toolCallId = crypto.randomUUID();
    session.addMessage('assistant', '', toolCallId, toolName, { args: {} });
    session.addMessage('tool', `[tool_result ${toolName}] {"ok":true}`, toolCallId, toolName, { ok: true });
  }
  session.addMessage('assistant', assistantText);
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: toolName ? 1 : 0 });
  await session.flushEvents();
}

test('no compaction below the 0.8 pressure threshold', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-below', tokenBudget: 1000 });
  session.addMessage('user', '中'.repeat(799)); // 799 tokens ≈ 0.799 pressure
  await session.flushEvents();
  const record = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer });
  assert.equal(record, null, 'below threshold returns null');
  const events = await getEventStore().listEvents('cmp-below');
  const compactionStarted = events.filter((e) => e.eventType === 'compaction_started');
  assert.equal(compactionStarted.length, 0, 'no compaction_started event appended');
});

test('compaction triggers at pressure >= 0.8 and keeps the event log append-only', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-append', tokenBudget: 1000 });
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));

  const eventsBefore = await getEventStore().listEvents('cmp-append');
  const snapshotBefore = eventsBefore.map((e) => ({ ...e, payload: { ...e.payload } }));

  const record = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer });
  assert.ok(record !== null, 'compaction must trigger at >=0.8 pressure');

  const eventsAfter = await getEventStore().listEvents('cmp-append');
  assert.equal(eventsAfter.length, snapshotBefore.length + 2, 'exactly 2 new events appended');

  // Every original event byte-intact (projection-only guarantee).
  for (const original of snapshotBefore) {
    const match = eventsAfter.find((e) => e.eventId === original.eventId);
    assert.ok(match, `original event ${original.eventId} must still be present`);
    assert.deepEqual(match, original, `event ${original.eventId} must be byte-identical`);
  }

  // New events in order: compaction_started then compaction_completed.
  const newEvents = eventsAfter.slice(snapshotBefore.length);
  assert.equal(newEvents[0].eventType, 'compaction_started');
  assert.equal(newEvents[1].eventType, 'compaction_completed');
});

test('CMP-02 provenance: covered seq span, generation time, model', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-provenance', tokenBudget: 1000 });
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));

  const record = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer });
  assert.ok(record !== null);
  assert.equal(record.coveredSeqStart, 1, 'covers from the first event');
  assert.ok(record.coveredSeqEnd >= 1, 'coveredSeqEnd must be a positive seq');
  assert.ok(!Number.isNaN(Date.parse(record.generatedAt)), 'generatedAt must be a parseable ISO timestamp');
  assert.equal(record.model, 'deepseek', 'model must reflect the provider');
  assert.ok(record.summaryText.startsWith('SUMMARY:'), 'summaryText comes from the fake summarizer');

  const events = await getEventStore().listEvents('cmp-provenance');
  const completedEvent = events.find((e) => e.eventType === 'compaction_completed');
  assert.ok(completedEvent, 'compaction_completed event must be appended');
  const completedPayload = completedEvent!.payload;
  assert.equal(typeof completedPayload.coveredEventCount, 'number', 'coveredEventCount recorded');
  assert.equal(completedPayload.coveredSeqEnd, record.coveredSeqEnd, 'coveredSeqEnd consistent');

  // Ollama variant: model string prefixed with ollama:
  resetMemoryEventStore();
  const session2 = new ChatSession({ sessionId: 'cmp-ollama', tokenBudget: 1000 });
  await appendTurn(session2, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session2, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session2, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  const ollamaRecord = await maybeCompactSession(session2, 'ollama', {
    ollamaModel: 'qwen3:8b',
    summarizer: fakeSummarizer,
  });
  assert.ok(ollamaRecord !== null);
  assert.equal(ollamaRecord.model, 'ollama:qwen3:8b', 'ollama model string must be prefixed');
});

test('split point is pairing-balanced and lands on a turn boundary', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-balance', tokenBudget: 1000 });

  // Two complete tool turns (balanced).
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60), 'listTasks');
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60), 'listTasks');

  // Open tail: unpaired tool_call (no tool_result) — this turn must NOT enter the prefix.
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '继续处理');
  session.addMessage('assistant', '', crypto.randomUUID(), 'deleteTask', { args: {} });
  session.recordTurnEnd({ outcome: 'tool_limit', iterations: 1, toolCallsExecuted: 0 });
  await session.flushEvents();

  const eventsBefore = await getEventStore().listEvents('cmp-balance');
  const record = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer, force: true });
  assert.ok(record !== null, 'force bypasses the pressure gate');

  // coveredSeqEnd lands on a turn_ended event.
  const endEvent = eventsBefore.find((e) => e.seq === record!.coveredSeqEnd);
  assert.ok(endEvent, 'event at coveredSeqEnd must exist in the original log');
  assert.equal(endEvent!.eventType, 'turn_ended', 'split point must be a turn_ended boundary');

  // Prefix is pairing-balanced (checkEventStream clean).
  const prefix = eventsBefore.filter((e) => e.seq <= record!.coveredSeqEnd);
  assert.deepEqual(checkEventStream(prefix), [], 'prefix must be pairing-balanced');

  // Suffix starts with a user_message; the unpaired tail tool_call is NOT inside the prefix.
  const suffix = eventsBefore.filter((e) => e.seq > record!.coveredSeqEnd);
  assert.ok(suffix.length > 0, 'suffix must contain the unpaired tail');
  const firstSuffix = suffix.find((e) => ['user_message', 'assistant_message', 'tool_call', 'tool_result'].includes(e.eventType));
  assert.equal(firstSuffix?.eventType, 'user_message', 'suffix begins at the next user turn');
  const tailToolCall = suffix.find((e) => e.eventType === 'tool_call');
  assert.ok(tailToolCall, 'unpaired tail tool_call must survive in the suffix, not the prefix');
});

test('projection after compaction leads with the sourced summary', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-projection', tokenBudget: 1000 });
  // Two complete tool turns (will be compacted) + an unpaired tail (stays as suffix).
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60), 'listTasks');
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60), 'listTasks');
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '继续处理尾部');
  session.addMessage('assistant', '', crypto.randomUUID(), 'deleteTask', { args: {} });
  session.recordTurnEnd({ outcome: 'tool_limit', iterations: 1, toolCallsExecuted: 0 });
  await session.flushEvents();

  const record = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer, force: true });
  assert.ok(record !== null);

  const messages = session.getMessagesForLLM();
  assert.ok(messages.length >= 2, 'summary + suffix messages');
  const firstMessage = messages[0];
  assert.ok(firstMessage.content.includes('[历史压缩摘要'), 'first message is the sourced summary');
  assert.ok(firstMessage.content.includes(`seq ${record!.coveredSeqStart}-${record!.coveredSeqEnd}`), 'summary mentions the covered seq range');
  assert.ok(firstMessage.content.includes('模型 deepseek'), 'summary mentions the generating model');
  assert.ok(firstMessage.content.includes(record!.summaryText), 'summary body is embedded');
  // Suffix content (the unpaired tail) is present in subsequent messages.
  assert.ok(messages.slice(1).some((m) => m.content.includes('继续处理尾部')), 'suffix turn content is present after the summary');

  const compactionInfo = session.getCompaction();
  assert.deepEqual(compactionInfo, record, 'getCompaction returns the record');
});

test('replay parity across compaction (fromEvents honors the boundary)', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-parity', tokenBudget: 1000 });
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));

  await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer });
  const events = await getEventStore().listEvents('cmp-parity');

  const rebuilt = ChatSession.fromEvents(events);
  assert.deepEqual(rebuilt.getMessagesForLLM(), session.getMessagesForLLM(), 'rebuilt session derives identical projection');
  assert.deepEqual(rebuilt.getCompaction(), session.getCompaction(), 'rebuilt session carries the same compaction record');
});

test('no valid split -> compaction skipped, log untouched', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-no-split', tokenBudget: 400 });
  // ONE turn WITHOUT recordTurnEnd — no turn_ended event exists anywhere.
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '中'.repeat(500));
  session.addMessage('assistant', '中'.repeat(500));
  await session.flushEvents();

  const eventsBefore = await getEventStore().listEvents('cmp-no-split');
  const record = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer, force: true });
  assert.equal(record, null, 'no split point available -> null');

  const eventsAfter = await getEventStore().listEvents('cmp-no-split');
  assert.equal(eventsAfter.length, eventsBefore.length, 'event log untouched when no split qualifies');
});

test('successive compaction carries the earlier summary into the new transcript', async () => {
  resetMemoryEventStore();
  const session = new ChatSession({ sessionId: 'cmp-successive', tokenBudget: 1000 });
  await appendTurn(session, '第一轮讨论'.repeat(60), '第一轮摘要'.repeat(60));
  await appendTurn(session, '第一轮讨论'.repeat(60), '第一轮摘要'.repeat(60));
  await appendTurn(session, '第一轮讨论'.repeat(60), '第一轮摘要'.repeat(60));

  const first = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer });
  assert.ok(first !== null);

  // Append two more CJK-heavy turns to push pressure back above the threshold.
  await appendTurn(session, '第二轮讨论'.repeat(80), '第二轮摘要'.repeat(80));
  await appendTurn(session, '第二轮讨论'.repeat(80), '第二轮摘要'.repeat(80));

  let captured = '';
  const capturingSummarizer: CompactionSummarizer = async ({ transcript }) => {
    captured = transcript;
    return 'SECOND';
  };
  const second = await maybeCompactSession(session, 'deepseek', { summarizer: capturingSummarizer, force: true });
  assert.ok(second !== null, 'second compaction must trigger');
  assert.ok(captured.includes('[earlier compressed summary]'), 'earlier summary carried forward into the new transcript');
});

console.log('OK: Phase 14 Plan 03 compaction checks passed');
