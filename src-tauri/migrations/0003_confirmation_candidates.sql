-- src-tauri/migrations/0003_confirmation_candidates.sql
-- Phase 14 (v0.3.0). Forward-only additive; no DROP / ALTER DROP ever in this directory.
-- EVT-05: HITL confirmation candidates survive app restarts. params_hash is the
-- SHA-256 hex of the canonicalized params JSON; consumption is an atomic conditional
-- UPDATE (status='confirmed' AND consumed_at IS NULL) so restarts or concurrent
-- callers can never double-consume. 'expired' is a DERIVED state: rows keep their
-- status and reads compare expires_at against the current time.

CREATE TABLE IF NOT EXISTS agent_confirmation_candidates (
  confirmation_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_write', 'destructive_action')),
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

CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_active
  ON agent_confirmation_candidates (kind, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_params_hash
  ON agent_confirmation_candidates (params_hash);

-- Idempotent schema_version bump — initializeDatabase.APP_SCHEMA_VERSION must equal 3.
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '3');
UPDATE meta SET value = '3' WHERE key = 'schema_version';
