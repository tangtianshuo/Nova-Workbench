// GAP-16-01 regression: the app layer (confirmationStore.ConfirmationKind) and the
// SQL CHECK constraints drifted apart — 'deliverable_draft' INSERTs failed with
// (code: 275) only on real SQLite (Node tests run MemoryConfirmationStore).
// This test executes the REAL migration .sql files against node:sqlite so DDL drift
// fails in CI, not in a human UAT session.
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

const confirmationKinds = ['knowledge_write', 'destructive_action', 'deliverable_draft'] as const;

function insertKind(db: DatabaseSync, kind: string): void {
  db.prepare(
    `INSERT INTO agent_confirmation_candidates
       (confirmation_token, kind, status, params_hash, params_json, summary, session_id, created_at, expires_at)
     VALUES (?, ?, 'pending', ?, '{}', NULL, NULL, '2026-08-17T00:00:00Z', '2026-08-24T00:00:00Z')`,
  ).run(`token-${kind}`, kind, `hash-${kind}`);
}

test('SQL CHECK constraints accept every ConfirmationKind the app layer can write', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(path.join(migrationsDir, '0001_init.sql'), 'utf8'));
  db.exec(readFileSync(path.join(migrationsDir, '0003_confirmation_candidates.sql'), 'utf8'));

  // Pre-0006 constraint accepted the two original kinds...
  insertKind(db, 'knowledge_write');
  insertKind(db, 'destructive_action');
  // ...and rejected the Phase 16 kind (the original bug).
  assert.throws(() => insertKind(db, 'deliverable_draft'));

  // 0006 rebuild widens the CHECK and preserves existing rows.
  db.exec(readFileSync(path.join(migrationsDir, '0006_confirmation_kind_deliverable.sql'), 'utf8'));
  insertKind(db, 'deliverable_draft');
  const count = db.prepare('SELECT COUNT(*) n FROM agent_confirmation_candidates').get() as { n: number };
  assert.equal(count.n, 3);

  // Unknown kinds must still be rejected — the constraint is a real boundary.
  assert.throws(() => insertKind(db, 'something_else'));
});
