-- src-tauri/migrations/0013_workflow_templates.sql
-- Phase 30 (30-02): workflow templates + user-extended deliverable catalog.
-- source CHECK excludes 'builtin' — builtins live in the packaged JSON and are
-- merged at the presentation/search layer, never stored in SQLite (D-01).
-- skill_trigger / skill_tools_json are D-08 (v0.4 skill) reserved fields —
-- single template DSL, no second format later.

CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps_json TEXT NOT NULL,
  manifest_version INTEGER NOT NULL DEFAULT 1,
  skill_trigger TEXT,
  skill_tools_json TEXT,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','distilled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_source ON workflow_templates (source);

-- SC-4 user layer: user-added deliverable kinds. This phase ships table + read
-- path only (generate_deliverable validation union); write tools/UI in v0.4.
CREATE TABLE IF NOT EXISTS deliverable_catalog_user (
  code TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  phase_name TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'markdown',
  icon TEXT NOT NULL DEFAULT 'FileText',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '13');
UPDATE meta SET value = '13' WHERE key = 'schema_version';
