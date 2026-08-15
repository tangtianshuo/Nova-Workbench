// Phase 14 Plan 04 — cross-plan integration suite (3 tests).
// Proves compaction replay parity survives restore (Plan 03 × Plan 04),
// awaiting-confirmation crash tails restore with candidates (Plan 02 × Plan 04),
// and restored sessions continue writing on the original event stream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatSession } from '../chatSession';
import {
  getEventStore,
  resetMemoryEventStore,
} from '../events/eventStore';
import { checkEventStream } from '../events/invariants';
import {
  createDestructiveActionCandidate,
} from '../confirmations';
import { resetMemoryConfirmationStore } from '../confirmationStore';
import {
  resetRestoreForTesting,
  restoreLatestSession,
} from '../sessionRestore';
import {
  maybeCompactSession,
  type CompactionSummarizer,
} from '../compaction';

const fakeSummarizer: CompactionSummarizer = async ({ transcript }) => `SUMMARY:${transcript.slice(0, 24)}`;

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

test('restore parity of a compacted session (Plan 03 × Plan 04)', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'compact-restore', tokenBudget: 1000 });
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));
  await appendTurn(session, '背景讨论'.repeat(60), '结论摘要'.repeat(60));

  const record = await maybeCompactSession(session, 'deepseek', { summarizer: fakeSummarizer });
  assert.ok(record !== null, 'compaction must trigger');

  // One complete turn AFTER compaction.
  await appendTurn(session, '压缩后的问题', '压缩后的回答');

  resetRestoreForTesting();
  const restored = await restoreLatestSession();
  assert.ok(restored !== null);
  assert.equal(restored.sessionId, 'compact-restore');

  // Sourced-summary parity: both the live session and the rebuilt projection
  // derive identical LLM messages (summary prefix + post-compaction turn).
  assert.deepEqual(restored.session.getMessagesForLLM(), session.getMessagesForLLM());

  // Verify the summary prefix is present.
  const messages = restored.session.getMessagesForLLM();
  assert.ok(messages[0].content.includes('历史压缩摘要'), 'sourced summary present');
  assert.ok(messages[0].content.includes(`seq ${record.coveredSeqStart}-${record.coveredSeqEnd}`), 'seq range present');
  assert.ok(messages[0].content.includes('模型 deepseek'), 'model attribution present');
});

test('awaiting_confirmation crash tail restores with the pending candidate and no orphan', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'wait-session' });
  await appendTurn(session, '第一轮', '第一轮结论');

  // WAIT tail: user request → tool_call → tool_result with awaitingConfirmation (paired).
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', '帮我删除任务 X');
  const waitCallId = crypto.randomUUID();
  session.addMessage('assistant', '', waitCallId, 'deleteTask', { args: { taskId: 'task-x' } });
  session.addMessage(
    'tool',
    `[tool_result deleteTask] ${JSON.stringify({ ok: false, awaitingConfirmation: true, error: 'Explicit confirmation is required before deleting this task.' })}`,
    waitCallId,
    'deleteTask',
    { ok: false, awaitingConfirmation: true },
  );
  await session.flushEvents();
  // NOTE: no recordTurnEnd — this simulates a crash mid-turn AFTER the WAIT result.

  // Simulate the candidate having been persisted before the crash.
  const candidate = await createDestructiveActionCandidate('deleteTask', { taskId: 'task-x' }, '删除任务后将无法恢复。');

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);

  // The WAIT tool_result pairs the tool_call — nothing is marked interrupted.
  assert.deepEqual(restored.interruptedToolCallIds, []);

  // The pending candidate re-surfaces.
  assert.equal(restored.pendingDestructiveActions.length, 1);
  assert.equal(restored.pendingDestructiveActions[0].confirmationToken, candidate.confirmationToken);

  // Crash tail is cut (the WAIT events are past the last turn_ended).
  const events = await getEventStore().listEvents('wait-session');
  const firstTurnEndedSeq = events.find((e) => e.eventType === 'turn_ended')!.seq;
  assert.equal(restored.cutSeq, firstTurnEndedSeq);

  // The WAIT user message does NOT appear in the LLM projection.
  const messages = restored.session.getAllMessages();
  const contents = messages.map((m) => m.content);
  assert.ok(!contents.includes('帮我删除任务 X'), 'crash-tail content excluded from projection');

  // Event stream is pairing-balanced (no orphans to mark).
  assert.deepEqual(checkEventStream(events), []);
});

test('the restored session continues the ORIGINAL event stream', async () => {
  resetAll();
  const session = new ChatSession({ sessionId: 'continue-session' });
  await appendTurn(session, '你好', '你好！');

  const eventsBefore = await getEventStore().listEvents('continue-session');
  const maxSeqBefore = Math.max(...eventsBefore.map((e) => e.seq));

  const restored = await restoreLatestSession();
  assert.ok(restored !== null);

  // Post-restore: the session writes new events on the same stream.
  restored.session.setCorrelationId(crypto.randomUUID());
  restored.session.addMessage('user', '继续对话');
  await restored.session.flushEvents();

  const eventsAfter = await getEventStore().listEvents('continue-session');
  const lastEvent = eventsAfter[eventsAfter.length - 1];
  assert.equal(lastEvent.eventType, 'user_message');
  assert.equal(lastEvent.payload.content, '继续对话');
  assert.equal(lastEvent.seq, maxSeqBefore + 1, 'seq continues from previous max');

  // session_created was NOT re-emitted (count stays 1).
  const sessionCreatedEvents = eventsAfter.filter((e) => e.eventType === 'session_created');
  assert.equal(sessionCreatedEvents.length, 1, 'session_created count stays exactly 1');

  // All events carry the same sessionId.
  assert.ok(eventsAfter.every((e) => e.sessionId === 'continue-session'));
});

console.log('OK: Phase 14 Plan 04 integration checks passed');
