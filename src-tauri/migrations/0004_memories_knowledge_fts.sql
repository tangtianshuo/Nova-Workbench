-- src-tauri/migrations/0004_memories_knowledge_fts.sql
-- Phase 15 (v0.3.0). Forward-only additive; no DROP / ALTER DROP ever in this directory.
-- MEM-01..05 storage foundation: memory candidates (anti-flood queue), versioned
-- memories (supersedes chain), versioned knowledge docs, and a standalone FTS5
-- virtual table for hybrid retrieval (MEM-06). FTS rows are never updated or
-- deleted — superseded docs are filtered at query time by joining back to
-- knowledge_docs (tauri-plugin-sql has no cross-execute transactions, so every
-- lifecycle operation must be a single atomic statement).
-- This migration doubles as the FTS5 runtime probe: if the bundled SQLite lacks
-- FTS5, migration fails -> initializeDatabase sanity refuses to start (D-04).

CREATE TABLE IF NOT EXISTS memory_candidates (
  candidate_token TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('model_inferred', 'user_directed')),
  scope TEXT NOT NULL DEFAULT 'global',
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'consumed', 'rejected')),
  session_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  consumed_at TEXT,
  rejected_at TEXT
);

-- Dedup key does double duty: pending dedup + permanent rejected re-propose block.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_candidates_hash
  ON memory_candidates (content_hash);
CREATE INDEX IF NOT EXISTS idx_memory_candidates_active
  ON memory_candidates (status, created_at);

CREATE TABLE IF NOT EXISTS memories (
  memory_rowid INTEGER PRIMARY KEY,
  memory_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  scope TEXT NOT NULL,
  product_id TEXT,
  source_type TEXT NOT NULL,
  source_session_id TEXT,
  source_candidate_token TEXT,
  supersedes_rowid INTEGER,
  created_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  superseded_at TEXT,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_id_version ON memories (memory_id, version);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  doc_rowid INTEGER PRIMARY KEY,
  doc_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'seed',
  source_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  superseded_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_docs_id_version ON knowledge_docs (doc_id, version);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_product ON knowledge_docs (product_id, updated_at);

-- Standalone FTS5 (NOT external-content, NOT contentless — see Phase 15 research
-- "Don't Hand-Roll"). Text columns store pre-segmented tokens (toFtsIndexedText);
-- doc_rowid UNINDEXED is the join anchor back to knowledge_docs.
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title, content, summary, tags,
  doc_rowid UNINDEXED
);

-- Idempotent schema_version bump — initializeDatabase.APP_SCHEMA_VERSION must equal 4.
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '4');
UPDATE meta SET value = '4' WHERE key = 'schema_version';
