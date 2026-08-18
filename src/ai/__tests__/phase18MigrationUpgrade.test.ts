// Phase 18 (v0.3.1) SESS-01/SESS-06: migration 0007 upgrade test.
// Builds a v0.3.0 fixture DB (0001..0006), runs 0007, and locks the
// highest-risk invariant: historical events are preserved byte-identically,
// every session_id gets a sessions row, and re-running 0007 is a no-op.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src-tauri/migrations',
);

const V030_MIGRATIONS = [
  '0001_init.sql',
  '0002_agent_events.sql',
  '0003_confirmation_candidates.sql',
  '0004_memories_knowledge_fts.sql',
  '0005_deliverable_source_event.sql',
  '0006_confirmation_kind_deliverable.sql',
];

function buildV030Db(kvBlob?: string): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const f of V030_MIGRATIONS) {
    db.exec(readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  if (kvBlob !== undefined) {
    db.prepare('INSERT INTO kv_store (key, value) VALUES (?, ?)').run('nova-workspace', kvBlob);
  }
  // 3 sessions x 4 events, workspace_id NULL (pre-0007 rows never set it).
  const ins = db.prepare(
    `INSERT INTO agent_events (event_id, session_id, seq, event_type, created_at, workspace_id, payload_json)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
  );
  for (let s = 1; s <= 3; s++) {
    for (let q = 1; q <= 4; q++) {
      ins.run(
        `ev-${s}-${q}`,
        `sess-${s}`,
        q,
        q === 4 ? 'turn_ended' : 'user_message',
        `2026-08-1${s}T0${q}:00:00Z`,
        JSON.stringify({ i: s * 10 + q }),
      );
    }
  }
  db.prepare(
    `INSERT INTO agent_confirmation_candidates
       (confirmation_token, kind, status, params_hash, params_json, summary, session_id, created_at, expires_at)
     VALUES ('tok-1', 'knowledge_write', 'pending', 'h1', '{}', NULL, 'sess-1',
             '2026-08-17T00:00:00Z', '2026-08-24T00:00:00Z')`,
  ).run();
  return db;
}

interface Snapshot {
  sessions: unknown[];
  eventCount: number;
  eventChecksums: string[];
  metaVersion: string | undefined;
}

function snapshot(db: DatabaseSync): Snapshot {
  const sessions = db
    .prepare('SELECT * FROM sessions ORDER BY session_id')
    .all();
  const events = db
    .prepare('SELECT session_id, seq, event_type, payload_json, workspace_id FROM agent_events ORDER BY session_id, seq')
    .all() as Record<string, unknown>[];
  return {
    sessions,
    eventCount: events.length,
    eventChecksums: events.map((e) => JSON.stringify(e)),
    metaVersion: (
      db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined
    )?.value,
  };
}

const sql0007 = () => readFileSync(path.join(migrationsDir, '0007_sessions.sql'), 'utf8');

test('0007 backfills sessions + workspace_id from kv_store, idempotent, zero event loss', () => {
  const db = buildV030Db('{"state":{"activeWorkspaceId":"ws-1"},"version":1}');
  db.exec(sql0007());

  // Every session_id has a sessions row with workspace stamped from kv_store.
  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY session_id')
    .all() as Record<string, unknown>[];
  assert.equal(rows.length, 3);
  for (const r of rows) {
    assert.equal(r.workspace_id, 'ws-1');
    assert.equal(r.title, null);
    assert.equal(r.parent_session_id, null);
    assert.equal(r.fork_cut_seq, null);
    assert.equal(r.created_at, `2026-08-1${String(r.session_id).slice(-1)}T01:00:00Z`);
    assert.equal(r.last_active_at, `2026-08-1${String(r.session_id).slice(-1)}T04:00:00Z`);
  }

  // Events preserved byte-identically; workspace_id backfilled on all rows.
  const events = db
    .prepare('SELECT session_id, seq, payload_json, workspace_id FROM agent_events ORDER BY session_id, seq')
    .all() as Record<string, unknown>[];
  assert.equal(events.length, 12);
  for (let s = 1; s <= 3; s++) {
    for (let q = 1; q <= 4; q++) {
      const e = events[(s - 1) * 4 + (q - 1)];
      assert.equal(e.session_id, `sess-${s}`);
      assert.equal(e.seq, q);
      assert.deepEqual(JSON.parse(e.payload_json as string), { i: s * 10 + q });
      assert.equal(e.workspace_id, 'ws-1');
    }
  }

  // Candidate row untouched.
  const cand = db
    .prepare("SELECT status FROM agent_confirmation_candidates WHERE confirmation_token = 'tok-1'")
    .get() as { status: string };
  assert.equal(cand.status, 'pending');

  // Idempotent: re-run 0007 → identical final state.
  const before = snapshot(db);
  db.exec(sql0007());
  assert.deepEqual(snapshot(db), before);
});

test('0007 without kv_store row: sessions backfilled with workspace_id NULL, no error', () => {
  const db = buildV030Db();
  db.exec(sql0007());
  const rows = db.prepare('SELECT workspace_id FROM sessions').all() as { workspace_id: unknown }[];
  assert.equal(rows.length, 3);
  for (const r of rows) assert.equal(r.workspace_id, null);
});

test('0007 bumps meta.schema_version to 7', () => {
  const db = buildV030Db('{"state":{"activeWorkspaceId":"ws-1"},"version":1}');
  db.exec(sql0007());
  const v = db
    .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
    .get() as { value: string };
  assert.equal(v.value, '7');
});
