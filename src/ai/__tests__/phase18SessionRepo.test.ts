// Phase 18 (v0.3.1) SESS-05: sessionRepo memory/sqlite parity tests.
// Memory repo behavior + SQL parity against real 0001+0007 migration SQL via
// node:sqlite (locks DDL drift — Pitfall 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  MemorySessionRepo,
  SESSION_UPSERT_SQL,
  SESSION_LIST_SQL,
  SESSION_TITLE_SQL,
  type SessionMeta,
  type SessionRepo,
} from '../sessionRepo';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src-tauri/migrations',
);

test('memory: upsert inserts createdAt/lastActiveAt, second call only bumps lastActiveAt', async () => {
  const repo = new MemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 's1', workspaceId: 'ws-1' });
  await repo.updateTitle('s1', 'First title');
  const before = (await repo.listSessionsByWorkspace('ws-1'))[0];
  await new Promise((r) => setTimeout(r, 5));
  await repo.upsertSessionMeta({ sessionId: 's1', workspaceId: 'ws-OTHER' });
  const after = (await repo.listSessionsByWorkspace('ws-1'))[0];
  assert.equal(after.workspaceId, 'ws-1'); // never overwritten
  assert.equal(after.title, 'First title'); // never overwritten
  assert.equal(after.createdAt, before.createdAt);
  assert.ok(after.lastActiveAt > before.lastActiveAt);
});

test('memory: updateTitle sets title on target row only', async () => {
  const repo = new MemorySessionRepo();
  await repo.upsertSessionMeta({ sessionId: 's1', workspaceId: 'ws-1' });
  await repo.upsertSessionMeta({ sessionId: 's2', workspaceId: 'ws-1' });
  await repo.updateTitle('s2', 'T2');
  const rows = await repo.listSessionsByWorkspace('ws-1');
  const s1 = rows.find((r: SessionMeta) => r.sessionId === 's1');
  const s2 = rows.find((r: SessionMeta) => r.sessionId === 's2');
  assert.equal(s1?.title, null);
  assert.equal(s2?.title, 'T2');
});

test('memory: listSessionsByWorkspace filters by workspace, DESC by lastActiveAt, NULL workspace visible everywhere', async () => {
  const repo = new MemorySessionRepo();
  const tick = () => new Promise((r) => setTimeout(r, 5));
  await repo.upsertSessionMeta({ sessionId: 'old', workspaceId: 'ws-1' });
  await tick();
  await repo.upsertSessionMeta({ sessionId: 'new', workspaceId: 'ws-1' });
  await tick();
  await repo.upsertSessionMeta({ sessionId: 'ws2', workspaceId: 'ws-2' });
  await tick();
  await repo.upsertSessionMeta({ sessionId: 'global', workspaceId: null });

  // insert order old → (sleep) → new → ws2 → global, so DESC = global, new, old.
  const ws1 = await repo.listSessionsByWorkspace('ws-1');
  assert.deepEqual(ws1.map((r: SessionMeta) => r.sessionId), ['global', 'new', 'old']);
  const ws2 = await repo.listSessionsByWorkspace('ws-2');
  assert.deepEqual(ws2.map((r: SessionMeta) => r.sessionId), ['global', 'ws2']);
});

/* === SQL parity: same behaviors against real migration SQL === */

// SQL parity uses the repo's own exported SQL strings ($N placeholders for
// tauri-plugin-sql) converted to node:sqlite positional `?`.
const q = (sql: string) => sql.replace(/\$\d+/g, '?');
const UPSERT_SQL = q(SESSION_UPSERT_SQL);
const LIST_SQL = q(SESSION_LIST_SQL);
const TITLE_SQL = q(SESSION_TITLE_SQL);

function buildDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_agent_events.sql', '0007_sessions.sql']) {
    db.exec(readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  return db;
}

function rowToMeta(r: Record<string, unknown>): SessionMeta {
  return {
    sessionId: r.session_id as string,
    workspaceId: (r.workspace_id as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    titleSource: (r.title_source as string | null) ?? null,
    parentSessionId: (r.parent_session_id as string | null) ?? null,
    forkCutSeq: (r.fork_cut_seq as number | null) ?? null,
    parentTitle: (r.parent_title as string | null) ?? null,
    createdAt: r.created_at as string,
    lastActiveAt: r.last_active_at as string,
  };
}

test('sqlite parity: upsert/list/title against real 0007 sessions table', () => {
  const db = buildDb();
  const upsert = db.prepare(UPSERT_SQL);

  upsert.run('s1', 'ws-1', '2026-08-18T00:00:00Z', '2026-08-18T00:00:00Z');
  db.prepare(TITLE_SQL).run('First title', 's1');
  upsert.run('s1', 'ws-OTHER', '2026-08-18T00:00:00Z', '2026-08-18T09:00:00Z'); // conflict path
  upsert.run('s2', 'ws-2', '2026-08-18T01:00:00Z', '2026-08-18T01:00:00Z');
  upsert.run('global', null, '2026-08-18T02:00:00Z', '2026-08-18T02:00:00Z');

  const ws1 = (db.prepare(LIST_SQL).all('ws-1') as Record<string, unknown>[]).map(rowToMeta);
  assert.deepEqual(ws1.map((m) => m.sessionId), ['s1', 'global']);
  const s1 = ws1[0];
  assert.equal(s1.workspaceId, 'ws-1'); // not overwritten by conflict upsert
  assert.equal(s1.title, 'First title'); // not overwritten
  assert.equal(s1.lastActiveAt, '2026-08-18T09:00:00Z'); // bumped
  assert.equal(s1.createdAt, '2026-08-18T00:00:00Z'); // not bumped

  db.prepare(TITLE_SQL).run('T2', 's2');
  const s2 = rowToMeta(db.prepare('SELECT * FROM sessions WHERE session_id = ?').get('s2') as Record<string, unknown>);
  assert.equal(s2.title, 'T2');
});

// Type-level: MemorySessionRepo satisfies the repo contract callers use.
const _repo: SessionRepo = new MemorySessionRepo();
void _repo;
