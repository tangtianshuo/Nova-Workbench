-- 0007: sessions 元数据表 + 历史会话回填 + agent_events workspace_id 回填 (v0.3.1 Phase 18, SESS-01/SESS-06)
-- Forward-only additive; all backfill in SQL (zero TypeScript backfill — Pitfall 2).
-- Idempotent: safe to re-run (INSERT OR IGNORE / IF NOT EXISTS / guarded UPDATE).

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  title TEXT,
  title_source TEXT,
  parent_session_id TEXT,
  fork_cut_seq INTEGER,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions (workspace_id, last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_workspace ON agent_events (workspace_id, created_at);

-- Backfill sessions from historical agent_events. workspace_id sourced from the
-- zustand persist blob (kv_store 'nova-workspace' $.state.activeWorkspaceId);
-- NULL = visible everywhere (acceptable when no workspace was ever active).
INSERT OR IGNORE INTO sessions (session_id, workspace_id, created_at, last_active_at)
SELECT
  e.session_id,
  (SELECT json_extract(v.value, '$.state.activeWorkspaceId') FROM kv_store v WHERE v.key = 'nova-workspace'),
  MIN(e.created_at),
  MAX(e.created_at)
FROM agent_events e
GROUP BY e.session_id;

-- Stamp workspace_id onto historical events (only NULL rows, so re-run is a no-op).
UPDATE agent_events
SET workspace_id = (
  SELECT json_extract(v.value, '$.state.activeWorkspaceId') FROM kv_store v WHERE v.key = 'nova-workspace'
)
WHERE workspace_id IS NULL;

-- Idempotent schema_version bump — initializeDatabase.APP_SCHEMA_VERSION must equal 7.
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '7');
UPDATE meta SET value = '7' WHERE key = 'schema_version';
