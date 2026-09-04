# Phase 18: Session 数据模型与底座 - Research

**Researched:** 2026-08-18
**Domain:** SQLite migration (tauri-plugin-sql/sqlx) + event-store data model extension in existing codebase
**Confidence:** HIGH

## Summary

This phase is a codebase-grounded extension, not an ecosystem pick. Every seam was read directly: migrations run **Rust-side** via `tauri_plugin_sql::Builder::add_migrations` (`src-tauri/src/lib.rs:19-56`, `include_str!` per file) — NOT via JS `db.execute`. The plugin's `migrate()` calls `sqlx::migrate::Migrator::run(pool)`, which wraps **each migration file in its own transaction** and records applied versions + checksums in `_sqlx_migrations` (verified against plugin v2 source, `wrapper.rs`). This dissolves the ROADMAP's atomicity worry: a single `0007_sessions.sql` containing table creation + backfill INSERT...SELECT is atomic per-file. The "无跨 execute 事务" concern only applies to JS-side `db.execute` calls — so the rule is: **all schema + backfill changes live entirely inside 0007 SQL; no JS-side backfill**.

Two discoveries reshape the work: (1) `agent_events.workspace_id` **column already exists** (nullable, migration 0002) — SESS-06 is stamp-at-write + backfill-NULL-rows, not ALTER TABLE. The reason historical events lack workspace_id is `src/ai/toolLoop.ts:39-43`, which registers the scope provider with `workspaceId: null` (comment: "deferred"). (2) A perfect test precedent exists: `src/ai/__tests__/sqlSchemaCheckConstraints.test.ts` already executes **real migration .sql files against `node:sqlite` DatabaseSync** (Node 24.14 installed). The fixture-DB upgrade test is that pattern extended: run 0001+0002(+0003..0006), insert v0.3.0-shaped fixture rows, run 0007, run 0007 again, assert idempotent no-duplication backfill.

Backfill design: sessions rows derive from `agent_events GROUP BY session_id` (the exact derivation `listSessions()` already does — one session per distinct session_id). Historical `workspace_id` is NULL everywhere, but the persisted active workspace is readable **inside the same DB**: `kv_store` key `'nova-workspace'` holds the zustand persist blob `{state: {activeWorkspaceId}}` (workspaceStore.ts:200-205), so SQLite `json_extract()` can backfill without JS. Title backfills as NULL (app layer falls back — TITLE-01's truncation fallback, Phase 21). `parent_session_id`/`fork_cut_seq` are NULL/NULL — Phase 20 concerns only.

**Primary recommendation:** One `0007_sessions.sql` (CREATE TABLE IF NOT EXISTS sessions + INSERT OR IGNORE backfill via GROUP BY + json_extract from kv_store + workspace_id backfill UPDATE on agent_events + schema_version bump to 7 + `APP_SCHEMA_VERSION = 7` in initializeDatabase.ts), a fixture-DB node:sqlite upgrade test modeled on sqlSchemaCheckConstraints.test.ts, a thin `sessionRepo.ts` mirroring eventStore's dual memory/sqlite pattern, and fixing the toolLoop scope provider to stamp real `activeWorkspaceId` plus `sessionId` on confirmation candidates via `getActiveAgentScope()`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | sessions 元数据表落地(workspace_id/title/parent_session_id/fork_cut_seq/created_at/last_active_at),migration 0007 含历史会话幂等回填,fixture DB 升级测试 | sqlx per-file transaction (verified plugin source); INSERT OR IGNORE + GROUP BY backfill pattern; node:sqlite fixture test precedent (sqlSchemaCheckConstraints.test.ts) |
| SESS-06 | agent_events 事件 scope 记录 workspaceId 并回填历史 | workspace_id column exists (0002); fix toolLoop.ts:39 provider to read workspaceStore.activeWorkspaceId; backfill historical NULLs via UPDATE with json_extract on kv_store |
</phase_requirements>

## Standard Stack

Zero new dependencies (confirmed against package.json + Cargo.toml).

### Core
| Item | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tauri-plugin-sql (existing) | 2.x, Rust-side migrations | 0007 migration | Already wired; sqlx Migrator gives per-file transactions + `_sqlx_migrations` versioning |
| node:sqlite DatabaseSync (existing, tests only) | Node 24.14 builtin | Fixture-DB upgrade test | Exact precedent in sqlSchemaCheckConstraints.test.ts; runs real .sql files |
| node:test (existing) | tsx --test | Test runner | 161 existing tests use it; `npm test` script already globs `src/ai/__tests__/*.test.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQL-only backfill inside 0007 | JS one-shot in initializeDatabase (knowledge_seed_v15 pattern) | JS version can't be transactional with the DDL and runs on every boot-check; SQL version is atomic + done once. Use JS pattern only if backfill needs logic SQL can't express — it doesn't (json_extract covers it) |

**Installation:** none.

## Architecture Patterns

### Pattern 1: Migration file (extend the existing convention)
Migrations 0002-0006 establish: header comment with phase/milestone, forward-only additive, `IF NOT EXISTS` everywhere, idempotent `INSERT OR IGNORE INTO meta` + `UPDATE meta` version bump pair, and the version duplicated in `initializeDatabase.ts` as `APP_SCHEMA_VERSION` (currently 6 at `src/stores/storage/initializeDatabase.ts:6`). 0006 also demonstrates the table-rebuild pattern (not needed for 0007 — sessions is new; agent_events gets no DDL change).

0007 must additionally register in `src-tauri/src/lib.rs` `sql_migrations()` (`include_str!`, version 7, `MigrationKind::Up`).

### Pattern 2: sessions backfill derivation
One session = one distinct `agent_events.session_id` (this is exactly what `SqliteEventStore.listSessions()` groups by). Backfill:

```sql
-- sessions skeleton follows 0002 column style; verify final names against SESS-01 spec
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  workspace_id TEXT,
  title TEXT,
  title_source TEXT,           -- Phase 21 concern; column now, value NULL
  parent_session_id TEXT,
  fork_cut_seq INTEGER,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions (workspace_id, last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_workspace ON agent_events (workspace_id, created_at);

-- Idempotent: PK dedupes; WHERE NOT EXISTS guards against re-derivation overwriting titles later
INSERT OR IGNORE INTO sessions (session_id, workspace_id, created_at, last_active_at)
SELECT e.session_id,
       (SELECT json_extract(v.value, '$.state.activeWorkspaceId')
          FROM kv_store v WHERE v.key = 'nova-workspace'),
       MIN(e.created_at),
       MAX(e.created_at)
FROM agent_events e
GROUP BY e.session_id;

-- SESS-06 backfill: stamp historical events with the persisted active workspace
UPDATE agent_events
SET workspace_id = (SELECT json_extract(v.value, '$.state.activeWorkspaceId')
                    FROM kv_store v WHERE v.key = 'nova-workspace')
WHERE workspace_id IS NULL;

INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '7');
UPDATE meta SET value = '7' WHERE key = 'schema_version';
```

Caveats verified: kv_store schema is `kv_store (key, value)` with value = JSON string (initializeDatabase.ts reads it with `SELECT value FROM kv_store WHERE key = $1` then JSON.parse). SQLite `json_extract` is available in sqlx's bundled SQLite (JSON1 is compiled in by default since SQLite 3.38). If kv_store is empty/absent the subquery yields NULL → workspace_id stays NULL → app layer treats NULL as "visible in all workspaces" (safe, lossless; document this in sessionRepo).

### Pattern 3: sessionRepo.ts (new, mirrors eventStore.ts)
`src/ai/sessionRepo.ts` — dual `MemorySessionRepo` / `SqliteSessionRepo` behind `getSessionRepo()` with the exact `isTauri()` singleton pattern of `src/ai/events/eventStore.ts:258-274`. Keep it thin (~80 LOC): `upsertSessionMeta`, `listSessionsByWorkspace(workspaceId)`, `updateTitle(sessionId, title)`. Session creation is upsert-on-first-event or explicit create — prefer explicit `upsertSessionMeta` call at turn start (Phase 19 wires it) so the repo never re-derives from events.

### Pattern 4: write-time stamping fixes (the actual SESS-06 + SESS-05 data-layer gap)
- **workspaceId on events:** `src/ai/toolLoop.ts:39-43` — change provider to `workspaceId: useWorkspaceStore.getState().activeWorkspaceId`. Provider pattern already resolves per-append; no other event write site exists (all appends flow through eventStore.append → resolveScope).
- **sessionId on confirmation candidates:** `src/ai/confirmations.ts` — `createKnowledgeWriteCandidate` and `createDestructiveActionCandidate` both hardcode `sessionId: null` (lines ~152, ~217). `getActiveAgentScope()` (`src/ai/agentScope.ts`, set by toolLoop each turn) already carries `sessionId`. Plumb scope in: callers in tools pass `getActiveAgentScope()?.sessionId ?? null`, or the create functions read the ambient scope directly. Direct read inside confirmations.ts is the smaller diff and covers all callers at once (root-cause fix).

### Anti-Patterns to Avoid
- **Never edit an already-shipped migration file.** sqlx stores a checksum per version in `_sqlx_migrations` and errors on mismatch (edited 0007 after release = upgrade failure for existing installs). Fix-forward = new migration number.
- **No JS-side backfill via db.execute** — it is not transactional with DDL and re-runs risk duplication. Everything lives in 0007.
- **Don't re-derive sessions rows wholesale on later boots** — INSERT OR IGNORE + never UPDATE existing title/workspace rows from the GROUP BY path (guard with WHERE NOT EXISTS if statements grow beyond INSERT OR IGNORE).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration versioning/transactions | JS migration runner | tauri-plugin-sql Rust-side `add_migrations` | sqlx Migrator already gives transactions, version tracking, checksums |
| Fixture SQLite in tests | npm sqlite lib (better-sqlite3/sql.js) | `node:sqlite` DatabaseSync | Builtin in Node 24, already proven in sqlSchemaCheckConstraints.test.ts; zero install |
| Session list derivation | New sessions-from-events projection queries | sessions table (this phase's deliverable) | listSessions() GROUP BY is the migration-time source only; runtime reads the table |
| Transactionality for backfill | BEGIN/COMMIT in JS | Single 0007 file | sqlx wraps the whole file in one transaction |

## Common Pitfalls

### Pitfall 1: "migration ate my history" (P-A from SUMMARY.md)
**What goes wrong:** 0007 backfill misses legacy sessions or wipes events → upgrade destroys history.
**Why:** Backfill derivation diverges from how sessions actually exist (distinct session_id in agent_events).
**How to avoid:** Fixture-DB test (Pattern below) builds a v0.3.0 DB, runs 0007, asserts: every fixture session_id present in sessions, event row count + content byte-identical, agent_events untouched except workspace_id. Run 0007 twice → identical final state.
**Warning signs:** sessions count != listSessions() count on upgraded DB.

### Pitfall 2: Non-atomic multi-statement assumptions
**What goes wrong:** Team splits 0007 into JS execute() calls; crash mid-way leaves schema_version bumped but backfill partial.
**Why:** JS `db.execute` is one implicit transaction per call.
**How to avoid:** All DDL + backfill in one .sql file; sqlx applies it atomically (verified: plugin `migrate()` → `Migrator::run` → per-migration begin/commit).
**Warning signs:** any 0007 logic appearing in TypeScript.

### Pitfall 3: sqlx checksum mismatch on edited migration
**What goes wrong:** Editing 0007 after any install ran it → `VersionMismatch`/checksum error at startup → app refuses to start.
**How to avoid:** Treat migrations as immutable once committed; fixture test locks behavior before release.

### Pitfall 4: DDL drift between memory and SQLite paths (GAP-16-01 recurrence)
**What goes wrong:** sessionRepo memory impl and SQL schema drift; Node tests pass, real SQLite fails.
**How to avoid:** Fixture test executes the real 0007 SQL (not a re-typed schema); keep SessionRepo row mapping column-complete.

### Pitfall 5: workspace_id backfill when kv_store blob shape differs
**What goes wrong:** zustand migrate/version field changes blob shape; json_extract path wrong → NULL workspace everywhere.
**How to avoid:** Test fixture includes a realistic kv_store 'nova-workspace' row (persist format `{state:{...},version:N}` — confirmed at workspaceStore.ts:200-208 with `partialize` including `activeWorkspaceId` at line 205). NULL result is acceptable-by-design (visible everywhere), so a wrong path degrades gracefully, not destructively.

### Pitfall 6: confirmation dedup now keyed differently
**What goes wrong:** Adding sessionId into `computeParamsHash` inputs breaks dedup of pre-existing pending candidates after upgrade.
**How to avoid:** Keep sessionId OUT of paramsHash (it rides the row's session_id column, like deliverable eventId rides params but is hash-excluded — see confirmations.ts:321-323 comment).

## Code Examples

### Fixture-DB upgrade test (extend this exact pattern)
```typescript
// src/ai/__tests__/phase18MigrationUpgrade.test.ts
// Source: adapted from src/ai/__tests__/sqlSchemaCheckConstraints.test.ts (proven pattern)
import { DatabaseSync } from 'node:sqlite';
// ... same fs/path setup to migrationsDir

function buildV030Db(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_agent_events.sql', '0003_confirmation_candidates.sql',
                   '0004_memories_knowledge_fts.sql', '0005_deliverable_source_event.sql',
                   '0006_confirmation_kind_deliverable.sql']) {
    db.exec(readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  // fixture: kv_store 'nova-workspace' blob, N sessions x M events with workspace_id NULL,
  // one pending confirmation candidate with session_id NULL
  return db;
}

test('0007 backfills sessions idempotently, preserves all events', () => {
  const db = buildV030Db();
  db.exec(readFileSync(path.join(migrationsDir, '0007_sessions.sql'), 'utf8'));
  const afterFirst = snapshot(db); // sessions rows, event count, event checksums
  db.exec(readFileSync(path.join(migrationsDir, '0007_sessions.sql'), 'utf8')); // idempotency
  assert.deepEqual(snapshot(db), afterFirst);
  // assert every fixture session_id has a sessions row; events count unchanged;
  // historical events now carry kv_store activeWorkspaceId; candidate rows untouched
});
```

Note on double-exec semantics: sqlx won't re-run 0007 in production (`_sqlx_migrations` version gate) — the double-run in the test is belt-and-braces for the OR IGNORE/IF NOT EXISTS idempotency requirement in SESS-01, and protects against partial-checkout/dev DB restore scenarios.

### Scope provider fix
```typescript
// src/ai/toolLoop.ts:39 — SESS-06 write-time stamping
setEventScopeProvider(() => ({
  workspaceId: useWorkspaceStore.getState().activeWorkspaceId,
  productId: useUIStore.getState().selectedProductId,
  projectId: null,
}));
```

## State of the Art

Not applicable (no ecosystem movement). One verified current fact: tauri-plugin-sql v2 migration execution confirmed from plugin source (`wrapper.rs`): `migrate()` delegates to `sqlx::migrate::Migrator::run(pool)`.

## Open Questions

1. **sessions row creation timing (Phase 19 boundary)**
   - What we know: 0007 backfills historical; new sessions need a row at creation or first event.
   - What's unclear: exact wiring point (chatConsoleStore submit vs sessionRepo explicit create) — Phase 19 runtime decides.
   - Recommendation: Phase 18 ships `upsertSessionMeta()` + a call at toolLoop turn start so every new session gets a row even if Phase 19 rewires it.

2. **agent_artifacts workspace scoping**
   - What we know: agent_artifacts has session_id but no workspace_id; accessed only via session-scoped reads today.
   - Recommendation: leave alone (YAGNI) — artifacts are fetched by artifactId within a session, never listed by workspace.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests (node:sqlite) | ✓ | 24.14.0 | — |
| Rust toolchain + tauri-plugin-sql | migration 0007 | ✓ | v2 (Cargo.toml) | — |
| npm test runner (tsx --test) | fixture test | ✓ | existing script | — |

**Missing dependencies with no fallback:** none.

## Sources

### Primary (HIGH confidence)
- Direct reads: `src-tauri/src/lib.rs`, `src-tauri/migrations/0001-0006`, `src/stores/storage/initializeDatabase.ts`, `src/stores/storage/lazySqlite.ts`, `src/ai/events/eventStore.ts`, `src/ai/confirmations.ts`, `src/ai/agentScope.ts`, `src/ai/toolLoop.ts` (scope provider), `src/stores/workspaceStore.ts`, `src/stores/chatConsoleStore.ts`, `src/ai/__tests__/sqlSchemaCheckConstraints.test.ts`
- tauri-plugin-sql v2 source (`wrapper.rs` via raw.githubusercontent.com) — `migrate()` → `sqlx::migrate::Migrator::run`, JS `execute` binds sqlx::query single statements

### Secondary (MEDIUM confidence)
- sqlx Migrator per-migration transaction semantics — training knowledge + plugin delegation path; the plugin side is verified, the begin/commit detail inside sqlx Migrator is standard documented behavior. Practically irrelevant even if wrong: idempotent SQL guards cover the failure mode.
- SQLite JSON1 availability in sqlx bundled SQLite — default-on since 3.38 (2022), near-certain; fixture test will verify in CI on day one.

## Metadata

**Confidence breakdown:**
- Migration atomicity: HIGH — plugin source read directly
- Backfill rules: HIGH — kv_store shape, persist key, workspace_id column all read from code
- Test approach: HIGH — exact in-repo precedent (sqlSchemaCheckConstraints.test.ts)
- json_extract availability: MEDIUM — verified day-one by the fixture test itself

**Research date:** 2026-08-18
**Valid until:** 2026-09-17 (stable codebase, no external fast-moving deps)
