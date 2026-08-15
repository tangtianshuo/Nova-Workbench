-- src-tauri/migrations/0002_agent_events.sql
-- Phase 13 (v0.3.0). Forward-only additive; no DROP / ALTER DROP ever in this directory.
-- Agent Event Log: append-only immutable events, the single source of truth for agent
-- runs. Writes happen JS-side via tauri-plugin-sql; seq is allocated SQL-side.

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS agent_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  workspace_id TEXT,
  product_id TEXT,
  project_id TEXT,
  correlation_id TEXT,
  payload_json TEXT NOT NULL,
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_agent_events_session_seq ON agent_events (session_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_events_product ON agent_events (product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events (event_type);

-- Oversized tool results (> 4KB): full content lives here; model history keeps
-- summary + artifact_id + head fragment (see src/ai/events/artifacts.ts).
CREATE TABLE IF NOT EXISTS agent_artifacts (
  artifact_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_session ON agent_artifacts (session_id);

-- Idempotent schema_version bump — initializeDatabase.APP_SCHEMA_VERSION must equal 2.
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '2');
UPDATE meta SET value = '2' WHERE key = 'schema_version';
