---
phase: 22-loop-replay-parity
plan: 03
subsystem: engine
tags: [event-log, confirmations, hitl, sqlite, rusqlite]
requires: ["22-01 (db.rs + engine skeleton)", "22-02 (params_hash)"]
provides: ["event_log append/list/invariants/artifacts/sessions/transaction", "confirmations create/dedup/confirm/consume/reject", "memory_candidates INSERT writer"]
affects: [src-tauri/src/engine/mod.rs]
tech-stack:
  added: []
  patterns: ["SQL-side seq allocation via INSERT subquery", "atomic conditional UPDATE with named_params $N binding", "hand-formatted semantic-key-order JSON in modelText"]
key-files:
  created: [src-tauri/src/engine/event_log.rs, src-tauri/src/engine/confirmations.rs]
  modified: [src-tauri/src/engine/db.rs, src-tauri/src/engine/mod.rs]
decisions:
  - "$1/$2 in verbatim TS SQL are NAMED params in rusqlite (bound by appearance order, not number) — use named_params! to keep SQL byte-identical"
  - "modelText embedded JSON ({\"ok\":true,...} key order) hand-formatted with format!, never serde-serialized (research rule #5)"
  - "upsert_session title is write-once (COALESCE(sessions.title, excluded.title)) matching 21-01 decision"
  - "TDD red/green collapsed: Rust unit tests live in the same module file; both tasks committed green"
metrics:
  duration: 50m
  completed: 2026-08-24
---

# Phase 22 Plan 03: Event Store & Confirmation Queue Summary

**One-liner:** event_log + confirmations ported to rusqlite with verbatim TS SQL (SQL-side seq, five invariant codes, atomic conditional UPDATEs) plus a real transaction wrapping event+artifact+candidate writes.

## What Was Done

### Task 1: event_log.rs (commit 5cd48d4)
- `append` uses the verbatim INSERT with `(SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_events WHERE session_id = ?2)` subquery — seq never allocated in Rust; authoritative seq re-read from the row.
- `list_events` / `list_sessions` / `save_artifact` / `get_artifact`: SQL verbatim from eventStore.ts:141-256.
- `check_event_stream`: invariants.ts 1:1 — SEQ_GAP / MISSING_TOOL_RESULT / RESULT_BEFORE_CALL / DUPLICATE_TOOL_CALL / DUPLICATE_TOOL_RESULT codes byte-identical; assert format `[event-log] invariant violation: CODE@seqN[:toolCallId]; ...` replicated.
- `prepare_tool_result`: 4096/512 thresholds, `[tool_result <name>] ` prefix, artifact INSERT with byte_size = json char length; embedded JSON key order (`ok` first, `ok/summary/artifactId/head`) hand-formatted per research rule #5.
- `upsert_session` (0007 columns, title write-once).
- `commit_turn`: rusqlite `conn.transaction()` wrapping events + artifacts + candidates — the DELIV-04 compensating-approximation debt elimination; no LLM/network inside.
- `db.rs` gained a `#[cfg(test)] testing` module running the shared `src-tauri/migrations/` suite on in-memory and file-backed (WAL) connections.
- Tests: seq contiguity, 50 concurrent appends under the single-connection Mutex (no gaps/UNIQUE conflicts), all five violation codes, threshold/artifact behavior, transactional commit, upsert semantics.

### Task 2: confirmations.rs (commit 48b2271)
- `confirm` / `consume` / `reject`: conditional UPDATEs verbatim from confirmationStore.ts:283-346 (`COALESCE(confirmed_at, $2)`, `expires_at > $2`, status guards); rowsAffected==1 judgment via rusqlite `execute` count.
- `create_candidate` dedup: destructive_action by params_hash; deliverable_draft by (code, productId, title, draft) — eventId excluded from the dedup key; knowledge_write never dedups (TS parity).
- `consume(token, expected_params)`: None → hash recomputed from stored params (deliverable 确认→编辑→落槽 locked decision); Some → caller-args hash compared (params_mismatch).
- `insert_memory_candidate`: memoryStore.ts SQLite INSERT columns verbatim (dedup/evict orchestration deferred to the loop layer per sole-writer boundary).
- Concurrency test: two threads with separate connections to a WAL file DB consume one token — exactly one Ok, one Err (test `concurrent_consume_exactly_one_wins`).

## Verification

`cargo test` — **57 passed, 0 failed** (2 ignored UAT probes). Filtered: event_log 7/7, confirmations 10/10. Acceptance greps confirmed: `COALESCE(MAX(seq)`, `%.3fZ`, `tool_result ` in event_log.rs; `COALESCE(confirmed_at`, `expires_at > ` in confirmations.rs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] rusqlite binds $N markers by appearance order, not number**
- **Found during:** Task 2 first test run — confirm/consume silently swapped token and now bindings (SET clause's `$2` appears before WHERE's `$1`).
- **Fix:** `named_params! {"$1": token, "$2": now}` — keeps the TS SQL byte-identical while binding by name.
- **Files modified:** src-tauri/src/engine/confirmations.rs
- **Commit:** 48b2271

**2. [Process] TDD red/green collapsed to single green commit per task**
- Rust unit tests live in the same module file as the implementation; a non-compiling RED commit has no value. Both tasks verified green (`cargo test`) before commit.

## Known Stubs

None. All exported functions write/read real SQLite rows.

## Self-Check: PASSED

- src-tauri/src/engine/event_log.rs — FOUND (commit 5cd48d4)
- src-tauri/src/engine/confirmations.rs — FOUND (commit 48b2271)
- cargo test 57/57 green
