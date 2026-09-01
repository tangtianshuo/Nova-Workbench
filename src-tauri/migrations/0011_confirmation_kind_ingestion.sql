-- src-tauri/migrations/0011_confirmation_kind_ingestion.sql
-- Phase 27 (27-02): ingestion_batch HITL kind (batch items array in params_json).
-- SQLite cannot ALTER a CHECK — same copy → drop → rename rebuild as 0006/0008/0009.

CREATE TABLE agent_confirmation_candidates_v11 (
  confirmation_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_write', 'destructive_action', 'deliverable_draft', 'exec_approval', 'fs_write', 'ingestion_batch')),
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

INSERT INTO agent_confirmation_candidates_v11 SELECT * FROM agent_confirmation_candidates;
DROP TABLE agent_confirmation_candidates;
ALTER TABLE agent_confirmation_candidates_v11 RENAME TO agent_confirmation_candidates;

CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_active
  ON agent_confirmation_candidates (kind, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_params_hash
  ON agent_confirmation_candidates (params_hash);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '11');
UPDATE meta SET value = '11' WHERE key = 'schema_version';
