-- src-tauri/migrations/0008_confirmation_kind_exec.sql
-- Phase 23 (23-02): exec_approval HITL kind. SQLite cannot ALTER a CHECK —
-- same copy → drop → rename rebuild as 0006 (data fully copied first; the DROP
-- is part of that rebuild, not an ALTER DROP).

CREATE TABLE agent_confirmation_candidates_v8 (
  confirmation_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_write', 'destructive_action', 'deliverable_draft', 'exec_approval')),
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

INSERT INTO agent_confirmation_candidates_v8 SELECT * FROM agent_confirmation_candidates;
DROP TABLE agent_confirmation_candidates;
ALTER TABLE agent_confirmation_candidates_v8 RENAME TO agent_confirmation_candidates;

CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_active
  ON agent_confirmation_candidates (kind, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_params_hash
  ON agent_confirmation_candidates (params_hash);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '8');
UPDATE meta SET value = '8' WHERE key = 'schema_version';
