# Stack Research

**Domain:** Tauri v2 desktop app — adding native IPC, SQLite persistence, GraphFlow/Rig PoC, dark mode wiring to existing React 19 / Zustand 5 / Express 4 app.
**Researched:** 2026-08-08
**Confidence:** HIGH for Tauri plugin + Rig + keyring; MEDIUM for graph-flow (young crate); LOW for the "Juncture" alternative named in docs/ (could not verify it exists).

Existing stack is **not** re-researched here. See `.planning/codebase/STACK.md` for React 19 / Vite 6 / Tailwind v4 / Zustand 5 / motion 12 / Radix / Phosphor / Express 4 / Tauri v2 baseline.

---

## Recommended Stack (new additions only)

### Rust backend (src-tauri/Cargo.toml)

| Technology | Version | Purpose | Why this one |
|------------|---------|---------|--------------|
| `tauri-plugin-sql` | 2.4.x | SQLite via Tauri official plugin; migrations + frontend `Database` API | Official, ships migrations, frontend-driven which fits Zustand-centric app. Migration support means schema can evolve without code rewrite. |
| `rusqlite` | 0.40.x (with `bundled` feature) | Direct synchronous SQLite for Rust-side needs (GraphFlow SqliteSaver, keyring cache) | Required by graph-flow's storage layer and any Rust-side query. `bundled` ships SQLite so no system dependency. Sync API is fine for desktop single-user. |
| `rig-core` | 0.41.x | Multi-provider LLM client (Gemini/Claude/GPT/Ollama) | Replaces `@google/genai` in `server.ts`. 20+ providers, built-in streaming (`stream_chat`), structured output. 0.41 is current, actively released (~every 2 weeks). |
| `graph-flow` | 0.6.x | LangGraph-style stateful/interruptible workflow engine, Rig-integrated | The only Rust crate that hits all three requirements: HITL via `interrupt!`, Rig integration, in-process. PoC only this milestone — see Pitfalls. |
| `keyring` | 4.1.x | OS keychain access (macOS Keychain / Windows Credential Manager / Linux Secret Service) | Cross-platform, mature, v4 line is current. Replaces `.env`-bundled `GEMINI_API_KEY` with user-provided, OS-secured storage. |
| `tokio` | 1.x (full features) | Async runtime for Rig + Tauri commands | Already implicit via Tauri; pin explicitly for Rig's async streams. |
| `serde` / `serde_json` | 1.x | Serde for IPC payload types | Already in Tauri's transitive deps; make direct for command arg types. |

### Tauri v2 official plugins (add to `tauri.conf.json` + `capabilities/default.json`)

| Plugin | Version | Purpose | Why official over community |
|--------|---------|---------|------------------------------|
| `tauri-plugin-sql` | 2.4.x | SQLite + migrations, frontend-accessible | Official, sqlx-backed, ships migration runner. Community `tauri-plugin-rusqlite2` exists but adds a second dependency surface for no gain at this scale. |
| `tauri-plugin-store` | 2.x | Persistent KV store (Zustand fallback for non-SQLite fields, theme, settings) | Official. Smaller than SQL, fine for `uiStore` / `useTheme`. Not for product data — that goes to SQLite. |

### Frontend (npm) — new deps

| Package | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| `@tauri-apps/plugin-sql` | 2.x | TS client for `tauri-plugin-sql` (`Database.load('sqlite:...')`) | All SQLite reads/writes from frontend. Replaces hypothetical fetch-to-Express for persisted data. |
| `@tauri-apps/plugin-store` | 2.x | TS client for `tauri-plugin-store` | Theme/UI flags only. |
| `zustand` `persist` middleware | (built into `zustand` 5.0.14, no new dep) | Rehydrate stores on boot | All 5 data stores (`product`/`task`/`rnd`/`schedule`/`workspace`). Use `createJSONStorage` adapter wrapping `@tauri-apps/plugin-store` for desktop; falls back to `localStorage` in web dev mode via `isTauri()` check. |

### Already-installed — keep using for the new work

| Package | Why reused |
|---------|------------|
| `@tauri-apps/api` 2.11.1 | `invoke()` for commands, `Channel` for streaming LLM tokens. No version bump. |
| `@phosphor-icons/react` | Sun/Moon icons for theme toggle. Already migrated to. |
| Radix `Switch` / `Select` / `Tabs` | Theme picker UI (light/dark/system) in SettingsView. Already present. |
| `motion/react` | Optional: animated theme transition. Already present. |

---

## Installation

```bash
# Frontend — only two new packages
npm install @tauri-apps/plugin-sql @tauri-apps/plugin-store

# Rust — src-tauri/
cd src-tauri
cargo add tauri-plugin-sql --features sqlite
cargo add tauri-plugin-store
cargo add rusqlite --features bundled
cargo add rig-core
cargo add graph-flow
cargo add keyring
cargo add tokio --features full
cargo add serde --features derive
cargo add serde_json
cargo add chrono --features serde
```

No new test runner, no ORM, no LangChain-rust, no Express 5 upgrade. Ponytail: the goal is to delete Express, not modernize it.

---

## Per-question recommendations (the actual decisions)

### 1. SQLite: `tauri-plugin-sql` vs `rusqlite` direct

**Use BOTH, in different layers.** This is not a binary choice.

- **Frontend-facing data** (Zustand-persisted product/task/rnd/schedule/workspace state) → `tauri-plugin-sql`. Frontend reads/writes directly, no IPC round-trip per query. Use the official migrations runner to evolve schema.
- **Rust-internal data** (GraphFlow checkpoints, Rig session cache, keyring-cached secrets) → `rusqlite 0.40.x` with `bundled` feature. GraphFlow's `SqliteSaver` already speaks rusqlite; don't fight it.

Share the same DB file (`<app_data_dir>/nova.db`) by passing the same path to both. sqlx (plugin-sql's engine) and rusqlite both read/write SQLite format-compatible; just don't open write transactions from both sides simultaneously on the same table. Use separate tables: `app_*` for frontend data, `gf_*` for GraphFlow.

**Avoid:** `tauri-plugin-rusqlite2` (community). Adds a third dependency for a feature the official plugin already covers. Only consider if sqlx's async overhead shows up in profiles (it won't at single-user scale).

### 2. State persistence: Zustand `persist` vs Tauri store plugin

**Zustand `persist` middleware with `createJSONStorage` adapter.** Do NOT swap the state library, do NOT bolt a Tauri plugin onto every store.

```ts
// src/lib/t auristorage.ts — one adapter, ~20 lines
import { isTauri } from '@/src/lib/api';
import type { StateStorage } from 'zustand/middleware';

const memoryFallback: StateStorage = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
};

export const tauriStorage: StateStorage = isTauri()
  ? {
      // Lazy-import so web mode doesn't try to load the plugin
      getItem: async (k) => (await import('@tauri-apps/plugin-store')).get(k) ?? null,
      setItem: async (k, v) => { (await import('@tauri-apps/plugin-store')).set(k, v); },
      removeItem: async (k) => { (await import('@tauri-apps/plugin-store')).delete(k); },
    }
  : memoryFallback;
```

**Why not `tauri-plugin-zustand` (community):** It exists, it works, but the official stack already gives us everything (`persist` + `plugin-store`). Adding a third-party abstraction over two official primitives is the kind of dependency that breaks when either upstream bumps a major. The adapter above is 20 lines.

**Why `tauri-plugin-store` (KV) for state but `tauri-plugin-sql` for product data:**
- Zustand stores are JSON blobs — KV is the right shape, no SQL needed.
- Product/RnD data will eventually need queries (and GraphFlow's SqliteSaver wants SQLite) — relational fits.
- Splitting now avoids a future "I need to query my Zustand-persisted JSON" rewrite.

**`partialize` is mandatory:** Drop transient flags (`isGenerating`, modal open states) — they shouldn't survive reload. Only `uiStore.theme` lives in `useTheme.ts` localStorage already; don't double-persist.

### 3. Rig current state and Tauri integration

**`rig-core 0.41.0` is current, actively shipped, 20+ providers, built-in streaming.** This is a HIGH-confidence pick.

- Streaming via `stream_chat()` returns `Stream<Item = Result<String>>` — wire each token through a `tauri::ipc::Channel<String>` to the frontend.
- Provider initialization reads API key from `keyring` (not env), so the same `rig::providers::google::Client::new(&key)` call works in any deployment.
- **Maturity caveat:** Rig is on a 2-week release cadence and breaks APIs across minor versions (it's pre-1.0). Pin to `=0.41.0` in `Cargo.toml`, upgrade deliberately.
- **No LangChain-rust:** heavier, parallel project, doesn't integrate with graph-flow. Rig was chosen upstream in `docs/TECH_STACK.md` because graph-flow already bundles it — re-litigating this means rewriting graph-flow's integration.

### 4. GraphFlow maturity + alternatives

**`graph-flow 0.6.x` is the current line.** v0.6.0 confirmed on crates.io; a `ROADMAP.md` dated 2026-07 exists in `a-agmon/rs-graph-llm` planning 0.7 breaking changes from a code review.

**Maturity assessment — LOW confidence in production readiness, HIGH confidence in PoC fitness:**
- Single author (`a-agmon`), small community.
- Pre-1.0, will have breaking changes (the roadmap says so).
- Has been advertised on r/rust as LangGraph-inspired with `interrupt!` for HITL.
- This is exactly why `PROJECT.md` scopes it as **PoC in this milestone**, not production. Smart call.

**Alternatives — what to fall back to if graph-flow can't carry the weight:**

| Alternative | Status | When to switch |
|-------------|--------|----------------|
| `rust-langgraph` (community, crates.io) | Active, Pregel-style | If `interrupt!` semantics differ from LangGraph's `interrupt()` in ways that break the HITL UX. Independent project, not LangChain-affiliated. |
| Hand-rolled state machine (typed enum + `tokio::sync::oneshot` for HITL approval) | Always available | If the PoC shows graph-flow's mental model doesn't fit Nova's pipeline shape. A 200-line FSM is cheaper than fighting a foreign abstraction. |
| **"Juncture"** (named in docs/TECH_STACK.md as backup) | **Could not verify existence.** No crate, no repo, no article found. | Treat as a documentation error. Do not plan around it. If the user knows different, ask before assuming. |

**Recommendation:** Build the PoC with graph-flow, but design pipeline node fns behind a trait (`PipelineNode`) so the engine is swappable. ~30 lines of trait, no premature abstraction.

### 5. LLM API key storage: Tauri keyring vs OS keychain vs encrypted local

**Use the `keyring` crate 4.1.x directly. NOT a Tauri plugin.**

- `keyring` already has a "Tauri 2.0 cross-platform GUI" in its repo per docs.rs — it's tested in Tauri contexts.
- The community Tauri keyring plugins (`tauri-plugin-keyring`, `tauri-plugin-keychain`, `tauri-plugin-keyring-store`) are three competing wrappers around the same underlying `keyring` crate. Adding one means picking a winner in a fragmented field.
- A direct `keyring::Entry::new("nova-pm", "gemini-api-key")?.set_password(...)` from the Rust side is 4 lines and exposes zero attack surface to the webview.

**Flow:**
1. Settings UI asks user for Gemini key, calls `invoke('set_api_key', { provider, key })`.
2. Rust command writes to keyring.
3. On AI command invoke, Rust reads from keyring, builds Rig client, never returns the key to JS.
4. Web dev mode (no Tauri) falls back to `.env` so the existing Express flow keeps working until removed.

**Avoid:** bundling the key in the Tauri app (current `.env` story, flagged HIGH in CONCERNS.md). Avoid community keyring plugins for now — they fragment, the underlying crate doesn't.

### 6. Tauri v2 command patterns for streaming LLM responses

**Use `tauri::ipc::Channel<T>` — the official, recommended streaming primitive.** Not events, not polling.

```rust
#[tauri::command]
async fn chat_stream(
    prompt: String,
    on_token: tauri::ipc::Channel<StreamEvent>,
) -> Result<(), String> {
    let client = build_rig_client()?; // reads key from keyring
    let mut stream = client.agent("gemini-3.6-flash").stream_chat(prompt);
    while let Some(token) = stream.next().await {
        on_token.send(StreamEvent::Token(token?)).map_err(|e| e.to_string())?;
    }
    on_token.send(StreamEvent::Done).ok();
    Ok(())
}
```

```ts
// Frontend
import { Channel, invoke } from '@tauri-apps/api/core';
const ch = new Channel<StreamEvent>();
ch.onmessage = (msg) => {
  if (msg.type === 'token') setResponse(r => r + msg.text);
  if (msg.type === 'done') setIsStreaming(false);
};
await invoke('chat_stream', { prompt, onToken: ch });
```

**Why Channel beats events:**
- Channel is point-to-point, scoped to one invocation — no global event namespace pollution, no leaked listeners across requests.
- Backpressure-aware (messages queue if frontend is slow).
- Officially recommended by Tauri docs for "streamed HTTP responses" — the LLM token case is exactly this.

**Capability wiring:** Add `chat-stream:allow` (and every other command) to `src-tauri/capabilities/default.json`. Tauri v2 ACL means commands are denied by default — easy to forget.

---

## Dark mode wiring (no new deps)

This is in scope per PROJECT.md but needs zero new technology. Listing here only to make the migration path explicit.

- `useTheme()` hook already exists in `src/hooks/useTheme.ts` and persists to `localStorage`. **Leave the localStorage for theme** (pre-Tauri users have it there); add a Tauri-store mirror later if desired.
- Wire the hook into `SettingsView.tsx` appearance section (Radix `Tabs` or `Select` for 3-way light/dark/system).
- Add a quick-toggle in `Header.tsx` (Phosphor `Sun` / `Moon` icons already in `src/lib/icons.ts`).
- Verify a sample of glass/elevated/shadow components against `.dark` palette (defined at `tokens.css:116-156`). ~80 lines of UI code total. CONCERNS.md rates this MEDIUM.

---

## Alternatives Considered

| Recommended | Alternative | When to use alternative |
|-------------|-------------|-------------------------|
| `tauri-plugin-sql` (sqlx) | `rusqlite` direct everywhere | If we drop frontend-driven DB access entirely and route all queries through Rust commands. More IPC overhead, less clean. Don't. |
| `tauri-plugin-sql` | `tauri-plugin-rusqlite2` | Never at this scale. Community fork of the official plugin, no gains. |
| Zustand `persist` + custom adapter | `tauri-plugin-zustand` (community) | If we outgrow the 20-line adapter and want multi-window sync for free. Not yet. |
| `rig-core` | LangChain-rust | Never. Doesn't integrate with graph-flow; heavier. |
| `rig-core` | Hand-rolled HTTP to Gemini/Anthropic | If Rig's release cadence becomes a liability. Acceptable fallback since it's the current Express approach, just without Express. |
| `graph-flow` 0.6.x (PoC) | `rust-langgraph` | If PoC shows graph-flow's HITL macro semantics are wrong for Nova. |
| `graph-flow` (PoC) | Hand-rolled FSM | If the pipeline shape is linear enough that a typed enum beats a graph engine. Likely outcome for v1's PoC scope. |
| `keyring` crate direct | `tauri-plugin-keyring` community wrappers | If we ever need to expose key management to the webview. We don't — keep keys in Rust. |
| `tauri::ipc::Channel` | Tauri events (`emit`/`listen`) | Never for streaming. Events are global broadcast; channels are scoped. Events are fine for app-wide notifications (theme changed). |
| Delete Express | Keep Express, just bind 127.0.0.1 | If the Tauri IPC migration slips. Stopgap only — the entire point of this milestone is no Node-side API key exposure. |

---

## What NOT to use

| Avoid | Why | Use instead |
|-------|-----|-------------|
| `tauri-plugin-rusqlite2` | Community fork of official plugin; adds a second SQLite surface for zero gain | `tauri-plugin-sql` (official, sqlx) + `rusqlite` (Rust-internal) |
| `tauri-plugin-zustand` | Third-party abstraction over two official primitives; 20-line adapter does the job | Zustand `persist` + `createJSONStorage` wrapping `@tauri-apps/plugin-store` |
| `tauri-plugin-keyring` / `tauri-plugin-keychain` / `tauri-plugin-keyring-store` | Three competing wrappers around one crate; pick the underlying crate | `keyring 4.1.x` direct from Rust commands |
| LangChain-rust | Doesn't integrate with graph-flow; heavier; parallel project | `rig-core` (graph-flow already uses it) |
| Any of the "Juncture" references in docs/TECH_STACK.md | Could not verify the crate exists; likely a doc error | `rust-langgraph` or hand-rolled FSM as graph-flow fallback |
| Tauri events for LLM token streaming | Global broadcast namespace; leaked listeners; backpressure issues | `tauri::ipc::Channel<T>` |
| Bundling `.env` into Tauri production builds | HIGH security risk per CONCERNS.md; key shipped in binary | `keyring` crate, user-provided at first run |
| `lancedb` in this milestone | Out of scope per PROJECT.md (Phase 4 future milestone); don't pull the vector DB dep before the basics work | Defer — listed here only to be explicit |
| Upgrading Express to 5.x | The plan is to delete Express, not modernize it | Migrate endpoints to Tauri commands, then remove Express |
| `react-router` for theme/routing | Active tab is fine via Zustand `uiStore.activeTab`; URL routing explicitly out of scope per PROJECT.md | Nothing — keep current pattern |

---

## Stack Patterns by Variant

**If running in Tauri (production build):**
- All AI calls → `invoke()` → Rust commands → Rig → streaming via `Channel`
- API key → keyring (set on first run via Settings)
- Persistence → Zustand `persist` → `tauri-plugin-store` (KV) + `tauri-plugin-sql` (relational)
- Theme → `useTheme()` → `<html class="dark">` toggle, persisted to localStorage (no need for Tauri store on day 1)

**If running in web dev mode (`npm run dev`, no Tauri):**
- AI calls → existing Express endpoints (kept as dev-only fallback, bind to `127.0.0.1` per CONCERNS.md)
- API key → `.env` / `GEMINI_API_KEY`
- Persistence → Zustand `persist` → `localStorage`
- Theme → unchanged

The `isTauri()` check in `src/lib/api.ts` is the switch. One adapter, one branch — no feature-flag system.

**If graph-flow PoC fails (can't express the HITL flow Nova needs):**
- Replace with hand-rolled trait + tokio oneshot channels for approval gates
- Keep Rig for LLM calls (it's independent of graph-flow's orchestration)
- ~200 lines of FSM code vs fighting an immature crate

---

## Version Compatibility

| Package | Compatible with | Notes |
|---------|-----------------|-------|
| `tauri-plugin-sql` 2.4.x | Tauri 2.x (current is 2.11.x CLI) | Requires `sqlite` cargo feature |
| `rig-core` 0.41.x | tokio 1.x, Rust 1.74+ | Pre-1.0, pin exact minor (`=0.41.0`) |
| `graph-flow` 0.6.x | `rig-core` (check its pinned version — graph-flow depends on a specific Rig line) | **Verify graph-flow's Cargo.lock picks a Rig version we can live with.** May need to bump graph-flow or pin Rig downward. |
| `rusqlite` 0.40.x `bundled` | SQLite 3.34.1+ (bundled ships newer) | No system SQLite dependency |
| `keyring` 4.1.x | Platform-specific backend libs (Linux: Secret Service / DBus) | macOS/Windows: native, no extra deps |
| `tauri-plugin-store` 2.x | Tauri 2.x, Rust 1.77.2+ | Min Rust bumps to 1.77.2 — verify toolchain |
| `@tauri-apps/plugin-sql` 2.x | Matches `tauri-plugin-sql` Rust 2.4.x | JS/Rust plugin versions track each other |

**Rust toolchain:** bump to 1.77.2+ minimum (required by `tauri-plugin-store`). Tauri 2 itself requires 1.70+; the plugins push it higher.

---

## Migration path from current Express-based stack

Ordered so each step is independently shippable. Ponytail: smallest diff per step.

### Step 1 — Dark mode (no backend changes)
Wire `useTheme()` into `SettingsView.tsx` + `Header.tsx`. Verify tokens. ~80 lines. Zero new deps. Ship.

### Step 2 — Persistence via Zustand `persist` (still localStorage)
Add `persist` middleware to all 5 data stores with `partialize`. App state survives reload even without Tauri. Web mode benefits too. Zero new deps (`persist` ships with Zustand 5).

### Step 3 — Tauri store plugin for desktop persistence
Add `tauri-plugin-store` + the 20-line `tauriStorage` adapter. Zustand stores transparently move from localStorage to Tauri store on desktop builds. Web mode unchanged.

### Step 4 — SQLite via `tauri-plugin-sql`
Define schema in Rust migrations. Migrate heaviest stores (`rndStore`, `productStore`) to SQLite tables. Frontend reads/writes via `@tauri-apps/plugin-sql` `Database` API. Keep `persist` for the rest as a stepping stone — don't force everything to SQL at once.

### Step 5 — Tauri commands for AI endpoints (replacing Express)
Port `server.ts` endpoints one at a time to `#[tauri::command]` functions in `src-tauri/src/commands/ai.rs`. Use Rig (replaces `@google/genai`). API key from keyring (Step 6 below, or `.env` initially).
- `generate_project` → `invoke('generate_project', {...})`
- `summarize_workspace` → `invoke('summarize_workspace', {...})`
- `generate_project_plan` → `invoke(...)`
- `generate_milestone_plan` → `invoke(...)`
- `generate_deliverable` → `invoke('generate_deliverable', ...)` with `Channel<String>` for streaming

Keep Express alive in parallel during the migration — `isTauri()` decides path. Delete Express only after all 5 endpoints have a Rust equivalent and web dev mode is the sole Express user.

### Step 6 — Keyring for API key
Add `set_api_key` / `get_api_key` Rust commands wrapping `keyring`. Settings UI gains an "API Key" field. Remove `.env` requirement for desktop builds.

### Step 7 — GraphFlow + Rig PoC
Last, scoped as PoC only. Build one minimal pipeline (e.g., `draft_prd` → HITL approval → `refine_prd`) to validate graph-flow's `interrupt!` semantics. If it works, expand next milestone. If it doesn't, fall back per the alternatives table.

### Step 8 — Delete Express
Once Steps 5-6 are complete and stable, remove `server.ts`, the `dev`/`start`/`build:server` scripts, `express`/`esbuild`/`tsx`/`@google/genai`/`dotenv` deps. Web dev mode becomes "Vite only, no AI" (acceptable per PROJECT.md — web is dev fallback).

---

## Sources

| Source | What it verified | Confidence |
|--------|------------------|------------|
| [v2.tauri.app/plugin/sql](https://v2.tauri.app/plugin/sql/) | `tauri-plugin-sql` exists, supports migrations, current 2.4.x | HIGH |
| [v2.tauri.app/plugin/store](https://v2.tauri.app/plugin/store/) | Official persistent KV store plugin | HIGH |
| [v2.tauri.app/develop/calling-rust](https://v2.tauri.app/develop/calling-rust/) | `Channel<T>` is recommended for streaming LLM responses | HIGH |
| [docs.rs/rig-core](https://docs.rs/rig-core) | rig-core 0.41.0 current | HIGH |
| [docs.rig.rs/docs/concepts/streaming](https://docs.rig.rs/docs/concepts/streaming) | `stream_chat` returns incremental tokens | HIGH |
| [github.com/0xPlaygrounds/rig](https://github.com/0xplaygrounds/rig) | 20+ provider support | HIGH |
| [docs.rs/crate/graph-flow](https://docs.rs/graph-flow) | graph-flow crate exists, LangGraph-inspired, Rig-integrated | MEDIUM (version 0.6.x confirmed, single-author project) |
| [github.com/a-agmon/rs-graph-llm](https://github.com/a-agmon/rs-graph-llm) | Repo activity, ROADMAP.md planning 0.7 breaking changes (2026-07) | MEDIUM |
| [docs.rs/crate/rusqlite/latest](https://docs.rs/crate/rusqlite/latest) | rusqlite 0.40.1 current | HIGH |
| [docs.rs/crate/keyring/latest](https://docs.rs/crate/keyring/latest) | keyring 4.1.5 current, cross-platform | HIGH |
| [crates.io/crates/lancedb](https://crates.io/crates/lancedb) | lancedb 0.22.0 current — **not in scope this milestone** | HIGH (version), N/A (deferred) |
| [crates.io/crates/tauri-plugin-zustand](https://crates.io/crates/tauri-plugin-zustand) | Community plugin exists, 14 versions — explicitly NOT recommended | HIGH |
| [v2.tauri.app/security/capabilities](https://v2.tauri.app/security/capabilities/) | v2 ACL model, commands denied by default | HIGH |
| [dev.to — Building a Desktop AI App with Tauri v2 + React 19 in 2026](https://dev.to/purpledoubled/how-i-built-a-desktop-ai-app-with-tauri-v2-react-19-in-2026-1g47) | Confirms event-based streaming layer is the right pattern | MEDIUM |
| WebSearch for "Juncture rust crate" | **No results found.** Crate named in docs/TECH_STACK.md as backup could not be verified to exist. | LOW (negative finding) |

---

*Stack research for: Tauri v2 native capabilities + SQLite + GraphFlow/Rig PoC*
*Researched: 2026-08-08*
