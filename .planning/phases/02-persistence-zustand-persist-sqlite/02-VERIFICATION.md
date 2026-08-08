---
phase: 02-persistence-zustand-persist-sqlite
verified: 2026-08-08T15:30:00Z
status: human_needed
score: 5/5 must-haves verified (code-level); 0/5 runtime-confirmed
re_verification: false
human_verification:
  - test: "First-run seed in Tauri: delete nova.db, run npm run tauri:dev, expect mock data + no errors + FileArchiveView shows 5 local files"
    expected: "App boots with 4 products, sample tasks, R&D deliverables, schedule events, workspaces, and 5 localIndexedFiles. No console errors."
    why_human: "Requires running the desktop binary and manually deleting app data — not reproducible from a one-shot command."
  - test: "Persistence survives restart: create task/product in running app, close window (do NOT delete nova.db), restart npm run tauri:dev"
    expected: "New task and product still present. Modal flags (isSearchOpen/isNewTaskOpen) reset to false."
    why_human: "Requires interactive create-then-restart cycle in the desktop app."
  - test: "Data ownership D-10: delete a product in running app, close app, restart"
    expected: "Deleted product stays GONE — no re-seed (has_seeded gate holds)."
    why_human: "Requires interactive delete-then-restart cycle."
  - test: "Flicker-free hydration: restart app and watch first paint"
    expected: "Brief Skeleton loader (text bar + 3 cards) then real UI snaps in. NO flash of empty lists."
    why_human: "Visual flicker timing cannot be asserted programmatically; needs human eye."
  - test: "Dev/web fallback: npm run dev, check localStorage in browser DevTools"
    expected: "nova-product, nova-task, nova-rnd, nova-schedule, nova-workspace, nova-ui keys in localStorage (D-03 fallback). Refresh preserves data."
    why_human: "Requires browser DevTools inspection; not the desktop target."
---

# Phase 2: Persistence (Zustand persist + SQLite) Verification Report

**Phase Goal:** App state survives refresh and restart; the rndStore fallback bug is fixed before persistence freezes it
**Verified:** 2026-08-08T15:30:00Z
**Status:** human_needed — all code-level checks pass; runtime behavior (refresh/restart/seed) routes to manual smoke tests
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After refresh/restart, all 6 stores restore data verbatim | VERIFIED (code) — runtime pending | All 6 stores wrapped in `persist(...)` with `sqliteStorage`; first-run seed populates `kv_store`; main.tsx awaits `initializeDatabase()` before React mounts. Runtime confirmation routed to human (Tests 1 & 2). |
| 2 | Transient flags do NOT survive restart — only real data does | VERIFIED | `uiStore` partialize explicitly returns ONLY `{ activeTab, selectedProductId }` (uiStore.ts:53-56). `theme` (owned by themeStore), `isSearchOpen`, `isNewTaskOpen` excluded with D-13 comment naming the reason. Other 5 stores' partialize strips all functions. |
| 3 | First run seeds from mock*.ts once via `has_seeded` gate; no re-seed; no silent schema-migration loss | VERIFIED (code) — runtime pending | `initializeDatabase.ts:52-62` reads `meta.has_seeded`, calls `seedAllStores` only when `'false'`, flips to `'true'` after Promise.all. Migration `0001_init.sql:16` seeds `has_seeded='false'`. `schema_version` guard at lines 37-47 refuses to start on too-new DB. Sanity SELECT at lines 27-34 surfaces migration failure. Runtime re-seed check routed to human (Test 3). |
| 4 | Hydration flicker-free: loading state until `_hasHydrated` flips, then real data paints | VERIFIED (code) — runtime pending | `HydrationGate.tsx:28-36` — 6-boolean && chain over `_hasHydrated` selectors, returns `<HydrationLoading />` (Skeleton-based, 5 components) until all flip. Wrapped in App.tsx:132 INSIDE AppProvider, OUTSIDE MainLayout. main.tsx:10 awaits DB before createRoot. Visual flicker timing routed to human (Test 4). |
| 5 | `rndStore` `INITIAL.p1` fallback bug fixed BEFORE persistence ships | VERIFIED | All 4 OR-fallback sites (`|| INITIAL_*.p1`) and 2 synthesizing sites replaced with typed EMPTY_* constants + console.warn. 6 node:test cases pass (npm test → 6 pass / 0 fail). grep for `INITIAL.p1`, `|| INITIAL_`, `products[0]` in rndStore.ts returns 0 matches. Shipped in commit `2bcd52c` (02-01) BEFORE persist wrap landed in `6be3d10`/`cc9ab48` (02-03). |

**Score:** 5/5 truths verified at code level. Runtime confirmation (Tests 1-5) routed to human — this is expected for a phase whose goal is refresh/restart behavior.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/stores/rndStore.ts` | Bug sites fixed + persist wrap | VERIFIED | 3 EMPTY_* constants; getProd returns `Product \| null`; 7 accessor sites null-guarded; persist wrapped with name='nova-rnd', partialize keeps all 7 Records, version 1, migrate stub, onRehydrateStorage flips _hasHydrated. |
| `src/stores/__tests__/rndStore.test.ts` | 6 node:test cases for unknown-id paths | VERIFIED | 6 cases covering empty-array, no-mutation, EMPTY-object, console.warn spy. All 6 pass via `npm test`. |
| `src/lib/api.ts` | `isTauri()` extracted with SSR guard | VERIFIED | 11 lines. `typeof window === 'undefined'` guard at line 9 prevents Node test-env ReferenceError. TitleBar.tsx imports from here (TitleBar.tsx:4). |
| `src-tauri/capabilities/sql.json` | 4 sql:allow-* permissions scoped to main window | VERIFIED | 4 permissions: load, execute, select, close. Windows: ["main"]. |
| `src-tauri/migrations/0001_init.sql` | kv_store + meta tables + idempotent seed rows | VERIFIED | 2 tables (kv_store, meta), 2 INSERT OR IGNORE seed rows (schema_version=1, has_seeded=false). |
| `src/stores/storage/lazySqlite.ts` | Database.load singleton + close | VERIFIED | Module-level `dbPromise` cache. `lazySqlite()` returns cached promise. `closeSqlite()` for teardown. |
| `src/stores/storage/sqliteStorage.ts` | createJSONStorage adapter with isTauri branch | VERIFIED | 30 lines. Single isTauri branch → SQLite desktop / localStorage dev. Uses $1 parameter binding. |
| `src/stores/storage/initializeDatabase.ts` | Startup orchestrator: sanity SELECT + version guard + has_seeded gate | VERIFIED | isTauri short-circuit; sanity SELECT (line 27); schema_version guard (line 42); has_seeded gate (line 52); seedAllStores + UPDATE meta (lines 56-61). |
| `src/stores/storage/seedData.ts` | buildInitialSeed() returns 6-store payload | VERIFIED | 42 lines. Both workspaces AND localIndexedFiles seeded in nova-workspace entry (line 38-41). |
| `src/components/HydrationGate.tsx` | &&-chain gate with Skeleton loader | VERIFIED | 37 lines. 6 store hooks + && chain. HydrationLoading uses 5 Skeleton components matching ViewLoading markup. |
| `src/main.tsx` | Top-level await initializeDatabase before createRoot | VERIFIED | Line 10: `await initializeDatabase();` before createRoot. ES2022 target supports top-level await. |
| `src/App.tsx` | MainLayout wrapped in HydrationGate inside AppProvider | VERIFIED | Lines 132-134: `<HydrationGate>` wraps `<MainLayout />` inside `<AppProvider>`. |
| `src-tauri/src/lib.rs` | tauri_plugin_sql registered with migrations | VERIFIED | `sql_migrations()` fn returns Vec<Migration> (Clone-not-impl workaround). Plugin registered before shell plugin (lines 45-49). `include_str!` embeds migration. |
| `src-tauri/Cargo.toml` | `tauri-plugin-sql = "2"` with sqlite feature | VERIFIED | Line 18: `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`. |
| `src-tauri/tauri.conf.json` | `plugins.sql.preload: ["sqlite:nova.db"]` | VERIFIED | Lines 35-36. |
| `package.json` | test script + @tauri-apps/plugin-sql dep | VERIFIED | Line 13: `"test": "tsx --test src/stores/__tests__/*.test.ts"`. Line 36: `"@tauri-apps/plugin-sql": "^2.4.0"`. |
| 6 stores wrapped | All 6 stores: persist + _hasHydrated + version:1 + migrate stub + onRehydrateStorage | VERIFIED | grep `persist(` in `src/stores/*.ts` returns 6 files: productStore, taskStore, rndStore, scheduleStore, workspaceStore, uiStore. themeStore correctly NOT wrapped (owns its own localStorage). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| main.tsx | initializeDatabase | `await initializeDatabase()` at top level | WIRED | main.tsx:10. ES2022 supports top-level await; Vite + esbuild honor it. |
| App.tsx | HydrationGate | `<HydrationGate>` wraps `<MainLayout />` | WIRED | App.tsx:15 import; App.tsx:132-134 wrap. |
| HydrationGate | 6 stores | `useXStore((s) => s._hasHydrated)` × 6 | WIRED | HydrationGate.tsx:30-35. All 6 stores expose _hasHydrated (verified per-file). |
| sqliteStorage | lazySqlite + isTauri | dynamic import inside adapter | WIRED | sqliteStorage.ts:5-6. Single isTauri branch at top level. |
| initializeDatabase | seedAllStores → buildInitialSeed | dynamic import('./seedData') | WIRED | initializeDatabase.ts:66. seedData.ts exports buildInitialSeed (line 18). |
| seedData | INITIAL_* mocks + buildInitialDeliverables | static imports | WIRED | seedData.ts:4-16. All 6 store payload keys present (nova-product through nova-ui). |
| lib.rs | tauri_plugin_sql migration | `add_migrations("sqlite:nova.db", sql_migrations())` | WIRED | lib.rs:47. cargo check exits 0. |
| rndStore test | rndStore | `import { useRndStore } from '../rndStore'` | WIRED | npm test → 6 pass. |
| uiStore partialize | only activeTab + selectedProductId | explicit field list | WIRED | uiStore.ts:53-56. theme/isSearchOpen/isNewTaskOpen NOT in returned object. |
| TitleBar | isTauri from src/lib/api | named import | WIRED | TitleBar.tsx:4. No local isTauri def. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| HydrationGate | allHydrated (boolean) | 6 store hooks reading `_hasHydrated` | Yes — onRehydrateStorage callbacks flip `_hasHydrated` after persist rehydrate | FLOWING |
| seedData.ts buildInitialSeed | 6-store payload | INITIAL_PRODUCTS_DATA + INITIAL_CATEGORIES + INITIAL_RND + INITIAL_EVENTS + INITIAL_WORKSPACES + INITIAL_LOCAL_FILES | Yes — all imported from real mock*.ts files | FLOWING |
| FileArchiveView | localIndexedFiles | useWorkspaceStore → seeded with INITIAL_LOCAL_FILES (5 entries) | Yes — seedData.ts:40 includes `localIndexedFiles: INITIAL_LOCAL_FILES` | FLOWING |
| rndStore | requirements/prototypes/knowledge/etc. | INITIAL_REQUIREMENTS et al. + persist rehydrate | Yes — partialize keeps all 7 Records | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| rndStore bug fix self-check | `npm test` | 6 pass / 0 fail; expected console.warn lines tagged `[rndStore]` print | PASS |
| Rust compiles with SQL plugin | `cd src-tauri && cargo check` | Finished dev profile, 0.96s, no errors | PASS |
| Tauri plugin registered before shell | `grep -n tauri_plugin_sql src-tauri/src/lib.rs` | 2 matches (import + builder chain) | PASS |
| No INITIAL.p1 regression | `grep -rE "INITIAL.p1\|\|\| INITIAL_\|products\[0\]" src/stores/` | 0 matches in src code (2 in test file — intentional documentation) | PASS |
| themeStore untouched by phase 2 | `git log --oneline f2c84c5..HEAD -- src/stores/themeStore.ts` | empty | PASS |
| AppContext untouched by phase 2 | `git log --oneline f2c84c5..HEAD -- src/store/AppContext.tsx` | empty | PASS |

Step 7b: SKIPPED for runtime scenarios (refresh, restart, first-run seed, flicker) — these require running the desktop binary which is incompatible with a one-shot verification. Routed to human_verification (Tests 1-5).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PERSIST-01 | 02-03 | All 5 stores data fully recover after refresh/restart | SATISFIED (code) — runtime pending | 6 stores wrapped in persist with sqliteStorage adapter. Runtime confirmation routed to human Tests 1-2. |
| PERSIST-02 | 02-03 | partialize correctly excludes transient flags | SATISFIED | Each store has explicit per-domain partialize. uiStore drops theme/isSearchOpen/isNewTaskOpen. rndStore keeps all 7 Records. |
| PERSIST-03 | 02-03 | Each store has explicit version:1 and migrate stub | SATISFIED | All 6 stores: `version: 1` + `migrate: (persisted, _version) => persisted as Partial<XState>`. |
| PERSIST-04 | 02-02 | SQLite via tauri-plugin-sql, not bare localStorage | SATISFIED | Cargo.toml adds tauri-plugin-sql 2 with sqlite feature. lib.rs registers plugin. JS adapter uses Database.load + SELECT/INSERT/DELETE on kv_store. |
| PERSIST-05 | 02-02 | ~20-line createJSONStorage adapter for tauri-plugin | SATISFIED | sqliteStorage.ts is 30 lines (slightly over 20 but well within spirit; ponytail comment names the budget). |
| PERSIST-06 | 02-02, 02-04 | Forward-only migration + sanity SELECT + schema_version table | SATISFIED | 0001_init.sql forward-only additive (no DROP). initializeDatabase sanity SELECT at line 27-34. meta.schema_version guard at line 42-47. |
| PERSIST-07 | 02-03, 02-04 | _hasHydrated flag prevents empty-state flicker | SATISFIED (code) — runtime pending | All 6 stores expose _hasHydrated/_setHydrated. HydrationGate consumes all 6 via && chain. Visual flicker timing routed to human Test 4. |
| PERSIST-08 | 02-01 | Fix rndStore INITIAL.p1 fallback bug | SATISFIED | 6/6 node:test cases pass. Bug patterns (INITIAL.p1, `|| INITIAL_`, products[0]) all removed from rndStore.ts. Shipped in 02-01 before 02-03 persist wrap. |
| PERSIST-09 | 02-04 | First-run seed from mock*.ts with has_seeded flag | SATISFIED (code) — runtime pending | seedData.ts buildInitialSeed returns 6-store payload. initializeDatabase has_seeded gate flips after Promise.all. Re-seed prevention routed to human Test 3. |

**Orphaned requirements check:** PERSIST-01..09 are the only requirements mapped to Phase 2 in REQUIREMENTS.md (lines 128-136). All 9 are claimed by at least one plan's frontmatter. None orphaned.

**Requirements traceability table status:** All 9 marked `[x]` Complete in REQUIREMENTS.md. Aligns with verification outcome.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TODO/FIXME/placeholder/console.log/empty-impl in any phase 2 touched file. Pre-existing `npm run lint` exit 2 from src-tauri/target is documented in deferred-items.md — unrelated to this phase, does not block goal. |

### Human Verification Required

Five manual smoke tests, all reproduced from `02-04-SUMMARY.md` §Manual Verification. None can be replaced by a one-shot command — all require either desktop binary interaction, app-data deletion, browser DevTools, or human-eye flicker timing.

### 1. First-run seed (Tauri mode)

**Test:** Delete `%APPDATA%\com.nova.pm-workspace\nova.db`, run `npm run tauri:dev`.
**Expected:** App boots showing mock data (4 products, sample tasks, R&D deliverables, schedule events, workspaces, AND 5 indexed local files in FileArchiveView). No console errors. No `[rndStore] unknown productId` warnings during normal nav.
**Why human:** Requires desktop binary + manual app-data deletion. Not reproducible from a one-shot command.

### 2. Persistence survives restart

**Test:** Create a new task + new product via Create Product modal. Close app window (do NOT delete nova.db). `npm run tauri:dev` again.
**Expected:** New task and product still present. Modal flags reset (no modal open on boot).
**Why human:** Interactive create-then-restart cycle.

### 3. Data ownership (D-10)

**Test:** Delete a product in running app. Close app. `npm run tauri:dev` again.
**Expected:** Deleted product stays GONE (has_seeded gate holds — no re-seed).
**Why human:** Interactive delete-then-restart cycle.

### 4. Flicker-free hydration

**Test:** Restart app, watch first paint.
**Expected:** Brief Skeleton (3 cards + text bar) → real UI snaps in. NO flash of empty lists.
**Why human:** Visual flicker timing cannot be asserted programmatically.

### 5. Dev/web fallback

**Test:** `npm run dev`, browser devtools → Application → Local Storage.
**Expected:** `nova-product`, `nova-task`, `nova-rnd`, `nova-schedule`, `nova-workspace`, `nova-ui` in localStorage (NOT SQLite — D-03 fallback). Refresh preserves data.
**Why human:** Browser DevTools inspection; not the desktop target.

### 6. rndStore bug fix spot-check (optional, code-level already confirmed)

**Test:** In tauri:dev console: `useRndStore.getState().getKnowledgeForProduct('zzz-nonexistent')`.
**Expected:** Returns `[]` + console shows `[rndStore] unknown productId in getKnowledgeForProduct: zzz-nonexistent`.
**Why human:** Optional — node:test suite already asserts this code path. Manual UAT confirms Tauri runtime parity with the Node test env.

### Gaps Summary

No gaps found at the code level. All 5 observable truths are verified against the actual codebase with grep, file inspection, npm test, and cargo check. All 9 PERSIST-* requirements are satisfied at the implementation level. No anti-patterns. No orphaned requirements.

The only remaining unknown is runtime confirmation — the phase goal is fundamentally about behavior across refresh/restart, which no one-shot command can prove. The 5 manual smoke tests in `02-04-SUMMARY.md` §Manual Verification are the right closure for this phase and have not yet been executed (or at least not reported back). Once Tests 1-4 pass on a real desktop build, Phase 2 is fully closed. Tests 5-6 cover the dev fallback path and an optional UAT for the bug fix (already covered by the node:test suite).

---

_Verified: 2026-08-08T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
