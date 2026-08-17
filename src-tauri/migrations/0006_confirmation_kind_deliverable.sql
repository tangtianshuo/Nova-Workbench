-- src-tauri/migrations/0006_confirmation_kind_deliverable.sql
-- GAP-16-01 fix (v0.3.0 UAT): Phase 16 added the 'deliverable_draft' kind at the
-- application layer (confirmationStore.ConfirmationKind) but 0003's CHECK constraint
-- only allowed two kinds — real SQLite INSERTs failed with (code: 275). Node tests
-- never caught it because they run MemoryConfirmationStore.
-- SQLite cannot ALTER a CHECK: canonical copy → drop → rename rebuild. The DROP here
-- is part of that rebuild (data fully copied first), not an ALTER DROP.

CREATE TABLE agent_confirmation_candidates_v6 (
  confirmation_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_write', 'destructive_action', 'deliverable_draft')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'consumed', 'rejected')),
  params_hash TEXT NOT NULL,
  params_json TEXT NOT NULL,
  summary TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  consumed_at TEXT,
  rejected_at TEXT
);

INSERT INTO agent_confirmation_candidates_v6 SELECT * FROM agent_confirmation_candidates;
DROP TABLE agent_confirmation_candidates;
ALTER TABLE agent_confirmation_candidates_v6 RENAME TO agent_confirmation_candidates;

CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_active
  ON agent_confirmation_candidates (kind, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_params_hash
  ON agent_confirmation_candidates (params_hash);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '6');
UPDATE meta SET value = '6' WHERE key = 'schema_version';
