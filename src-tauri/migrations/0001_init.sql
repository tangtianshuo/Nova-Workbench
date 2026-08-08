-- src-tauri/migrations/0001_init.sql
-- Per D-05. Forward-only additive; no DROP / ALTER DROP ever in this directory.

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Idempotent seed rows. INSERT OR IGNORE so re-running this migration is safe.
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO meta (key, value) VALUES ('has_seeded', 'false');
