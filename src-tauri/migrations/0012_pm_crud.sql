-- src-tauri/migrations/0012_pm_crud.sql
-- Phase 29 (29-01): PM CRUD relational foundation — tasks/schedules/task_categories
-- + pm_write confirmation kind. Dates/times stored as TEXT, zero conversion.

CREATE TABLE IF NOT EXISTS task_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'bg-blue-500',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '未开始',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  deadline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  assignee TEXT NOT NULL DEFAULT '',
  assignee_avatar TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL DEFAULT '',
  scheduled_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks (deadline);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'reminder' CHECK (type IN ('meeting','deadline','task','reminder','review','sync')),
  location TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  task_id TEXT,
  status TEXT NOT NULL DEFAULT '未开始',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules (date);
CREATE INDEX IF NOT EXISTS idx_schedules_project_id ON schedules (project_id);

-- pm_write confirmation kind (SQLite cannot ALTER a CHECK — copy → drop → rename
-- rebuild as 0006/0008/0009/0011).
CREATE TABLE agent_confirmation_candidates_v12 (
  confirmation_token TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('knowledge_write', 'destructive_action', 'deliverable_draft', 'exec_approval', 'fs_write', 'ingestion_batch', 'pm_write')),
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
INSERT INTO agent_confirmation_candidates_v12 SELECT * FROM agent_confirmation_candidates;
DROP TABLE agent_confirmation_candidates;
ALTER TABLE agent_confirmation_candidates_v12 RENAME TO agent_confirmation_candidates;
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_active ON agent_confirmation_candidates (kind, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_confirmation_candidates_params_hash ON agent_confirmation_candidates (params_hash);

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '12');
UPDATE meta SET value = '12' WHERE key = 'schema_version';
