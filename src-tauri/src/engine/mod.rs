// src-tauri/src/engine/mod.rs
// Phase 22 (v0.3.2) — Rust run engine. Modules are added one per plan as the
// TS spec (src/ai/*) is ported. Not yet wired into lib.rs builder (wiring in 22-06).
pub mod db;
pub mod params_hash;
pub mod fts_tokens;
pub mod token_estimate;
pub mod event_log;
pub mod confirmations;
pub mod chat_session;
pub mod compaction;
pub mod fork;
pub mod context_assembler;
pub mod exec;
pub mod fs_ops;
pub mod tools;
pub mod ingest;
pub mod channel;
pub mod loop_runner;
pub mod restore;
pub mod scheduler;
pub mod commands;
pub mod parity;
pub mod pm_store;
pub mod workflow_store;
