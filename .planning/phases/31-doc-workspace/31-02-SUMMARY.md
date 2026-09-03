---
phase: 31-doc-workspace
plan: "02"
subsystem: database
tags: [sqlite, migration, zustand, knowledge-docs, notes, fts5]

requires:
  - phase: 31-doc-workspace (plan 01)
    provides: Milkdown editor UI (consumes this store in 31-04)
provides:
  - knowledge_docs.doc_kind column (migration 0014, default 'document')
  - knowledgeRepo listDocs + docKind input (document/note, both impls)
  - docWorkspaceStore (docs/currentDocId/saveStatus, note CRUD, save chain)
affects: [31-doc-workspace plans 03/04 (panel wiring), knowledge search]

tech-stack:
  added: []
  patterns:
    - "sentinel productId '__global__' for global notes (no table rebuild, FTS/version chain untouched)"
    - "store-level save state machine (idle/editing/saving/saved/error) without persistence"

key-files:
  created:
    - src-tauri/migrations/0014_doc_kind_note.sql
    - src/stores/docWorkspaceStore.ts
  modified:
    - src-tauri/src/lib.rs
    - src/ai/knowledgeRepo.ts

key-decisions:
  - "sentinel `__global__` product_id instead of NULL — zero changes to FTS join, version chain, and existing indexes"
  - "docWorkspaceStore not persisted — panel open/width goes to uiStore (31-03), content lives in knowledge_docs version chain"
  - "saveDoc preserves docId/productId/docKind/title; only content rewrites (new version row = free history)"

requirements-completed: [DOC-01, DOC-02]

duration: 18min
completed: 2026-09-03
---

# Phase 31 Plan 02: Doc Workspace Data Layer Summary

**migration 0014 adds knowledge_docs.doc_kind + knowledgeRepo listDocs/docKind + docWorkspaceStore save chain, enabling global notes (productId='__global__') with zero behavior change to existing documents**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-09-03T08:05Z (approx)
- **Completed:** 2026-09-03
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- doc_kind column landed via forward-only ALTER TABLE (migration 0014, registered as v14 — registry unit test passes)
- knowledgeRepo: docKind input on upsert (SQLite INSERT column + memory parity), listDocs filter by kind/product, updated_at DESC
- docWorkspaceStore: loadDocs/openDoc/createNote/saveDoc + saveStatus state machine + GLOBAL_OWNER sentinel
- Old rows default to 'document'; Rust read paths use explicit column SELECTs (no deny_unknown_fields anywhere in src-tauri) — zero Rust changes beyond migration registration

## Task Commits

1. **Task 1: migration 0014 + Rust 侧确认** - `ecd7cf7` (feat)
2. **Task 2: knowledgeRepo docKind 扩展 + docWorkspaceStore** - `4d0c390` (feat)

## Files Created/Modified
- `src-tauri/migrations/0014_doc_kind_note.sql` - ALTER TABLE add doc_kind + schema_version 14
- `src-tauri/src/lib.rs` - Migration v14 registration (registry test guards completeness)
- `src/ai/knowledgeRepo.ts` - docKind on input/doc/row, upsert writes doc_kind, listDocs both impls
- `src/stores/docWorkspaceStore.ts` - workspace state: docs list, current doc, note CRUD, save chain, saveStatus

## Verification
- `cargo test migration_registry_tests` — 1 passed (0014 registered, versions ascending, count matches files)
- `grep deny_unknown_fields src-tauri/src` — zero hits (Rust read structs safe with new column)
- `npm run lint` — exit 0
- `npm test` — 234/234 pass (knowledgeRepo round-trip + parity fixtures unaffected)
- migration file contains no `DROP NOT NULL`
- rndStore.ts zero changes (grep: only pre-existing hydrateKnowledgeFromRepo references)
- PRAGMA table_info verification deferred to next tauri:dev launch (migration is plugin-driven; registry + forward-only ALTER is the same pattern as 0005/0008-0011 column additions)

## Decisions Made
- Registered 0014 in `sql_migrations()` (lib.rs) — the registry completeness test (27-04) makes this mandatory, matching 0012/0013 precedent; SQL file itself carries the meta UPDATE
- saveDoc falls back to `listVersions` when doc not in store cache — keeps save working after external doc changes

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None — createNote/saveDoc are fully wired to knowledgeRepo (web dev falls back to MemoryKnowledgeRepo automatically via getKnowledgeRepo()).

## Next Phase Readiness
- Store + repo + schema ready for 31-03 (uiStore panel fields) and 31-04 (panel UI wiring)
- Note: first `npm run tauri:dev` after this plan applies migration 0014 automatically (tauri-plugin-sql)

---
*Phase: 31-doc-workspace*
*Completed: 2026-09-03*

## Self-Check: PASSED
