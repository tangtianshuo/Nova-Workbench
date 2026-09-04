---
phase: 29-pm-crud
plan: 01
subsystem: engine/persistence
tags: [migration, sqlite, pm-crud, kv-migration]
requires:
  - "migration 0011 (schema_version 11)"
provides:
  - "tasks/schedules/task_categories relational tables (schema_version 12)"
  - "pm_write confirmation kind"
  - "pm_store SQL CRUD helpers for 29-02 tool layer"
affects:
  - "src/stores/storage/initializeDatabase.ts (APP_SCHEMA_VERSION 12)"
  - "src-tauri/src/lib.rs (startup migration hook)"
tech-stack:
  added: []
  patterns:
    - "idempotent INSERT OR IGNORE by id (0010 pattern)"
    - "CHECK extension via copy→drop→rename rebuild (0006/0008/0009/0011 pattern)"
    - "meta-key latch for one-shot startup migration"
key-files:
  created:
    - src-tauri/migrations/0012_pm_crud.sql
    - src-tauri/src/engine/pm_store.rs
  modified:
    - src-tauri/src/lib.rs
    - src-tauri/src/engine/mod.rs
    - src/stores/storage/initializeDatabase.ts
decisions:
  - "dates/times stored as TEXT (YYYY-MM-DD / HH:mm), zero conversion (CONTEXT ruling)"
  - "kv → relational migration as startup hook (not migration SQL) with meta latch pm_kv_migrated_v29; kv keys preserved as backup"
  - "delete_task clears schedules.task_id backlink to mirror taskStore clearTaskLink"
metrics:
  duration: 35m
  completed: 2026-09-02
  tasks: 2
  files: 5
---

# Phase 29 Plan 01: PM CRUD 关系化地基 Summary

Relational foundation for PM CRUD: migration 0012 creates tasks/schedules/task_categories tables + pm_write confirmation kind (schema_version 12); pm_store.rs provides SQL CRUD helpers with camelCase TS field mapping and a one-shot idempotent kv→relational startup migration gated by a meta latch.

## What Was Built

### Task 1: Migration 0012 + registration (204fb3a)
- `src-tauri/migrations/0012_pm_crud.sql` — idempotent CREATE IF NOT EXISTS for task_categories/tasks/schedules with indexes; confirmation CHECK rebuilt (copy→drop→rename) adding `pm_write`; schema_version → 12
- `src-tauri/src/lib.rs` — `sql_migrations()` version 12 registered (registry_matches_migration_files green)
- `src/stores/storage/initializeDatabase.ts` — APP_SCHEMA_VERSION 11 → 12

### Task 2: pm_store.rs SQL layer + kv migration (3273786 test, 63ba91d impl)
- CRUD: `insert_task` (server-generated uuid id, INSERT OR IGNORE), `update_task` (column whitelist, updated_at), `delete_task` (clears `schedules.task_id` backlink), `list_tasks` (status/projectId/deadline filters, limit default 50); schedule twins (`upsert_schedule_from_json` ON CONFLICT UPDATE, `update_schedule`, `delete_schedule`, `list_schedules`)
- Rows map back to TS camelCase shapes (Task/ScheduleEvent field names, no new schema)
- `migrate_kv_pm_data`: reads kv_store `nova-task` (`state.categories[].tasks[]`) and `nova-schedule` (`state.events[]`), INSERT OR IGNORE by id; meta latch `pm_kv_migrated_v29`; kv rows preserved; bad JSON/missing key skipped with log, never Err
- Startup hook in lib.rs `setup()` after `restore_latest_session`, before storing conn — log-only failure (latch unset → safe retry next boot)

## Deviations from Plan

None — plan executed exactly as written. (Task 2 TDD: RED commit 3273786, GREEN commit 63ba91d.)

## Verification

- `cargo test --lib`: 198 passed, 0 failed (includes 6 new pm_store tests + migration registry guard)
- `npm run lint` (tsc --noEmit): exit 0
- Three-way schema version consistency: 0012 SQL / lib.rs version 12 / APP_SCHEMA_VERSION = 12

## Known Stubs

None. UI stores still read kv snapshots — switching taskStore/scheduleStore to SQL single source is 29-03 scope, not a stub of this plan.

## Self-Check: PASSED

- src-tauri/migrations/0012_pm_crud.sql: FOUND
- src-tauri/src/engine/pm_store.rs: FOUND
- Commits 204fb3a, 3273786, 63ba91d: FOUND
