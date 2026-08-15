---
phase: 14-confirm-restore-compaction
plan: 01
wave: 1
subsystem: ai-persistence
tags: [evt-05, storage, sqlite, dual-impl, sha256, atomic-update]
dependency_graph:
  requires: [phase-13-event-log (migration pattern, lazySqlite, isTauri)]
  provides: [agent_confirmation_candidates table, paramsHash, ConfirmationStore]
  affects: [phase-14-plan-02 (public confirmation API migration)]
tech_stack:
  added: [WebCrypto globalThis.crypto.subtle for SHA-256]
  patterns: [dual-impl (Memory/Sqlite) via isTauri() branch, atomic conditional UPDATE, canonical JSON with sorted keys + preserved array order]
key_files:
  created:
    - src-tauri/migrations/0003_confirmation_candidates.sql
    - src/ai/paramsHash.ts
    - src/ai/confirmationStore.ts
    - src/ai/__tests__/phase14ConfirmationStore.test.ts
  modified:
    - src-tauri/src/lib.rs (added Migration version 3)
    - src/stores/storage/initializeDatabase.ts (APP_SCHEMA_VERSION 2 → 3)
metrics:
  duration: ~12 min
  completed: 2026-08-15
  tasks: 4 (+ 2 fix-ups)
  files: 7
  tests_added: 9
  tests_total: 53 (44 baseline + 9 new)
---

# Phase 14 Plan 01: EVT-05 Storage Foundation Summary

**One-liner:** Persistent confirmation candidate store (SQLite/memory dual-impl) with canonical-JSON SHA-256 `params_hash` and atomic conditional consume UPDATE — foundation for the HITL confirmation API migration in Plan 02.

## What Was Built

1. **Migration 0003 — `agent_confirmation_candidates` DDL**
   - `confirmation_token TEXT PRIMARY KEY`, `kind` (knowledge_write / destructive_action), `status` (pending / confirmed / consumed / rejected), `params_hash`, `params_json`, timestamps (created/expires/confirmed/consumed/rejected)
   - CHECK constraints on `kind` + `status`; composite index on `(kind, status, expires_at)` for `listActive`; single-column index on `params_hash` for de-dupe lookups in Plan 02
   - Idempotent schema_version bump to `'3'`
   - Forward-only additive: zero DROP statements
   - Registered as `Migration { version: 3 }` in `src-tauri/src/lib.rs` `sql_migrations()`

2. **`APP_SCHEMA_VERSION` 2 → 3** in `src/stores/storage/initializeDatabase.ts`
   - Synced with migration 0003's meta-row bump
   - Startup guard refuses to run on DBs newer than 3

3. **`src/ai/paramsHash.ts`** — canonical-JSON SHA-256
   - `canonicalJsonStringify`: recursive key-sorted JSON; array order preserved (matching old `sameDraft` positional comparison); `undefined` values dropped (JSON.stringify parity); non-object primitives via JSON.stringify
   - `sha256Hex`: WebCrypto `globalThis.crypto.subtle.digest('SHA-256', ...)` → 64-char lowercase hex
   - `computeParamsHash`: compose both for stable identity hashing
   - Runs in Node (tests) AND Tauri webview (no Tauri dependency)

4. **`src/ai/confirmationStore.ts`** — dual-impl ConfirmationStore
   - Interface: `create / get / confirm / consume / reject / listActive`
   - `MemoryConfirmationStore`: Node tests / web dev; `Map<string, PersistedConfirmation>` with deep-copy returns; single-threaded atomicity in `consume` (check + mutation synchronous)
   - `SqliteConfirmationStore`: Tauri; mirrors migration 0003 snake_case columns via `mapRow`
   - **Atomic consume UPDATE**: `WHERE status='confirmed' AND consumed_at IS NULL` — of two concurrent consumers exactly ONE succeeds; loser fails with `already_settled`
   - **Expiry is derived**: rows keep their status; all reads compare `expires_at > now`; expired rows are never listed or transitionable
   - **Kind discrimination**: both `knowledge_write` + `destructive_action` flow through the same store, partitioned by `kind` column
   - Idempotent `confirm`: re-confirm of already-confirmed row preserves original `confirmedAt` (needed for crash restore)
   - Singleton trio matches `eventStore.ts` pattern exactly: `getConfirmationStore() / getMemoryConfirmationStore() / resetMemoryConfirmationStore()`

5. **`src/ai/__tests__/phase14ConfirmationStore.test.ts`** — 9-test suite
   - canonical hash key-order invariance + array-order sensitivity + known `'abc'` vector (`ba7816bf…`)
   - create → get roundtrip (params deepEqual, deep-copy isolation — mutation of returned object doesn't leak)
   - state transitions: pending → confirmed → consumed (with idempotent re-confirm preserving original `confirmedAt`)
   - **atomic double-consume**: `Promise.allSettled` of two concurrent consumes; exactly one `fulfilled`, one `rejected` with `code === 'already_settled'`
   - failure modes: `not_found` / `not_confirmed` / `params_mismatch` each covered
   - TTL expiry (`ttlMs: -1000`): cannot confirm, cannot consume, not in listActive
   - reject settles + blocks later confirm/consume + excluded from listActive
   - listActive: kind filtering + createdAt ASC ordering

## Files Changed

| File | Change |
|---|---|
| `src-tauri/migrations/0003_confirmation_candidates.sql` | CREATED — DDL + indexes + schema_version bump |
| `src-tauri/src/lib.rs` | APPENDED Migration { version: 3 } entry |
| `src/stores/storage/initializeDatabase.ts` | `APP_SCHEMA_VERSION = 2` → `= 3` (one-line change) |
| `src/ai/paramsHash.ts` | CREATED — canonical JSON + SHA-256 utility |
| `src/ai/confirmationStore.ts` | CREATED — dual-impl ConfirmationStore (370 lines) |
| `src/ai/__tests__/phase14ConfirmationStore.test.ts` | CREATED — 9-test suite |

## Verification (actual numbers)

- `npm run lint` — **0 errors** (tsc --noEmit clean)
- `npx tsx --test src/ai/__tests__/phase14ConfirmationStore.test.ts` — **9/9 passing** (301 ms)
- `npm test` — **53/53 passing** (44 baseline + 9 new; 8.6 s), fail 0
- `cargo check --manifest-path src-tauri/Cargo.toml` — **green**
- `grep -c "CREATE TABLE IF NOT EXISTS agent_confirmation_candidates" src-tauri/migrations/0003_confirmation_candidates.sql` → 1 ✓
- `grep -c "CHECK (kind IN ('knowledge_write', 'destructive_action'))"` → 1 ✓
- `grep -c "SET value = '3' WHERE key = 'schema_version'"` → 1 ✓
- `grep -c "AND status = 'confirmed'" src/ai/confirmationStore.ts` → 1 ✓
- `grep -c "AND consumed_at IS NULL" src/ai/confirmationStore.ts` → 5 ✓ (atomic conditional consume UPDATE)
- `grep -c "rowsAffected" src/ai/confirmationStore.ts` → 3 ✓ (confirm/consume/reject all check it)
- `grep -c "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" src/ai/__tests__/phase14ConfirmationStore.test.ts` → 1 ✓
- `grep -c "Promise.allSettled" src/ai/__tests__/phase14ConfirmationStore.test.ts` → 1 ✓
- `grep -c "ttlMs: -1000" src/ai/__tests__/phase14ConfirmationStore.test.ts` → 1 ✓

## Hard-constraint satisfaction (from 14-CONTEXT.md)

| Constraint | Status |
|---|---|
| Atomic conditional UPDATE consume (one of two concurrent succeeds) | ✓ SQL: `WHERE status='confirmed' AND consumed_at IS NULL`; memory: synchronous check+mutation; 9-test suite's "atomic double-consume" proves it |
| `params_hash` = SHA-256 hex (64 lowercase chars) of canonicalized JSON; object key order invariant, array order preserved | ✓ `canonicalJsonStringify` sorts keys recursively, preserves array order; 64-hex format asserted; 'abc' known vector matches |
| Expired candidates cannot be confirmed / consumed / listed | ✓ `expires_at <= nowIso()` check in `failureFor`; expired-row tests prove all three gates |
| Both streams persist through same store with kind discrimination | ✓ `kind` column + CHECK constraint; `listActive(kind)` filtered |
| Dual-impl pattern (SQLite/memory) matching eventStore.ts | ✓ Single `isTauri()` branch; singleton trio identical shape |
| Migration 0003 forward-only additive, registered in lib.rs, APP_SCHEMA_VERSION=3 | ✓ No DROP; `Migration { version: 3 }` appended; version bumped |
| Plan does NOT touch `src/ai/confirmations.ts` or any consumer | ✓ `git diff` shows only migration/lib.rs/initializeDatabase/paramsHash/confirmationStore/test files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type narrowing in test deep-copy assertion**
- **Found during:** Task 4 verification (first lint pass)
- **Issue:** The `refetch()` helper declared parameter type `{ params: { title: string } }` which is not assignable from `PersistedConfirmation` whose `params: Record<string, unknown>`. `tsc --noEmit` failed with TS2345.
- **Fix:** Removed the `refetch` helper; replaced with inline cast `(fetched.params as { title: string }).title = 'MUTATED'` and the assertion `(refetched?.params as { title: string }).title`. Test semantics unchanged; still proves deep-copy isolation.
- **Files modified:** `src/ai/__tests__/phase14ConfirmationStore.test.ts`
- **Commit:** 0c90ad7 (fix(14-01))

**2. [Plan bug - minor] `grep -c "DROP"` acceptance criterion cannot return 0**
- **Found during:** Task 1 verification
- **Issue:** The plan's acceptance criterion `grep -c "DROP" src-tauri/migrations/0003_confirmation_candidates.sql returns 0` cannot be satisfied because the header comment (matching migration 0002 convention) is `-- Phase 14 (v0.3.0). Forward-only additive; no DROP / ALTER DROP ever in this directory.` — the word `DROP` appears in the comment.
- **Resolution:** The SPIRIT of the criterion — no `DROP TABLE` / `DROP INDEX` statements in the DDL — is satisfied. Migration 0002 has the identical pattern and also returns `grep -c "DROP"` = 1. Record as a plan-spec imprecision; no code change needed.

## Self-Check: PASSED

- ✓ `src-tauri/migrations/0003_confirmation_candidates.sql` exists
- ✓ `src-tauri/src/lib.rs` contains `version: 3` + `0003_confirmation_candidates.sql`
- ✓ `src/stores/storage/initializeDatabase.ts` has `APP_SCHEMA_VERSION = 3`
- ✓ `src/ai/paramsHash.ts` exists (3 exported functions)
- ✓ `src/ai/confirmationStore.ts` exists (interface + 2 impls + singleton trio)
- ✓ `src/ai/__tests__/phase14ConfirmationStore.test.ts` exists (9 tests)
- ✓ All 5 commits present in git log:
  - 020102c feat(14-01): migration 0003
  - 307f3fd feat(14-01): paramsHash
  - 17612e7 feat(14-01): ConfirmationStore dual-impl
  - fb559bf test(14-01): phase14ConfirmationStore test suite
  - 0c90ad7 fix(14-01): tighten test type assertions
- ✓ `src/ai/confirmations.ts` untouched (Plan 02 scope)

## Next Steps (Plan 02 — Wave 1)

Migrate `src/ai/confirmations.ts`'s public API (`createKnowledgeWriteCandidate`, `confirmKnowledgeWrite`, `consumeKnowledgeWriteConfirmation`, `rejectKnowledgeWrite`, `createDestructiveActionCandidate`, `confirmDestructiveAction`, `consumeDestructiveActionConfirmation`, `rejectDestructiveAction`) to delegate to the new `getConfirmationStore()`. The internal `pendingConfirmations` / `pendingDestructiveActions` `Map`s go away; all state flows through the persistent store. Error messages in the new `ConfirmationStoreError` must match what existing callers (ChatPanel, toolLoop) already catch — Plan 02 must preserve those strings.
