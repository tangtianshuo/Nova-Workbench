-- 0010: workspace ingestion idempotency (Phase 27-01).
-- One row per successfully extracted content hash; failed extractions are
-- NOT recorded (D-04: every rescan retries them).
CREATE TABLE IF NOT EXISTS ingested_documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,           -- extracted/partial
  reason TEXT,
  doc_id TEXT,                    -- backfilled with knowledge_docs.id after consume
  extracted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingested_documents_workspace ON ingested_documents(workspace_id);
