# Project Research Summary

**Project:** Nova PM Workspace — Dark Mode + Tauri Native + Persistence + GraphFlow PoC
**Domain:** Tauri v2 desktop app — adding native IPC, SQLite persistence, dark mode wiring, and a workflow-engine PoC on top of an existing React 19 / Zustand 5 / Express 4 app (v0.1.0)
**Researched:** 2026-08-08
**Confidence:** HIGH overall for dark mode / persistence / IPC; MEDIUM for GraphFlow PoC (pre-1.0 crate, novel embedding pattern)

## Executive Summary

Nova v0.1.0 ships a polished UI shell with design tokens, Zustand stores, and Express-backed Gemini AI, but four gaps separate it from the "Apple-style AI-native PM desktop agent" positioning: dark mode is defined in tokens but not wired, all state resets on refresh, AI calls round-trip through an Express server with a bundled API key, and the headline Rust-native HITL workflow is unproven. All four research files converge on the same four-phase sequence to close these gaps: dark mode first (smallest win, clears tech debt), persistence second (fixes the biggest user-visible hole and unblocks everything downstream), Tauri IPC migration third (resolves the security debt and enables streaming), and the GraphFlow + Rig PoC last (highest risk, gated behind a feature flag).

The recommended approach uses official Tauri primitives wherever they exist: `tauri::ipc::Channel<T>` for LLM token streaming (not events), `tauri-plugin-sql` (sqlx) for frontend-facing data plus `rusqlite` for Rust-internal needs sharing one DB file, Zustand built-in `persist` middleware with a ~20-line `createJSONStorage` adapter wrapping `@tauri-apps/plugin-store`, and the `keyring` crate called directly from Rust commands (no community plugin wrappers). Rig 0.41.x replaces `@google/genai` once AI calls move to Rust; Gemini remains the first provider. This stack minimizes new dependencies (only two npm packages and a handful of well-established Rust crates) and preserves dev/prod parity through one `isTauri()` branch in `lib/tauri.ts`.

The dominant risk is the GraphFlow layer. The `graph-flow` crate is pre-1.0, single-author, and has no production Tauri-embedding reference. Worse, the project design docs (`docs/ARCHITECTURE.md`, `docs/PIPELINE_DESIGN.md`, `docs/DECISIONS.md`) contain fabricated claims about it: no `SqliteSaver` ships in the crate (we must implement `SessionStorage` ourselves), no `interrupt!` macro exists (HITL is `TaskResult { next_action: NextAction::WaitForInput }`), the Juncture backup crate named in `TECH_STACK.md` cannot be verified to exist, and ADR-002 "v1.4.2 with 99.99% availability" is fiction (crate is 0.x). Phase 4 scope must be derived from docs.rs/graph-flow, not the design docs, and ADR-002 must be corrected before Phase 4 begins. Secondary risks — Linux GTK theme detection is broken in wry/WebKitGTK, Tauri SQL migrations silently fail, capabilities/CSP are silent at build time, HITL state corrupts on close-mid-approval — each have concrete mitigations documented below.
## Key Findings

### Recommended Stack

Two new npm packages (`@tauri-apps/plugin-sql`, `@tauri-apps/plugin-store`) and a focused set of Rust crates. No new state library, no ORM, no LangChain-rust, no Express 5 upgrade — the plan is to delete Express, not modernize it. See `.planning/research/STACK.md` for the full table and per-question rationale.

**Core technologies (new):**
- `tauri-plugin-sql` 2.4.x (sqlx) — frontend-facing SQLite with migrations; Zustand stores remain the read path, SQLite is write-behind
- `rusqlite` 0.40.x with `bundled` — Rust-internal SQLite for GraphFlow checkpoints and keyring cache; shares the same DB file as the plugin
- `rig-core` 0.41.x (pinned exact) — replaces `@google/genai`; 20+ providers, built-in streaming via `stream_chat()`
- `graph-flow` 0.x (pinned exact) — LangGraph-inspired workflow engine; **PoC only this milestone**, isolate behind a trait so the engine is swappable
- `keyring` 4.1.x direct from Rust (NOT a Tauri plugin) — OS keychain for the LLM API key; 4 lines to set/get, zero attack surface in webview
- `tauri-plugin-store` 2.x — KV store for Zustand `persist` adapter; theme stays in localStorage for now
- Zustand `persist` middleware (built into 5.0.14, no new dep) with `partialize` mandatory on every store

**Already installed — keep using:** `@tauri-apps/api` 2.11.1 (`invoke()` + `Channel`), `@phosphor-icons/react` (Sun/Moon), Radix `Switch`/`Select`/`Tabs`, `motion/react`. Rust toolchain bumps to 1.77.2+ (required by `tauri-plugin-store`).

**Explicitly avoid:** `tauri-plugin-rusqlite2` (community fork, zero gain), `tauri-plugin-zustand` (third-party abstraction over two official primitives — 20-line adapter wins), `tauri-plugin-keyring`/`keychain`/`keyring-store` (three competing wrappers — use the underlying crate), LangChain-rust (heavier, does not integrate with graph-flow), Tauri events for LLM streaming (use `Channel<T>`), Express 5 upgrade (delete, do not modernize).

### Expected Features

See `.planning/research/FEATURES.md` for the full table with complexity and priority.

**Must have (table stakes — ship blocks the milestone):**
- Three-way theme toggle (Light/Dark/System) in Settings + Header quick-toggle — `useTheme()` already implements all three modes; work is wiring UI
- Dark palette verification pass across every Card variant and every view — token misses are the #1 reported dark-mode bug class
- Zustand persistence on all 5 stores with `partialize` + `version` + `migrate` stub — fixes the "loses my data on refresh" hole
- AI cancellation client-side (`AbortController` per in-flight call + Stop button)
- AI errors surfaced as user-facing messages (try/catch around parse + network)
- Explicit CSP in production Tauri build (`csp: null` is current state — must change)
- API key out of the bundle (OS keychain via Settings prompt, no `.env` in release builds)

**Should have (differentiators — the milestone reason for existing):**
- Tauri IPC streaming via `Channel<T>` for one AI endpoint (recommend `/generate-project` or new chat)
- Server-side AI cancellation via Rust `CancellationToken` (free with the streaming rewrite — do together)
- GraphFlow + Rig minimal PoC (2 nodes + 1 interrupt + resume + checkpoint survives restart) — decision gate for next milestone architecture

**Defer (explicitly out of scope per PROJECT.md):**
- Full LanceDB vector search / "second brain" — its own milestone
- Full 10-node PM Pipeline from `PIPELINE_DESIGN.md` — expand only if PoC lands
- Multi-window CRDT / conflict resolution — YAGNI for single-user local app
- Cloud sync / multi-device — separate product decision
- Custom Rig provider plugin system — hardcode 4 providers, add plugin system at the 5th real user
- Per-view dark mode override, URL routing, AppContext full removal

### Architecture Approach

Three independent migration axes that must be sequenced (not bundled) because each has a different risk profile: persistence (lowest risk, highest immediate value), Tauri IPC (medium risk, addresses security debt), GraphFlow PoC (highest risk, narrow scope). The single load-bearing abstraction is a `lib/tauri.ts` adapter — every frontend -> backend call goes through it, the adapter inspects `isTauri()` and routes to `invoke()` or falls back to `fetch()`. This preserves dev/prod parity and lets Express shrink to dev-only without code duplication. See `.planning/research/ARCHITECTURE.md` for the full target system diagram and Rust module layout.

**Major components (new):**
1. `lib/tauri.ts` adapter — single chokepoint for `invoke()` + `Channel<>` + `listen()`; never bypassed by views/stores
2. `src-tauri/src/commands/` — thin IPC surface (ai.rs, pipeline.rs, workspace.rs, secrets.rs); no business logic, delegates to domain modules
3. `src-tauri/src/ai/` — Rig client construction + streaming (`stream_chat` -> `Channel<StreamChunk>`); system prompts isolated from user content
4. `src-tauri/src/pipeline/` — GraphFlow PoC; 2-3 node graph, custom `SessionStorage` impl over our SQLite pool, feature-flagged
5. `src-tauri/src/db/` — sqlx pool, numbered additive-only migrations, JSON-blob `kv_store` table for Zustand state (do NOT normalize Zustand shape in v1)
6. `src-tauri/src/secrets.rs` — thin `keyring` wrapper; one fn per secret, keys never cross to JS

**Key patterns:** Adapter-first IPC (Pattern 1), `Channel<T>` for streaming not `emit`/`listen` (Pattern 2 — backpressure-aware, scoped, type-safe), custom `SessionStorage` for GraphFlow since no `SqliteSaver` exists (Pattern 3), single typed `AppError` enum with manual `serde::Serialize` for IPC errors (Pattern 4).

**Anti-patterns to refuse:** normalizing Zustand shape into relational SQLite tables in v1 (multi-week yak-shave, no payoff at single-user scale), `emit`/`listen` for token streams (global listener leaks, out-of-order delivery), bundled API key as keyring fallback (binary leak waiting to happen), trusting the design docs GraphFlow API surface (they are wrong — see Critical Pitfalls).

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for the full set with recovery strategies. Top 5:

1. **Design docs fabricate GraphFlow API surface.** `docs/ARCHITECTURE.md` and `docs/PIPELINE_DESIGN.md` reference `SqliteSaver` (does not exist) and `interrupt!` macro (does not exist). ADR-002 "v1.4.2 with 99.99% availability" is fabricated — crate is 0.x pre-1.0. "Juncture" backup crate in `TECH_STACK.md` cannot be verified. **Mitigation:** derive Phase 4 scope from docs.rs/graph-flow, not the design docs. Actual HITL API: `TaskResult { next_action: NextAction::WaitForInput }`, resumed by calling `flow_runner.run(session_id)` again. SQLite session store must be implemented in-house.

2. **Linux `prefers-color-scheme` is broken in wry/WebKitGTK.** "System" theme mode silently stays on whatever the app started in. **Mitigation:** ship a GTK detection shim (read `gsettings get org.gnome.desktop.interface color-scheme` or `GTK_THEME`) the same phase that ships system mode. Manual override must win over detection. Confirmed open: tauri#9427, wry#884, WebKit bug #196685.

3. **Tauri SQL plugin migrations silently fail (plugins-workspace#509).** App boots against stale schema, first write throws `no such column`. No down migrations either (#1346). **Mitigation:** forward-only additive migrations (never edit a shipped migration), post-load sanity `SELECT` against a known column, manual `schema_version` row in a `meta` table to refuse downgrade corruption.

4. **Zustand `persist` without `partialize` + `migrate` + `_hasHydrated` is a footgun.** Functions vanish, shape changes break old users, async rehydration races React renders. **Mitigation:** all 5 stores get `persist` with explicit `partialize`, `version: 1`, and a `migrate` stub in one phase. **Do NOT ship partial persistence.** Fix `rndStore` `INITIAL.p1` fallback accessor before persisting it (persistence would otherwise freeze the wrong-product-data bug).

5. **Tauri capabilities + CSP fail silently at build time.** Missing capability = runtime `invoke` rejection. Missing scope on `sql:allow-execute` = silent no-op. `csp: null` (current) -> tightening it later breaks Tailwind v4 inline styles + Radix + `motion/react` inline transforms. **Mitigation:** one capability file per feature (sql.json, llm.json) with explicit scope to `${appData}/nova.db`; smoke test each command from the webview in CI; declare CSP in the same phase as IPC migration with `style-src self unsafe-inline`, default-deny `script-src`, test against `tauri build` (not `tauri dev`).

**Other notable pitfalls:** API key bundled into binary still leaks (use keychain from day one), HITL state corruption on close-mid-approval (checkpoint at every interrupt, persist frontend pending-approval state, lock pipelines to main window), AppContext re-render worsens after persistence (finish AppContext removal before persisting — though PROJECT.md defers this; revisit if perf bites).

## Implications for Roadmap

The four research files independently converged on the same phase order. This is the load-bearing recommendation of the synthesis — the convergence is the signal.

### Phase 1: Dark Mode Wiring

**Rationale:** Smallest, lowest-risk win; clears existing tech debt (Phase 7 in CLAUDE.md); fully independent of persistence/IPC/PoC. `useTheme()` and the dark token set already exist — work is plumbing + a verification pass. Ships user-visible value fastest.
**Delivers:** Three-way toggle in Settings, quick-toggle in Header, smooth color transitions, dark-verified every Card variant and every view, GTK detection shim on Linux.
**Addresses features:** Theme toggle UI, dark palette verification, system theme live response, smooth color transitions.
**Avoids pitfall:** Critical Pitfall 1 (Linux `prefers-color-scheme` broken) — GTK detection lands in the same phase as system mode.
**Stack:** Zero new deps. Phosphor Sun/Moon, Radix Switch/Select/Tabs, `motion/react`, `useTheme()` hook, `tokens.css` dark variants.

### Phase 2: Persistence (Zustand `persist` + SQLite)

**Rationale:** Persistence must land before the GraphFlow PoC (PoC needs a SQLite pool for `SessionStorage`) and before the IPC migration (persisting bad data through migrated endpoints is worse than persisting through Express, which works today). Get the storage layer right while the existing API still gates writes.
**Delivers:** All 5 Zustand stores survive refresh; `partialize` drops transient flags; `version` + `migrate` stub set the convention; SQLite via `tauri-plugin-sql` for heavier stores with JSON-blob `kv_store` table; `_hasHydrated` flag prevents render-time flicker; `rndStore` accessor bug fixed before persisting.
**Addresses features:** Persistence on 5 stores, no data loss on schema migration.
**Avoids pitfalls:** Critical Pitfalls 2 (SQL migration silent failure — sanity SELECT + version table), 3 (persist serialization — partialize + migrate + hydration flag), `rndStore` INITIAL.p1 footgun.
**Stack:** `tauri-plugin-sql` 2.4.x + `@tauri-apps/plugin-sql`, `rusqlite` 0.40.x, `tauri-plugin-store` + ~20-line `tauriStorage` adapter, Zustand `persist` middleware.

### Phase 3: Tauri IPC Migration + Security Baseline

**Rationale:** Depends on Phase 2 persistence. Resolves the bundled-API-key and `csp: null` security debt in the same phase, because both are security-perimeter decisions that affect the same commands. Express shrinks to dev-only. The Channel-based streaming rewrite is the natural moment to add server-side cancellation.
**Delivers:** `lib/tauri.ts` adapter (single chokepoint), `AppError` enum + typed IPC, `Channel<StreamChunk>` for one streaming endpoint, `CancellationToken` for server-side cancellation, capabilities files per feature, strict CSP tested against `tauri build`, keyring-based API key with Settings onboarding, Express bound to `127.0.0.1` and removed from production bundle path.
**Addresses features:** AI streaming via Channel, in-flight server-side cancellation, AI errors as user messages, explicit CSP, API key out of bundle, progress events (P2 if time).
**Avoids pitfalls:** Critical Pitfalls 4 (Express->Tauri loses fetch semantics — `api.ts` shim + `AppError`), 5 (capabilities silent rejection — per-feature files + scope), 6 (key in bundle — keychain from day one), 7 (CSP null breaks later — declare now with `unsafe-inline` on style-src only).
**Stack:** `@tauri-apps/api` Channel, `keyring` 4.1.x direct, `rig-core` 0.41.x (pinned exact), `thiserror` for `AppError`.

### Phase 4: GraphFlow + Rig PoC (feature-flagged, last)

**Rationale:** Highest novelty. Zero production Tauri-embedding references for graph-flow — every example is HTTP/Axum. Design docs contain fabricated API claims (Critical Pitfall 9 + design-doc correction above). Must come last so its slip does not drag shipped features; everything else (persistence, IPC patterns, error handling) must be stable before introducing a pre-1.0 crate.
**Pre-work:** Correct ADR-002 (remove fabricated 99.99% / v1.4.2 claim, document pre-1.0 status, document Juncture non-existence, name fallback as `rust-langgraph` or hand-rolled FSM). Read docs.rs/graph-flow fresh.
**Delivers:** A 2-3 node pipeline (e.g., `analyze_requirements` -> WaitForInput -> `generate_prd`) with explicit exit criteria; one minimal "approve / reject" UI; sessions persist across app restart via in-house `SqliteSessionStorage`; close-app-mid-approval-then-resume demo works. Decision gate: if it lands, next milestone = expand to req -> PRD; if not, re-evaluate engine before sinking more time.
**Out of scope (ruthless):** full 10-node pipeline, 4 HITL gates, time-travel recovery, FanOut tasks, multi-concurrent runs, wiring PoC into existing product/rnd stores, multi-provider generalization (hardcode one provider behind a trait).
**Avoids pitfalls:** Critical Pitfall 8 (HITL state corruption — checkpoint at every interrupt, serialize resumes through tokio Mutex, lock to main window, cache LLM response in checkpoint), 9 (graph-flow version pin + trait isolation, document fallback).
**Stack:** `graph-flow` (exact pin), `rig-core` (already in Phase 3), custom `SqliteSessionStorage` impl over Phase 2 pool.

### Phase 5 (optional / if in scope): Distribution Hardening

**Rationale:** Only if PROJECT.md includes distribution in this milestone. `tauri build` succeeding locally is not the same as a shippable artifact.
**Delivers:** Code signing (Windows SmartScreen, macOS notarization), auto-updater configured, signed release artifact.
**Stack:** Tauri signing keys, updater JSON hosting.

### Phase Ordering Rationale

- **Why dark mode first:** zero dependencies, zero new tech, fastest user-visible win, clears tech debt flagged in CLAUDE.md. All three other phases are unaffected by its presence or absence.
- **Why persistence before IPC:** persisted bad data through migrated endpoints is worse than persisted data through Express (which works today). Storage layer must be right while the existing API still gates writes.
- **Why IPC and security baseline together:** both are security-perimeter decisions affecting the same commands; splitting them = two passes over every endpoint. Capabilities + CSP + keyring + AppError all land in one phase.
- **Why PoC last:** highest novelty, gated behind feature flag, depends on Phase 2 DB pool and Phase 3 IPC patterns + error handling. A slip here does not drag shipped features.
- **Why each phase is independently shippable:** each delivers user value (Phase 1: visible polish; Phase 2: data survives restart; Phase 3: streaming + security; Phase 4: PoC insight). No phase is "infrastructure only."

### Research Flags

**Phases likely needing deeper `/gsd:research-phase` during planning:**
- **Phase 4 (GraphFlow PoC):** HIGH research need. Pre-1.0 crate, novel Tauri embedding (no production reference), design docs are wrong. Needs fresh docs.rs/graph-flow read, `SessionStorage` trait surface verification, and an exit-criteria workshop before scoping.
- **Phase 3 (Tauri IPC):** MEDIUM research need. Streaming + cancellation + capabilities + CSP + keyring in one phase. Channel patterns and capability scoping warrant a focused read against current Tauri v2 docs (the platform is still evolving).

**Phases with standard patterns (skip deep research):**
- **Phase 1 (Dark mode):** Token system + `useTheme()` already exist. Standard wiring. The only non-obvious bit (Linux GTK detection) is documented in PITFALLS.md.
- **Phase 2 (Persistence):** Zustand `persist` is well-documented; the JSON-blob `kv_store` pattern is conventional. The `rndStore` accessor fix is a codebase concern, not a research concern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Tauri plugins, Rig, keyring, rusqlite all verified against official docs. Only graph-flow version surface is uncertain (see Cross-File Discrepancy below). |
| Features | HIGH | Dark mode / persistence / IPC are well-trodden territory. GraphFlow PoC scope is MEDIUM (judgment, not standard). |
| Architecture | HIGH | Patterns verified against Tauri v2 docs. MEDIUM on the GraphFlow-in-Tauri embedding pattern (no production reference exists). |
| Pitfalls | HIGH | Most pitfalls backed by GitHub issues + WebKit bug trackers. GraphFlow pitfalls MEDIUM (pre-1.0 crate, sparse production reports). |

**Overall confidence:** HIGH for Phases 1-3. MEDIUM for Phase 4 (GraphFlow PoC) — by design; the PoC job is to convert MEDIUM into HIGH or pivot.

### Gaps to Address

- **Cross-file discrepancy on `graph-flow` version:** STACK.md and PITFALLS.md say 0.6.x; ARCHITECTURE.md says 0.2.x. Both files independently verified against docs.rs and crates.io. **Resolution:** whichever is current at Phase 4 kickoff wins — re-check crates.io/graph-flow and pin exact. Either way it is pre-1.0; the conclusion (PoC scope, trait isolation, fallback ready) holds regardless.
- **Design docs are unreliable on GraphFlow.** `docs/ARCHITECTURE.md`, `docs/PIPELINE_DESIGN.md`, `docs/DECISIONS.md` (ADR-002), and `docs/TECH_STACK.md` (Juncture reference) contain fabricated API surface and a fabricated maturity claim. **Action before Phase 4:** correct ADR-002, remove Juncture references, add a "design docs are intent not spec for GraphFlow" warning. Phase 4 scope comes from docs.rs only.
- **GraphFlow embedding in Tauri is novel.** No production reference exists. The PoC must verify three things: (a) `FlowRunner` plays well with Tauri tokio runtime, (b) `WaitForInput` works across separate `invoke` calls, (c) in-house `SessionStorage` survives restart. Have a sidecar fallback plan if embedding fails (violates zero-sidecar principle but unblocks the feature).
- **Multi-window capability scope** is acknowledged but unverified — the current app is single-window. If multi-window lands, capabilities must be window-label-scoped.
- **Auto-updater / code signing** is out of scope for this research pass. If Phase 5 (Distribution) is in the milestone, it needs its own research.

## Sources

Aggregated from the four research files. See each file for the full source table with per-source confidence.

### Primary (HIGH confidence)
- Tauri v2 official docs — Calling Rust/Frontend, SQL plugin, Store plugin, CSP, Capabilities, Permissions, Code Signing
- docs.rs/rig-core, docs.rig.rs — provider list, streaming API
- docs.rs/graph-flow, crates.io/graph-flow, github.com/a-agmon/rs-graph-llm — actual API surface (`Task`, `TaskResult`, `NextAction`, `FlowRunner`, `SessionStorage` trait; no `SqliteSaver`, no `interrupt!`)
- docs.rs/rusqlite, docs.rs/keyring — current versions
- GitHub issues — tauri#9427 (Linux theme), wry#884, WebKit #196685, plugins-workspace #509/#1346/#3536
- Apple HIG Dark Mode, NN/g dark-mode user research, Zustand v5 migration docs

### Secondary (MEDIUM confidence)
- Reddit r/rust — Tauri API key storage consensus, graph-flow author introduction post
- Dev.to tutorials — Tauri 2 SQLite + React, IPC commands vs events, dark-mode three-way switch
- tauri-plugin-keyring (HuakunShen) — community plugin, evaluated and rejected in favor of direct `keyring` crate

### Tertiary (LOW confidence — flagged for validation)
- GraphFlow production usage reports — **none found** beyond author own posts; this is the core reason Phase 4 is PoC-scoped
- "Juncture" rust crate named in `docs/TECH_STACK.md` — **no results found** in any search; treat as documentation error, do not plan around it
- `docs/DECISIONS.md` ADR-002 GraphFlow stability claim — **fabricated**; correct before Phase 4

---
*Research completed: 2026-08-08*
*Ready for roadmap: yes*
