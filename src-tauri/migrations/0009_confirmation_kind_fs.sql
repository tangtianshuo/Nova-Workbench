-- src-tauri/migrations/0009_confirmation_kind_fs.sql
-- Phase 23 (23-03): fs_write HITL kind. SQLite cannot ALTER a CHECK —
-- same copy → drop → rename rebuild as 0006/0008.

CREATE TABLE agent_confirmation_candidates_v9 (
  confirmation_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_write', 'destructive_action', 'deliverable_draft', 'exec_approval', 'fs_write')),
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

INSERT INTO agent_confirmation_candidates_v9 SELECT * FROM agent_confirmation_candidates;
DROP TABLE agent_confirmation_candidates;
ALTER TABLE agent_confirmation_candidates_v9 RENAME TO agent_confirmation_candidates;

CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_active
  ON agent_confirmation_candidates (kind, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_params_hash
  ON agent_confirmation_candidates (params_hash);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '9');
UPDATE meta SET value = '9' WHERE key = 'schema_version';
