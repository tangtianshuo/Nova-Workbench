# Phase 2: Persistence (Zustand persist + SQLite) - Research

**Researched:** 2026-08-08
**Domain:** Local-first state persistence (Tauri SQL plugin + Zustand persist middleware) + reactive store bug fix
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (do not research alternatives — implement these)

- **D-01:** Use `tauri-plugin-sql` (official, sqlx-based, JS-side API via `@tauri-apps/plugin-sql`) as the storage backend. **Not** `rusqlite`. **Not** dual-layer. Phase 4 GraphFlow PoC's `SqliteSessionStorage` will reuse the same connection pool.
- **D-02:** Write a ~20-line `createJSONStorage` adapter that bridges Zustand persist to the plugin's `select`/`execute` API. Lives at `src/stores/storage/sqliteStorage.ts`.
- **D-03:** Adapter degrades to `localStorage` when `isTauri() === false` (dev/web). One `if` branch, not a second storage implementation.
- **D-04:** Startup ordering, executed before React renders: (1) `Database.load('sqlite:nova.db')` → (2) run migrations → (3) sanity `SELECT key FROM kv_store LIMIT 1` (throw = "schema corrupted" fatal error) → (4) compare `meta.schema_version` to app expected (refuse to start if DB > app) → (5) read `meta.has_seeded`, seed from `mock*.ts` if `'false'`, set true → (6) mark hydration done, render.
- **D-05:** Initial schema `0001_init.sql` creates `kv_store(key TEXT PRIMARY KEY, value TEXT NOT NULL)` and `meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)` with seed rows for `schema_version='1'` and `has_seeded='false'`.
- **D-06:** Migrations live in `src-tauri/migrations/`, registered via plugin's `Builder::add_migrations(...)`. Forward-only additive (no DROP / ALTER DROP; CI / manual grep enforces). Add sanity SELECT + explicit `schema_version` table to backstop the plugin's known silent-fail bug (plugins-workspace#509).
- **D-07:** Fix `rndStore` accessors: replace `[productId] || INITIAL_X.p1` (which returns Product 1's seed data) with typed empty values (`EMPTY_*`). Add `console.warn` for unknown productId. **Do NOT split the store in this phase** (separate refactor).
- **D-08:** Add a minimal self-check (~30 lines, `node --test` or `tsx --test`). Assert `getKnowledgeForProduct('unknown-id')` returns EMPTY, not `INITIAL_KNOWLEDGE_BASE.p1`.
- **D-09:** First-run seeding reads `meta.has_seeded`. If `'false'`, batch-insert seed JSON for all 5 stores into `kv_store`, then `UPDATE meta SET value='true'`.
- **D-10:** `has_seeded` is a one-shot gate, not "does data exist". User-deleted-then-restart must NOT re-seed.
- **D-11:** Each store gets `_hasHydrated: boolean` set in `onRehydrateStorage` callback via `_setHydrated` action.
- **D-12:** Wrap `<MainLayout>` in `<HydrationGate>` (in `src/App.tsx`). Reuse `ViewLoading` skeleton.
- **D-13:** Per-store `partialize`:
  - productStore → `products`
  - taskStore → `categories`
  - rndStore → 7 nested Records (requirements / prototypes / knowledgeBase / codeScaffolds / testCases / competitorData / deliverables)
  - scheduleStore → `events`
  - workspaceStore → `workspaces`, `localIndexedFiles`
  - uiStore → `activeTab`, `selectedProductId` (drop `isSearchOpen`, `isNewTaskOpen`, `theme`)
- **D-14:** New `src-tauri/capabilities/sql.json` scoped to SQL plugin (`sql:allow-load`, `sql:allow-execute`, `sql:allow-select`, `sql:allow-close`). One file, not pre-creating Phase 3's `llm.json`.

### Claude's Discretion (research options, recommend)

- Startup orchestration: module-level side-effect vs explicit `await initializeDatabase()` before `createRoot`. **Recommendation:** explicit `await` in `main.tsx` — simpler control flow, easier to gate behind HydrationGate, no top-level-await quirks across bundlers.
- `lazySqlite` singleton shape: module-level promise cache vs React context. **Recommendation:** module-level `let dbPromise: Promise<Database> | null` cache, ~10 lines. No React coupling.
- HydrationGate skeleton: reuse `ViewLoading` vs new component. **Recommendation:** reuse `ViewLoading` — already exists, already styled.
- Batch seed write: `execute_batch` vs multiple `execute` in `Promise.all`. **Recommendation:** single `Database.execute_batch(sql, params)` if plugin supports it, else `Promise.all` of 6 inserts (small data, no perf concern).
- Migration registration: Rust `add_migrations` vs JS `Database.load(..., migrations)`. **Recommendation:** Rust-side (`lib.rs`) — plugin's idiomatic path, runs even before JS boots, recommended by official docs.

### Deferred Ideas (OUT OF SCOPE — do not address)

- Splitting `rndStore` into per-domain stores
- Removing `AppContext.tsx` (track separately per view migration)
- Unifying `themeStore` into SQLite (it already uses `nova-theme` localStorage key)
- Data export / import / backup / restore
- Multi-window sync (Zustand persist doesn't cross windows natively)
- Server / cloud sync
- Full automated test infrastructure (only D-08 self-check this phase)
- rndStore partial persistence / lazy load per product
- DB encryption (Stronghold plugin is later polish)
- Per-workspace / per-project DB files (single `${appData}/nova.db` is enough)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERSIST-01 | 5 Zustand stores restore after refresh / restart | D-02 adapter + D-11 hydration + D-13 partialize; per-store `persist()` wrap |
| PERSIST-02 | `partialize` strips transient flags | D-13 lists exact fields per store; uiStore drops modal/theme flags |
| PERSIST-03 | Each store has explicit `version: 1` + `migrate` stub | Per-store `persist` config — `migrate: (s, v) => s` no-op stub for forward migration lane |
| PERSIST-04 | SQLite via `tauri-plugin-sql` as backend | D-01, D-05, D-06 — Cargo dep + plugin registration + 0001_init.sql |
| PERSIST-05 | ~20-line `createJSONStorage` adapter | D-02 — verified adapter shape below |
| PERSIST-06 | Forward-only additive migrations + sanity SELECT + `schema_version` table | D-04 step 3, D-05, D-06 — defeats Pitfall 2 |
| PERSIST-07 | `_hasHydrated` blocks render-time empty-state flicker | D-11 + D-12 — HydrationGate in `App.tsx` |
| PERSIST-08 | Fix `rndStore` `INITIAL.p1` fallback bug BEFORE persist | D-07 — replace 4 fallback sites + add `console.warn` + D-08 self-check |
| PERSIST-09 | First-run seeds from `mock*.ts` with `has_seeded` flag | D-04 step 5, D-09, D-10 — one-shot gate |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack locked:** React 19 + Tauri v2 + Zustand 5 + Tailwind v4 (no refactor).
- **No sidecar:** LLM / workflow ultimately all Rust. (This phase has no LLM work — irrelevant, but the SQL plugin path aligns.)
- **Persistence:** Local-first — localStorage first (zustand persist) → then SQLite (Tauri SQL plugin). **This phase ships SQLite.**
- **Backward compat:** `AppContext.tsx` compatibility layer survives. Persisting at the Zustand store layer is invisible to `useApp()` consumers — the shim continues to delegate.
- **Security:** `csp: null` is tracked debt; CSP tightening is Phase 3 (SEC-01/SEC-02). SQL capabilities still scoped now (D-14) per Pitfall 5.
- **Distribution:** Desktop = Tauri app. Web = dev fallback. D-03's `isTauri()` branch keeps dev/prod parity.

## Summary

Phase 2 turns Nova from "demo that resets on refresh" into a working tool by adding Zustand `persist` middleware to all 5 domain stores + uiStore, backed by SQLite via `tauri-plugin-sql`. The architecture is intentionally thin: one ~20-line `createJSONStorage` adapter maps Zustand's `getItem`/`setItem`/`removeItem` to SQL `SELECT`/`INSERT OR REPLACE`/`DELETE` against a `kv_store(key, value)` table. Each store gets one row in that table holding the JSON-serialized `partialize` output. The plugin's known silent-migration-failure bug (plugins-workspace#509) is backstopped with a sanity `SELECT` after load, an explicit `meta.schema_version` row, and a `has_seeded` one-shot gate so user-deleted data doesn't "come back to life" on restart.

**Critical pre-requisite (D-07, HIGH severity per CONCERNS.md):** `rndStore` has 4 accessor sites that fall back to `INITIAL_KNOWLEDGE_BASE.p1` / `INITIAL_CODE_SCAFFOLDS.p1` / `INITIAL_TEST_CASES.p1` / `INITIAL_COMPETITOR_DATA.p1` when a productId isn't found in the Record. That fallback returns Product 1's seed data under any wrong / undefined / stale productId header — a pre-existing footgun that persistence would *freeze* into stored state. Fix this before persisting: replace each fallback with a typed empty value and add a `console.warn` for unknown IDs.

**Primary recommendation:** Wave 0 — fix rndStore (D-07 + D-08 self-check). Wave 1 — plugin + capability + migration + adapter + lazy singleton + dev/localStorage fallback. Wave 2 — wrap each store in `persist(...)` with `_hasHydrated` + `partialize`. Wave 3 — seeding + HydrationGate in App.tsx. Ship.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tauri-apps/plugin-sql` | `^2.4.0` (npm) | JS bindings for the SQL plugin | Official Tauri plugin; sqlx-based; only first-party SQLite option for Tauri v2 |
| `tauri-plugin-sql` | `2` cargo, `features = ["sqlite"]` | Rust plugin host | Same; registered in `lib.rs` via `Builder::default().add_migrations(...).build()` |
| `zustand` | `5.0.14` (already installed) | State container + `persist` middleware | Project-locked per CLAUDE.md; `persist` + `createJSONStorage` ship in-box |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `^4.21.0` (already in devDeps) | Run the D-08 self-check via `tsx --test src/stores/__tests__/rndStore.test.ts` | One-shot test, no jest/vitest adoption |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tauri-plugin-sql` (sqlx) | `rusqlite` crate + custom Tauri commands | D-01 explicitly rejects — would need to write our own command surface, duplicate the adapter; sqlx is good enough and official |
| `tauri-plugin-sql` | `tauri-plugin-stronghold` (encrypted) | D-deferred — Stronghold is later polish; encryption without a key story is theatre |
| `createJSONStorage` adapter | Hand-rolled Zustand storage object | `createJSONStorage` IS the standard helper — adapter pattern *is* the recommended path |
| Migrations registered in Rust | Migrations registered in JS via `Database.load(..., { migrations })` | JS path exists but is less idiomatic; Rust-side runs at plugin init (before any JS), and the official README uses Rust |

**Installation:**

```bash
npm install @tauri-apps/plugin-sql@^2.4.0
```

Cargo (`src-tauri/Cargo.toml`):

```toml
[dependencies]
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

**Version verification (2026-08-08):**
- npm `@tauri-apps/plugin-sql` latest = `2.4.0` (published 2026-04-04). Verified via `npm view`.
- crates.io `tauri-plugin-sql` latest = `2.4.0` (confirmed via docs.rs / Socket.dev search; cargo specifier `"2"` resolves to 2.x latest).
- Rust toolchain present: `cargo 1.91.1` (≥ plugin's 1.77.2 minimum).
- Zustand `5.0.14` already in `package.json` — `persist` and `createJSONStorage` are part of `zustand/middleware`, no extra dep.

## Architecture

### Recommended Project Structure (additions only — Ponytail: smallest possible diff)

```
src/
├── stores/
│   ├── storage/                       # NEW — 3 small files, ~60 lines total
│   │   ├── sqliteStorage.ts           # ~25-line createJSONStorage adapter (D-02)
│   │   ├── lazySqlite.ts              # ~10-line module-level singleton (D-02)
│   │   └── initializeDatabase.ts      # ~30-line startup orchestration (D-04)
│   ├── __tests__/                     # NEW
│   │   └── rndStore.test.ts           # ~30-line self-check (D-08)
│   ├── productStore.ts                # MODIFIED — wrap create() in persist(...)
│   ├── taskStore.ts                   # MODIFIED — same
│   ├── rndStore.ts                    # MODIFIED — fix INITIAL.p1 fallbacks (D-07) + persist
│   ├── scheduleStore.ts               # MODIFIED — same
│   ├── workspaceStore.ts              # MODIFIED — same
│   ├── uiStore.ts                     # MODIFIED — persist only activeTab + selectedProductId
│   └── themeStore.ts                  # UNCHANGED — already uses its own 'nova-theme' localStorage key
├── components/
│   └── HydrationGate.tsx              # NEW — ~15-line wrapper around ViewLoading
├── App.tsx                            # MODIFIED — wrap <MainLayout> in <HydrationGate>
└── main.tsx                           # MODIFIED — await initializeDatabase() before createRoot().render(...)

src-tauri/
├── migrations/                        # NEW directory
│   └── 0001_init.sql                  # kv_store + meta tables + seed rows
├── capabilities/
│   └── sql.json                       # NEW — sql:allow-* permissions (D-14)
├── src/
│   └── lib.rs                         # MODIFIED — register plugin + migrations
├── Cargo.toml                         # MODIFIED — add tauri-plugin-sql dep
└── tauri.conf.json                    # MODIFIED — plugins.sql.preload = ["sqlite:nova.db"]
```

### How the Pieces Fit

```
┌─ main.tsx ───────────────────────────────────────────────────────────┐
│  await initializeDatabase()        // (D-04) runs BEFORE React render │
│  createRoot(...).render(<App />)                                      │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─ initializeDatabase.ts ──────────────────────────────────────────────┐
│  1. lazySqlite() → Database.load('sqlite:nova.db')                    │
│       (migrations auto-run via plugin's Builder in Rust)              │
│  2. await db.select<{key:string}[]>('SELECT key FROM kv_store LIMIT 1')│
│       → throws → fatal "schema corrupted" error                       │
│  3. await db.select<MetaRow[]>('SELECT value FROM meta WHERE key=$1', │
│       ['schema_version']) → compare to APP_SCHEMA_VERSION (refuse if  │
│       db > app)                                                       │
│  4. await db.select<MetaRow[]>('SELECT value FROM meta WHERE key=$1', │
│       ['has_seeded'])                                                 │
│       → if 'false': seedAllStores(db), then setHasSeeded(true)        │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ (after seed/skip)
┌─ React render ───────────────────────────────────────────────────────┐
│  <App> → <HydrationGate>                                              │
│    gates on every store's _hasHydrated flag                           │
│    shows <ViewLoading /> until all hydrated                           │
│    → <MainLayout>                                                     │
└───────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼ (store reads/writes)
┌─ Zustand persist ────────────────────────────────────────────────────┐
│  useProductStore.set({ products: ... })                               │
│   → persist middleware intercepts                                     │
│   → partialize(state) returns { products }                            │
│   → JSON.stringify                                                    │
│   → sqliteStorage.setItem('nova-product', jsonString)                 │
│        → await db.execute('INSERT OR REPLACE INTO kv_store ...', ...)  │
└───────────────────────────────────────────────────────────────────────┘
```

### Pattern 1: Adapter (StateStorage → SQLite)

**What:** Bridge Zustand's `StateStorage` interface to the Tauri SQL plugin's async API.
**When to use:** Any time the storage backend is async and not native `localStorage`.

```ts
// src/stores/storage/sqliteStorage.ts
// Source: D-02 + Zustand persist docs (https://zustand.docs.pmnd.rs/reference/middlewares/persist)
import { createJSONStorage } from 'zustand/middleware';
import { isTauri } from '@/src/lib/api';          // see note below — D-03 gating
import { lazySqlite } from './lazySqlite';

// D-03: dev/web mode has no Tauri plugin — fall back to localStorage.
// createJSONStorage(() => localStorage) returns sync storage; Zustand handles both.
export const sqliteStorage = isTauri()
  ? createJSONStorage(() => ({
      getItem: async (name) => {
        const db = await lazySqlite();
        const rows = await db.select<{ value: string }[]>(
          'SELECT value FROM kv_store WHERE key = $1',
          [name],
        );
        return rows[0]?.value ?? null;
      },
      setItem: async (name, value) => {
        const db = await lazySqlite();
        await db.execute(
          'INSERT OR REPLACE INTO kv_store (key, value) VALUES ($1, $2)',
          [name, value],
        );
      },
      removeItem: async (name) => {
        const db = await lazySqlite();
        await db.execute('DELETE FROM kv_store WHERE key = $1', [name]);
      },
    }))
  : createJSONStorage(() => localStorage);
```

**Note on `isTauri`:** Today `isTauri` is defined locally in `src/components/layout/TitleBar.tsx`. To consume it from the adapter, extract it to `src/lib/api.ts` (creating the file). The CLAUDE.md `code_context` references `src/lib/api.ts` as the canonical home — this phase finally creates it. One export, one re-export from TitleBar (replace local fn with import), zero behavior change.

### Pattern 2: Lazy Singleton

```ts
// src/stores/storage/lazySqlite.ts
import Database from '@tauri-apps/plugin-sql';

// Module-level promise cache. First call kicks off Database.load; subsequent
// callers await the same promise. No React coupling, no context.
let dbPromise: Promise<Database> | null = null;

export function lazySqlite(): Promise<Database> {
  if (!dbPromise) {
    // Migrations are registered Rust-side (lib.rs Builder::add_migrations) and
    // run automatically when the plugin initializes for this connection string.
    // By the time Database.load resolves, schema is ready.
    dbPromise = Database.load('sqlite:nova.db');
  }
  return dbPromise;
}

export async function closeSqlite(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}
```

### Pattern 3: Store Wrap with persist + partialize + _hasHydrated

```ts
// Pattern shown on rndStore; identical shape applies to all 6 stores.
// Source: Zustand persist docs (PERSIST-03 + D-11 + D-13)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { sqliteStorage } from './storage/sqliteStorage';

export const useRndStore = create<RndState>()(
  persist(
    (set, get) => ({
      // ... existing state + actions ...
      _hasHydrated: false,
      _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'nova-rnd',                 // one row in kv_store per store
      version: 1,                       // PERSIST-03 — bump on shape change
      storage: sqliteStorage,
      partialize: (s) => ({             // D-13 — only serializable data
        requirements: s.requirements,
        prototypes: s.prototypes,
        knowledgeBase: s.knowledgeBase,
        codeScaffolds: s.codeScaffolds,
        testCases: s.testCases,
        competitorData: s.competitorData,
        deliverables: s.deliverables,
      }),
      // PERSIST-03 — forward migration lane. No-op stub today; replace with
      // real transformer when bumping `version`. Signature: (persisted, v) => newState
      migrate: (persisted, _version) => persisted as Partial<RndState>,
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
```

### Pattern 4: HydrationGate

```tsx
// src/components/HydrationGate.tsx — ~15 lines, reuses ViewLoading skeleton
import { ReactNode } from 'react';
import { useProductStore } from '@/src/stores/productStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useRndStore } from '@/src/stores/rndStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { useUIStore } from '@/src/stores/uiStore';
import { Skeleton } from '@/src/components/ui/Skeleton';

const Loading = (
  <div className="p-6 space-y-4">
    <Skeleton variant="text" width="30%" />
    <Skeleton variant="rect" height={40} />
    <div className="grid grid-cols-3 gap-4">
      <Skeleton variant="card" height={120} />
      <Skeleton variant="card" height={120} />
      <Skeleton variant="card" height={120} />
    </div>
  </div>
);

export function HydrationGate({ children }: { children: ReactNode }) {
  const allHydrated =
    useProductStore((s) => s._hasHydrated) &&
    useTaskStore((s) => s._hasHydrated) &&
    useRndStore((s) => s._hasHydrated) &&
    useScheduleStore((s) => s._hasHydrated) &&
    useWorkspaceStore((s) => s._hasHydrated) &&
    useUIStore((s) => s._hasHydrated);
  return allHydrated ? <>{children}</> : Loading;
}
```

> Note: `themeStore` is NOT in the gate — it already hydrates synchronously from `localStorage['nova-theme']` and `useTheme()` applies the resolved theme on first effect. No need to block app render on it.

### Anti-Patterns to Avoid

- **Don't** omit `partialize`. Default serializes the entire store including functions; `JSON.stringify(fn)` silently drops them and round-trip loses actions.
- **Don't** omit `version`. Default `0`; if you ever need to migrate, you can't distinguish "never set" from "v0 persisted".
- **Don't** skip the sanity `SELECT` after `Database.load`. Plugin migrations silently fail (plugins-workspace#509); without the check, the first write fails with a confusing column-not-found error.
- **Don't** gate hydration on `themeStore`. It's already sync from localStorage; including it adds a flash of wrong-theme UI for no benefit.
- **Don't** persist `rndStore` before fixing `INITIAL.p1` fallback. The bug *becomes* persistent.
- **Don't** use `sql:default` blanket permission. List explicit `sql:allow-load` / `allow-execute` / `allow-select` / `allow-close` — Pitfall 5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Async storage for Zustand persist | Manual `JSON.parse` + `db.execute` per field, custom hydration tracking | `createJSONStorage(() => asyncStorage)` | Zustand's helper handles `null` returns, async awaits, error paths |
| SQL migration runner | Custom `__migrations` table + version comparison | `tauri_plugin_sql::Builder::add_migrations` + plugin's internal `__migrations` tracking | Plugin already does this; backstop with sanity SELECT + `meta.schema_version` |
| DB connection pooling | `Pool<Sqlite>` with max_conns tuning | Single `Database.load` singleton | SQLite serializes writes anyway; one connection is correct for desktop single-user |
| Test framework | Adopt jest/vitest for one self-check | `node --test` or `tsx --test` on a single `.test.ts` file | D-08 explicitly scoped to minimal self-check; full test infra is deferred |
| Per-store hydration state machine | Context + reducer tracking which stores rehydrated | One `_hasHydrated` boolean per store + `&&` in `HydrationGate` | 6 booleans is simpler than any abstraction |

**Key insight:** the entire storage layer is ~60 lines of TypeScript. Don't generalize; the abstraction cost would exceed the implementation cost.

## Common Pitfalls

### Pitfall 1: `tauri-plugin-sql` migrations silently fail (plugins-workspace#509)

**What goes wrong:** Plugin reports successful load but schema is missing columns / tables. First write throws "no such column".
**Why it happens:** Plugin's migration runner tracks applied migrations in `__migrations` but partial application isn't surfaced.
**How to avoid (D-04 step 3):** After `Database.load`, run `await db.select('SELECT key FROM kv_store LIMIT 1')`. If it throws → fatal "DB schema corrupted" error, do not proceed.
**Warning signs:** First write throws `no such column` / `no such table`.

### Pitfall 2: Persisting `rndStore` freezes the `INITIAL.p1` bug (HIGH — D-07)

**What goes wrong:** Today, `rndStore` accessors do `state.X[productId] || INITIAL_X.p1` (lines 255, 299, 323, 369). If `productId` is undefined / stale / from a deleted product, the accessor silently returns Product 1's seed data and the UI shows the wrong product's content with no error. Persistence freezes this bug into stored state across restarts.
**Why it happens:** Legacy demo convenience — pre-persistence, falling back to *some* data was less broken than crashing.
**How to avoid:** Replace all 4 fallback sites with typed empty values (`[]` for arrays, a minimal EMPTY object for the typed shapes). Add `console.warn('[rndStore] unknown productId:', productId)` so future regressions are visible.
**Warning signs:** Persisting without the fix, then deleting a product, then refreshing — the deleted product's slot in the UI may briefly show P1 data.

### Pitfall 3: `getProd()` fallback in `rndStore` returns the wrong product (related to D-07)

**What goes wrong:** Line 112 `return products.find((p) => p.id === productId) || products[0];` — if productId doesn't match, returns `products[0]`. The accessor then synthesizes data for *that* product under the requested productId header.
**Why it happens:** Same legacy demo pattern as Pitfall 2.
**How to avoid:** In D-07, also fix `getProd` — return `null` / throw if not found, or have callers short-circuit with EMPTY when product is missing. Test that `getRequirementForProduct('unknown-id')` returns EMPTY, not data synthesized from `products[0]`.
**Warning signs:** Generating AI for a deleted product produces content for `p1`.

### Pitfall 4: Async hydration race — components read empty state before rehydrate completes

**What goes wrong:** `useProductStore((s) => s.products)` returns `INITIAL_PRODUCTS_DATA` for one render frame, then jumps to persisted state. Views flicker "no data" → "data".
**Why it happens:** `createJSONStorage(() => asyncStorage)` makes hydration async; React renders before the promise resolves.
**How to avoid (D-11 + D-12):** `_hasHydrated` flag per store, gated at the root via `<HydrationGate>`. Gate shows skeleton until all 6 stores report hydrated.
**Warning signs:** List "flickers empty for 200ms on launch".

### Pitfall 5: Tauri capabilities missing or over-permissioned (Pitfall 5 in PITFALLS.md)

**What goes wrong:** `sql:default` blanket permission silently over-permissions; missing scope silently under-permissions (command "doesn't work" with vague error).
**Why it happens:** Capabilities are a separate file from Rust code; adding a command doesn't auto-grant.
**How to avoid (D-14):** New `src-tauri/capabilities/sql.json` listing exactly `sql:allow-load` / `allow-execute` / `allow-select` / `allow-close`, scoped to window `main`. No `sql:default`.
**Warning signs:** `command not allowed` rejection in devtools; SQL `execute` returns 0 rows when DB has data.

### Pitfall 6: `has_seeded` interpreted as "does data exist" instead of one-shot gate

**What goes wrong:** User deletes all products → restart → app sees "no data" → re-seeds → deleted data "comes back".
**Why it happens:** Natural reading of "has_seeded" is "is there data"; the correct semantic is "have we ever seeded".
**How to avoid (D-10):** `meta.has_seeded` is set to `'true'` once after the first seed write and never reset by the app code. Only manual `nova.db` deletion re-triggers seeding.
**Warning signs:** Deleted products reappear after restart.

### Pitfall 7: AppContext re-render compounds with persistence (existing tech debt — DO NOT amplify)

**What goes wrong:** `AppContext.tsx` constructs a fresh value object on every render (no `useMemo`). Persisted state changes trigger the same blast radius as in-memory changes — every consumer re-renders.
**Why it happens:** Pre-existing tech debt (CONCERNS.md "Legacy AppContext Compatibility Layer (HIGH)").
**How to avoid:** Persistence is invisible to `AppContext` — it subscribes to the same store slices. Don't change `AppContext` this phase; just be aware perf may *appear* worse after persist because more state changes survive across reloads. AppContext removal is tracked separately.
**Warning signs:** UI feels slower post-persist on large state — not a regression introduced here, but visibility increased.

## Runtime State Inventory

> Triggered by D-04 (refactor of startup flow) and D-07 (bug fix touching accessor return shape).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `localStorage['nova-theme']` — themeStore already persists there (NOT in scope; leave alone). No other persisted state today (in-memory only). | None — first persistence layer |
| Live service config | Express server has zero SQL state. `GEMINI_API_KEY` lives in `.env`, untouched. | None |
| OS-registered state | No Tauri commands registered for SQL yet. Window command registrations in `lib.rs` unchanged. | Add SQL plugin registration (D-14, lib.rs) |
| Secrets / env vars | `GEMINI_API_KEY` — not stored in DB; not in scope. | None |
| Build artifacts | `dist/server.cjs` (esbuild output) — irrelevant. `src-tauri/target/` will need rebuild for new cargo dep. | `cargo build` after Cargo.toml change |

**Nothing blocks:** No data migration needed because there's no existing SQLite data. First run creates the schema and seeds.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build / dev / test runner | ✓ | 24.14.0 | — |
| npm | Package install | ✓ | 11.9.0 | — |
| Rust toolchain | Tauri build (`tauri:dev` / `tauri:build`) | ✓ | rustc 1.91.1, cargo 1.91.1 | — |
| Tauri CLI | `tauri dev` / `tauri build` | ✓ | @tauri-apps/cli 2.11.4 (devDep) | — |
| `@tauri-apps/plugin-sql` (npm) | JS adapter | ✗ (not yet installed) | latest 2.4.0 | None — required for prod path |
| `tauri-plugin-sql` (cargo) | Rust plugin | ✗ (not yet installed) | latest 2.4.0 | None — required for prod path |
| SQLite (system) | SQL storage | ✓ (bundled via `sqlx`'s bundled feature in the plugin) | — | — |
| `tsx` (devDep) | D-08 self-check runner | ✓ | 4.21.0 | — |

**Missing dependencies with no fallback:** none — both missing deps (`@tauri-apps/plugin-sql` + cargo crate) are installable, expected to succeed in Wave 1.

**Missing dependencies with fallback:** none.

**Web/dev mode note (D-03):** When running `npm run dev` (Express + Vite middleware, no Tauri shell), `isTauri()` returns `false`, adapter falls back to `localStorage`. SQLite plugin / cargo / Rust toolchain are NOT exercised in this mode — dev experience is unaffected.

## Implementation Strategy (Wave-by-Wave)

### Wave 0 — Pre-persistence bug fix (mandatory per D-07, PERSIST-08)

**Scope:** Fix `rndStore` accessors + self-check before any persistence touches the store. Independent; shippable on its own.

Files:
- `src/stores/rndStore.ts` — replace 4 fallback sites (lines 255, 299, 323, 369) + fix `getProd` (line 112) to handle missing product
- `src/stores/__tests__/rndStore.test.ts` (NEW) — ~30 lines, `node --test` or `tsx --test`
- `package.json` — add `"test": "tsx --test src/stores/__tests__/*.test.ts"` script

Acceptance:
- `getKnowledgeForProduct('unknown-id')` returns `[]`, not `INITIAL_KNOWLEDGE_BASE.p1`
- `getCompetitorDataForProduct('unknown-id')` returns an EMPTY shape (typed minimal object), not `INITIAL_COMPETITOR_DATA.p1`
- `console.warn` fires for unknown IDs
- `npm test` passes

### Wave 1 — Storage infrastructure

**Scope:** Wire the SQL plugin + adapter. No store changes yet — just the foundation.

Files:
- `package.json` — add `@tauri-apps/plugin-sql` dep
- `src-tauri/Cargo.toml` — add `tauri-plugin-sql = { version = "2", features = ["sqlite"] }`
- `src-tauri/migrations/0001_init.sql` (NEW) — `kv_store` + `meta` + seed rows (D-05)
- `src-tauri/src/lib.rs` — register plugin + migrations (D-06)
- `src-tauri/capabilities/sql.json` (NEW) — D-14 permissions
- `src-tauri/tauri.conf.json` — `plugins.sql.preload = ["sqlite:nova.db"]` (so the connection opens at app start, not lazily on first JS call)
- `src/lib/api.ts` (NEW) — extract `isTauri()` here; update `src/components/layout/TitleBar.tsx` to import from it
- `src/stores/storage/lazySqlite.ts` (NEW)
- `src/stores/storage/sqliteStorage.ts` (NEW)
- `src/stores/storage/initializeDatabase.ts` (NEW)

Acceptance:
- `npm run tauri:dev` boots, no console errors
- `await lazySqlite()` resolves to a Database; `kv_store` and `meta` tables exist
- Dev (`npm run dev`) falls back to `localStorage` adapter, app still runs

### Wave 2 — Wrap each store in `persist(...)`

**Scope:** Add persistence to all 6 stores. After this wave, state survives refresh — but seed may not happen yet (still uses mock data on first load because `_hasHydrated` flow is wired in Wave 3).

Files:
- `src/stores/productStore.ts`
- `src/stores/taskStore.ts`
- `src/stores/rndStore.ts`
- `src/stores/scheduleStore.ts`
- `src/stores/workspaceStore.ts`
- `src/stores/uiStore.ts` (partialize drops `theme` — moved to themeStore in Phase 1; drops `isSearchOpen`, `isNewTaskOpen` per D-13)

Each store:
1. Add `_hasHydrated: boolean` + `_setHydrated: () => void` to state interface
2. Wrap `create(...)` in `persist(...)` with `name`, `version: 1`, `storage: sqliteStorage`, `partialize`, `migrate` no-op stub, `onRehydrateStorage` callback
3. Initialize `_hasHydrated: false`

Acceptance:
- After refresh in dev mode, all 6 stores' persisted state round-trips through `localStorage`
- `npm run lint` (tsc) passes
- App still renders (no regression)

### Wave 3 — Startup orchestration + HydrationGate + seeding

**Scope:** Bring it all together. First-run seed + hydration gate before render.

Files:
- `src/stores/storage/initializeDatabase.ts` — flesh out: load → sanity SELECT → version check → seed check
- `src/main.tsx` — `await initializeDatabase()` then `createRoot().render(<App />)`
- `src/components/HydrationGate.tsx` (NEW) — D-12
- `src/App.tsx` — wrap `<MainLayout>` in `<HydrationGate>`

Acceptance:
- First launch on empty `${appData}/nova.db`: schema created → seed runs → `meta.has_seeded = 'true'` → app boots with mock data
- Second launch: `has_seeded = 'true'` → skip seed → user changes from previous session preserved
- Delete `nova.db` manually → next launch re-seeds (expected per D-10)
- `npm run tauri:dev` shows skeleton briefly, then full UI; no flash of empty lists

## Technical Details

### Initial Migration (0001_init.sql)

```sql
-- src-tauri/migrations/0001_init.sql
-- Per D-05. Forward-only additive; no DROP / ALTER DROP ever in this directory.

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Idempotent seed rows. INSERT OR IGNORE so re-running this migration is safe.
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
INSERT OR IGNORE INTO meta (key, value) VALUES ('has_seeded', 'false');
```

### Rust Registration (`src-tauri/src/lib.rs`)

```rust
// Per D-06. Migrations are Rust-side so they run at plugin init, before any JS boots.
use tauri_plugin_sql::{Migration, MigrationKind};

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        description: "init_kv_store_and_meta",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    },
];

// Inside run():
tauri::Builder::default()
    .plugin(
        tauri_plugin_sql::Builder::default()
            .add_migrations("sqlite:nova.db", MIGRATIONS.to_vec())
            .build(),
    )
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![get_gnome_color_scheme])
    // ... rest unchanged
```

### Capability (`src-tauri/capabilities/sql.json`)

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "sql",
  "description": "SQLite persistence for Zustand stores (Phase 2)",
  "windows": ["main"],
  "permissions": [
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close"
  ]
}
```

> Tauri v2 auto-discovers all `*.json` files in `src-tauri/capabilities/` — no manifest edit needed.

### `tauri.conf.json` Plugin Preload

```json
{
  "plugins": {
    "sql": {
      "preload": ["sqlite:nova.db"]
    }
  }
}
```

> This causes the plugin to open the connection + run migrations at app start, so by the time JS calls `Database.load(...)`, it returns the already-open pooled connection. (Without preload, the first `Database.load` would still work but migrations would be slightly delayed.)

### Startup Orchestration (`src/stores/storage/initializeDatabase.ts`)

```ts
// Per D-04. Exported as a function called from main.tsx before React renders.
import { lazySqlite } from './lazySqlite';

export const APP_SCHEMA_VERSION = 1;

interface MetaRow { value: string }

export async function initializeDatabase(): Promise<void> {
  const db = await lazySqlite();

  // Step 3 (D-04): sanity SELECT — surface silent migration failure (Pitfall 2)
  try {
    await db.select<{ key: string }[]>('SELECT key FROM kv_store LIMIT 1');
  } catch (err) {
    throw new Error(
      '[initializeDatabase] kv_store sanity SELECT failed — schema may be corrupted. ' +
      'Delete nova.db in app data dir and restart. Cause: ' + String(err),
    );
  }

  // Step 4 (D-04): schema_version guard (refuse to start on too-new DB)
  const versionRows = await db.select<MetaRow[]>(
    "SELECT value FROM meta WHERE key = $1",
    ['schema_version'],
  );
  const dbVersion = parseInt(versionRows[0]?.value ?? '0', 10);
  if (dbVersion > APP_SCHEMA_VERSION) {
    throw new Error(
      `[initializeDatabase] DB schema_version (${dbVersion}) is newer than app ` +
      `expected (${APP_SCHEMA_VERSION}). Refusing to start — upgrade the app.`,
    );
  }

  // Step 5 (D-04 + D-09): one-shot seed gate
  const seededRows = await db.select<MetaRow[]>(
    "SELECT value FROM meta WHERE key = $1",
    ['has_seeded'],
  );
  if (seededRows[0]?.value === 'false') {
    await seedAllStores(db);
    await db.execute(
      "UPDATE meta SET value = 'true' WHERE key = $1",
      ['has_seeded'],
    );
  }
}

async function seedAllStores(db: Awaited<ReturnType<typeof lazySqlite>>): Promise<void> {
  // Dynamic imports — keeps mock data out of the prod bundle when has_seeded is already true.
  // Ponytail: lazy import is one extra line, saves ~2k lines of seed data from main bundle.
  const { INITIAL_PRODUCTS_DATA } = await import('@/src/data/mockProducts');
  const { INITIAL_CATEGORIES } = await import('@/src/data/mockTasks');
  const {
    INITIAL_REQUIREMENTS, INITIAL_PROTOTYPES, INITIAL_KNOWLEDGE_BASE,
    INITIAL_CODE_SCAFFOLDS, INITIAL_TEST_CASES, INITIAL_COMPETITOR_DATA,
  } = await import('@/src/data/mockRndData');
  // schedule + workspace seeds are defined in-store (INITIAL_EVENTS, INITIAL_WORKSPACES,
  // INITIAL_LOCAL_FILES); re-export from a single seed module to keep this function tight.
  const { buildInitialSeed } = await import('./seedData');

  const seeds: Record<string, unknown> = {
    'nova-product': { products: INITIAL_PRODUCTS_DATA },
    'nova-task':    { categories: INITIAL_CATEGORIES },
    'nova-rnd':     {
      requirements: INITIAL_REQUIREMENTS,
      prototypes: INITIAL_PROTOTYPES,
      knowledgeBase: INITIAL_KNOWLEDGE_BASE,
      codeScaffolds: INITIAL_CODE_SCAFFOLDS,
      testCases: INITIAL_TEST_CASES,
      competitorData: INITIAL_COMPETITOR_DATA,
      deliverables: buildInitialSeed.deliverables, // built from INITIAL_PRODUCTS_DATA via buildInitialDeliverables
    },
    'nova-schedule': { events: buildInitialSeed.events },
    'nova-workspace': { workspaces: buildInitialSeed.workspaces, localIndexedFiles: buildInitialSeed.localIndexedFiles },
    'nova-ui':       { activeTab: 'agent', selectedProductId: null },
  };

  // 6 inserts, single transaction would be nicer but plugin doesn't expose transactions
  // at this layer. Promise.all is fine — SQLite serializes anyway.
  await Promise.all(
    Object.entries(seeds).map(([key, value]) =>
      db.execute(
        'INSERT OR REPLACE INTO kv_store (key, value) VALUES ($1, $2)',
        [key, JSON.stringify(value)],
      ),
    ),
  );
}
```

> The `seedData.ts` helper centralizes the in-store seed constants (`INITIAL_EVENTS` etc., currently file-private in `scheduleStore.ts` and `workspaceStore.ts`). Refactor: export them so seeding can read. Smallest diff — just add `export` to the existing `const`.

### `src/main.tsx` Change

```ts
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initializeDatabase } from './stores/storage/initializeDatabase';
import './index.css';

// Top-level await is supported by Vite + esbuild for ES2022 modules.
// Ponytail: no error UI on init failure — a thrown error here produces a blank
// screen with the message in console. If we want UX polish, add later.
await initializeDatabase();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

> Vite supports top-level await when `target: ES2022` (which `tsconfig.json` already has). No bundler config change needed.

### Per-Store `partialize` Reference

| Store | Key | Persisted Fields | Dropped Fields |
|-------|-----|------------------|----------------|
| productStore | `nova-product` | `products` | (only actions otherwise) |
| taskStore | `nova-task` | `categories` | (only actions otherwise) |
| rndStore | `nova-rnd` | `requirements`, `prototypes`, `knowledgeBase`, `codeScaffolds`, `testCases`, `competitorData`, `deliverables` | (only actions otherwise) |
| scheduleStore | `nova-schedule` | `events` | (only actions otherwise) |
| workspaceStore | `nova-workspace` | `workspaces`, `localIndexedFiles` | (only actions otherwise) |
| uiStore | `nova-ui` | `activeTab`, `selectedProductId` | `theme` (already in themeStore), `isSearchOpen`, `isNewTaskOpen` (transient modal flags) |
| themeStore | (NOT TOUCHED) | `theme` via its own `nova-theme` localStorage | — |

### rndStore Bug Fix Detail (D-07)

Current accessor signatures (4 sites + `getProd`):

```ts
// Line 112 — getProd
const getProd = (productId: string): Product => {
  const products = useProductStore.getState().products;
  return products.find((p) => p.id === productId) || products[0];  // BUG: returns P1
};

// Line 255 — getKnowledgeForProduct
return knowledgeBase[productId] || INITIAL_KNOWLEDGE_BASE.p1 || [];  // BUG

// Line 299 — getCodeScaffoldsForProduct
return codeScaffolds[productId] || INITIAL_CODE_SCAFFOLDS.p1 || [];  // BUG

// Line 323 — getTestCasesForProduct
return testCases[productId] || INITIAL_TEST_CASES.p1 || [];          // BUG

// Line 369 — getCompetitorDataForProduct (synthesizes from INITIAL_COMPETITOR_DATA.p1 + prod)
return { ..., radarData: INITIAL_COMPETITOR_DATA.p1.radarData, ... };  // BUG
```

Fixed shape:

```ts
// Empty fallbacks — typed minimal objects. Lives at top of rndStore.ts.
const EMPTY_REQUIREMENT: ProductRequirementDesign = {
  id: '', productId: '', title: '', version: 'v0.0.0', updatedAt: '',
  status: '草稿', author: '', businessGoal: '', targetAudience: [],
  coreSummary: '', userStories: [], useCases: [], boundaryChecks: [],
  flowchartNodes: [], prdMarkdown: '',
};

const EMPTY_PROTOTYPE: UIPrototypeScreen = {
  id: '', title: '', device: 'desktop', theme: 'indigo', route: '',
  description: '', sections: [], reactCode: '',
  designTokens: { primaryColor: '', fontFamily: '', borderRadius: '', spacingScale: '' },
};

const EMPTY_COMPETITOR: CompetitorAnalysisData = {
  productId: '', productName: '', updatedAt: '',
  radarData: [], competitors: [], swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
  differentiationStrategy: '', gapAnalysis: [],
};

// getProd — return null when not found, callers handle
const getProd = (productId: string): Product | null => {
  const products = useProductStore.getState().products;
  return products.find((p) => p.id === productId) ?? null;
};

// Accessors — return EMPTY when missing; warn for visibility
getRequirementForProduct: (productId) => {
  const { requirements } = get();
  if (requirements[productId]) return requirements[productId];
  console.warn('[rndStore] unknown productId in getRequirementForProduct:', productId);
  return EMPTY_REQUIREMENT;
},

getPrototypeForProduct: (productId) => {
  const { prototypes } = get();
  if (prototypes[productId]) return prototypes[productId];
  console.warn('[rndStore] unknown productId in getPrototypeForProduct:', productId);
  return EMPTY_PROTOTYPE;
},

getKnowledgeForProduct: (productId) => {
  const { knowledgeBase } = get();
  if (knowledgeBase[productId]) return knowledgeBase[productId];
  console.warn('[rndStore] unknown productId in getKnowledgeForProduct:', productId);
  return [];  // empty array is the natural empty for list types
},

getCodeScaffoldsForProduct: (productId) => {
  const { codeScaffolds } = get();
  if (codeScaffolds[productId]) return codeScaffolds[productId];
  console.warn('[rndStore] unknown productId in getCodeScaffoldsForProduct:', productId);
  return [];
},

getTestCasesForProduct: (productId) => {
  const { testCases } = get();
  if (testCases[productId]) return testCases[productId];
  console.warn('[rndStore] unknown productId in getTestCasesForProduct:', productId);
  return [];
},

getCompetitorDataForProduct: (productId) => {
  const { competitorData } = get();
  if (competitorData[productId]) return competitorData[productId];
  console.warn('[rndStore] unknown productId in getCompetitorDataForProduct:', productId);
  return EMPTY_COMPETITOR;
},

getDeliverablesForProduct: (productId) => {
  const { deliverables } = get();
  if (deliverables[productId]) return deliverables[productId];
  console.warn('[rndStore] unknown productId in getDeliverablesForProduct:', productId);
  return [];
},
```

> Note: the existing `getDeliverablesForProduct` at line 399 has a *side-effecting* fallback (`set(...)` to cache). Drop that side effect for unknown IDs — only seed-on-first-access for known products. Test: `getDeliverablesForProduct('unknown')` must NOT write to the store.

### D-08 Self-Check

```ts
// src/stores/__tests__/rndStore.test.ts
// Run with: tsx --test src/stores/__tests__/rndStore.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useRndStore } from '../rndStore';

test('rndStore: unknown productId returns empty, not INITIAL.p1', () => {
  const store = useRndStore.getState();

  // Knowledge: empty array, not INITIAL_KNOWLEDGE_BASE.p1
  const knowledge = store.getKnowledgeForProduct('definitely-unknown-id-xyz');
  assert.deepEqual(knowledge, [], 'getKnowledgeForProduct must return [] for unknown id');

  // Code scaffolds
  const scaffolds = store.getCodeScaffoldsForProduct('definitely-unknown-id-xyz');
  assert.deepEqual(scaffolds, [], 'getCodeScaffoldsForProduct must return [] for unknown id');

  // Test cases
  const tests = store.getTestCasesForProduct('definitely-unknown-id-xyz');
  assert.deepEqual(tests, [], 'getTestCasesForProduct must return [] for unknown id');

  // Deliverables — also must NOT mutate store as a side effect
  const deliverablesBefore = useRndStore.getState().deliverables;
  const delivs = store.getDeliverablesForProduct('definitely-unknown-id-xyz');
  assert.deepEqual(delivs, [], 'getDeliverablesForProduct must return [] for unknown id');
  assert.equal(
    useRndStore.getState().deliverables,
    deliverablesBefore,
    'getDeliverablesForProduct must not write to store for unknown id',
  );

  // Competitor data: typed empty object, not INITIAL_COMPETITOR_DATA.p1
  const comp = store.getCompetitorDataForProduct('definitely-unknown-id-xyz');
  assert.equal(comp.productId, '', 'competitor must be empty for unknown id');
  assert.deepEqual(comp.radarData, []);
  assert.deepEqual(comp.competitors, []);
});
```

> `package.json` script: `"test": "tsx --test src/stores/__tests__/*.test.ts"`. Run with `npm test`.

## Validation Architecture

> `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json` — **skip this section per instructions.** Project has no test framework; validation is manual + the D-08 self-check.

### Manual Verification Checklist

Each requirement gets a manual check (no automated test framework this phase):

| Req ID | Manual Verification |
|--------|---------------------|
| PERSIST-01 | In `tauri:dev`: add a product → restart app → product still present. Same for task / rnd deliverable / schedule event / workspace. |
| PERSIST-02 | Open a modal (e.g. "new task") → refresh → modal closed, `isNewTaskOpen === false`. Verify via React DevTools. |
| PERSIST-03 | `grep -n "version:" src/stores/*.ts` shows `version: 1` in each `persist` config. `grep -n "migrate:" src/stores/*.ts` shows stub. |
| PERSIST-04 | `cargo tree -p tauri-plugin-sql` shows version 2.x. `npm ls @tauri-apps/plugin-sql` shows 2.4.x. |
| PERSIST-05 | `sqliteStorage.ts` line count ≤ 30; single `if (isTauri())` branch. |
| PERSIST-06 | Manually corrupt `kv_store` table (drop it via a SQLite CLI) → restart → app shows "schema corrupted" error, not silent crash. Grep `migrations/` for `DROP\|ALTER.*DROP` → 0 results. |
| PERSIST-07 | Throttle network in devtools → restart → confirm skeleton shows until `_hasHydrated === true` for all 6 stores. |
| PERSIST-08 | `npm test` passes. Manually call `useRndStore.getState().getKnowledgeForProduct('zzz')` in console → returns `[]`, console.warn fires. |
| PERSIST-09 | Delete `nova.db` in `${appData}` → restart → seed data appears → `meta.has_seeded === 'true'`. Delete a product → restart → product NOT re-seeded (data ownership respected). |

### Sampling Rate

- **Per task commit:** `npm run lint` (tsc) + `npm test` (D-08 self-check)
- **Per wave merge:** manual smoke of `tauri:dev` (add data, restart, verify)
- **Phase gate:** all 9 manual checks above pass before `/gsd:verify-work`

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Plugin migration silently fails (Pitfall 2) | MEDIUM | HIGH — first write crashes | Sanity SELECT + `meta.schema_version` table (D-04 step 3) |
| `rndStore` fix changes downstream view behavior | MEDIUM | MEDIUM — some views may now show empty state where they used to show P1 data | D-08 self-check + manual smoke of every R&D tab in `tauri:dev` |
| Top-level await in `main.tsx` breaks older bundler path | LOW | HIGH — app won't boot | Vite + esbuild support it for ES2022 (verified in tsconfig); fallback: wrap in IIFE |
| `tauri.conf.json` `plugins.sql.preload` not picked up | LOW | MEDIUM — first JS call is slower, migrations delayed | Even without preload, `Database.load` runs migrations on first call — preload is optimization, not correctness |
| Adapter returns `null` for missing keys → Zustand treats as "no persisted state" → uses default | LOW | LOW — first run correctly uses defaults | This is the *desired* behavior; first run falls through to seeding anyway |
| `has_seeded` row missing on first run (migration didn't seed it) | LOW | HIGH — seed loop runs every launch | `0001_init.sql` includes `INSERT OR IGNORE INTO meta ... 'has_seeded', 'false'`; sanity SELECT would also catch missing table |
| Seeding writes succeed for some stores, fail for others (partial seed) | LOW | HIGH — `has_seeded` set to true despite partial | Order: write all 6 in `Promise.all`, only set `has_seeded='true'` after all resolve. If any throws, `has_seeded` stays false, next launch retries. |
| `themeStore` not in HydrationGate causes theme flash | LOW | LOW — momentary wrong theme | `themeStore` is sync from localStorage; `useTheme()` applies resolved theme on first effect — at most one frame of light theme before dark applies. Acceptable. |
| `AppContext` re-renders worsen with persistence | MEDIUM | MEDIUM — perf regression visibility | Out of scope (CONCERNS.md HIGH). Note in commit message; do not fix here. |

## Open Questions

1. **Does `tauri-plugin-sql` support transactions across `execute` calls?**
   - What we know: The plugin's underlying sqlx pool supports transactions, but the JS API surface (`Database.execute`) doesn't expose `BEGIN`/`COMMIT` directly. Some users report `db.execute('BEGIN')` works as a regular SQL statement.
   - Recommendation: For seeding, use `Promise.all` of 6 inserts. SQLite serializes writes anyway. If atomicity matters later, investigate `execute_batch` with a single multi-statement string. **Not blocking this phase** — partial-seed mitigation above (only set `has_seeded` after all resolve) is sufficient.

2. **Should `initializeDatabase` be called inside `HydrationGate` or before `createRoot`?**
   - What we know: Both work. Before `createRoot` is simpler (no React lifecycle coupling) but blocks first paint with a black screen during DB load. Inside `HydrationGate` shows skeleton during DB load.
   - Recommendation: **Before `createRoot`** (matches D-04 wording "在 React 渲染前"). DB load is ~10-50ms; black screen is invisible. If it grows, revisit.

3. **Should we expose `_hasHydrated` via a single hook (`useAllStoresHydrated`)?**
   - What we know: `HydrationGate` does the `&&` inline (6 stores). A custom hook would centralize.
   - Recommendation: **Skip the hook.** YAGNI — `HydrationGate` is the only consumer. Adding `useAllStoresHydrated` is one abstraction for one call site.

## References

### Primary (HIGH confidence)

- [Tauri v2 SQL Plugin docs](https://v2.tauri.app/plugin/sql/) — installation, Rust registration, `Database.load`, migrations, permission setup
- [tauri-plugin-sql on crates.io](https://crates.io/crates/tauri-plugin-sql) — version 2.4.0 latest, features `sqlite`/`mysql`/`postgres`
- [plugins-workspace sql/README.md (v2 branch)](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/sql/README.md) — full code samples, `include_str!` migration pattern
- [@tauri-apps/plugin-sol on npm](https://www.npmjs.com/package/@tauri-apps/plugin-sql) — version 2.4.0 latest
- [Zustand persist docs](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) — `createJSONStorage`, `partialize`, `migrate`, `onRehydrateStorage`
- [Zustand persist middleware reference](https://zustand.docs.pmnd.rs/reference/middlewares/persist) — full options surface
- [plugins-workspace#509](https://github.com/tauri-apps/plugins-workspace/issues/509) — confirmed silent migration failure bug
- [plugins-workspace#1346](https://github.com/tauri-apps/plugins-workspace/issues/1346) — no first-class down migrations (forward-only is correct policy)
- [plugins-workspace#3536](https://github.com/tauri-apps/plugins-workspace/issues/3536) — permissions need explicit scopes

### Secondary (MEDIUM confidence — verified multiple sources)

- Stack Overflow / dev.to examples of `StateStorage` interface with async `getItem` / `setItem` (consistent with official Zustand docs)

### Local Files (verified by reading the codebase)

- `.planning/codebase/CONCERNS.md` — `rndStore` God Store bug + No State Persistence HIGH severity
- `.planning/research/PITFALLS.md` — Pitfall 2 (SQL migrations), Pitfall 3 (Zustand persist pitfalls), Pitfall 5 (capabilities)
- `src/stores/rndStore.ts:112` — `getProd` returns `products[0]` fallback
- `src/stores/rndStore.ts:255, 299, 323, 369` — `INITIAL_X.p1` fallbacks (4 sites)
- `src/stores/themeStore.ts` — already persists to `localStorage['nova-theme']`; out of scope
- `src/components/layout/TitleBar.tsx:7-11` — local `isTauri()` to extract to `src/lib/api.ts`
- `src/main.tsx` — entry point for `await initializeDatabase()` injection
- `src/App.tsx:106-117` — `<HydrationGate>` wrap location around `<MainLayout>`
- `src-tauri/src/lib.rs` — Tauri builder, plugin registration point
- `src-tauri/Cargo.toml` — clean dep list, no SQL plugin yet
- `src-tauri/capabilities/default.json` — current permissions (window + shell); sql.json sibling will be auto-discovered

## Sources

### Primary (HIGH confidence)

- [Tauri v2: SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [tauri-plugin-sql 2.4.0 on docs.rs](https://docs.rs/crate/tauri-plugin-sql/latest)
- [tauri-plugin-sql on crates.io](https://crates.io/crates/tauri-plugin-sql)
- [@tauri-apps/plugin-sol on npm](https://www.npmjs.com/package/@tauri-apps/plugin-sql)
- [plugins-workspace v2 plugins/sql README](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/sql/README.md)
- [Zustand: Persisting store data](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data)
- [Zustand: persist middleware](https://zustand.docs.pmnd.rs/reference/middlewares/persist)
- [Zustand discussion #2596 — async setItem contract](https://github.com/pmndrs/zustand/discussions/2596)
- [plugins-workspace#509 — silent migration failure](https://github.com/tauri-apps/plugins-workspace/issues/509)
- [plugins-workspace#1346 — no down migrations](https://github.com/tauri-apps/plugins-workspace/issues/1346)
- [plugins-workspace#3536 — permissions need scopes](https://github.com/tauri-apps/plugins-workspace/issues/3536)

### Tertiary (LOW confidence — not load-bearing for this phase)

- [Tauri 2.0 SQLite DB with React (dev.to)](https://dev.to/focuscookie/tauri-20-sqlite-db-react-2aem) — corroborates official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via `npm view` (2.4.0 latest), docs.rs, project's `package.json`/`Cargo.toml`
- Architecture: HIGH — adapter pattern is the official Zustand-recommended path; SQL plugin API surface confirmed via official README
- rndStore fix: HIGH — 4 fallback sites + `getProd` identified via grep at exact line numbers
- Pitfalls: HIGH — sourced from project's own `.planning/research/PITFALLS.md` + `codebase/CONCERNS.md`

**Research date:** 2026-08-08
**Valid until:** 2027-02-08 (6 months — Tauri v2 plugin API stable; tauri-plugin-sql at 2.4.0, no breaking changes expected before Tauri v3)
