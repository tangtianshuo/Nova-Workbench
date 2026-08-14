# Architecture Research

**Domain:** v0.3.0 integration of Agent Event Log + persistent confirmations + long-term memory (FTS5) + deliverable pipeline into the existing Nova architecture (React 19 frontend tool loop, Rust llm.rs, tauri-plugin-sql SQLite).
**Researched:** 2026-08-14
**Confidence:** HIGH on integration analysis (all six mandated source files + storage layer + ChatPanel + api.ts read in full); HIGH on FTS5 availability (verified against [libsqlite3-sys build.rs](https://github.com/rusqlite/rusqlite/blob/master/libsqlite3-sys/build.rs) — bundled build sets `-DSQLITE_ENABLE_FTS5` by default, and `tauri-plugin-sql` `features=["sqlite"]` uses sqlx's bundled SQLite).
**Supersedes:** prior ARCHITECTURE.md (v0.1 Tauri-native/GraphFlow research — GraphFlow is now formally rejected per PROJECT.md).

---

## Executive Summary

The v0.3.0 features integrate cleanly because the tool loop, tool registry, confirmations, and all domain stores already live on the **JS side**, and SQLite access already exists on the JS side via `tauri-plugin-sql` (`lazySqlite()` → `sqlite:nova.db`). The correct architecture is: **event log, confirmations, memory, and knowledge documents as new SQLite tables accessed from TypeScript, with schema DDL living in the existing Rust-side migration files** (`src-tauri/migrations/`, forward-only, auto-run by the plugin on connection). Rust `llm.rs` stays untouched — it is a stateless provider bridge and should not learn about events.

The single most important refactor is making `toolLoop.ts` write every step to the event log and **deriving the LLM `messages` array from the ChatSession projection instead of maintaining a parallel array** — the current code already has a latent divergence between the two histories (assistant messages are added to both, user/tool messages only to one or the other). ChatPanel does not need breaking changes: it re-renders from its own React state and only uses `ChatSession` for LLM history, so `ChatSession` can become an event-log projection behind its existing API.

FTS5 works in the existing `nova.db` with **zero build changes** (verified: bundled libsqlite3-sys enables FTS5). The first FTS5 `CREATE VIRTUAL TABLE` migration doubles as the runtime smoke test — if it ever failed, `initializeDatabase`'s startup path fails loudly.

---

## Recommended Architecture (target, v0.3.0)

### System Overview

```
┌────────────────────────── React 19 (webview) ──────────────────────────────┐
│                                                                             │
│  UI: ChatPanel / CmdK / MorningReport / ContextMenu / MemoryCandidatesPanel │
│        │                     │                                              │
│        ▼                     ▼                                              │
│  ┌─────────────┐   ┌──────────────────┐        ┌──────────────────────┐   │
│  │ Zustand     │   │ src/ai/toolLoop  │◄──────►│ src/ai/eventLog (N)  │   │
│  │ stores (6)  │   │  + registry      │        │ append / replay /    │   │
│  │ (kv_store)  │   │                  │        │ invariant checks     │   │
│  └─────────────┘   └───────┬──────────┘        └──────────┬───────────┘   │
│        │                   │                              │               │
│        │            ┌──────┴───────┐              ┌───────┴───────────┐   │
│        │            │ chatSession  │              │ confirmations (M) │   │
│        │            │ = projection │              │ DB-backed, hash,  │   │
│        │            │ over events  │              │ expiry, idempotent│   │
│        │            └──────┬───────┘              └───────┬───────────┘   │
│        │                   │                      ┌───────┴───────────┐   │
│        │                   │                      │ memory/retrieval  │   │
│        │                   │                      │ (N): candidates,  │   │
│        │                   │                      │ FTS5 hybrid query │   │
│        │                   │                      └───────┬───────────┘   │
├────────┼───────────────────┼──────────────────────────────┼───────────────┤
│        ▼                   ▼ (invoke 'chat', Channel)    ▼               │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ tauri-plugin-sql (sqlx pool)  →  sqlite:nova.db                  │    │
│  │   kv_store (existing) | agent_events (N) | confirmation_candidates│    │
│  │   memory_candidates (N) | memory_items (N) | knowledge_documents  │    │
│  │   knowledge_chunks (N) | knowledge_fts (N, FTS5) | artifacts (N)  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ Rust llm.rs / commands.rs — UNCHANGED (stateless provider bridge)│    │
│  │ + src-tauri/migrations/000{2..4}_*.sql (N: DDL only, no logic)   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
(N) = new component, (M) = modified component
```

### Component Responsibilities

| Component | Status | Responsibility | Communicates With |
|-----------|--------|----------------|-------------------|
| `src/ai/eventLog.ts` | **New** | `appendEvent(sessionId, type, payload, correlationId?)`, `replaySession(sessionId)`, `checkInvariants(sessionId)` (tool_call/result pairing, seq continuity) | toolLoop, chatSession, memory |
| `src/ai/chatSession.ts` | **Modified** | Same public API; `addMessage` also appends event; new `ChatSession.fromEvents(sessionId)` async factory; turn/token trim stays (= the Working Context projection) | eventLog, toolLoop, ChatPanel |
| `src/ai/toolLoop.ts` | **Modified** | Writes an event at every step (user_message, assistant_message, tool_call, tool_result, approval_*, context_injected, turn_ended); generates `correlationId` per LLM iteration; **derives LLM messages from session projection** (removes dual-array drift); offloads long tool results to artifacts | eventLog, retrieval, registry |
| `src/ai/confirmations.ts` | **Modified** | Same exported API; storage swapped from in-memory `Map` to `confirmation_candidates` table with `params_hash` + `expires_at`; atomic consume via conditional UPDATE | toolLoop, ChatPanel, new tools |
| `src/ai/retrieval.ts` | **New (P1)** | FTS5 hybrid query: keyword MATCH + product/project/date structured filters; returns source-annotated results | knowledge tables, toolLoop/context |
| `src/ai/memory.ts` | **New (P1)** | Memory candidate CRUD, confirm/reject/supersede, scope filtering | eventLog (provenance), retrieval |
| `src/ai/tools/knowledgeWrite.ts`, `knowledgeSearch.ts` | **Modified (P1)** | Write-through to `knowledge_documents`/chunks/FTS on confirm; search goes through retrieval.ts | retrieval, rndStore |
| `src/ai/context.ts` + `prompts.ts` | **Modified** | Priority-ordered context assembly (per AGENT_MEMORY_REFERENCE §6): business facts → pending confirmations → confirmed memories → retrieved knowledge → recent turns | retrieval, memory, stores |
| `src/stores/agentStore.ts` | **New** | UI-facing state: session list (lazy), pending confirmations, memory candidates queue (Zustand + persist via existing kv_store adapter) | ChatPanel, MorningReport, MemoryCandidatesPanel |
| `src/ai/tools/deliverable.ts` | **New (production line)** | `generateDeliverable` tool: returns a confirmation candidate (kind `deliverable`); on confirm writes rndStore deliverable slot + event | confirmations, rndStore |
| ChatPanel.tsx | **Modified (small)** | On open: restore last session via `ChatSession.fromEvents` + hydrate message list; render restored pending confirmations | chatSession, agentStore |
| `src-tauri/migrations/0002..0004_*.sql` | **New** | DDL only: agent_events, confirmation_candidates (0002); memory + knowledge + FTS5 (0003); artifacts/indexes (0004). No Rust logic. | auto-run by tauri-plugin-sql |
| `src/stores/storage/initializeDatabase.ts` | **Modified** | Bump `APP_SCHEMA_VERSION`; existing sanity-SELECT guard already surfaces migration failure |
| Rust `llm.rs` / `commands.rs` | **Unchanged** | Stateless LLM bridge. Event/memory logic never crosses IPC. | — |

---

## Key Design Decisions (answers to the research questions)

### 1. Where does the event log live? → **JS side, via existing tauri-plugin-sql; DDL in Rust migrations**

**Why not Rust side:** the tool loop, tool registry, Zod validation, confirmations, and every domain store it touches run in the JS runtime. A Rust-side event writer would double-hop every event over IPC (JS loop → IPC → Rust INSERT) and force serializing tool results (which reference live Zustand state) across the boundary twice. Event frequency is human-scale (per turn / per tool call), so sqlx-pool IPC overhead per INSERT is irrelevant on a desktop app.

**Why the schema still lives in `src-tauri/migrations/`:** that is where it already lives (`0001_init.sql`, registered in `lib.rs::sql_migrations()`, auto-run by the plugin on first connection). Keeping DDL there preserves the forward-only additive discipline and requires zero new Rust code. JS never runs DDL.

**Concrete table (0002):**

```sql
CREATE TABLE IF NOT EXISTS agent_events (
  event_id        TEXT PRIMARY KEY,            -- UUID v4 (crypto.randomUUID)
  session_id      TEXT NOT NULL,
  seq             INTEGER NOT NULL,
  event_type      TEXT NOT NULL,               -- vocabulary per AGENT_MEMORY_REFERENCE §3
  created_at      INTEGER NOT NULL,            -- Date.now()
  workspace_id    TEXT,
  product_id      TEXT,
  correlation_id  TEXT,                        -- per LLM iteration; links request+calls+results+approvals
  payload_json    TEXT NOT NULL,
  UNIQUE (session_id, seq)                     -- replay invariant enforced by constraint
);
CREATE INDEX IF NOT EXISTS idx_events_session ON agent_events (session_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON agent_events (correlation_id);

CREATE TABLE IF NOT EXISTS confirmation_candidates (
  token        TEXT PRIMARY KEY,               -- UUID v4 (existing confirmationToken)
  kind         TEXT NOT NULL,                  -- 'knowledge_write' | 'destructive' | 'memory' | 'deliverable'
  session_id   TEXT,
  payload_json TEXT NOT NULL,                  -- full candidate (draft / toolName+args / summary)
  params_hash  TEXT NOT NULL,                  -- SHA-256 hex of canonical JSON (see §3)
  status       TEXT NOT NULL DEFAULT 'pending',-- pending | confirmed | rejected | consumed
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER                         -- NULL = no expiry; default 24h at creation
);
```

**seq allocation — single-statement, race-free, no counter module:**

```sql
INSERT INTO agent_events (event_id, session_id, seq, ...)
VALUES ($1, $2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_events WHERE session_id = $2), ...)
```

One tool loop runs per session at a time; the `UNIQUE(session_id, seq)` constraint catches any residual race (second writer fails loudly). No in-memory counter to restore.

### 2. ChatSession as projection — without breaking ChatPanel

Read the actual coupling first: **ChatPanel re-renders from its own `useState` message list and only uses `sessionRef.current` as the LLM-history object passed into `runToolLoop`.** It never calls `getAllMessages()` for rendering. So the session object's internals are free to change as long as the API (`addMessage`, `getMessagesForLLM`, `getAllMessages`, `clear`, `estimateTokens`, `sessionId`, `tokenBudget`) survives.

**Migration path:**

1. Keep `ChatSession` class + API. `addMessage` becomes: update in-memory cache (unchanged) + `void appendEvent(...)` awaited internally via a small async queue (serialize appends so seq ordering matches call ordering — a module-level promise chain is enough).
2. Add `static async fromEvents(sessionId, tokenBudget?): Promise<ChatSession>` — replays events in seq order, rebuilds the message cache, then runs the invariant check: any `tool_call` without a matching `tool_result` (same `correlation_id`) gets a synthetic `tool_result` event appended with payload `{ ok: false, error: 'interrupted by restart' }` so the reconstructed LLM history stays provider-valid.
3. The existing `groupIntoTurns`/`trimToBudget` logic **is** the "Working Context projection" from AGENT_MEMORY_REFERENCE §6 — keep it verbatim. No rename needed this milestone.
4. ChatPanel diff: `useEffect` on first open → `const s = await ChatSession.fromEvents(lastSessionId)` → set `sessionRef.current`, hydrate `messages` state from `s.getAllMessages()` filtered to user/assistant, and surface any restored pending confirmation from the confirmation table. ~40 lines.
5. Session discovery: `SELECT session_id, MAX(seq) FROM agent_events GROUP BY session_id ORDER BY MAX(created_at) DESC` — restore only the most recent one (session manager UI is v0.4; YAGNI now).

**Latent bug the refactor fixes (call it out in the phase plan):** current `toolLoop.ts` maintains two divergent histories — it pushes assistant/tool messages to a local `messages` array *and* to the session, but the initial user message goes to both while the no-tool-call assistant message goes only to the session, and tool errors are appended to `messages` with retry hints that never enter the session. Post-refactor, the event log is the single write path and the per-iteration `messages` array is derived from `session.getMessagesForLLM()` + the current iteration's additions.

### 3. Confirmation candidates — idempotent persistence (param hash + expiry)

Replace the two in-memory `Map`s with the `confirmation_candidates` table, keeping every exported function signature identical (`createKnowledgeWriteCandidate`, `consumeKnowledgeWriteConfirmation`, `consumeDestructiveActionConfirmation`, etc.) so tools and ChatPanel don't change.

- **params_hash:** SHA-256 via Web Crypto (`crypto.subtle.digest('SHA-256', ...)`) over **canonical JSON** — `JSON.stringify` with sorted keys. This replaces both the 10-field `sameDraft()` comparison *and* fixes an existing latent bug: `consumeDestructiveActionConfirmation` compares `JSON.stringify(args)` strings, which silently fails when key order differs between the confirmation call and the consume call. Canonicalization kills that class of bug.
- **Idempotent consume — one conditional UPDATE, atomic in SQLite, replay-safe:**

```sql
UPDATE confirmation_candidates
SET status = 'consumed'
WHERE token = $1 AND status = 'confirmed' AND params_hash = $2
  AND (expires_at IS NULL OR expires_at > $3)
```

Row count 1 → proceed with the business write; 0 → throw the existing error classes. No read-modify-write window, and a restarted duplicate replay of the same confirmed tool call cannot double-write.

- **Expiry:** lazy — enforced in the WHERE clause above and in `getKnowledgeWriteCandidate`; plus a one-line `DELETE ... WHERE expires_at < now AND status='pending'` on app start. Default `expires_at = created_at + 24h`.
- **Dev/web fallback:** web mode has no SQLite (existing `sqliteStorage` branches to localStorage). Keep a thin in-memory fallback behind the same API when `!isTauri()` — mirrors `sqliteStorage.ts`'s established pattern and keeps `src/ai/__tests__/*` working.
- **Events:** `approval_requested` event on create, `approval_decided` (decision in payload) on confirm/reject — gives the audit trail AGENT_MEMORY_REFERENCE §10 asks for.

### 4. Memory retrieval injection into the tool loop

Two injection points, both on the JS side — **no Rust changes**:

1. **System-prompt projection (automatic, every turn):** extend `buildCoreContext()` → priority-ordered blocks per reference §6: (a) business facts — already there; (b) pending confirmations for this session (from confirmation table); (c) confirmed memories scoped to `workspace/product` (from memory tables); (d) top-k (k=3) FTS5 hits for the current `userMessage` + selected product filter, each with source metadata (`source_type, source_id, source_version, updated_at`); (e) recent turns — already handled by ChatSession trim. Emit one `context_injected` event per turn recording what was included (the audit requirement: "任一模型上下文片段都能定位到来源事件或来源文档版本").
2. **On-demand tool (model-driven):** extend the existing `knowledgeSearch` tool to call `retrieval.ts` (FTS5 MATCH + structured filters). This already exists as a registered tool — the change is the backend query, not a new tool surface.

**Retrieval query shape (P1, 0003 migration):**

```sql
-- knowledge_fts is a standalone FTS5 table (contentful, not external-content):
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title, content, tags,
  tokenize = 'unicode61 remove_diacritics 2'   -- CJK-safe-ish default; see Pitfalls
);
-- hybrid: FTS rank + structural filter via join on knowledge_chunks → knowledge_documents
SELECT d.*, c.content, bm25(knowledge_fts) AS rank
FROM knowledge_fts f
JOIN knowledge_chunks c ON c.id = f.rowid
JOIN knowledge_documents d ON d.id = c.document_id
WHERE knowledge_fts MATCH $query AND d.product_id = $product
ORDER BY rank LIMIT $k;
```

**Artifacts (long tool results):** `artifacts` table (`id, session_id, event_id, content, content_hash, created_at`). In `toolLoop.ts`, when a stringified tool result exceeds ~4 KB (current cap is a blind 2000-char slice — this *upgrades* fidelity), store full result as artifact, pass the model a summary + `artifact_id` reference. The event log keeps the full payload regardless (log = truth; projection truncates).

### 5. Build order

Dependencies run strictly downward:

```
P0 Event log + confirmations + session rebuild
   │  (everything below needs event_id provenance + persistent HITL)
   ▼
P1 Memory candidates + knowledge docs + FTS5 retrieval
   │  (candidates reference source_event_id; retrieval feeds context projection)
   ▼
Production line: generateDeliverable tool → HITL → rndStore slot
   │  (needs P0 confirmations only for the HITL part, but knowledge-doc
   │   versioning from P1 for the generated deliverable artifact)
   ▼
Agent UX: global entry + morning report + right-click actions
      (pure frontend; morning report reads P1 candidates + existing stores)
```

Recommended phase slicing (coarse granularity per constraint):

1. **Phase A (P0 core):** migrations 0002 + `eventLog.ts` + toolLoop instrumentation + messages-derived-from-session refactor + invariant checker. Confirmations still in-memory in this phase (isolate the riskiest refactor first).
2. **Phase B (P0 finish):** confirmation table + confirmations.ts swap + `ChatSession.fromEvents` + ChatPanel restore + restart recovery UAT (kill app mid-tool-loop, relaunch, verify replay + no duplicate writes — this is AGENT_MEMORY_REFERENCE §10's acceptance test).
3. **Phase C (P1):** migrations 0003 + memory candidates + knowledge documents/chunks/FTS5 + retrieval.ts + context/prompt projection + knowledgeWrite/knowledgeSearch upgrade.
4. **Phase D (production line):** `generateDeliverable` tool + deliverable confirmation kind + rndStore slot landing + document versioning.
5. **Phase E (UX + docs):** global entry with view context, morning report, right-click quick actions, ARCHITECTURE.md + ADR rewrite, v0.2.0 regression pass.

A and B can be validated independently; C depends on B's event schema; D depends on B (confirmations) and benefits from C; E is cheap and last.

---

## Data Flow (post-v0.3.0, one tool loop turn)

```
user input
  ↓
toolLoop: append user_message event ──► agent_events
  ↓
retrieval (P1): FTS5 query + memory scope filter
  ↓ append context_injected event
buildSystemPrompt(coreContext + memories + retrieved blocks w/ sources)
  ↓
invoke('chat') ── Channel ──► Rust llm.rs (unchanged) ──► tokens stream back
  ↓ toolCalls[]
for each call:
  append tool_call event (correlation_id = this iteration's UUID)
  executeTool →
    ├─ ConfirmationRequiredError → append approval_requested event
    │     + insert confirmation_candidates row → return to UI
    │       (user confirms later → conditional UPDATE → business write
    │        → append tool_result + approval_decided events)
    ├─ result ≤ 4 KB → append tool_result event → push to LLM messages
    └─ result > 4 KB → store artifact → append tool_result event (full)
           → push summary + artifact_id to LLM messages
  ↓ (loop ≤ 5 iterations)
append assistant_message + turn_ended events
  ↓
ChatPanel renders from its own state (unchanged);
session.getMessagesForLLM() derived from event-backed cache
```

**Restart recovery:** on app start → `initializeDatabase` (bumped schema version) → ChatPanel open → `ChatSession.fromEvents(lastSessionId)` → invariant check repairs dangling tool_calls → restored pending confirmations read from table → user can confirm/reject; consume is hash-guarded so replay cannot double-write.

---

## Anti-Patterns to Avoid

### 1. Moving the tool loop or event writing into Rust
**What people do:** "no sidecar / 最终目标全 Rust" is read as "put the agent runtime in Rust now."
**Why it's wrong:** every tool executes against live Zustand state in the webview. A Rust-side loop would IPC-marshall each tool call back to JS anyway, or duplicate domain logic in Rust. The constraint bans a *Node sidecar*, not JS-side logic.
**Do instead:** JS tool loop + JS event log over tauri-plugin-sql. Rust migration of the runtime is a post-v0.4 evaluation at the earliest.

### 2. Making knowledge_documents a second truth for rndStore content
**What people do:** write knowledge articles to both `rndStore.knowledgeBase` (kv_store blob) and `knowledge_documents`, with no link.
**Why it's wrong:** AGENT_MEMORY_REFERENCE §9 explicitly bans duplicating state; the two copies drift on manual edits.
**Do instead:** `knowledge_documents` rows carry `source_type='rnd_store', source_ref=<itemId>, content_hash`. rndStore stays the UI/edit truth this milestone; documents/chunks/FTS are the *derived retrieval index*, re-synced via the hash check on read. Full inversion (documents as truth) is v0.4. Mark with a `ponytail:`-style comment naming the ceiling.

### 3. Awaited event writes blocking the streaming path
**What people do:** `await appendEvent()` inline between token batches.
**Why it's wrong:** adds an IPC round-trip per step and couples stream latency to DB.
**Do instead:** append once per *logical step* (message complete, tool call, tool result), through a serialized per-session async queue (promise chain). Token streaming itself is untouched.

### 4. External-content FTS5 tables without triggers
**What people do:** `content=''` contentless FTS5 to "save space," then forget that deletes/updates require manual `fts5_delete` + reinsert.
**Why it's wrong:** stale index returns deleted documents — directly violates acceptance criterion "检索不会返回失效索引."
**Do instead:** plain contentful FTS5 table synced in the same code path that writes `knowledge_chunks` (one transaction, application-managed). Rebuild-from-chunks command (`INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')` is not available without external content — instead delete+reinsert by document_id) for corruption recovery.

### 5. Inventing a session/job scheduler for recovery
**What people do:** background resume daemons, retry queues.
**Why it's wrong:** single-user desktop app; the only crash window is mid-tool-loop, and the invariant repair in `fromEvents` already covers it.
**Do instead:** repair-on-replay. No scheduler.

---

## Integration Points

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| toolLoop ↔ eventLog | direct async fn calls, serialized queue | eventLog never imports toolLoop (no cycle) |
| eventLog ↔ tauri-plugin-sql | `lazySqlite()` singleton, `$1` sqlx placeholders | `db.select` for queries, `db.execute` returns affected-row count — the consume idempotency relies on it |
| confirmations ↔ tools | unchanged: `ConfirmationRequiredError` + `confirmationToken` arg | API-compatible swap; tools/knowledgeWrite etc. unchanged except deliverable additions |
| memory/retrieval ↔ context.ts | plain function calls at prompt-build time | `getState()` reads (established pattern, e.g. buildCoreContext) |
| agentStore ↔ ChatPanel/MorningReport | Zustand selectors | persists via existing `sqliteStorage` kv_store adapter — UI state only, never domain truth |
| migrations ↔ plugin | `include_str!` in `lib.rs::sql_migrations()` | forward-only additive; bump `meta.schema_version` + JS `APP_SCHEMA_VERSION` in lockstep |

### External services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| SQLite (bundled, FTS5 on) | existing `Database.load('sqlite:nova.db')` | FTS5 verified compiled in; first `CREATE VIRTUAL TABLE` is the smoke test — startup fails loudly if absent |
| LLM providers | existing `chat` command + Channel | zero changes; `correlation_id` lives JS-side only |

---

## Pitfalls (phase-specific warnings)

| Phase topic | Likely pitfall | Mitigation |
|-------------|----------------|------------|
| FTS5 Chinese text | `unicode61` tokenizer splits CJK poorly (no word segmentation) | Acceptable for v1 keyword search: CJK ends up char/bigram-ish indexed; pair with LIKE fallback merge, or add a trigram tokenizer (`tokenize='trigram'`) if UAT recall is bad. Decision point in Phase C UAT |
| kv_store ↔ new tables | new tables live beside JSON blobs; stores stay blobs | do NOT migrate business stores to relational tables this milestone (explicit non-goal) |
| async append ordering | concurrent `addMessage` calls could race seq | serialize via per-session promise chain; UNIQUE(session_id,seq) as backstop |
| web/dev mode | no SQLite in web fallback | in-memory confirmation/event fallback behind same API (mirrors sqliteStorage branch); tests keep working |
| ChatPanel hydration | restored session may contain huge history | hydrate UI from last N messages; projection trim already bounds LLM cost |
| deliverable slot write | rndStore deliverable slots keyed by productId + slot type | reuse `buildInitialDeliverables` catalog mapping; confirm kind='deliverable' hash covers slot + content |

---

## Sources

- Codebase (read in full this session): `src/ai/chatSession.ts`, `src/ai/toolLoop.ts`, `src/ai/registry.ts`, `src/ai/confirmations.ts`, `src/ai/context.ts`, `src/lib/api.ts`, `src/components/ChatPanel.tsx`, `src/ai/tools/knowledgeWrite.ts`, `src/stores/storage/{lazySqlite,sqliteStorage,initializeDatabase}.ts`, `src-tauri/Cargo.toml`, `src-tauri/migrations/0001_init.sql`, `src-tauri/src/lib.rs` (grep)
- `docs/AGENT_MEMORY_REFERENCE.md` v1.0 (2026-08-14) — authoritative design reference
- `.planning/PROJECT.md` — v0.3.0 milestone scope, constraints, out-of-scope list
- [libsqlite3-sys build.rs](https://github.com/rusqlite/rusqlite/blob/master/libsqlite3-sys/build.rs) — bundled build flag list includes `-DSQLITE_ENABLE_FTS5` (HIGH confidence)
- [tauri-plugin-sql docs](https://v2.tauri.app/plugin/sql/) — sqlx-backed, migrations auto-run per connection (HIGH confidence)
- [SQLite FTS5 docs](https://sqlite.org/fts5.html) — tokenizer options, bm25 ranking

---
*Architecture research for: Nova v0.3.0 agent event log / memory / production line integration*
*Researched: 2026-08-14*
