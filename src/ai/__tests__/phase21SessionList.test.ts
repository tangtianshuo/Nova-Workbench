// Phase 21 (LIST-01/TITLE-02): message-count aggregate, guarded updateTitle,
// formatRelativeTime.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  MemorySessionRepo,
  SESSION_TITLE_SQL,
  SESSION_MESSAGE_COUNT_SQL,
} from '../sessionRepo';
import { getEventStore, resetMemoryEventStore } from '../events/eventStore';
import { formatRelativeTime } from '../../lib/utils';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src-tauri/migrations',
);

test('memory: countMessagesBySession counts user/assistant messages, zero for empty', async () => {
  resetMemoryEventStore();
  const repo = new MemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 's1', workspaceId: 'ws-1' });
  await repo.upsertSessionMeta({ sessionId: 's2', workspaceId: 'ws-1' });
  const store = getEventStore();
  const mk = (sessionId: string, eventType: string) =>
    store.append({ sessionId, eventType, payload: {} });
  await mk('s1', 'user_message');
  await mk('s1', 'assistant_message');
  await mk('s1', 'tool_call'); // not a message
  await mk('s2', 'user_message');

  const counts = await repo.countMessagesBySession(['s1', 's2', 's-none']);
  assert.equal(counts.get('s1'), 2);
  assert.equal(counts.get('s2'), 1);
  assert.ok(!counts.has('s-none') || counts.get('s-none') === 0);
});

test('memory: updateTitle sets title+source once, refuses overwrite', async () => {
  const repo = new MemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 's1', workspaceId: 'ws-1' });
  await repo.updateTitle('s1', '新标题', 'llm');
  let row = await repo.getSession('s1');
  assert.equal(row?.title, '新标题');
  assert.equal(row?.titleSource, 'llm');

  await repo.updateTitle('s1', '另标题', 'fallback'); // NO-OP
  row = await repo.getSession('s1');
  assert.equal(row?.title, '新标题');
  assert.equal(row?.titleSource, 'llm');
});

test('SQL: SESSION_TITLE_SQL guards with title IS NULL and writes title_source', () => {
  assert.ok(SESSION_TITLE_SQL.includes('title_source = $2'));
  assert.ok(SESSION_TITLE_SQL.includes('AND title IS NULL'));
});

test('SQL: SESSION_MESSAGE_COUNT_SQL groups by session over message event types', () => {
  assert.ok(SESSION_MESSAGE_COUNT_SQL.includes('GROUP BY session_id'));
  assert.match(SESSION_MESSAGE_COUNT_SQL, /event_type IN \('user_message','assistant_message'\)/);
});

/* === SQL parity against real migrations === */

const q = (sql: string) => sql.replace(/\$\d+/g, '?');

test('sqlite parity: guarded title + message count against real schema', async () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_agent_events.sql', '0007_sessions.sql']) {
    db.exec(readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  db.prepare(`INSERT INTO sessions (session_id, workspace_id, created_at, last_active_at) VALUES (?, 'ws-1', ?, ?)`)
    .run('s1', '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z');

  const TITLE_SQL = q(SESSION_TITLE_SQL);
  db.prepare(TITLE_SQL).run('新标题', 'llm', 's1');
  db.prepare(TITLE_SQL).run('另标题', 'fallback', 's1'); // no-op
  const row = db.prepare('SELECT title, title_source FROM sessions WHERE session_id = ?').get('s1') as Record<string, unknown>;
  assert.equal(row.title, '新标题');
  assert.equal(row.title_source, 'llm');

  const ins = db.prepare(`INSERT INTO agent_events (event_id, session_id, seq, event_type, created_at, payload_json) VALUES (?, ?, ?, ?, ?, '{}')`);
  ins.run('e1', 's1', 1, 'user_message', '2026-08-18T00:00:01Z');
  ins.run('e2', 's1', 2, 'assistant_message', '2026-08-18T00:00:02Z');
  ins.run('e3', 's1', 3, 'tool_call', '2026-08-18T00:00:03Z');

  // dynamic IN-list, same shape as the exported constant
  const ids = ['s1'];
  const sql = `SELECT session_id, COUNT(*) AS message_count FROM agent_events WHERE session_id IN (${ids.map(() => '?').join(', ')}) AND event_type IN ('user_message','assistant_message') GROUP BY session_id`;
  const counts = db.prepare(sql).all(...ids) as Record<string, unknown>[];
  assert.equal(counts[0].message_count, 2);
});

/* === formatRelativeTime === */

test('formatRelativeTime buckets', () => {
  const now = new Date('2026-08-19T12:00:00Z');
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);
  assert.equal(formatRelativeTime(now, now), '刚刚');
  assert.equal(formatRelativeTime(at(5 * 60_000), now), '5 分钟前');
  assert.equal(formatRelativeTime(at(59 * 60_000), now), '59 分钟前');
  assert.equal(formatRelativeTime(at(3 * 3_600_000), now), '3 小时前');
  assert.equal(formatRelativeTime(at(6 * 86_400_000), now), '6 天前');
  assert.equal(formatRelativeTime(at(7 * 86_400_000), now), '8月12日');
  assert.equal(formatRelativeTime('2026-08-12T12:00:00Z', now), '8月12日'); // string input
});
