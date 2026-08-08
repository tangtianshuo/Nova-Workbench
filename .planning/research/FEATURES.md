# Feature Research

**Domain:** AI-native PM desktop workbench (Tauri v2 + React 19) — milestone on existing v0.1.0 app, adding dark mode, Tauri-native IPC, persistence, and a GraphFlow PoC.
**Researched:** 2026-08-08
**Confidence:** HIGH for dark mode / persistence / Tauri IPC patterns (official docs + well-trodden territory). MEDIUM for GraphFlow PoC scope (the crate is itself a 2025 PoC; what "validates the path" is judgment, not a documented standard).

## Scope of This Research

Nova v0.1.0 already ships the UI shell, design tokens, Zustand stores, and Express+Gemini AI. This milestone adds four capabilities on top of that surface. This document does **not** re-litigate what's already built — it categorizes only the **new** feature work.

The five research questions map to features as follows:

| Question | Feature area |
|---|---|
| 1. Dark mode UX | Theme toggle, system-theme listener, transition polish |
| 2. Tauri IPC for AI | Streaming chat command, progress events, cancellation, error surfacing |
| 3. Local persistence | Auto-save layer, schema migration, store-level hydration |
| 4. GraphFlow + Rig PoC | Minimum-viable Rust workflow run + HITL interrupt |
| 5. Tauri security baseline | CSP, capability scoping, API-key handling |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the app reads as broken, half-built, or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Three-way theme toggle (Light / Dark / System)** in Settings | Apple HIG pattern; every native Mac PM tool (Things, Linear, Notion) ships this. A binary toggle or "follow system only" feels limited. NN/g research shows users treat dark mode like brightness — they want it global and predictable. | LOW | `useTheme()` already implements all three modes + system listener. **Work is wiring UI**: a `Select` or `Tabs` in `SettingsView` "appearance" section calling `setTheme('light'\|'dark'\|'system')`. ~1 day. |
| **Quick theme toggle in Header** | One-click flip without navigating to Settings. Standard in macOS menu bar apps and most Apple-style productivity tools. | LOW | Header already exists. Add a single icon button (Sun/Moon phased icon from Phosphor) calling `toggle()`. ~2 hours. |
| **System theme change responds live** when set to "system" | Users expect: change OS appearance → app follows within seconds without restart. Apple apps do this natively; web apps that miss it feel broken. | LOW (already built) | `useTheme.ts` already registers `matchMedia('change')` listener. Verify it still works after wiring UI. No new code. |
| **Smooth color transition when switching themes** | Hard color flips look cheap; Apple apps fade. `transition: background-color 150ms` on token-driven surfaces is the floor. | LOW | Add a scoped CSS transition in `tokens.css` (or a Tailwind utility class) on `background-color`, `border-color`, `color` for body/cards. Watch out: transitioning `box-shadow` can flicker — leave it unanimated. |
| **Dark palette actually works on every view** | "Dark mode that shows white cards" is the #1 reported dark-mode bug across desktop apps. Shadows disappear, borders vanish, glass effects look wrong. | MEDIUM | Token system already exists. Work is **verification pass**, not new design: open every view + each Card variant (`default/elevated/glass/interactive/dark`) in dark mode, fix token misses. CLAUDE.md already calls out "verify shadows/glass/borders." ~1-2 days of pixel work. |
| **Persistence: state survives app restart** | The single biggest gap in v0.1.0 per `CONCERNS.md`. A "desktop PM tool" that loses all products/tasks on refresh is not a tool — it's a demo. Users will not tolerate this. | MEDIUM | `zustand/middleware` `persist` on 5 stores + localStorage. Use `partialize` to drop transient flags (`isGenerating`, `modalOpen`, etc.). Add `version: 1` + a `migrate` stub now even if empty — future-you will thank you. ~1 day for plumbing across 5 stores. |
| **No data loss on schema migration** | App updates that wipe user products = trust destroyed. Migration is table stakes for any persistence layer, not a nice-to-have. | MEDIUM | Two layers: (a) Zustand `version` + `migrate` for shape changes; (b) when SQLite lands later, `tauri-plugin-sql` ships a migration system. Set the convention now (version field, migrate stub) so the SQLite move is mechanical. |
| **AI call cancellation** | Currently `rndStore` has no `AbortController` — "generate all deliverables" stacks Gemini requests with no way to stop. Users will spam-click and expect a Stop button. | LOW | Track an `AbortController` per in-flight call; expose `cancelGeneration(productId)` action; UI shows "Stop" button when `status === 'generating'`. Whether the call routes through Express or Tauri IPC, the controller lives client-side. |
| **AI errors surface as user-facing messages, not blank screens** | Today `JSON.parse` failures on Gemini output throw a 500 with raw error (CONCERNS.md). Users see nothing or an opaque crash. Every AI tool shows "AI had trouble, try again." | LOW | Wrap the parse + network call in try/catch, return `{ ok: false, error: 'human message' }`. ~half day. Independent of where the call lives. |
| **Explicit CSP in Tauri production build** | `csp: null` ships a webview with zero injection protection. Not "best practice" — it's the floor for any distributed app, even single-user. Tauri's own docs treat CSP as required-by-default. | LOW | Define a strict CSP in `tauri.conf.json`: `default-src 'self'`, `connect-src` to your LLM provider origin + `ipc:` + dev server, `style-src 'self' 'unsafe-inline'` (Tailwind needs inline), `img-src 'self' data: blob:`, `script-src 'self'`. Test against actual fetches. ~half day. |
| **API key not bundled into the app binary** | Shipping `GEMINI_API_KEY` baked into a Tauri bundle is a leak waiting to happen — anyone unzipping the app reads it. Hard requirement for distribution. | MEDIUM | Two viable paths: (1) OS keychain via `tauri-plugin-biometry` or the Rust `keyring` crate, populated on first-run prompt; (2) require user to paste key into Settings, store in keychain, read at call time. Both unblock removing dotenv from prod. Path (2) is the minimum bar. |

### Differentiators (Competitive Advantage)

These are where Nova earns its "AI-native PM agent" positioning vs Linear/Notion/Things. Not required for "working app," but required for the value prop.

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **AI streaming via Tauri Channel (token-by-token)** | Tauri v2 `Channel<T>` is the recommended pattern for streaming. Chat that types out token-by-token feels 10x faster than batch HTTP — perceived latency drops from "wait 8 seconds" to "first token in 500ms, rest streams." This is the moment "AI native" stops being marketing. | MEDIUM | Rust command takes a `Channel<StreamChunk>`, frontend passes `new Channel()` callback. Replaces today's Express POST + wait. Pattern is well-documented in Tauri v2 docs. ~2-3 days for one streaming endpoint (start with `/generate-project` or a new chat). |
| **In-flight AI cancellation (server-side)** | Today's "abort" only stops the client wait — Express keeps burning Gemini tokens. Moving to Tauri IPC lets a Rust `CancellationToken` actually halt the upstream LLM call. Cost + UX win. | MEDIUM | Comes free with the streaming-channel rewrite: pass a `CancellationToken` into the LLM future, expose a `cancel_chat(run_id)` command. Worth doing in the same phase as streaming, not separately. |
| **Progress events for long-running AI ops** | Beyond chat tokens: "generating 5 deliverables in batch" should emit per-item progress (`{item: 2/5, status: 'generating'}`) so UI shows a real progress bar instead of a spinner. | LOW-MEDIUM | `app.emit("pipeline-progress", payload)` + frontend `listen()`. Different mechanism from channels (events are broadcast, channels are 1:1). Use events for pipeline-level progress, channels for token streaming. |
| **Rust-native LLM call via Rig (multi-provider)** | Rig abstracts Claude/GPT/Gemini/Ollama behind one trait. Once the call lives in Rust, swapping providers is config, not code rewrite. Apple-style "just works" multi-provider is rare in PM tools. | MEDIUM-HIGH | Belongs in the GraphFlow PoC phase, not before — Rig's value is best validated by actually driving a workflow node. Don't pre-build a Rig wrapper that has no caller. |
| **GraphFlow HITL PoC (single workflow + interrupt + resume)** | The differentiator the whole milestone exists to validate. Proof that a Rust-native workflow engine can pause for human input, persist its state, and resume — in a desktop shell. Nothing on the market does this Rust-native today. | HIGH | See "PoC scope" below — keep it ruthlessly minimal. |
| **SqliteSaver checkpoint persistence** | GraphFlow's built-in checkpointer. Once wired, "crash mid-pipeline, resume from last HITL node" is free. No PM tool survives a crash mid-PRD-generation today. | MEDIUM | Lands as part of the PoC: GraphFlow + SqliteSaver + one interrupt node. ~3-5 days once GraphFlow is integrated. |
| **Local-first data sovereignty** | "All your PRDs/code/tests live in SQLite on your machine, never on our servers" is a real differentiator vs cloud-only PM tools. Design doc already commits to this. | LOW (messaging) / MEDIUM (delivery) | Mostly delivered for free by the SQLite persistence work. The differentiator is *saying it clearly* in onboarding — that's product/UX, not engineering. |

### Anti-Features (Commonly Requested, Often Problematic)

Things that look like they belong in this milestone but should be **explicitly deferred** per PROJECT.md's Out of Scope.

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Full LanceDB vector search ("second brain")** | Design doc lists it as Phase 4; tempting to spike early since SQLite is being wired anyway. | Doubles the persistence surface (new DB engine, embedding pipeline, ingestion jobs) before the basic SQLite layer is proven. PoC scope creep kills milestones. | Ship SQLite + persistence this milestone. LanceDB is its own milestone when "search my notes" becomes a real user ask. |
| **Full PM Pipeline (req → PRD → proto → code → test)** | PIPELINE_DESIGN.md specifies it; users will ask "does it actually generate code yet?" | 10 nodes, 4 conditional loops, 5 interrupt points. Building all of it on an unproven engine = months of work with no off-ramp if GraphFlow can't carry the load. | Build **one** minimal end-to-end flow (e.g., 2 nodes + 1 interrupt) as the PoC. If it lands, expand in next milestone. |
| **Multi-window conflict resolution (CRDT / last-write-wins UI)** | "What if user opens two windows and edits the same product?" Asks for Figma-style multiplayer semantics. | Single-user local app with localStorage has no real concurrency. Multi-window write conflicts are a Phase-N problem nobody has hit yet. YAGNI. | Last-write-wins on store update is fine for v1. Document as known limit. Add real CRDT only when multi-window is actually used. |
| **Cloud sync / multi-device** | "I want my products on my laptop and phone." | Triggers auth, transport, conflict model, server infra. Whole company-level scope. | Local-first is the design principle. Sync is a future milestone with its own research pass. |
| **Custom Rig provider plugin system** | "Let users register their own LLM provider." | Plugin systems are 10x the work of supporting 4 hardcoded providers. Premature abstraction. | Hardcode Claude/GPT/Gemini/Ollama via Rig's built-in support. Add plugin system only when a user actually needs a 5th. |
| **Per-view dark mode override** | "Let me set Product view to dark but keep Schedule light." | No user has asked for this. Adds a settings UI + per-view token scoping for zero real value. Complicates the mental model NN/g warned about. | One global theme. Period. |
| **AppContext full removal in this milestone** | Tech debt, looks like cleanup that should fit. | 30+ files consume `useApp()`. Touching all of them mid-feature-work = merge conflicts and regression risk. | Out of Scope per PROJECT.md. Migrate opportunistically as each view is touched, but don't make it a milestone goal. |
| **URL routing / deep links / browser back-button** | Feels like a basic web-app feature. | Custom `activeTab` state works for a single-window desktop app. Retrofitting react-router touches every view + the lazy-load setup. No user need yet. | Keep `activeTab` state. Defer router until a feature actually needs URL state (sharing links, deep linking from notifications). |
| **Multi-user collaboration on the SQLite store** | "Share a product with my team." | Requires auth, transport, conflict resolution, server. Multi-month scope. | Single-user local. Multi-user is a different product. |

---

## Feature Dependencies

```
[Theme toggle UI] ──(uses)──> useTheme() [ALREADY BUILT]
[Theme transition polish] ──(after)──> [Theme toggle UI]
[Dark palette verification] ──(after)──> [Theme toggle UI]

[Persistence: Zustand persist + localStorage] ─┐
                                                ├──> [No data loss on restart]
                                                │
[Persistence: schema version + migrate stub] ──┘

[AI cancellation client-side] ──(independent)──> works on Express OR Tauri IPC

[Tauri IPC streaming channel] ─┐
                                ├──> [AI errors surface user-facing]
[Tauri CSP]                     │   (rewrite is the moment to add error handling)
[Tauri keychain for API key]   ─┘

[GraphFlow + Rig integration] ─┐
                                ├──> [SqliteSaver checkpoint persistence]
[Tauri SQL plugin]              │   (GraphFlow's SqliteSaver needs SQLite)
[One workflow + interrupt] ────┘

[GraphFlow PoC] ──(unblocks decision)──> [Full Pipeline future milestone]
[GraphFlow PoC] ──(unblocks decision)──> [LanceDB second-brain future milestone]
```

### Dependency Notes

- **Persistence must land before GraphFlow PoC.** GraphFlow's `SqliteSaver` needs SQLite wired; SQLite wiring is also the right moment to introduce the `version` + `migrate` convention that Zustand persistence will reuse. Order: Zustand persist (smallest, unblocks UX value) → SQLite via Tauri SQL plugin → GraphFlow PoC.
- **Tauri IPC streaming and AI cancellation should ship together.** The Channel-based rewrite is the natural moment to add `CancellationToken` server-side. Doing them in separate phases means rewriting the same code twice.
- **Tauri CSP + keychain must precede any production build.** They are not blocked by features — they can be done independently, but the build cannot ship without them. Pair them in a "security baseline" phase.
- **Dark mode is fully independent.** No dependency on persistence, IPC, or PoC. Ship first for fastest user-visible value.
- **GraphFlow PoC blocks the next milestone's scope decision.** If PoC fails (engine can't carry HITL cleanly, or Rig integration is rough), the entire design-doc target architecture needs re-evaluation. This is the highest-risk item — schedule it last so its slip doesn't drag other shipped features.
- **AI cancellation (client-side only) does NOT require Tauri IPC.** Can ship against current Express layer as a stopgap. But doing it twice (once on Express, once on Tauri) is waste — if Tauri IPC lands in the same milestone, do it once.

---

## MVP Definition

### Launch With (v1 of this milestone)

Minimum to call this milestone done. Maps to roughly 4 phases.

- [ ] **Dark mode UI wired** — Settings three-way toggle + Header quick-toggle. Tokens already exist; this is plumbing.
- [ ] **Dark palette verification pass** — every Card variant + every view checked in dark mode, token misses fixed.
- [ ] **Zustand persistence on 5 stores** — `persist` middleware with `partialize` (drop transient flags) and `version: 1` + empty `migrate` stub. State survives restart.
- [ ] **AI cancellation client-side** — `AbortController` tracked per call, Stop button in UI.
- [ ] **AI errors as user messages** — try/catch around parse + network, return human-readable errors.
- [ ] **Tauri CSP declared** — strict policy in `tauri.conf.json`, tested against actual origins.
- [ ] **API key out of bundle** — keychain (or first-run prompt into keychain), no dotenv in prod.
- [ ] **Tauri IPC streaming for one AI endpoint** — pick one (recommend `/generate-project` or a new chat endpoint) and rewrite as Rust command + Channel. Validates the IPC path.
- [ ] **GraphFlow + Rig minimal PoC** — one workflow (2 nodes), one `interrupt!`, SqliteSaver persistence, resume after interrupt. Decision gate for next milestone.

### Add After Validation (v1.x)

- [ ] **All 5 AI endpoints migrated to Tauri IPC** — once one endpoint proves the pattern, the rest is mechanical.
- [ ] **Progress events for batch AI ops** — `pipeline-progress` event emission, progress bar UI.
- [ ] **More workflow nodes** — expand PoC into a real req → PRD flow once GraphFlow proves out.
- [ ] **SQLite as primary store** — migrate Zustand-persisted data to SQLite via Tauri SQL plugin, keep Zustand as cache layer.

### Future Consideration (v2+)

- [ ] **LanceDB vector search / second brain** — its own milestone after SQLite is stable.
- [ ] **Full PM Pipeline** — all 10 nodes from PIPELINE_DESIGN.md.
- [ ] **Multi-window + conflict resolution** — only if real usage emerges.
- [ ] **Cloud sync** — separate product decision.
- [ ] **AppContext removal** — opportunistic, not milestone-scoped.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Theme toggle UI wiring | HIGH (visible) | LOW | P1 |
| Dark palette verification | HIGH (visible quality) | MEDIUM | P1 |
| Zustand persist on 5 stores | HIGH (fixes "loses my data") | MEDIUM | P1 |
| AI errors as user messages | MEDIUM | LOW | P1 |
| AI cancellation client-side | MEDIUM | LOW | P1 |
| Tauri CSP | LOW (invisible until attack) | LOW | P1 |
| API key out of bundle | LOW (invisible) | MEDIUM | P1 |
| Tauri IPC streaming (1 endpoint) | HIGH (perceived perf) | MEDIUM | P1 |
| GraphFlow + Rig + interrupt PoC | HIGH (validates architecture) | HIGH | P1 (last) |
| SqliteSaver checkpoints | MEDIUM | MEDIUM | P1 (part of PoC) |
| All 5 endpoints on Tauri IPC | MEDIUM | MEDIUM (mechanical) | P2 |
| Progress events | MEDIUM | LOW | P2 |
| SQLite as primary store | MEDIUM | MEDIUM | P2 |
| LanceDB vector search | HIGH (future) | HIGH | P3 |
| Full PM Pipeline | HIGH (future) | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone
- P2: Add once core P1 lands
- P3: Future milestone, explicitly deferred

---

## PoC Scope: GraphFlow + Rig (Special Section)

This is the highest-risk, highest-uncertainty feature. Defining what "done" means for the PoC up front prevents scope creep.

### What the PoC Must Demonstrate (validates the architecture path)

1. **GraphFlow integrates into Tauri Rust backend** — `Cargo.toml` depends on `graph-flow`, a `StateGraph` builds and compiles.
2. **Rig LLM call works from inside a node** — at least one node calls `rig::client::*` and gets a real LLM response (provider: pick whichever has a free tier, default Gemini since key already exists).
3. **`interrupt!` pauses execution and surfaces to frontend** — a node triggers interrupt, Tauri command returns "paused" status with interrupt payload, frontend renders an approval card.
4. **Resume after human input** — second Tauri command submits the human decision, GraphFlow resumes from the interrupt, runs next node, completes.
5. **SqliteSaver persists state across app restart** — start a workflow, hit interrupt, **close the app**, reopen, resume from where it paused. This is the killer demo.
6. **State is typed** — `PmPipelineState` (or simpler) is a real Rust struct, not `serde_json::Value` everywhere. Compile-time guarantees on field access.

### What the PoC Must NOT Do (scope creep traps)

- Do **not** build all 10 nodes from PIPELINE_DESIGN.md. Two nodes + one interrupt is enough.
- Do **not** build the full frontend approval UI. A minimal "approve / reject" button pair is enough to prove the round-trip.
- Do **not** wire the PoC into existing product/rnd stores yet. PoC runs in isolation; integration is next milestone.
- Do **not** support multiple concurrent workflow runs. Single run, single user.
- Do **not** generalize the LLM provider yet. Hardcode one provider behind a trait, worry about multi-provider later.

### Working Features That Typically Emerge From Such PoCs

Based on comparable Rust workflow-engine PoCs (LangGraph4Rust, rs-graph-llm, GraphFlow's own examples):

- A "run workflow" button that visibly steps through nodes
- A persisted run that survives restart (the demo that sells the architecture)
- An approval card pattern reusable for all future HITL nodes
- A `StateGraph` definition file that becomes the template for the real Pipeline
- Confidence (or refusal) to commit the next milestone to building the full Pipeline on this engine

If the PoC lands cleanly: next milestone = expand to req → PRD. If it's rough: re-evaluate engine choice before sinking more time.

---

## Competitor / Comparable Feature Analysis

Not direct competitors (Nova's "AI-native PM desktop agent" niche is thin), but reference points for what users expect.

| Feature | Linear (web) | Notion (web/desktop) | Things 3 (macOS) | Raycast (macOS) | Nova's Plan |
|---|---|---|---|---|---|
| Three-way theme toggle | Light/Dark/System | Light/Dark/System | System only (follows OS) | Light/Dark/System | Light/Dark/System (matches Linear/Notion/Raycast) |
| Quick theme switch | Profile menu | Settings | N/A (OS-level) | Single command | Header icon button |
| Local persistence | Cloud | Cloud + local cache | Local (Core Data) | Local | Local-first (SQLite) |
| AI streaming | Token stream | Token stream | N/A | Token stream | Tauri Channel stream |
| AI cancellation | Stop button | Stop button | N/A | Cmd+. | Stop button + server-side cancel |
| HITL workflow | No | No | No | No (extensions are atomic) | GraphFlow interrupt (differentiator) |
| Multi-provider LLM | OpenAI only | OpenAI only | N/A | OpenAI only | Rig multi-provider (differentiator) |

**Takeaway:** Theme + streaming + cancellation are table stakes — every modern AI-aware tool has them. The HITL workflow and multi-provider are where Nova can actually differentiate. Don't try to out-polish Linear on theme; ship parity and invest the differentiated effort in GraphFlow.

---

## Sources

### Official Documentation (HIGH confidence)
- [Tauri v2 — Calling Rust from the Frontend](https://v2.tauri.app/develop/calling-rust/) — Channels API for streaming
- [Tauri v2 — Calling the Frontend from Rust](https://v2.tauri.app/develop/calling-frontend/) — Events / emit
- [Tauri v2 — CSP](https://v2.tauri.app/security/csp/) — Content Security Policy
- [Tauri v2 — Capabilities](https://v2.tauri.app/security/capabilities/) — Permission scoping
- [Tauri v2 — SQL Plugin](https://v2.tauri.app/plugin/sql/) — SQLite + migrations
- [Tauri v2 — Store Plugin](https://v2.tauri.app/plugin/store/) — Key-value persistence (NOT for secrets)
- [Apple HIG — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) — macOS dark-mode conventions
- [Zustand — persist middleware](https://zustand.docs.pmnd.rs/reference/middlewares/persist) — `partialize`, `version`, `migrate`
- [graph-flow crate](https://crates.io/crates/graph-flow) — Workflow engine reference
- [rs-graph-llm (GraphFlow source)](https://github.com/a-agmon/rs-graph-llm) — Upstream

### Community / Tutorials (MEDIUM confidence)
- [IPC in Tauri: Commands vs Events](https://dev.to/hiyoyok/ipc-in-tauri-tauri-commands-vs-custom-ipc-what-to-use-when-2ab4) — When to use which mechanism
- [Dark Mode Three-Way Switch](https://dev.to/colinaut/dark-mode-three-way-switch-40e) — UX rationale for three options
- [NN/g — Dark Mode: How Users Think About It](https://www.nngroup.com/articles/dark-mode-users-issues/) — Mental model research
- [Tauri 2.0 SQLite + React tutorial](https://dev.to/focuscookie/tauri-20-sqlite-db-react-2aem) — Plugin usage
- [Figma — Behind the Feature: Autosave](https://www.figma.com/blog/behind-the-feature-autosave/) — Multi-window / concurrent edit lessons
- [Reddit r/rust — Safest way to store API keys in Tauri](https://www.reddit.com/r/rust/comments/1ia29hp/safest_way_to_store_api_keys_for_production_tauri/) — Keychain consensus
- [tauri-plugin-biometry](https://crates.io/crates/tauri-plugin-biometry) — OS keychain integration

### Project-Internal Sources
- `.planning/PROJECT.md` — Active requirements + Out of Scope
- `.planning/codebase/CONCERNS.md` — Tech debt + bugs being addressed
- `docs/ARCHITECTURE.md` — Target architecture (8 locked ADRs)
- `docs/PIPELINE_DESIGN.md` — Full Pipeline spec (deferred to future milestone)
- `src/hooks/useTheme.ts` — Existing three-way theme hook (already built)
- `src/styles/tokens.css` — Dark token set (already defined)
- `src-tauri/tauri.conf.json` — Current `csp: null` (debt to clear)

---
*Feature research for: AI-native PM desktop workbench — dark mode + Tauri native capabilities milestone*
*Researched: 2026-08-08*
