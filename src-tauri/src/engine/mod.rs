// src-tauri/src/engine/mod.rs
// Phase 22 (v0.3.2) — Rust run engine. Modules are added one per plan as the
// TS spec (src/ai/*) is ported. Not yet wired into lib.rs builder (wiring in 22-06).
pub mod db;
pub mod params_hash;
pub mod fts_tokens;
pub mod token_estimate;
