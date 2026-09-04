-- 0016: code_edit HITL kind (Phase 32-03).
-- SQLite cannot ALTER a CHECK or ADD COLUMN in one rebuild — copy → drop →
-- rename as 0008/0009/0011/0012. Two additions beyond the new kind:
--   reject_reason TEXT — why a candidate was rejected (user reason or run-cancel cascade)
--   base_hash    TEXT — sha256 of the target file at proposal time (code_edit
--                      stale-detection at apply, CP-3; NULL for other kinds)
CREATE TABLE agent_confirmation_candidates_v16 (
  confirmation_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_write', 'destructive_action', 'deliverable_draft', 'exec_approval', 'fs_write', 'ingestion_batch', 'pm_write', 'code_edit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'consumed', 'rejected')),
  params_hash TEXT NOT NULL,
  params_json TEXT NOT NULL,
  summary TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  consumed_at TEXT,
  rejected_at TEXT,
  reject_reason TEXT,
  base_hash TEXT
);

INSERT INTO agent_confirmation_candidates_v16
  (confirmation_token, kind, status, params_hash, params_json, summary, session_id,
   created_at, expires_at, confirmed_at, consumed_at, rejected_at)
  SELECT confirmation_token, kind, status, params_hash, params_json, summary, session_id,
         created_at, expires_at, confirmed_at, consumed_at, rejected_at
  FROM agent_confirmation_candidates;
DROP TABLE agent_confirmation_candidates;
ALTER TABLE agent_confirmation_candidates_v16 RENAME TO agent_confirmation_candidates;

CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_active
  ON agent_confirmation_candidates (kind, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_params_hash
  ON agent_confirmation_candidates (params_hash);

UPDATE meta SET value = '16' WHERE key = 'schema_version';
