-- src-tauri/migrations/0005_deliverable_source_event.sql
-- Phase 16 (DELIV-03). Forward-only additive; no DROP / ALTER DROP ever in this directory.
-- AI 溯源事件指针:落槽 doc 记录生成 turn 的 correlation_id,
-- SELECT * FROM agent_events WHERE correlation_id = source_event_id 可重建完整生成回合。
ALTER TABLE knowledge_docs ADD COLUMN source_event_id TEXT;
