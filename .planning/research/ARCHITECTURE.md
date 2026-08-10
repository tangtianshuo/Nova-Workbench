# Architecture Research

**Domain:** Tauri-native migration of an existing React+Express PM desktop app (in-memory stores, 5 Gemini endpoints, minimal Rust shell) to a Tauri-native + SQLite + GraphFlow-ready architecture.
**Researched:** 2026-08-08
**Confidence:** HIGH (verified against official Tauri v2 docs, docs.rs graph-flow 0.2.x, and the rs-graph-llm repo); MEDIUM on the GraphFlow-in-Tauri embedding pattern (no production reference found — every GraphFlow example is an HTTP/Axum service).

## Executive Summary

The existing app has three independent migration axes that **must be sequenced, not bundled**, because each has a different risk profile and unblocks different downstream work:

1. **Persistence** — lowest risk, highest immediate user value (refresh no longer loses data). Land first.
2. **Tauri IPC commands replacing Express AI endpoints** — medium risk, addresses the bundled-API-key and `0.0.0.0` security debt. Land second.
3. **GraphFlow + Rig PoC in Rust** — highest risk (new crate, novel embedding pattern, no reference deployment). Land last, behind a feature flag.

**Critical correction to design docs:** `docs/ARCHITECTURE.md` and `docs/PIPELINE_DESIGN.md` claim GraphFlow ships a `SqliteSaver`. **It does not.** The current `graph-flow` crate (0.2.x) ships `InMemorySessionStorage` and `PostgresSessionStorage` only. The design docs also show an `interrupt!` macro — that macro does not exist in graph-flow. HITL is done via `TaskResult { next_action: NextAction::WaitForInput }` returned from a task, surfaced to the caller as `ExecutionStatus::WaitingForInput`, and resumed by the driver loop calling `flow_runner.run(session_id)` again after the human responds. This must be reflected in any PoC phase scope — a SQLite-backed session store has to be written in-house (impl `SessionStorage` trait) or GraphFlow's session state must be serialized by our own code.

## Standard Architecture

### System Overview (target)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + Zustand 5)                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ views/*     │  │ stores/*    │  │ lib/tauri.ts│                 │
│  │ (existing)  │  │ (existing + │  │ (new IPC    │                 │
│  │             │  │  persist)   │  │  adapter)   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
├─────────┴────────────────┴────────────────┴─────────────────────────┤
│  Tauri IPC Layer                                                     │
│  invoke(cmd, args)         ← request/response (typed, JSON)          │
│  Channel<T>                ← streaming (LLM tokens, progress)        │
│  emit/listen(event, payload) ← one-to-many broadcast                 │
├──────────────────────────────────────────────────────────────────────┤
│  Rust Backend (src-tauri/src/)                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ commands │  │ ai       │  │ pipeline │  │ secrets  │            │
│  │ (IPC     │  │ (Rig     │  │ (GraphFlow│ │ (keyring │            │
│  │  surface)│  │  client) │  │  PoC)    │  │  plugin) │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │             │             │             │                   │
│  ┌────┴─────────────┴─────────────┴─────────────┴────┐             │
│  │  persistence (sqlx + rusqlite via tauri-plugin-sql)│             │
│  └────────────────────────────────────────────────────┘             │
├──────────────────────────────────────────────────────────────────────┤
│  Native OS                                                           │
│  SQLite file        OS keychain/credential manager                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Lives in | Status |
|-----------|----------------|----------|--------|
| React views | UI; call stores + `lib/tauri.ts` adapter; never call `invoke` directly outside the adapter | `src/views/`, `src/components/` | exists |
| Zustand stores (with `persist`) | Domain state; cache of last-seen backend state; optimistic UI updates | `src/stores/` | needs `persist` middleware |
| `lib/tauri.ts` adapter | Single chokepoint for `invoke()` + `Channel<>` + `listen()`. Abstracts `isTauri()` so views stay platform-agnostic. Falls back to `fetch('/api/...')` when not in Tauri (web/dev mode) | `src/lib/tauri.ts` | **new** |
| Tauri command layer | Typed IPC entry points; argument validation; error → serializable type; no business logic — delegates to `ai/`, `pipeline/`, `persistence/` | `src-tauri/src/commands/` | **new** |
| Rig AI client | LLM calls (Gemini first; multi-provider later); streaming via async iterator; structured-output parsing with retry | `src-tauri/src/ai/` | **new** |
| GraphFlow pipeline | Stateful workflow execution; HITL via `WaitForInput`; serializes sessions via custom `SessionStorage` impl | `src-tauri/src/pipeline/` | **new, PoC only in v1** |
| Secrets (keyring) | Read/write API keys from OS credential store | `src-tauri/src/secrets.rs` + `tauri-plugin-keyring` | **new** |
| Persistence | SQLite schema + migrations; Zustand ↔ SQLite sync strategy | `src-tauri/src/db/` + `@tauri-apps/plugin-sql` from frontend | **new** |
| Express server (dev fallback only) | Vite dev middleware + mock AI endpoints when not in Tauri. **No longer ships in production bundle.** | `server.ts` | exists, scope shrinks |

## Recommended Project Structure

### Rust (`src-tauri/src/`) — growing from 2 files to a real backend

```
src-tauri/src/
├── main.rs                 # entry — calls nova_lib::run() (unchanged)
├── lib.rs                  # Tauri builder: plugin registration, invoke_handler!, managed state
├── error.rs                # AppError enum + serde::Serialize impl (single IPC error type)
├── state.rs                # AppState struct (DB pool, Rig client, pipeline registry) — passed via tauri::State
├── commands/
│   ├── mod.rs              # re-exports submodules
│   ├── ai.rs               # generate_project, generate_deliverable, polish_article, summarize_workspace, chat_stream
│   ├── pipeline.rs         # start_pipeline, resume_pipeline, get_session, list_sessions
│   ├── workspace.rs        # list_workspace_files (replaces mock endpoint)
│   └── secrets.rs          # get_api_key, set_api_key, has_api_key
├── ai/
│   ├── mod.rs
│   ├── client.rs           # Rig client construction (Gemini provider first)
│   ├── streaming.rs        # wrap Rig stream → tauri::ipc::Channel<StreamChunk>
│   └── prompts.rs          # system prompts (separate from user content — fixes prompt-injection concern)
├── pipeline/
│   ├── mod.rs              # build_pm_pipeline() — graph definition (PoC: 2-3 nodes, not the full 10)
│   ├── tasks/              # one file per task (analyze_requirements, generate_prd, ...)
│   ├── session_store.rs    # SqliteSessionStorage: impl graph_flow::SessionStorage over our DB pool
│   └── types.rs            # PmPipelineState (replace the design doc's struct with what graph-flow actually needs)
├── db/
│   ├── mod.rs              # DB pool init (sqlx::SqlitePool or rusqlite via tauri-plugin-sql)
│   ├── migrations/         # numbered .sql files, applied on startup
│   └── repos/              # one repo per domain (products, tasks, deliverables, ...)
└── secrets.rs              # thin wrapper over tauri-plugin-keyring (one fn per secret)
```

**Rationale:** This mirrors how Tauri v2 docs recommend structuring non-trivial backends — commands are thin, logic lives in domain modules. One module per concern = one phase's work per folder.

### Frontend (`src/`) — minimal additions

```
src/
├── lib/
│   ├── tauri.ts            # NEW: invokeAdapter(cmd, args), streamViaChannel(cmd, args, onChunk), isTauri()
│   ├── api.ts              # EXISTING per CLAUDE.md (re-export layer; tauri.ts delegates to fetch when !isTauri)
│   └── utils.ts            # existing
└── stores/                 # add `persist` middleware to each (one PR per store)
```

## Architectural Patterns

### Pattern 1: Adapter-First IPC (single chokepoint)

**What:** Every frontend → backend call goes through `src/lib/tauri.ts`. The adapter inspects `isTauri()` and routes to `invoke()` or falls back to `fetch()`.

**When to use:** Always — this is the load-bearing abstraction for dev/prod parity.

**Trade-offs:** Slight indirection cost (one extra function call). Pays off because the rest of the frontend stays platform-agnostic and the Express server stays useful as a dev/mock backend without code duplication.

**Example:**
```typescript
// src/lib/tauri.ts
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';

export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

// one-shot request
export async function rpc<T>(cmd: string, args?: object): Promise<T> {
  if (isTauri()) return invoke<T>(cmd, args);
  // dev fallback — Express still serves these endpoints with mock data
  const res = await fetch(`/api/${cmd.replace(/_/g, '-')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// streaming
export async function stream<T>(
  cmd: string,
  args: object,
  onChunk: (c: T) => void,
): Promise<void> {
  if (!isTauri()) {
    // dev fallback: no streaming in mock mode, just one big response
    const data = await rpc<any>(cmd, args);
    onChunk(data);
    return;
  }
  const channel = new Channel<T>();
  channel.onmessage = onChunk;
  await invoke(cmd, { ...args, channel });  // Rust receives tauri::ipc::Channel<T>
}
```

### Pattern 2: Channel<T> for streaming, not emit/listen

**What:** Tauri's official docs name `tauri::ipc::Channel<T>` as the recommended primitive for streaming data (LLM tokens, progress events) from Rust → frontend. It is ordered, type-safe, scoped to one invocation, and avoids the cleanup pitfalls of `listen()` (which is global, must be `unlisten()`'d, and can deliver out of order with async handlers).

**When to use:** Whenever a single invoke produces multiple chunks — LLM streaming, pipeline progress.

**Trade-offs:** Channel is scoped to one invoke — if you need cross-window broadcast (rare here), use `emit`/`listen` instead.

**Rust side:**
```rust
#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum StreamChunk {
    Delta { text: String },
    Done,
    Error { message: String },
}

#[tauri::command]
async fn chat_stream(
    prompt: String,
    channel: tauri::ipc::Channel<StreamChunk>,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    let mut stream = state.ai_client.stream(prompt).await?;
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(text) => channel.send(StreamChunk::Delta { text })?,
            Err(e) => { channel.send(StreamChunk::Error { message: e.to_string() })?; break; }
        }
    }
    channel.send(StreamChunk::Done)?;
    Ok(())
}
```

### Pattern 3: Custom `SessionStorage` for GraphFlow (not a SqliteSaver)

**What:** GraphFlow does not ship a SQLite session store. To persist pipeline sessions across app restarts, implement the `SessionStorage` trait ourselves over our existing SQLite pool.

**When to use:** Required for any production-viable GraphFlow integration. **Not needed for the PoC** — `InMemorySessionStorage` is fine for proving the embedding works.

**Trade-offs:** One trait to implement (~3 methods: `save`, `get`, `list_sessions` or similar). The serialized `Session` includes a `Context` with chat history — store as JSON blob in a `pipeline_sessions` table, don't try to normalize it.

**Build-order implication:** This is why the PoC must come *after* persistence — we need the SQLite pool to exist first.

### Pattern 4: Single typed error enum for IPC

**What:** All commands return `Result<T, AppError>` where `AppError` is a `thiserror::Error` enum with manual `serde::Serialize` that emits `{ kind: "io" | "ai" | "auth" | ..., message: string }`. Mirrors the Tauri docs' canonical pattern.

**Trade-offs:** Slight boilerplate. Avoids the leaky `map_err(|e| e.to_string())` pattern that loses error typing at the IPC boundary.

```rust
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("io: {0}")] Io(#[from] std::io::Error),
    #[error("ai: {0}")] Ai(String),
    #[error("missing API key")] NoApiKey,
    #[error("db: {0}")] Db(#[from] sqlx::Error),
}
impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
```

## Data Flow

### Persistence — write path (Zustand → SQLite)

```
React event (button click)
  → store action (set/update)
  → store holds new value in memory (synchronous, instant UI)
  → store's `persist` middleware serializes the changed slice
  → if isTauri(): persisted via Tauri (custom storage adapter writes to SQLite via @tauri-apps/plugin-sql)
  → if !isTauri(): persisted to localStorage (dev fallback)
```

**Boundary rule:** Zustand remains the **read path** for the UI (no async hydration tax on every render). SQLite is the **write-behind** store. On app startup, stores hydrate from SQLite once, then operate in-memory.

### Persistence — read path (startup hydration)

```
App boot
  → for each store: invoke('load_store_state', { store: 'products' })
  → Rust reads JSON blob from sqlite.session_state table
  → returns to frontend
  → store.setState(parsed, replace: true)
  → stores mark themselves hydrated; UI renders
```

**Trade-off noted:** Zustand `persist` middleware supports async storage but the store initializes synchronously. The cleanest path is the "JSON blob per store" pattern — minimal schema (`store_name TEXT PK, state_json TEXT, version INT`), atomic writes, no migration pain per store. Reserve relational tables for GraphFlow session state and (later) LanceDB vector index. Premature normalization of Zustand shape into SQLite tables would be a multi-phase yak-shave with no payoff in v1.

### AI streaming flow

```
User clicks "Generate deliverable"
  → store calls stream<StreamChunk>('generate_deliverable', { productId, code }, onChunk)
  → adapter creates Channel<StreamChunk>, registers onmessage, invokes command
  → Rust command reads API key via secrets.rs, builds Rig client, calls provider.stream()
  → for each token chunk: channel.send(StreamChunk::Delta { text })
  → store's onChunk appends to deliverable.content
  → component re-renders via Zustand subscription
  → on StreamChunk::Done: store marks status 'done', persist middleware writes final content to SQLite
```

### GraphFlow HITL flow

```
User starts pipeline
  → invoke('start_pipeline', { productId, rawRequirements })
  → Rust: creates Session, sets context, calls flow_runner.run(session_id)
  → flow_runner executes task 1 (analyze_requirements)
  → task returns TaskResult { next_action: WaitForInput }
  → flow_runner returns ExecutionResult { status: WaitingForInput }
  → Rust command emits interrupt payload to frontend (return value, not Channel)
      { sessionId, phase: 'requirement_confirmation', data: { analyzedRequirements } }
  → Frontend renders approval card
User clicks "Approve"
  → invoke('resume_pipeline', { sessionId, decision: 'approve', feedback })
  → Rust sets decision in session context, calls flow_runner.run(session_id) again
  → next task (generate_prd) executes
  → ... loop ...
```

**Key insight:** GraphFlow's `WaitForInput` model maps cleanly to Tauri's request/response IPC. No event polling required — each invoke returns either a final result or an "I'm waiting" payload, and the next invoke resumes. Streaming within a single task (LLM token-by-token) uses Channel<T>; the wait/resume boundary uses plain invoke return values.

## Recommended Build Order

This ordering is the load-bearing recommendation of this research — it determines phase structure.

### Phase A: Persistence (lowest risk, highest immediate value)

**Why first:** Every existing store resets on refresh. This is the largest gap between the "Apple-style desktop client" positioning and actual behavior. Fixes a HIGH-priority concern with no architectural uncertainty.

**Scope:**
- Add `tauri-plugin-sql` (SQLite via frontend) OR `sqlx` (SQLite via Rust) — pick **one**. Recommendation: **`sqlx`** (Rust-side), because (a) we need Rust-side DB access for the GraphFlow `SessionStorage` impl later, (b) avoids two SQL surfaces, (c) `@tauri-apps/plugin-sql` is async-by-default which fights Zustand's sync init.
- Add `persist` middleware to each of the 5 Zustand stores with `partialize` (drop functions, transient UI flags).
- Custom Zustand storage adapter that calls `invoke('load_store_state', ...)` / `invoke('save_store_state', ...)`.
- Two Rust commands + JSON-blob table.

**Migration sequence:** Parallel — keep stores working as-is, add `persist` to one store at a time. No cutover event. Each store migration is independently shippable.

### Phase B: Tauri IPC replaces Express AI endpoints (medium risk, security debt)

**Why second:** Depends on Phase A's secrets infrastructure (keyring). Unblocks the API-key-in-bundle security issue. The Express server shrinks to dev-only.

**Scope:**
- Add `tauri-plugin-keyring` (or Stronghold if a password gate is acceptable — but keyring is the right default for desktop).
- Add Rig dependency, build Gemini provider client.
- Port the 5 Express endpoints to 5 Tauri commands. Use `Channel<StreamChunk>` for the 4 generation endpoints (all benefit from streaming). Keep mock fallback path.
- Build `src/lib/tauri.ts` adapter (Pattern 1). Update stores to call adapter instead of `fetch`.
- Restrict Express to `127.0.0.1`. Remove `npm run build:server` from the production Tauri bundle path — Express becomes dev-only.

**Migration sequence:** Parallel during dev. Run both Express and the new Tauri commands side-by-side; flip the adapter's default from `fetch` to `invoke` per endpoint once a command is verified. Cutover event = remove `build:server` from production config.

### Phase C: GraphFlow + Rig PoC (highest risk, narrow scope)

**Why last:** Highest novelty. GraphFlow has zero production Tauri-embedding references — every example is an HTTP/Axum service. Design docs contain factual errors about the crate (SqliteSaver, `interrupt!` macro) that must be corrected before scoping. This phase should produce a **PoC, not a feature**: prove that GraphFlow can be embedded in Tauri, that HITL works over IPC, and that sessions persist — all behind a feature flag.

**Scope (deliberately narrow):**
- Add `graph-flow = { version = "0.2", features = ["rig"] }` dep.
- Implement `SqliteSessionStorage` (impl `SessionStorage`) over Phase A's DB pool.
- Build a 2-3-node pipeline (not the full 10-node design doc flow). Example: `analyze_requirements` → `WaitForInput` → `generate_prd`. Proves the pattern.
- Two commands: `start_pipeline`, `resume_pipeline`.
- One minimal UI surface (a "Pipeline PoC" panel under R&D center, gated by a feature flag).
- **Explicitly out of scope:** the full 10-node pipeline, the 4 HITL gates, time-travel recovery, FanOut tasks.

**Migration sequence:** N/A — net new, feature-flagged.

### Phase D (deferred, NOT v1): dark mode

The PROJECT.md Active section lists dark mode alongside Tauri migration, but it has no architectural dependency on anything above. It can ship in any phase (or as a standalone quick win) — do NOT bundle it into the critical path.

## Anti-Patterns

### Anti-Pattern 1: Normalizing Zustand store shape into relational SQLite tables in v1

**What people do:** Design a `products`, `tasks`, `milestones`, `deliverables` relational schema; write ORM-style repos; sync Zustand ↔ SQL row-by-row.
**Why it's wrong:** Multi-week yak-shave. Every store shape change becomes a migration. No payoff in v1 (single user, single machine, < 10K rows). The Zustand shape IS the source of truth for the UI; SQLite's only v1 job is to survive restarts.
**Do this instead:** One table: `kv_store (store_name TEXT PK, state_json TEXT, schema_version INT)`. Update the whole blob per store change. Reserve relational tables for GraphFlow session state (Phase C).

### Anti-Pattern 2: Using `emit`/`listen` for LLM token streaming

**What people do:** `app_handle.emit("token", chunk)` from Rust; `listen("token", cb)` in React. Pitfalls: global listener lifetime must be managed; out-of-order delivery with async handlers; collisions if multiple generations run concurrently.
**Do this instead:** `tauri::ipc::Channel<StreamChunk>`. Scoped to one invoke. Ordered. Type-safe. No cleanup needed.

### Anti-Pattern 3: Bundled API key as fallback when keyring is empty

**What people do:** Ship a `.env` baked into the Tauri bundle as a "fallback" so AI works out of the box.
**Do this instead:** Empty keyring = "Set your API key in Settings" prompt. The current Express fallback (returns mock templates when key is absent) is fine for dev, unacceptable for shipped builds because it silently degrades "AI" to hardcoded strings.

### Anti-Pattern 4: Trusting the design docs' GraphFlow API surface

**What people do:** Read `docs/PIPELINE_DESIGN.md`'s `interrupt!(context, data).await?` and write code against it.
**Do this instead:** Verify against docs.rs/graph-flow. Actual API is `TaskResult { next_action: NextAction::WaitForInput }`. Treat the design docs as intent, not spec.

### Anti-Pattern 5: Migrating all 5 Zustand stores to SQLite in one PR

**What people do:** Refactor all stores + persistence + adapter + hydration in one giant PR.
**Do this instead:** One store per PR. `taskStore` first (smallest surface, drives the kanban bug fix). `rndStore` last (largest, fragile, has the `INITIAL.p1` fallback bug).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Gemini API (Rig) | Rust-side, key from OS keyring. Streaming via Rig's async stream → Channel<StreamChunk>. | First provider only in v1; Rig's multi-provider abstraction earns its keep later. |
| OS keychain / Credential Manager / Secret Service | `tauri-plugin-keyring` (recommended) or `tauri-plugin-stronghold` (password-gated, overkill for v1). | Tauri has **no built-in secrets API** — a plugin is mandatory. Keyring avoids a per-launch password prompt. |
| SQLite | `sqlx::SqlitePool` managed in `AppState`. Single file at `app_data_dir()/nova.db`. Migrations applied on boot. | Pick `sqlx` over `rusqlite` — async-first, matches the rest of the stack, plays well with Tauri's tokio runtime. |
| Express (dev fallback only) | Continues to serve Vite middleware + 5 mock endpoints on `127.0.0.1`. **Not bundled in production Tauri builds.** | Addresses the `0.0.0.0` security concern; keeps the dev loop fast. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React ↔ Rust | `invoke()` (request/response) + `Channel<T>` (streaming). All funneled through `lib/tauri.ts`. | Never bypass the adapter in views/stores. |
| React ↔ Express (dev only) | `fetch('/api/...')` — same adapter, different branch. | One code path, two transports. |
| Tauri command ↔ domain modules (ai, pipeline, db) | Direct function calls; `tauri::State<AppState>` carries shared handles (DB pool, AI client). | Commands are thin. No business logic in `commands/*.rs`. |
| GraphFlow tasks ↔ LLM | Tasks construct Rig `Agent` from `Context`-passed config or `AppState`. | Avoid making tasks own client lifecycle — pass via context. |
| Zustand store ↔ SQLite | `persist` middleware with custom async storage adapter → `invoke('save_store_state')` → Rust → `sqlx`. | Write-behind, not write-through. UI never blocks on DB. |

## Dev vs Prod Parity

| Concern | Dev (browser via Vite) | Prod (Tauri shell) |
|---------|------------------------|---------------------|
| Persistence | `localStorage` ( Zustand `persist` default) | SQLite via Tauri commands |
| AI calls | Express mock endpoints (no API key needed) | Rig over real provider, key from keyring |
| Streaming | Single mocked response (no token stream) | Real `Channel<StreamChunk>` stream |
| File system | None | Real workspace file listing |

The `lib/tauri.ts` adapter is what makes this work — views and stores stay identical across modes.

**Hard rule:** Do NOT ship `dist/server.cjs` in the production Tauri bundle. Remove `build:server` from the production build path. The current `npm run tauri:build` chain includes it; this is the security-debt source.

## Module Boundaries in `src-tauri/src/`

| Module | Grows how | Cohesion |
|--------|-----------|----------|
| `commands/` | One file per concern (ai.rs, pipeline.rs, secrets.rs, workspace.rs). Files stay small because they delegate. | IPC contract |
| `ai/` | One provider per file once multi-provider lands. `client.rs` is the constructor; `streaming.rs` is the Channel adapter. | LLM integration |
| `pipeline/` | `tasks/` gets one file per pipeline task as the pipeline grows. `session_store.rs` is single-purpose. | Workflow execution |
| `db/` | `migrations/` only grows; `repos/` splits when a domain's queries exceed ~200 lines. | Persistence |
| `state.rs`, `error.rs`, `secrets.rs` | Single-file modules — do not split until they exceed 200 lines. | Cross-cutting |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single user, < 1K products | v1 design as above. JSON-blob persistence is fine. |
| Single user, 10K+ products | Move heavy stores out of JSON blob into relational tables (rndStore's 7 nested maps are the first to split). Lazy-load products by ID instead of hydrating all at startup. |
| Multi-user / sync | Out of scope per PROJECT.md. Would require sync layer (CRDT or server) — different milestone. |

**First bottleneck (v1 + scaling):** `rndStore` hydration cost — it has 7 nested `Record<productId, ...>` maps. At ~50 products with full R&D data, the JSON blob gets large. Mitigation: lazy-load per-product R&D data via `invoke('load_rnd_data', { productId })` instead of bundling into the all-store blob.

## Risks & Coupling to Avoid

### Risk: GraphFlow embedding is novel (MEDIUM confidence)

Every documented GraphFlow deployment is an HTTP/Axum service. Embedding it in Tauri (long-running process, no per-request task spawn, IPC instead of HTTP) is unproven. The PoC must verify: (a) `FlowRunner` plays well with Tauri's tokio runtime, (b) `WaitForInput` works across separate invoke calls (sessions persist between invocations), (c) our custom `SessionStorage` survives app restart.

**Mitigation:** PoC phase has explicit exit criteria. If embedding fails, fall back to running GraphFlow in a sidecar (violates the zero-sidecar principle but unblocks the pipeline feature) — this is a Phase-C decision, not a project-level blocker.

### Risk: Design docs contain factual errors about GraphFlow

`docs/ARCHITECTURE.md` and `docs/PIPELINE_DESIGN.md` reference `SqliteSaver` (doesn't exist) and `interrupt!` macro (doesn't exist). Anyone scoping Phase C from the design docs alone will write wrong code.

**Mitigation:** Phase C scope MUST be derived from this research file and fresh docs.rs/graph-flow reads, not from `docs/`.

### Coupling to avoid: Frontend reaching past `lib/tauri.ts`

If even one view calls `invoke()` directly, the dev/prod parity breaks. Lint rule or grep-check in CI: `invoke` should only appear in `src/lib/tauri.ts`.

### Coupling to avoid: Stores depending on Tauri types

Stores should import only `StreamChunk` types (which are plain TS interfaces). Never import `@tauri-apps/api/core` from a store. The adapter returns native TS types.

### Abstraction leak to watch: Zustand `persist` + async Tauri storage

Zustand's `persist` middleware hydrates asynchronously when the storage is async. There is a window between app boot and hydration where the store is empty. Components must either (a) show a loading state until hydrated, or (b) be tolerant of empty initial state. The `onRehydrateStorage` callback is the hook for this. Watch for "rendered with empty data, then snapped to real data" flicker.

## Sources

- [Tauri v2 — Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/) — HIGH confidence. Authoritative on `invoke`, `Channel<T>`, `emit`/`listen`, command error handling, async command semantics.
- [Tauri v2 — SQL Plugin](https://v2.tauri.app/plugin/sql/) — HIGH confidence. Confirms plugin exists, is async-first. We recommend `sqlx` (Rust-side) over this plugin for our use case, but the plugin remains a viable alternative if Rust-side SQL is deemed too much surface for v1.
- [graph-flow on docs.rs](https://docs.rs/graph-flow/latest/graph_flow/) — HIGH confidence. Authoritative on actual API surface: `Task`, `TaskResult`, `NextAction` (Continue / ContinueAndExecute / WaitForInput / End / GoTo / GoBack), `ExecutionStatus`, `FlowRunner`, `GraphBuilder`, `InMemorySessionStorage`, `PostgresSessionStorage`, `Session`, `SessionStorage` trait. **No SqliteSaver. No interrupt! macro.**
- [rs-graph-llm GitHub (a-agmon)](https://github.com/a-agmon/rs-graph-llm) — HIGH confidence. Source repo + comprehensive README with insurance-claims-service as the canonical reference deployment. Confirms HITL pattern: `WaitForInput` returned from task, surfaced as `WaitingForInput` status, resumed by next `flow_runner.run()` call. All examples are HTTP/Axum services — no Tauri embedding reference.
- [Reddit r/rust — graph-flow introduction by author](https://www.reddit.com/r/rust/comments/1lecxqy/graphflow_langgraphinspired_stateful_graph/) — MEDIUM confidence. Community context on crate maturity.
- [tauri-plugin-keyring (HuakunShen)](https://github.com/HuakunShen/tauri-plugin-keyring) — MEDIUM confidence. Community plugin wrapping Rust `keyring` crate. Mature alternative if Stronghold is rejected.
- [Tauri v2 — Stronghold Plugin](https://v2.tauri.app/plugin/stronghold/) — HIGH confidence. Official. Password-gated; overkill for v1 single-key use case.
- [Reddit: Safest way to store API keys for production (Tauri)](https://www.reddit.com/r/rust/comments/1ia29hp/safest_way_to_store_api_keys_for_production_tauri/) — MEDIUM confidence. Community consensus that Tauri has no built-in secrets API and a keyring-style plugin is the right default.
- [graph-flow crate](https://crates.io/crates/graph-flow) — HIGH confidence. Version 0.2.x as of research date.

---
*Architecture research for: Nova-PM-Workspace — Tauri-native migration*
*Researched: 2026-08-08*
