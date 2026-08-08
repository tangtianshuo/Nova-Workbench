# Roadmap: Nova PM Workspace

## Overview

Four-phase v1 milestone that converts Nova v0.1.0 from a polished UI shell with in-memory state and an Express AI proxy into a native Tauri desktop agent: wire dark mode (clears tech debt), land SQLite + Zustand persistence (fixes "refresh = reset"), migrate AI calls to Tauri IPC with a real security perimeter (kills bundled API key + `csp: null`), and gate a feature-flagged GraphFlow + Rig PoC behind an explicit decision point. Each phase is independently shippable user value — no infrastructure-only phases. Phase 5 (Distribution Hardening) is intentionally out of scope per PROJECT.md and deferred to the next milestone.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Dark Mode Wiring** - Three-way theme toggle, palette verification, Linux GTK detection shim (completed 2026-08-08)
- [ ] **Phase 2: Persistence (Zustand persist + SQLite)** - All 5 stores survive refresh, fix rndStore bug, SQLite layer
- [ ] **Phase 3: Tauri IPC Migration + Security Baseline** - Channel streaming, keychain API key, CSP, capabilities
- [ ] **Phase 4: GraphFlow + Rig PoC (feature-flagged)** - 2-3 node HITL pipeline with restart-resume decision gate

## Phase Details

### Phase 1: Dark Mode Wiring
**Goal**: Users get a working three-way dark mode across the whole app, clearing the v0.1.0 Phase 7 tech debt
**Depends on**: Nothing (first phase)
**Requirements**: DARK-01, DARK-02, DARK-03, DARK-04, DARK-05, DARK-06, DARK-07
**Success Criteria** (what must be TRUE):
  1. User can switch theme to Light / Dark / System from Settings and the entire app reflects the choice immediately
  2. User can quick-toggle theme from the Header with one click (cycles light/dark, or pops a menu)
  3. When the OS theme changes while in System mode, Nova follows it live (no restart) — including on Linux GNOME/KDE via a GTK detection shim (manual override wins over detection)
  4. Every Card variant (default/elevated/glass/interactive/dark) and every one of the 11 views + 16 product sub-components renders with correct contrast in dark mode (no white-on-white, invisible borders, or missing tokens)
  5. Theme switches animate smoothly with no flash of unstyled or wrong-themed content
**Plans**: 4 plans
- [x] 01-01-PLAN.md — themeStore + Linux GTK detection shim (Wave 1)
- [x] 01-02-PLAN.md — SettingsView SegmentedControl + Header quick-toggle (Wave 2)
- [x] 01-03-PLAN.md — CSS color transitions in tokens.css (Wave 1)
- [x] 01-04-PLAN.md — Card dark variant rework + 47-component audit (Wave 2)
**UI hint**: yes

### Phase 2: Persistence (Zustand persist + SQLite)
**Goal**: App state survives refresh and restart; the rndStore fallback bug is fixed before persistence freezes it
**Depends on**: Phase 1
**Requirements**: PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04, PERSIST-05, PERSIST-06, PERSIST-07, PERSIST-08, PERSIST-09
**Success Criteria** (what must be TRUE):
  1. After refresh or app restart, all 5 Zustand stores (task/product/rnd/schedule/workspace/ui) restore their data verbatim — no empty screens, no lost work
  2. Transient flags (modal open, loading spinner, selected tab) do NOT survive a restart — only real data does
  3. First run on a clean machine seeds from `mock*.ts` once (gated by `has_seeded`); subsequent runs never re-seed and never silently lose data on schema migration
  4. Render hydration is flicker-free: the app shows a loading state until `_hasHydrated` flips, then paints the real data
  5. The known `rndStore` `INITIAL.p1` fallback bug is fixed (verified by the existing repro) BEFORE persistence ships — so the bug is not frozen into stored state
**Plans**: 4 plans
- [x] 02-01-PLAN.md — Fix rndStore INITIAL.p1 fallback bug (Wave 1, mandatory pre-req per PERSIST-08)
- [x] 02-02-PLAN.md — Stand up SQLite substrate: tauri-plugin-sql + adapter + dev fallback + capability + migration (Wave 1)
- [x] 02-03-PLAN.md — Wrap all 6 Zustand stores in persist with partialize + _hasHydrated + migrate stub (Wave 2)
- [x] 02-04-PLAN.md — Wire startup orchestration: first-run seed (has_seeded gate) + HydrationGate + main.tsx await (Wave 3, has checkpoint)
**UI hint**: yes

### Phase 3: Tauri IPC Migration + Security Baseline
**Goal**: AI calls move to Tauri IPC with Channel streaming, the API key leaves the bundle via OS keychain, and the production build gets a real CSP — closing the security perimeter in one phase
**Depends on**: Phase 2
**Requirements**: IPC-01, IPC-02, IPC-03, IPC-04, IPC-05, IPC-06, IPC-07, IPC-08, IPC-09, IPC-10, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07
**Success Criteria** (what must be TRUE):
  1. User sees live token streaming on at least one AI endpoint (e.g., `/generate-project` or chat) in the Tauri desktop build, and the same UI works in dev/web via the `lib/tauri.ts` adapter's `fetch` fallback (dev/prod parity preserved)
  2. User can click Stop mid-generation to cancel an in-flight AI request; the button is disabled while a request is active (no request stacking)
  3. When an AI call fails (network, parse, truncation), the user sees a human-readable message (toast or inline) instead of a swallowed 500
  4. On first launch, the user is prompted in Settings to enter their LLM API key; it is stored in the OS keychain (not `.env`, not the bundle, never exposed to the webview) and read silently on subsequent launches
  5. The production Tauri build ships with an explicit CSP (`style-src self unsafe-inline`, `script-src` default-deny) verified against `tauri build` (not dev), and each Tauri command is reachable from the webview without silent capability rejection — verified against the actual built artifact
**Plans**: TBD
**UI hint**: yes

### Phase 4: GraphFlow + Rig PoC (feature-flagged)
**Goal**: A minimal, trait-isolated GraphFlow + Rig PoC validates (or invalidates) the Rust-native HITL workflow engine as the foundation for the next milestone's full PM Pipeline — gated behind a feature flag so its outcome does not block shipped features
**Depends on**: Phase 3
**Requirements**: POC-01, POC-02, POC-03, POC-04, POC-05, POC-06, POC-07, POC-08
**Success Criteria** (what must be TRUE):
  1. The design-doc GraphFlow fabrications are corrected: ADR-002 is rewritten to record the crate's actual pre-1.0 status, the "Juncture" reference is removed, and Phase 4 scope is derived from docs.rs/graph-flow (not `docs/ARCHITECTURE.md` / `docs/PIPELINE_DESIGN.md`)
  2. With the `NOVA_PIPELINE_POC` feature flag ON, a user can run a 2-3 node pipeline (e.g., `analyze_requirements` → WaitForInput → `generate_prd`), receive a HITL approval prompt in a minimal UI, approve it, and see the pipeline complete
  3. The user can close the app mid-approval, reopen it, and resume the pipeline from its checkpoint (proving the in-house `SqliteSessionStorage` survives restart — the core embedding risk)
  4. With the feature flag OFF (default), the rest of the app behaves identically to the end of Phase 3 — the PoC introduces zero user-visible risk
  5. Decision gate reached with a written verdict: PoC lands → next milestone expands to full req→PRD pipeline; PoC fails → engine selection re-evaluated (rust-langgraph / hand-rolled FSM / sidecar fallback) before sinking more time
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Dark Mode Wiring | 4/4 | Complete   | 2026-08-08 |
| 2. Persistence (Zustand persist + SQLite) | 2/4 | In Progress|  |
| 3. Tauri IPC Migration + Security Baseline | 0/TBD | Not started | - |
| 4. GraphFlow + Rig PoC (feature-flagged) | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-08*
*Granularity: coarse (4 phases)*
*Coverage: 41/41 v1 requirements mapped, 0 unmapped*
