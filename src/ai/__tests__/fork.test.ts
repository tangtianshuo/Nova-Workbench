// Phase 20 Plan 01 (FORK-02/LIST-03) — fork pure-function suite. Written FIRST (RED).
// Locks: pairing invariants, seq normalization, compaction payload remap
// (two-case rule), replay parity, mid-turn/orphan rejection, fork-of-fork,
// compaction round-trip through the real memory repos, and sessionRepo
// fork columns + parentTitle enrichment (memory + SQL parity).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildForkEventStream, findForkCutSeq, resolveSessionEvents } from '../fork';
import { ChatSession } from '../chatSession';
import { maybeCompactSession, type CompactionSummarizer } from '../compaction';
import { getEventStore, resetMemoryEventStore } from '../events/eventStore';
import { checkEventStream } from '../events/invariants';
import type { AgentEvent } from '../events/types';
import {
  MemorySessionRepo,
  SESSION_LIST_SQL,
  SESSION_FORK_INSERT_SQL,
  SESSION_GET_SQL,
  getMemorySessionRepo,
  resetMemorySessionRepo,
} from '../sessionRepo';

/* === fake event helper === */

let evSeq = 0;
function ev(sessionId: string, seq: number, eventType: string, payload: Record<string, unknown> = {}): AgentEvent {
  evSeq += 1;
  return {
    eventId: `ev-${evSeq}`,
    sessionId,
    seq,
    eventType,
    createdAt: '2026-08-18T00:00:00Z',
    workspaceId: null,
    productId: null,
    projectId: null,
    correlationId: null,
    payload,
  };
}

/** Parent stream: two complete tool turns + a third plain turn. */
function parentStream(): AgentEvent[] {
  return [
    ev('p1', 1, 'session_created', { tokenBudget: 8000 }),
    ev('p1', 2, 'user_message', { content: '帮我查任务' }),
    ev('p1', 3, 'tool_call', { toolCallId: 't1', toolName: 'listTasks', args: {} }),
    ev('p1', 4, 'tool_result', { toolCallId: 't1', toolName: 'listTasks', ok: true, modelText: '[]' }),
    ev('p1', 5, 'assistant_message', { content: '没有任务' }),
    ev('p1', 6, 'turn_ended', { outcome: 'completed' }),
    ev('p1', 7, 'user_message', { content: '再查日程' }),
    ev('p1', 8, 'tool_call', { toolCallId: 't2', toolName: 'listSchedule', args: {} }),
    ev('p1', 9, 'tool_result', { toolCallId: 't2', toolName: 'listSchedule', ok: true, modelText: '[]' }),
    ev('p1', 10, 'assistant_message', { content: '日程为空' }),
    ev('p1', 11, 'turn_ended', { outcome: 'completed' }),
    ev('p1', 12, 'user_message', { content: '总结一下' }),
    ev('p1', 13, 'assistant_message', { content: '一切为空' }),
    ev('p1', 14, 'turn_ended', { outcome: 'completed' }),
  ];
}

/** Child's own rows (child seq space): marker + one complete turn. */
function childStream(): AgentEvent[] {
  return [
    ev('c1', 1, 'session_forked', { parentSessionId: 'p1', parentCutSeq: 6 }),
    ev('c1', 2, 'user_message', { content: '换个话题' }),
    ev('c1', 3, 'assistant_message', { content: '好的' }),
    ev('c1', 4, 'turn_ended', { outcome: 'completed' }),
  ];
}

test('1. pairing invariants: normalized fork stream passes checkEventStream', () => {
  const out = buildForkEventStream(parentStream(), 11, childStream());
  assert.equal(out.invalid, undefined);
  assert.deepEqual(checkEventStream(out.events), []);
});

test('2. seq normalization: prefix keeps 1..cut, child = cut+1..cut+M, contiguous', () => {
  const parent = parentStream();
  const out = buildForkEventStream(parent, 11, childStream());
  const seqs = out.events.map((e) => e.seq);
  assert.deepEqual(seqs, Array.from({ length: seqs.length }, (_, i) => i + 1), '1..N no gaps');
  // prefix identity: first 11 events keep parent eventId + seq 1..11
  out.events.slice(0, 11).forEach((e, i) => {
    assert.equal(e.eventId, parent[i].eventId);
    assert.equal(e.seq, i + 1);
  });
  // child events keep their own order, offset by prefix length
  out.events.slice(11).forEach((e, i) => assert.equal(e.seq, 11 + i + 1));
});

test('3. compaction remap: child payloads += prefix.length, prefix payloads identity', () => {
  const parent = parentStream();
  // parent prefix carries an old compaction (identity rule)
  parent[3] = ev('p1', 4, 'compaction_completed', { coveredSeqStart: 1, coveredSeqEnd: 2, summaryText: 's', model: 'x', generatedAt: 't' });
  const child = childStream();
  child.push(ev('c1', 5, 'compaction_started', { splitSeq: 2 }));
  child.push(ev('c1', 6, 'compaction_completed', { coveredSeqStart: 1, coveredSeqEnd: 4, summaryText: 's2', model: 'x', generatedAt: 't' }));

  const out = buildForkEventStream(parent, 11, child);
  assert.equal(out.invalid, undefined);
  const prefixCompaction = out.events.find((e) => e.seq === 4);
  assert.deepEqual(
    { s: prefixCompaction!.payload.coveredSeqStart, e: prefixCompaction!.payload.coveredSeqEnd },
    { s: 1, e: 2 },
    'prefix compaction payload identity',
  );
  const childStarted = out.events.find((e) => e.eventType === 'compaction_started');
  const childCompleted = out.events.find((e) => e.eventType === 'compaction_completed' && e.payload.summaryText === 's2');
  assert.equal(childStarted!.payload.splitSeq, 2 + 11, 'splitSeq += prefix.length');
  assert.equal(childCompleted!.payload.coveredSeqStart, 1 + 11);
  assert.equal(childCompleted!.payload.coveredSeqEnd, 4 + 11);
});

test('4. replay parity: fromEvents(normalized) projection === parent projection up to cut', () => {
  const parent = parentStream();
  const cut = 11;
  const out = buildForkEventStream(parent, cut, childStream());
  const forkProjection = ChatSession.fromEvents(out.events).messages;
  const parentProjection = ChatSession.fromEvents(parent.filter((e) => e.seq <= cut)).messages;
  assert.deepEqual(forkProjection, parentProjection.slice(0, parentProjection.length));
  // and the child's own turn is appended after the parent prefix
  const outFull = ChatSession.fromEvents(out.events).messages;
  assert.ok(outFull.length > parentProjection.length, 'child turn projected after prefix');
});

test('5. mid-turn rejection: cut on a tool_call seq / nonexistent seq → MID_TURN', () => {
  assert.deepEqual(buildForkEventStream(parentStream(), 8, childStream()), { events: [], invalid: 'MID_TURN' });
  assert.deepEqual(buildForkEventStream(parentStream(), 99, childStream()), { events: [], invalid: 'MID_TURN' });
});

test('6. no complete turn prefix → NO_PREFIX_TURN; unbalanced prefix → UNBALANCED', () => {
  // single incomplete turn, cut attempted on a tool_call with no earlier turn_ended
  const incomplete = [
    ev('p2', 1, 'session_created', {}),
    ev('p2', 2, 'user_message', { content: 'hi' }),
    ev('p2', 3, 'tool_call', { toolCallId: 't9', toolName: 'x', args: {} }),
  ];
  assert.deepEqual(buildForkEventStream(incomplete, 3, []), { events: [], invalid: 'NO_PREFIX_TURN' });

  // cut is turn_ended but the prefix contains an unpaired tool_call
  const unbalanced = [
    ev('p3', 1, 'user_message', { content: 'hi' }),
    ev('p3', 2, 'tool_call', { toolCallId: 't8', toolName: 'x', args: {} }),
    ev('p3', 3, 'turn_ended', { outcome: 'completed' }),
  ];
  assert.deepEqual(buildForkEventStream(unbalanced, 3, []), { events: [], invalid: 'UNBALANCED' });
});

test('7. fork-of-fork: resolved child stream serves as grandchild prefix', () => {
  const parent = parentStream();
  const childResolved = buildForkEventStream(parent, 11, childStream()).events;
  // grandchild forks after the child's turn: child turn_ended normalized seq = 15
  const cut = childResolved.filter((e) => e.eventType === 'turn_ended').at(-1)!.seq;
  const grandchild = [
    ev('g1', 1, 'session_forked', { parentSessionId: 'c1', parentCutSeq: cut }),
    ev('g1', 2, 'user_message', { content: '孙代' }),
    ev('g1', 3, 'assistant_message', { content: '好' }),
    ev('g1', 4, 'turn_ended', { outcome: 'completed' }),
  ];
  const out = buildForkEventStream(childResolved, cut, grandchild);
  assert.equal(out.invalid, undefined);
  assert.deepEqual(checkEventStream(out.events), []);
  assert.deepEqual(out.events.map((e) => e.seq), Array.from({ length: out.events.length }, (_, i) => i + 1));
  const proj = ChatSession.fromEvents(out.events).messages;
  const childProj = ChatSession.fromEvents(childResolved.filter((e) => e.seq <= cut)).messages;
  assert.deepEqual(proj.slice(0, childProj.length), childProj, 'grandchild parity with child prefix');
});

test('8. findForkCutSeq: first turn_ended after the assistant seq; null when absent', () => {
  const parent = parentStream();
  assert.equal(findForkCutSeq(parent, 5), 6);
  assert.equal(findForkCutSeq(parent, 10), 11);
  assert.equal(findForkCutSeq(parent, 13), 14);
  const openTail = parent.slice(0, 13); // last assistant_message, no turn_ended after
  assert.equal(findForkCutSeq(openTail, 13), null);
});

/* === 9. round-trip through the real memory repos (eventStore + sessionRepo) === */

const capturedTranscripts: string[] = [];
const fakeSummarizer: CompactionSummarizer = async ({ transcript }) => {
  capturedTranscripts.push(transcript);
  return `SUMMARY:${transcript.slice(0, 24)}`;
};

async function appendTurn(session: ChatSession, userText: string, assistantText: string) {
  session.setCorrelationId(crypto.randomUUID());
  session.addMessage('user', userText);
  session.addMessage('assistant', assistantText);
  session.recordTurnEnd({ outcome: 'completed', iterations: 1, toolCallsExecuted: 0 });
  await session.flushEvents();
}

test('9. round-trip: fork → child turns → forced compaction → resolveSessionEvents → fromEvents parity', async () => {
  resetMemoryEventStore();
  resetMemorySessionRepo();
  capturedTranscripts.length = 0;
  const repo = getMemorySessionRepo();
  const store = getEventStore();

  // Parent: three big turns.
  const parent = new ChatSession({ sessionId: 'rt-parent', tokenBudget: 1000 });
  await appendTurn(parent, '背景讨论甲'.repeat(60), '结论摘要甲'.repeat(60));
  await appendTurn(parent, '背景讨论乙'.repeat(60), '结论摘要乙'.repeat(60));
  await appendTurn(parent, '背景讨论丙'.repeat(60), '结论摘要丙'.repeat(60));

  // Fork after the second parent turn.
  const parentEvents = await store.listEvents('rt-parent');
  const cutSeq = findForkCutSeq(parentEvents, parentEvents.find((e) => e.eventType === 'assistant_message' && e.payload.content?.includes('乙'))!.seq);
  assert.ok(cutSeq !== null);
  await repo.createForkSession({ sessionId: 'rt-child', workspaceId: null, parentSessionId: 'rt-parent', forkCutSeq: cutSeq, title: null });
  await store.append({ sessionId: 'rt-child', eventType: 'session_forked', payload: { parentSessionId: 'rt-parent', parentCutSeq: cutSeq } });

  // Child gains two turns of its own.
  const child = ChatSession.fromEvents(await resolveSessionEvents('rt-child'), { sessionId: 'rt-child', tokenBudget: 1000 });
  child.resumeEventEmission();
  await appendTurn(child, '子代问题一'.repeat(60), '子代回答一'.repeat(60));
  await appendTurn(child, '子代问题二'.repeat(60), '子代回答二'.repeat(60));

  // Forced compaction: the transcript must cover the PARENT prefix (Pitfall 1).
  const record = await maybeCompactSession(child, 'deepseek', { force: true, summarizer: fakeSummarizer });
  assert.ok(record !== null, 'forced compaction must run');
  assert.ok(capturedTranscripts.at(-1)!.includes('背景讨论甲'), 'parent prefix entered the compaction transcript');
  assert.ok(record.coveredSeqEnd > cutSeq, 'coveredSeqEnd spans the parent prefix (normalized space)');

  // Post-compaction turn.
  await appendTurn(child, '压缩后的问题', '压缩后的回答');

  // Restart-equivalent: resolve from the stores and rebuild.
  const resolved = await resolveSessionEvents('rt-child');
  const restored = ChatSession.fromEvents(resolved, { sessionId: 'rt-child', tokenBudget: 1000 });
  assert.ok(restored.compaction !== null, 'compaction summary carried through re-resolution');
  const llm = restored.getMessagesForLLM();
  assert.ok(llm[0].content.includes('历史压缩摘要'), 'sourced summary prepended');
  const flat = llm.map((m) => m.content).join('\n');
  assert.ok(flat.includes('压缩后的问题') && flat.includes('压缩后的回答'), 'post-compaction turn replayed');
  assert.ok(!flat.includes('子代问题一'), 'pre-compaction child turn filtered by coveredSeqEnd');
  assert.ok(!flat.includes('背景讨论乙'), 'pre-compaction parent prefix filtered (covered by summary, not replayed)');
});

/* === 10. sessionRepo: createForkSession / getSession / parentTitle === */

test('10a. memory repo: createForkSession persists fork columns; list returns parentTitle', async () => {
  const repo = new MemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 'parent-1', workspaceId: 'ws-1' });
  await repo.updateTitle('parent-1', '父会话标题');
  await repo.createForkSession({ sessionId: 'fork-1', workspaceId: 'ws-1', parentSessionId: 'parent-1', forkCutSeq: 6, title: null });

  const meta = await repo.getSession('fork-1');
  assert.ok(meta !== null);
  assert.equal(meta!.parentSessionId, 'parent-1');
  assert.equal(meta!.forkCutSeq, 6);
  assert.equal(await repo.getSession('nope'), null);

  const rows = await repo.listSessionsByWorkspace('ws-1');
  const fork = rows.find((r) => r.sessionId === 'fork-1');
  assert.equal(fork!.parentTitle, '父会话标题', 'LEFT JOIN semantics mirrored in memory');
  const plain = rows.find((r) => r.sessionId === 'parent-1');
  assert.equal(plain!.parentTitle, null);
});

test('10b. SQL parity: fork insert / get / LEFT JOIN parentTitle against real 0007 schema', () => {
  const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src-tauri/migrations');
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0007_sessions.sql']) {
    db.exec(readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  const q = (sql: string) => sql.replace(/\$\d+/g, '?');
  const now = '2026-08-18T00:00:00Z';
  db.prepare(q('INSERT INTO sessions (session_id, workspace_id, title, created_at, last_active_at) VALUES ($1, $2, $3, $4, $5)')).run('sp', 'ws-1', '父标题', now, now);
  db.prepare(q(SESSION_FORK_INSERT_SQL)).run('sf', 'ws-1', 'sp', 6, now);

  const got = db.prepare(q(SESSION_GET_SQL)).get('sf') as Record<string, unknown>;
  assert.equal(got.parent_session_id, 'sp');
  assert.equal(got.fork_cut_seq, 6);
  assert.equal(got.title, null);

  const rows = db.prepare(q(SESSION_LIST_SQL)).all('ws-1') as Record<string, unknown>[];
  const forkRow = rows.find((r) => r.session_id === 'sf');
  assert.equal(forkRow!.parent_title, '父标题');
  const parentRow = rows.find((r) => r.session_id === 'sp');
  assert.equal(parentRow!.parent_title, null);
});
