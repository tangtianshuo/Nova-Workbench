# Technology Stack — v0.3.0 New Capabilities

**Project:** Nova-PM-Workspace (v0.3.0 Agent 功能闭环)
**Researched:** 2026-08-14
**Mode:** Project research (STACK for new features only — existing validated stack NOT re-researched)

## Headline Finding

**Almost nothing new is needed.** The single most important verification of this research: **FTS5 is already compiled into the existing SQLite** in this exact dependency tree — verified from the vendored crate sources on this machine, not from docs. The milestone's heaviest-sounding items (event log, FTS5 retrieval, morning report) require **zero new Rust dependencies** and **one new npm package** (Radix ContextMenu, ~12 KB).

## Recommended Stack (additions only)

### New npm dependencies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@radix-ui/react-context-menu` | 2.3.7 (latest) | Right-click context menu for quick AI actions | Same primitive family and near-identical API as the already-installed `@radix-ui/react-dropdown-menu` ^2.1.24 — the existing `DropdownMenu.tsx` wrapper can be cloned into a `ContextMenu.tsx` in `src/components/ui/` with ~30 lines of edits (trigger swap, drop dropdown-specific props). Inherits tokens + `cn()` pattern, portal, keyboard nav, submenus for free. |

That is the complete list of new dependencies for this milestone.

### New Rust dependencies

**None.** Verified against `src-tauri/Cargo.toml` and the actual vendored sources:

- `tauri-plugin-sql` 2.4.0 (installed) → enables sqlx `sqlite` feature
- sqlx 0.8.6 `sqlite` feature → `sqlx-sqlite/bundled` (verified in vendored `sqlx-0.8.6/Cargo.toml`, `sqlite = [..., "sqlx-sqlite/bundled"]`)
- `libsqlite3-sys` 0.30.1 bundled `build.rs` compiles `sqlite3.c` **3.46.0** with `-DSQLITE_ENABLE_FTS5` (also FTS3, FTS3_PARENTHESIS, JSON1, RTREE, STAT4, column metadata, soundex)

Confidence: **HIGH** — read directly from `~/.cargo/registry/src/.../libsqlite3-sys-0.30.1/build.rs` (lines 127–129) and `sqlite3/sqlite3.h` (`SQLITE_VERSION "3.46.0"`). This is the binary already being shipped; `CREATE VIRTUAL TABLE ... USING fts5(...)` works against `sqlite:nova.db` today with no config change.

### Existing pieces being extended (no version change)

| Technology | Version | New Role in v0.3.0 |
|------------|---------|---------------------|
| `tauri-plugin-sql` (Rust + JS) | 2.4.0 | Event log + memory tables via new migration files; FTS5 virtual tables; retrieval `SELECT`s with `MATCH` + `bm25()` |
| `src-tauri/migrations/` forward-only migrations | existing pattern | Add `0002_agent_events.sql`, `0003_memory.sql`, `0004_fts5.sql` — `sql_migrations()` in `lib.rs` gains three `include_str!` entries |
| `kv_store` / `meta` tables | existing | Morning-report "shown today" date flag lives in `kv_store` — already exists, no new table |
| Zod tool registry + `toolLoop.ts` | existing (~200 LOC) | Emit events per step via `Database.execute`; an append call in the loop, not a registry rewrite |
| Rust `llm.rs` + Tauri Channel streaming | existing | Unchanged; morning report and deliverable generation go through the same `chat` command |

## Integration Decisions

### 1. FTS5 availability — verified, not assumed

Evidence chain (all read from local disk):

```
tauri-plugin-sql 2.4.0
  └─ sqlx 0.8.6, feature "sqlite"          (tauri-plugin-sql Cargo.toml)
       └─ sqlx-sqlite 0.8.6 "bundled"      (sqlx Cargo.toml: sqlite = [..., "sqlx-sqlite/bundled"])
            └─ libsqlite3-sys 0.30.1 build_bundled
                 -DSQLITE_ENABLE_FTS5       (build.rs:129)
                 SQLite 3.46.0              (sqlite3.h:149)
```

Consequence: hybrid retrieval is pure SQL against the existing DB. No js-search, no minisearch, no flexsearch, no sqlite-vec, no Rust FTS crate.

### 2. Schema migrations — extend the existing pattern, don't add a tool

The project already has the right mechanism: `sql_migrations()` in `src-tauri/src/lib.rs` + forward-only additive SQL files + JS-side `meta.schema_version` sanity check. New tables (agent_events, confirmation_candidates, memory_candidates, knowledge_documents/chunks, FTS5 virtual tables) are just `0002+` migration files. Explicitly do NOT add: Diesel/SeaORM/Prisma, an event-sourcing enforcement library (a `CHECK` + unique index IS the invariant), or a migration framework with down-migrations (project already decided forward-only).

Two SQLite-level additions worth one line each in the migration:

- `PRAGMA journal_mode = WAL;` — the single `nova.db` now takes concurrent writes from the Zustand persist adapter AND event-log appends; WAL removes most `SQLITE_BUSY` risk. (WAL is persistent per-database, so setting it once sticks.)
- `CREATE UNIQUE INDEX ... ON agent_events(session_id, seq);` — tool call/result pairing and seq invariants live in the DB, not in TS discipline. Append via atomic single statement: `INSERT INTO agent_events (..., seq) SELECT ..., COALESCE(MAX(seq),0)+1 FROM agent_events WHERE session_id = ?` so a crash between read and write can't duplicate seq.

Note on the plugin's JS API: `execute()` is one statement per call — fine at event-log volume (one row per tool call/turn). No batching layer needed.

### 3. CJK tokenizer — the one real FTS5 gotcha for this codebase

Nova's content is Chinese. FTS5's default `unicode61` tokenizer treats a contiguous CJK run as a **single token** ("需求分析" is one token; querying "需求" misses it), and the bundled build has **no ICU tokenizer** (`SQLITE_ENABLE_ICU` is not in the build.rs flag list — verified). Options:

| Approach | How | Tradeoff |
|----------|-----|----------|
| **CJK char-split at index+query time (recommended)** | ~10-line TS helper: insert spaces between CJK chars before writing to the FTS5 table and before building the `MATCH` query; keep `unicode61` | Zero deps, handles 2-char queries ("需求", "任务"), phrase-ish matching works; slightly dilutes bm25 relevance — acceptable because v0.3.0 retrieval is structured-filter-first (AGENT_MEMORY_REFERENCE §5) |
| `tokenize='trigram'` (SQLite ≥3.34; we have 3.46) | Just a tokenizer option in `CREATE VIRTUAL TABLE` | Zero code, substring match; but queries under 3 characters return nothing — disqualifying for common 2-char Chinese terms |
| External tokenizer crate / jieba-wasm / lindera | — | Rejected: heavy new deps for marginal gain over char-split at this scale |

Pair the FTS5 table with an **external-content** definition over `knowledge_chunks` plus the standard 4 sync triggers (INSERT/UPDATE/DELETE on the content table), so index drift — a stated acceptance criterion in AGENT_MEMORY_REFERENCE §10 — is impossible by construction. Ranking: built-in `bm25()` with column weights (title > content), then filtered/re-ranked in JS by workspace/product/type/recency.

### 4. Right-click context menu — one Radix package, wrapper cloning

`@radix-ui/react-context-menu` 2.3.7 (verified live on npm registry, 2026-08-14). API mirrors DropdownMenu (ContextMenu/Trigger/Content/Item/Sub...). Build `src/components/ui/ContextMenu.tsx` as a token-styled wrapper mirroring the existing `DropdownMenu.tsx`, register in the `ui/index.ts` barrel. Do NOT add react-contexify or a hand-rolled `onContextMenu` + fixed-position div (loses portal/keyboard/submenu behavior Radix gives for free).

### 5. Morning report — no scheduler at all

"晨报" is a once-per-day, app-launch-triggered artifact. The lazy correct design:

1. On app startup (plus a 60s `setInterval` in one hook for sessions crossing midnight — 10 lines), compare `kv_store['morning_report_last_shown']` to today's date.
2. If stale: assemble report from existing stores (scheduleStore today, taskStore overdue, pending memory candidates) — synchronous local reads, optionally one `chat` call for prose summarization.
3. Render in-app. Done.

Do NOT add: `tokio-cron-scheduler`, `cron` crate, node-cron, or a Rust background timer emitting Tauri events — a timer that fires while the app is closed is meaningless, and the webview is alive whenever the report could be shown. If OS-level notifications are ever wanted (not this milestone), `tauri-plugin-notification` is the future answer — noted, not installed.

### 6. Event-log write path — stays in TypeScript

AGENT_MEMORY_REFERENCE §7 targets `toolLoop.ts`/`confirmations.ts`/`registry.ts` for event emission. Route all appends through the tauri-plugin-sql JS API (`Database.load('sqlite:nova.db')`), one `execute()` per event. No Rust command layer needed: the plugin already owns the connection pool, and moving appends to Rust would duplicate pool ownership. Web-mode (Express) fallback: plugin unavailable in browser — degrade to in-memory events (current behavior), consistent with the existing localStorage fallback boundary.

## What NOT to Add (explicit rejections)

| Rejected | Why |
|----------|-----|
| LanceDB / sqlite-vec / any vector DB | Project decision: FTS5 first, embeddings are P2 (v0.4); vector index is a derived layer, never source of truth |
| GraphFlow / any workflow engine | Formally rejected in PROJECT.md Key Decisions |
| js-search / minisearch / flexsearch / Fuse.js | Duplicates FTS5 already running in-process via the SQL plugin; double indexing, double drift risk |
| Event-sourcing library | The "event log" here is one append-only table + replay queries — a library would be 100% ceremony |
| tokio-cron-scheduler / node-cron | Launch-time date check covers the requirement (see §5) |
| react-contexify or custom context menu | Radix ContextMenu is the design system's primitive family |
| New migration/ORM tooling | Forward-only `add_migrations` pattern validated in v0.1.0 |
| ICU tokenizer / segmentation crates | CJK char-split helper (~10 lines) covers v0.3.0 query patterns |

## Installation

```bash
npm install @radix-ui/react-context-menu@2.3.7
# That's it. No cargo changes. No config changes.
```

## Sources

| Source | What it verified | Confidence |
|--------|------------------|------------|
| Vendored `libsqlite3-sys-0.30.1/build.rs` (lines 90–140), `sqlite3.h` (3.46.0), vendored `sqlx-0.8.6/Cargo.toml`, `sqlx-sqlite-0.8.6/Cargo.toml`, `tauri-plugin-sql-2.4.0/Cargo.toml` — local cargo registry | FTS5 enabled in the exact shipped binary | HIGH |
| `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/migrations/0001_init.sql`, `package.json` — local repo | Existing integration points, migration pattern, Radix version family | HIGH |
| npm registry `@radix-ui/react-context-menu@latest` → 2.3.7 (live query 2026-08-14) | Current version | HIGH |
| SQLite FTS5 docs (unicode61/trigram tokenizers, external content tables, bm25) | Tokenizer behavior; consistent with verified 3.46.0 build | MEDIUM-HIGH — unicode61 CJK behavior is well-established; recommend a 5-minute `SELECT ... MATCH` smoke test at P1 kickoff |

---

*Stack research for: v0.3.0 — event log base, FTS5 memory retrieval, deliverable pipeline, agent UX*
*Replaces v0.2.0 stack research (date-fns/@dnd-kit — all shipped and validated)*
