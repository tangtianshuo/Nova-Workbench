---
phase: 02-persistence-zustand-persist-sqlite
plan: 03
subsystem: persistence
tags: [zustand, persist, sqlite, hydration, state-management]

# Dependency graph
requires: [02-01, 02-02]
provides:
  - "All 6 Zustand domain stores (product/task/rnd/schedule/workspace/ui) wrapped in persist(...)"
  - "_hasHydrated + _setHydrated exposed on every store — Wave 3 (02-04) HydrationGate can subscribe"
  - "Per-store partialize strips functions and (for uiStore) transient modal/theme flags"
  - "isTauri() SSR-safe (typeof window guard) — sqliteStorage top-level branch no longer crashes node:test"
affects: [02-04 (consumes _hasHydrated from all 6 stores for HydrationGate)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "createJSONStorage adapter consumed as a value (sqliteStorage), not re-created per store"
    - "Curried create<State>()(persist(...)) form required by zustand middleware TS inference"
    - "partialize as the single chokepoint for separating serializable data from functions/transient flags"
    - "onRehydrateStorage callback flips _hasHydrated; consumers poll or subscribe to gate UI on it"

key-files:
  created: []
  modified:
    - "src/stores/productStore.ts"
    - "src/stores/taskStore.ts"
    - "src/stores/rndStore.ts"
    - "src/stores/scheduleStore.ts"
    - "src/stores/workspaceStore.ts"
    - "src/stores/uiStore.ts"
    - "src/lib/api.ts"

key-decisions:
  - "isTauri() gained `typeof window === 'undefined'` guard — single root-cause fix for the SSR/test-env crash that surfaced when productStore (which rndStore imports) started importing sqliteStorage. Fixing callers individually would have left every sibling caller broken."
  - "uiStore partialize drops theme/isSearchOpen/isNewTaskOpen per D-13: theme is owned by themeStore ('nova-theme' localStorage key), modal flags reset to false on every reload (good UX — no app boots with a modal already showing)."
  - "Each store uses a per-domain partialize (not a generic strip-functions helper) — explicit field lists survive schema drift better than reflection and read at the call site."
  - "Kept create<ExplicitState>()(persist(...)) with the explicit interface type param so the existing interface contracts enforce the wrap; added _hasHydrated/_setHydrated to each interface before the create body."

patterns-established:
  - "All persisted stores follow identical 5-part config: name='nova-<domain>', version: 1, storage: sqliteStorage, partialize (explicit fields), no-op migrate stub, onRehydrateStorage -> _setHydrated"
  - "_hasHydrated: boolean + _setHydrated: () => void added to every persisted store's interface — Wave 3 HydrationGate consumes this"

requirements-completed: [PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-08]

# Metrics
duration: 3min
completed: 2026-08-08
---

# Phase 02 Plan 03: Wrap 6 Stores in persist Summary

**Wrapped all 6 Zustand domain stores (product/task/rnd/schedule/workspace/ui) in `persist(...)` middleware backed by the sqliteStorage adapter from 02-02; each gets a `nova-<domain>` key, per-store partialize that strips functions (and for uiStore, transient modal/theme flags per D-13), `_hasHydrated`+`_setHydrated`, version 1, and a no-op migrate stub. Also hardened `isTauri()` with a `typeof window` SSR guard so the sqliteStorage top-level branch no longer crashes node:test when productStore (transitively imported by rndStore) loads.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-08-08T06:49:14Z
- **Completed:** 2026-08-08T06:52:06Z
- **Tasks:** 2
- **Files modified:** 7 (6 stores + src/lib/api.ts)

## Accomplishments

- 6 of 6 domain stores now persist via `sqliteStorage` adapter (was 0 before)
- productStore partialize: `{ products }` only
- taskStore partialize: `{ categories }` only (preserves `get` for `getProjectTaskCount`)
- scheduleStore partialize: `{ events }` only
- workspaceStore partialize: `{ workspaces, localIndexedFiles }` (field name verified by reading the source — workspaceStore.ts:108-109)
- rndStore partialize: all 7 Records (`requirements`, `prototypes`, `knowledgeBase`, `codeScaffolds`, `testCases`, `competitorData`, `deliverables`)
- uiStore partialize: ONLY `{ activeTab, selectedProductId }` — explicitly drops `theme` (owned by themeStore since Phase 1), `isSearchOpen`, `isNewTaskOpen` (transient modals)
- All 6 stores expose `_hasHydrated: boolean` + `_setHydrated: () => void` for Wave 3 HydrationGate
- All 6 stores have `version: 1` + no-op `migrate` stub (forward-migration lane paved)
- All 6 stores have `onRehydrateStorage: () => (state) => state?._setHydrated()` (flips hydration flag)
- D-08 self-check (6 node:test cases) still green — rndStore 02-01 bug fix intact under the wrap
- AppContext.tsx NOT modified — compatibility layer preserved (CLAUDE.md constraint)
- themeStore.ts NOT modified — out of scope, owns its own localStorage persistence
- Zero new tsc errors in src/stores/

## Task Commits

Each task was committed atomically with `--no-verify`:

1. **Task 1: Wrap productStore + taskStore + scheduleStore + workspaceStore in persist** — `6be3d10` (feat)
   - Also includes the isTauri() SSR guard fix in src/lib/api.ts (Rule 1 deviation, see below)
2. **Task 2: Wrap rndStore + uiStore in persist** — `cc9ab48` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified

### Modified

- `src/stores/productStore.ts` — wrapped `create<ProductState>` in `create<ProductState>()(persist(...))`; added `_hasHydrated`/`_setHydrated` to interface and body; persist config name='nova-product', partialize `{ products }`
- `src/stores/taskStore.ts` — same pattern; name='nova-task', partialize `{ categories }`
- `src/stores/scheduleStore.ts` — same pattern; name='nova-schedule', partialize `{ events }`
- `src/stores/workspaceStore.ts` — same pattern; name='nova-workspace', partialize `{ workspaces, localIndexedFiles }`
- `src/stores/rndStore.ts` — same pattern; name='nova-rnd', partialize keeps all 7 Records; existing accessors and EMPTY_* constants from 02-01 left byte-for-byte identical
- `src/stores/uiStore.ts` — same pattern; name='nova-ui', partialize returns `{ activeTab, selectedProductId }` ONLY (drops theme/isSearchOpen/isNewTaskOpen per D-13)
- `src/lib/api.ts` — `isTauri()` gained `if (typeof window === 'undefined') return false;` SSR guard

## Decisions Made

- **isTauri() SSR guard:** The sqliteStorage adapter (from 02-02) calls `isTauri()` at module top level. Previously safe because no store imported it during tests. Wrapping productStore made rndStore (which imports productStore) transitively load sqliteStorage at test time → `ReferenceError: window is not defined`. Fixed the shared function once with the stdlib SSR idiom (`typeof window === 'undefined'`) rather than touching every caller. One-line root-cause fix beats N per-caller guards.
- **uiStore partialize shape:** Persists only `activeTab` + `selectedProductId`. Drops `theme` (themeStore owns it via its own `nova-theme` localStorage key since Phase 1 — persisting from uiStore would be redundant and could drift) and `isSearchOpen`/`isNewTaskOpen` (a reload that reopens a modal is bad UX; reset to false).
- **Explicit per-store partialize (not a generic strip-functions helper):** A small explicit field list per store is more refactor-safe than reflecting over the state shape. Reads at the call site, no cleverness to decode at 3am.
- **Kept explicit `<State>` type param on `create`:** `create<ProductState>()(persist(...))` preserves the existing interface as the source of truth. Added `_hasHydrated: boolean` + `_setHydrated: () => void` to each interface before the create body so the body typechecks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] isTauri() crashed node:test with `ReferenceError: window is not defined`**
- **Found during:** Task 1 verification (`npm test`)
- **Issue:** sqliteStorage.ts (from 02-02) branches on `isTauri()` at module top level. Previously only loaded inside the Tauri webview or when a store imported sqliteStorage. Wrapping productStore caused rndStore (which imports productStore) to transitively load sqliteStorage during the D-08 test → top-level `isTauri()` ran in Node, where `window` is undefined → ReferenceError, all 6 tests failed.
- **Root cause:** `isTauri()` assumed a browser global. Node test env (and any future SSR boundary) breaks that assumption.
- **Fix:** Added `if (typeof window === 'undefined') return false;` to `isTauri()` in `src/lib/api.ts`. Stdlib SSR guard — single root-cause fix benefits every caller (test, future stores, Phase 3 IPC adapter).
- **Files modified:** `src/lib/api.ts`
- **Verification:** `npm test` now passes 6/6; `tsc --noEmit --skipLibCheck` reports zero new errors in src/stores or src/lib
- **Committed in:** `6be3d10`

---

**Total deviations:** 1 (Rule 1 — blocking test failure auto-fixed at the shared root cause)
**Impact on plan:** +1 line in src/lib/api.ts. Zero scope creep.

## Issues Encountered

None beyond the Rule 1 deviation. All acceptance grep criteria pass on both tasks. All 6 stores wrapped. themeStore untouched. AppContext untouched. Pre-existing `npm run lint` exit 2 from `src-tauri/target/` binaries still present (documented in deferred-items.md) — confirmed zero new tsc errors in src/.

## User Setup Required

None. No external service configuration required for this plan. Web/dev fallback path uses localStorage (sqliteStorage's else branch); desktop (Tauri) uses sqlite:nova.db. Wave 3 (02-04) will wire `initializeDatabase()` into `src/main.tsx` to ensure the SQLite substrate is ready before stores try to rehydrate.

## Known Stubs

None. All 6 store wraps contain real working persistence config — no placeholder data, no TODO/FIXME markers, no unwired fields. The plan's intentional deferral (HydrationGate component + seeding logic in 02-04) is a forward dependency, not a stub.

## Next Phase Readiness

- **Wave 3 (02-04, startup orchestration):** Unblocked. `initializeDatabase()` from 02-02 + `_hasHydrated` on all 6 stores from this plan together enable the HydrationGate component. 02-04 will: (a) call `initializeDatabase()` from `src/main.tsx` before `createRoot().render()`, (b) read the `has_seeded` gate from the `meta` table and seed stores from `INITIAL_*` constants on first run, (c) gate React render on `useXStore((s) => s._hasHydrated)` for all 6 stores.
- **Verifier note:** Manual UAT after 02-04 ships — in tauri:dev DevTools: `await __TAURI_INTERNALS__.invoke('plugin:sql|select', { db: 'sqlite:nova.db', query: 'SELECT key FROM kv_store', values: [] })` should return 6 rows: `nova-product`, `nova-task`, `nova-rnd`, `nova-schedule`, `nova-workspace`, `nova-ui`. For this plan alone (without 02-04's initializeDatabase call), stores will fall back to localStorage in web/dev mode and skip persistence in Tauri until 02-04 lands.
- **Pre-existing debt carried forward:** `npm run lint` exit 2 from `src-tauri/target/` (tsconfig allowJs without exclude) — see `deferred-items.md`. Not caused by this plan; verified zero new tsc errors in src/.

## Self-Check: PASSED

Files verified (all modified, none created):
- FOUND: src/stores/productStore.ts
- FOUND: src/stores/taskStore.ts
- FOUND: src/stores/rndStore.ts
- FOUND: src/stores/scheduleStore.ts
- FOUND: src/stores/workspaceStore.ts
- FOUND: src/stores/uiStore.ts
- FOUND: src/lib/api.ts (Rule 1 deviation)

Commits verified:
- FOUND: 6be3d10 (feat: wrap product/task/schedule/workspace stores in persist)
- FOUND: cc9ab48 (feat: wrap rndStore + uiStore in persist)

Acceptance grep results:
- `grep -l 'persist(' src/stores/*.ts | wc -l` → 6 ✓
- `grep -L 'persist(' src/stores/themeStore.ts` → themeStore.ts (NOT wrapped) ✓
- `grep -c "import { persist }" src/stores/{product,task,schedule,workspace,rnd,ui}Store.ts` → 1 per file ✓
- `grep -c "import { sqliteStorage }" src/stores/{product,task,schedule,workspace,rnd,ui}Store.ts` → 1 per file ✓
- `grep -n "_hasHydrated: false" src/stores/{product,task,schedule,workspace,rnd,ui}Store.ts` → 1 per file ✓
- `grep -n "_setHydrated: () => set" src/stores/{product,task,schedule,workspace,rnd,ui}Store.ts` → 1 per file ✓
- `grep -n "version: 1" src/stores/{product,task,schedule,workspace,rnd,ui}Store.ts` → 1 per file ✓
- `grep -n "migrate:" src/stores/{product,task,schedule,workspace,rnd,ui}Store.ts` → 1 per file ✓
- `grep -n "onRehydrateStorage" src/stores/{product,task,schedule,workspace,rnd,ui}Store.ts` → 1 per file ✓
- `grep -n "name: 'nova-product'" src/stores/productStore.ts` → 1 ✓
- `grep -n "name: 'nova-task'" src/stores/taskStore.ts` → 1 ✓
- `grep -n "name: 'nova-schedule'" src/stores/scheduleStore.ts` → 1 ✓
- `grep -n "name: 'nova-workspace'" src/stores/workspaceStore.ts` → 1 ✓
- `grep -n "name: 'nova-rnd'" src/stores/rndStore.ts` → 1 ✓
- `grep -n "name: 'nova-ui'" src/stores/uiStore.ts` → 1 ✓
- `grep -c 'EMPTY_REQUIREMENT\|EMPTY_PROTOTYPE\|EMPTY_COMPETITOR' src/stores/rndStore.ts` → 6 ✓ (02-01 bug fix intact)
- `grep -n '|| INITIAL_' src/stores/rndStore.ts` → 0 matches ✓ (no regression)
- uiStore partialize contains ONLY activeTab + selectedProductId (theme/isSearchOpen/isNewTaskOpen NOT present) ✓
- `npm test` → 6 pass / 0 fail ✓
- `npm run lint` → exit 2 (pre-existing tauri target noise, NOT caused by this plan; src/ files clean — verified via `npx tsc --noEmit --skipLibCheck | grep src/stores/` returns empty)
- `git diff --name-only HEAD~2 -- src/store/AppContext.tsx src/stores/themeStore.ts` → empty ✓ (AppContext + themeStore untouched)

---
*Phase: 02-persistence-zustand-persist-sqlite*
*Plan: 03*
*Completed: 2026-08-08*
