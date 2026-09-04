-- 0015: workspace repo binding (Phase 32-01, CP-4 repo scope lock).
-- Deviation from plan: no `workspaces` SQL table exists — workspace records
-- live in the kv_store zustand persist blob ('nova-workspace'). Engine-side
-- repo_root gets its own keyed table instead of ALTER TABLE workspaces.
-- NULL/absent row = workspace not bound to a repo (coding tools fail-safe).
CREATE TABLE IF NOT EXISTS workspace_repo_roots (
  workspace_id TEXT PRIMARY KEY,
  repo_root TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
