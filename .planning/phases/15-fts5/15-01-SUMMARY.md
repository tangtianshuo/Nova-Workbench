---
phase: 15-fts5
plan: 01
subsystem: storage-foundation
tags: [sqlite, fts5, migration, memory, cjk-tokenizer]
requires:
  - "tauri-plugin-sql migrations 0001-0003 (schema_version=3)"
  - "src/ai/paramsHash.ts computeParamsHash (Phase 14)"
  - "confirmationStore.ts dual-impl pattern (Phase 14)"
provides:
  - "migration 0004: memory_candidates / memories / knowledge_docs / knowledge_fts FTS5 virtual table"
  - "src/ai/ftsTokens.ts: toFtsTokens / toFtsIndexedText / toFtsMatchString (index+query same source)"
  - "src/ai/memoryStore.ts: getMemoryStore dual impl — propose/confirm/reject/consumeIntoMemories/insertMemory/listActiveMemories/listAllMemories/listRecentUserDirected/deleteByProduct/listRejected/stats"
affects:
  - "src/ai/tools/knowledgeSearch.ts (lexicalTerms extracted, now consumes toFtsTokens)"
  - "src/stores/storage/initializeDatabase.ts (APP_SCHEMA_VERSION 3→4)"
  - "src-tauri/src/lib.rs (sql_migrations 4th entry)"
tech-stack:
  added: []  # zero new deps — FTS5 is bundled-SQLite built-in
  patterns:
    - "standalone FTS5 + join-back supersede filter (no FTS row deletes, no transactions)"
    - "single-statement cap eviction via UPDATE + subselect"
    - "user_directed auto confirm+consume chain inside propose (locked decision)"
key-files:
  created:
    - src-tauri/migrations/0004_memories_knowledge_fts.sql
    - src/ai/ftsTokens.ts
    - src/ai/memoryStore.ts
    - src/ai/__tests__/phase15FtsTokens.test.ts
    - src/ai/__tests__/phase15MemoryStore.test.ts
  modified:
    - src-tauri/src/lib.rs
    - src/stores/storage/initializeDatabase.ts
    - src/ai/tools/knowledgeSearch.ts
decisions:
  - "Expired-pending hash hit refreshes TTL in place (UNIQUE content_hash blocks a new row); rejected+user_directed revives the row — explicit user instruction beats rejection history"
  - "Cap eviction runs BEFORE insert (plan step order count→evict→insert); first implementation checked after insert and evicted at the 20th candidate — caught by tests, fixed in both impls"
  - "Plan's Test 4/5 expected strings contradicted the plan's own verbatim implementation order (latin words before CJK); tests follow the mandated implementation — MATCH is order-insensitive implicit AND"
metrics:
  duration: ~11 min
  completed: 2026-08-15
---

# Phase 15 Plan 01: Storage Foundation (Migration 0004 + ftsTokens + memoryStore) Summary

SQLite storage substrate for Phase 15: migration 0004 (memory candidates, versioned memories, versioned knowledge docs, standalone FTS5 virtual table), shared CJK tokenizer with injection-proof MATCH construction, and the dual-impl memoryStore with anti-flood trio and supersedes chain. 96/96 tests green (80 baseline + 16 new), lint clean, zero new dependencies.

## What Was Built

### Task 1 — Migration 0004 trio (commit c6b603a)
- `src-tauri/migrations/0004_memories_knowledge_fts.sql`: 3 tables + 5 indexes + `CREATE VIRTUAL TABLE ... USING fts5` (standalone, `doc_rowid UNINDEXED` join anchor). UNIQUE `idx_memory_candidates_hash` does double duty: pending dedup + permanent rejected re-propose block. No `BEGIN TRANSACTION` (tauri-plugin-sql has no cross-execute transactions).
- `src-tauri/src/lib.rs`: 4th `sql_migrations()` entry (version 4, `memories_knowledge_fts`).
- `src/stores/storage/initializeDatabase.ts`: `APP_SCHEMA_VERSION = 4`. All three committed together (Pitfall 6).
- The migration doubles as the FTS5 runtime probe: missing FTS5 → migration fails → app refuses to start (D-04).

### Task 2 — ftsTokens shared CJK tokenizer (commits 793ada4 RED, eb47135 GREEN)
- `src/ai/ftsTokens.ts`: `toFtsTokens` (latin words whole + CJK per-char, deduped), `toFtsIndexedText` (space-joined pre-segmented form for fts columns), `toFtsMatchString` (every token double-quoted → FTS5 syntax characters stripped at source, injection-immune).
- `src/ai/tools/knowledgeSearch.ts`: local `lexicalTerms` deleted, consumes `toFtsTokens` — zero behavior change (verbatim logic extraction), index/query same-source per MEM-06.
- 6-test suite covering CJK segmentation, mixed scripts, dedup, join form, syntax-word stripping, index/query hit guarantee.

### Task 3 — memoryStore dual implementation (commits 2fc2266 RED, 557a564 GREEN)
- `MemoryMemoryStore` (Node/web) + `SqliteMemoryStore` (isTauri), singleton `getMemoryStore()`, test hooks `getMemoryMemoryStore()`/`resetMemoryMemoryStore()` — confirmationStore structural template.
- **propose** (MEM-03): `computeParamsHash({content, scope, productId})` dedup key; pending/confirmed/consumed hits → `deduplicated: true`; rejected + model_inferred → `reason: 'previously_rejected'` (MEM-02); cap-20 eviction of oldest live pending (single-statement UPDATE + subselect in SQLite); 7-day TTL derived expiry (no status writes).
- **user_directed** (locked decision, second half): propose runs confirm → consumeIntoMemories immediately — never occupies the pending queue; memories row keeps `source_candidate_token` audit chain; rejected rows revive under explicit user instruction. model_inferred stays pending (first half, unchanged).
- **consumeIntoMemories**: atomic conditional UPDATE `status='confirmed'→'consumed'`, repeat throws `MemoryStoreError('already_settled')`.
- **insertMemory** (MEM-05): version = MAX+1 per memory_id; `supersedesRowid` stamps old row's `superseded_at` in place, history preserved; `listActiveMemories` filters superseded/deleted; `listAllMemories` for audit UI.
- Plus `listRecentUserDirected` (15-04 ChatPanel data source), `deleteMemory`/`deleteByProduct` (soft delete cascade), `listRejected` (MEM-02 system-prompt injection source), `stats()` (pendingCount/dedupHits/evictions — anti-flood observable per Pitfall 8).
- 10-test suite covering all 9 plan behaviors + rejected-revival edge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cap eviction timing**
- **Found during:** Task 3 GREEN run
- **Issue:** Eviction check ran after insert, so the 20th candidate (not the 21st) triggered eviction — two tests caught it (evictions=2, second-oldest expired).
- **Fix:** Moved count→evict before INSERT in both impls, matching the plan's own step order (2 before 3).
- **Files modified:** src/ai/memoryStore.ts
- **Commit:** 557a564

**2. [Plan self-inconsistency] Test 4/5 expected token order**
- Plan's behavior tests expected CJK-first output (`'需 求 评 审 api'`, `'"需" "求" "or" "near"'`) but the plan's mandated verbatim implementation emits latin words before CJK. MATCH is order-insensitive implicit AND, so tests assert the implementation order.

**3. [Plan self-inconsistency] `grep -c CREATE` = 7 vs 9**
- Plan's overall verification says 7 (3 tables + 1 virtual + 3 indexes), but the Task 1 schema spec mandates 5 indexes. Actual: 9. Task 1 acceptance criteria (which don't include the count) all pass.

**4. [Rule 2 - Correctness] Expired-pending hash hit handling**
- **Issue:** Plan's propose step 1 only handles live pending and rejected hits; an expired pending row still occupies the UNIQUE `content_hash` index and would make INSERT throw.
- **Fix:** Expired pending/confirmed hit refreshes TTL in place (row reused, token preserved). Documented in code comments.

## Worktree Note

This executor ran in a git worktree that was initially detached at a pre-Phase-13 commit (7285b33). HEAD was moved to master tip (8f85129) before execution so Phase 13/14 dependencies (paramsHash, confirmationStore, migrations 0002/0003) were present. Commits c6b603a..557a564 sit on top of 8f85129.

## Known Stubs

None. All store methods are fully implemented in both impls; the SQLite impl is untested in Node by design (Tauri-only path, same as Phase 14 confirmationStore — exercised on real DB boot).

## Test Evidence

- Baseline before work: 80/80 green.
- After all tasks: 96/96 green (80 baseline + 6 ftsTokens + 10 memoryStore), zero regressions.
- `npm run lint` (tsc --noEmit) exit 0.
- Task acceptance greps: all pass (3 CREATE TABLE, FTS5 virtual table, UNIQUE idx_memory_candidates_hash, lib.rs version: 4, APP_SCHEMA_VERSION = 4, no BEGIN TRANSACTION, no lexicalTerms).

## Self-Check: PASSED

All 6 created files exist on disk; all 5 task commits (c6b603a, 793ada4, eb47135, 2fc2266, 557a564) present in git log.
