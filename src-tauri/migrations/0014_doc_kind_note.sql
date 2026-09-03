-- src-tauri/migrations/0014_doc_kind_note.sql
-- Phase 31 (D-06, plan 31-02): doc workspace — doc_kind for global notes.
-- 全局归属哨兵方案:product_id='__global__' 表示无产品归属(不重建表,FTS/版本链零改动)。
-- 语义债:哨兵字符串而非 NULL,换取 FTS join 与既有索引零改动。

ALTER TABLE knowledge_docs ADD COLUMN doc_kind TEXT NOT NULL DEFAULT 'document';

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '14');
UPDATE meta SET value = '14' WHERE key = 'schema_version';
