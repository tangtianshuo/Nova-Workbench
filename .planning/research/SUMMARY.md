# Research Summary — v0.3.0 功能闭环 (Agent Feature Loop)

**Project:** Nova-PM-Workspace | **Synthesized:** 2026-08-14 | **Inputs:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

## Executive Summary

v0.3.0 is an integration milestone, not a technology milestone. All four research streams converge on the same headline: **almost nothing new needs to be installed**. The single new dependency is `@radix-ui/react-context-menu` (~12 KB, same primitive family as the existing DropdownMenu). Zero new Rust crates, zero config changes, zero new tooling. FTS5 is verified compiled into the exact SQLite binary this project ships (read from vendored `libsqlite3-sys-0.30.1/build.rs`: SQLite 3.46.0 with `-DSQLITE_ENABLE_FTS5`), so long-term memory retrieval is pure SQL against the existing `nova.db`.

The correct architecture keeps everything on the JS side: event log, confirmations, memory, and knowledge tables are new SQLite tables written from TypeScript via `tauri-plugin-sql`, with DDL in the existing forward-only Rust migration files. Rust `llm.rs` stays untouched. The keystone refactor is making `toolLoop.ts` write every step to the event log and **deriving the LLM messages array from the ChatSession projection** — the current code maintains two divergent histories (a latent bug), and the refactor collapses them into one write path.

The dominant risks are all invariants, not unknowns: double-execution of tool calls after restore (never auto-execute orphaned tool_calls + hash-guarded idempotent consume), replay divergence (single write path + permanent replay parity test), Chinese FTS tokenization (unicode61 treats a CJK run as one token — ~10-line CJK char-split helper applied identically at index and query time), and memory candidate spam (dedupe + cap + expiry before the queue reaches the user). One conflict between research files — FTS5 availability (STACK: verified HIGH; PITFALLS: contradictory sources, MEDIUM) — resolves cheaply: **run a 5-minute runtime probe (`CREATE VIRTUAL TABLE fts5_probe USING fts5(...)`) at P1 hour one, on the packaged build**, before finalizing the retrieval schema.

## Key Findings

### From STACK.md
- **One new npm package total:** `@radix-ui/react-context-menu` 2.3.7 — clone existing `DropdownMenu.tsx` wrapper (~30 lines of edits), register in `ui/index.ts` barrel.
- **FTS5 verified present** in shipped binary (tauri-plugin-sql 2.4.0 → sqlx 0.8.6 bundled → libsqlite3-sys 0.30.1 build.rs:129, SQLite 3.46.0). No js-search/minisearch/sqlite-vec/LanceDB.
- **CJK tokenizer is the one real FTS5 gotcha:** no ICU in bundled build. Recommended: ~10-line TS helper space-separating CJK chars before index write and MATCH build, keep `unicode61`. Trigram rejected (3-char minimum kills 2-char Chinese queries like 需求/任务).
- **Schema via existing migration pattern:** `0002_agent_events.sql`, `0003_memory.sql`, `0004_fts5.sql`. Add `PRAGMA journal_mode = WAL` and `UNIQUE(session_id, seq)` with SQL-side seq allocation.
- **Morning report needs no scheduler:** launch-time date check against `kv_store` + 60s midnight-crossing interval. Rejected: cron crates, background timers, tray threads.
- **Explicit rejections:** vector DBs, GraphFlow, JS search libs, event-sourcing libraries, ORMs, new migration tooling.

### From FEATURES.md
- **Table stakes:** session survives restart, tool_call↔tool_result pairing integrity, pending confirmations survive restart, memory management list with delete, rejected memories never retrieved, product/workspace-scoped retrieval, morning report, editable AI drafts, AI-provenance marking, clean mid-run cancel.
- **Differentiators:** pre-save memory candidate confirmation (nobody mainstream does this), auditable event log, deliverable → HITL → versioned slot, contextual ⌘K entry, 3-5 curated right-click actions, sourced retrieval citations.
- **Anti-features:** silent auto-write memory, full auto-orchestrated pipeline, vector retrieval in v0.3.0, business facts copied into memories, blocking/LLM-only morning report, 15-item context menus, editable event log UI, inline agent per view.
- **Build order:** Event Log is the keystone — 4 of 6 feature groups depend on it. UX items cheapest and last.

### From ARCHITECTURE.md
- **JS-side event log over tauri-plugin-sql; DDL in Rust migrations; `llm.rs` unchanged** (a Rust-side loop would IPC-marshall every tool call back to JS anyway).
- **ChatSession becomes a projection:** keep class + API; `addMessage` also appends event (serialized per-session promise chain); `ChatSession.fromEvents()` repairs dangling tool_calls with synthetic interrupted results. ChatPanel diff ~40 lines.
- **Refactor fixes a live latent bug:** toolLoop's two divergent histories (no-tool-call assistant messages, tool-error retry hints never entering the session).
- **Idempotent confirmations:** in-memory Maps → `confirmation_candidates` table (params_hash = SHA-256 of canonical JSON, 24h expiry, atomic conditional-UPDATE consume). Canonicalization also fixes existing key-order consume-matching bug.
- **Context assembly priority** (AGENT_MEMORY_REFERENCE §6): business facts → pending confirmations → confirmed memories → FTS5 top-k with source metadata → recent turns; one `context_injected` event per turn.
- **Artifacts table** for tool results > 4 KB (upgrades current blind 2000-char slice).

### From PITFALLS.md (top 5)
1. **Double-execution after restore** (P0) — never auto-execute orphaned tool_calls; crash-mid-loop test in every P0 plan.
2. **Replay divergence** (P0) — single write path, toolCallId as UUID, permanent replay-parity test; 0bbc3f2 trace-color test is the canary.
3. **kv_store vs tables truth split** (decide P0, execute P1) — knowledge tables as derived retrieval index keyed on rndStore via content_hash; full inversion deferred to v0.4.
4. **FTS5 Chinese tokenization** (P1) — CJK char-split helper shared by index and query paths; pure-Chinese/mixed/2-char regression tests from day one; tokenizer not changeable in place later.
5. **Stale FTS index** (P1, re-verify in DELIV) — single write API for documents in one transaction; MDXEditor saves route through it; DELIV adds a fourth write path.

Plus: memory candidate spam controls (dedupe before queue, cap ~20, 1-week expiry, rejected kept and fed back), right-click must skip editable regions (MDXEditor is contenteditable) and snapshot selection, seq in SQL not JS, fix the Chinese token estimate (`length/4` is already wrong today; load-bearing in P0 replay).

## Implications for Roadmap

All four files independently arrive at the same dependency chain: **event log → confirmations/restore → memory/FTS5 → deliverable line → UX**. Recommended 5 phases (upper edge of the 3-5 constraint; merge 1+2 for 4).

1. **P0 Core: Event Log + ToolLoop Refactor** — migrations 0002, `eventLog.ts`, event emission per step, messages-derived-from-session, invariant checker. Confirmations stay in-memory (isolate riskiest refactor). Avoid Pitfalls 1/2/10; fix CJK token estimate here. Research not needed — DDL and seq SQL already written.
2. **P0 Finish: Persisted Confirmations + Session Restore** — confirmation table + API-compatible swap, `fromEvents`, ChatPanel restore, crash-recovery UAT (THE acceptance test). Research not needed.
3. **P1: Memory + Knowledge Docs + FTS5 Retrieval** — migrations 0003, candidates with dedupe/cap/expiry, FTS5 + CJK char-split, retrieval.ts, context injection. **First action: FTS5 runtime probe** (resolves the STACK/PITFALLS conflict). **Needs `/gsd:research-phase`** — tokenizer decision point (char-split vs trigram+LIKE) settles with probe + UAT.
4. **Deliverable Production Line** — `generateDeliverable` tool → HITL → MDXEditor edit → versioned rndStore slot. One deliverable type (PRD) end-to-end first. Re-verify stale-index pitfall (fourth write path). Research not needed.
5. **Agent UX + Architecture Docs** — ⌘K with view context, morning report (structured cards, launch-triggered, one dated row), right-click actions (3-5, editable-region guard), ARCHITECTURE.md + ADR rewrite, v0.2.0 regression. Cheapest, last. Research light/skip.

## Research Flags

Needs research: **Phase 3 only** (FTS5 probe result + tokenizer decision). Standard patterns: Phases 1, 2, 4, 5.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | FTS5 verified from vendored build.rs on this machine; Radix live-checked on npm |
| Features | HIGH | Official Claude Code docs + authoritative internal reference |
| Architecture | HIGH | All six source files read in full; ChatPanel coupling verified before design |
| Pitfalls | HIGH | Codebase-grounded; one MEDIUM flag (FTS5) closed by mandated probe |

**Overall: HIGH** — unusually well-resolved because verification ran against the actual codebase and vendored binaries, not external docs.

**Gaps to address:** (1) FTS5 runtime confirmation on packaged build — probe at Phase 3 hour one; (2) tokenizer recall quality on real Chinese PM vocabulary — UAT decision point; (3) no concurrent-session (⌘K + ChatPanel) test exists yet; (4) product-deletion retention policy for events/memories/index — decide during Phase 3 schema design.
