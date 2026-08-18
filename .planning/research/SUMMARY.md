# Project Research Summary

**Project:** Nova-PM-Workspace (v0.3.1 Multi-Session Chat)
**Domain:** Desktop AI agent (Tauri v2 + React 19) - event-sourced multi-session conversations
**Researched:** 2026-08-18
**Confidence:** HIGH

## Executive Summary

Nova v0.3.1 adds multi-session chat to an existing event-sourced agent runtime: per-workspace session lists, on-demand restore, reference-based fork (zero event copy), LLM auto-titling, hover copy/branch actions, and Ctrl+Shift+K workspace+session pickers. The research consensus is that **the event log is the truth source and the DB never changes shape for forks** - a forked child is a normal session plus metadata (parent_session_id, fork_cut_seq) in one new thin table (migration 0007). Prefix concatenation is a pure projection-time function, never inside fromEvents.

**Zero new dependencies.** Migration pattern (0002-0006), fork primitives (ChatSession.fromEvents + resumeEventEmission already exist), clipboard (8 in-repo navigator.clipboard precedents), relative time (Intl.RelativeTimeFormat), and LLM titling (existing llm.rs IPC + conditional-UPDATE pattern) are all covered by existing code. The build order is strict: data model, multi-session runtime, fork (pure function + tests first), UI surfaces + titling.

Top risks: (1) migration 0007 backfill missing legacy sessions/workspace_id causing "migration ate my history" on upgrade; (2) module-level singleton sessionRef racing activeSessionId causing cross-session message bleed (worst user-visible bug class); (3) fork cut mid-turn creating dangling tool_calls that corrupt the child at birth. All three have concrete, code-traced preventions.

## Key Findings

### Recommended Stack

Everything exists. See STACK.md for full rationale.

- migrations/0007_sessions.sql - thin metadata table (title, workspace_id, parent_session_id, fork_cut_seq, title_source) + backfill from agent_events; schema_version to 7
- src/ai/sessionRepo.ts (~80 LOC, NEW) - dual SQLite/memory impl mirroring eventStore pattern
- ChatSession.fromEvents + resumeEventEmission - fork primitives already present in chatSession.ts
- navigator.clipboard.writeText - copy; no clipboard plugin (but see conflict note in Gaps)
- Intl.RelativeTimeFormat('zh') - ~15-line helper, no date lib
- Existing Rust llm.rs one-shot call - auto-title with guarded conditional UPDATE (WHERE title IS NULL)

### Expected Features

**Must have (table stakes):** session list (title + relative time + count), workspace-filtered reverse-chron ordering, click-to-restore full projection, auto-title with first-message fallback, hover copy, fork-then-navigate-to-new-session, new-session-on-entry, branch badge, streaming switch-lock.

**Should have (differentiators):** reference fork (O(1), audit-preserving), Ctrl+Shift+K dual dropdowns, session-scoped pending HITL cards, branch-from-any-assistant-message hover.

**Defer (out of scope):** rename/delete/pin, edit-message-to-fork, branch tree visualization, cross-workspace memory isolation, background streaming into non-active sessions.

### Architecture Approach

Append-only agent_events unchanged; new sessions table is metadata-only; fork = pure projection via new buildForkEventStream helper that re-seqs the combined stream 1..N AND remaps compaction_completed payload values so fromEvents, crash-tail, and orphan logic stay untouched. Fork cut enforced at turn_ended boundaries only.

**Major components:**
1. migration 0007 + sessionRepo.ts - sessions metadata, workspace scope provider, sessionId on all candidate call sites
2. chatConsoleStore changes - activeSessionId, switchSession() (loading-guarded, per-session reset of messages/pending, global memory cards), restoreSession(sessionId?) replacing restoreLatestSession()
3. buildForkEventStream (pure, tested first) + fork UI (hover icon, sessions INSERT, switchSession)
4. UI surfaces - ChatPanel selects, recent-sessions panel, LLM auto-title fire-and-forget

### Critical Pitfalls

1. **Fork cut mid-turn creates dangling tool_call** - cut only at turn_ended (reuse findCrashTailCutSeq semantics); test fork inside a tool-heavy turn
2. **sessions[0] restore assumption** - restore must read persisted activeSessionId, never "latest row"; most load-bearing Phase 2 refactor
3. **Global singleton vs activeSessionId race** - capture sessionId at submit start, bail in callbacks if changed, hard lock switch while loading; keyed sessionRef
4. **Migration backfill miss makes legacy history invisible** - backfill workspace_id + legacy sessions row IN migration 0007; test against real v0.3.0 DB fixture
5. **Title race + fat metadata divergence** - title task carries its own sessionId, guarded conditional UPDATE; keep sessions table thin, derive counts from events

## Implications for Roadmap

Suggested 4 phases (matches ARCHITECTURE.md build order A-B-C-D; Phases 3/4 partially parallel after Phase 2):

### Phase 1: Data Model & Foundation
**Rationale:** Everything depends on it; nothing user-visible.
**Delivers:** Migration 0007 (thin table + backfill), sessionRepo.ts, workspace scope provider, sessionId stamped on ALL candidate call sites, orphan-workspace sentinel policy.
**Avoids:** Pitfalls 4, 6, 7, 8 (schema-level decisions locked here).

### Phase 2: Multi-Session Runtime
**Rationale:** Hard dependency on Phase 1; runtime must be session-aware before any UI.
**Delivers:** activeSessionId, switchSession() lifecycle (loading guard, per-session reset, composite message keys, switching skeleton state), restoreSession(sessionId?), new-session-on-entry, session-scoped pending cards.
**Avoids:** Pitfalls 2, 3, 6b, 9, 10, 13.

### Phase 3: Fork & Hover Actions
**Rationale:** Highest-risk logic isolated as a pure function before UI; depends on Phases 1+2.
**Delivers:** buildForkEventStream + tests FIRST (pairing invariants, compaction remap, replay parity, idempotency, mid-turn cut), then hover fork/copy UI + branch badge + child-first metadata (session_created).
**Avoids:** Pitfalls 1, 12, 15.

### Phase 4: UI Surfaces & Titling
**Rationale:** Depends on Phase 2 (selects) and Phase 3 (badge); can start partially in parallel after Phase 2.
**Delivers:** ChatPanel workspace/session selects (Ctrl+Shift+K only, conditional render), recent-sessions panel, LLM auto-title with truncation fallback and guarded write.
**Avoids:** Pitfalls 5, 11, 14, 16.

### Phase Ordering Rationale

- Phase 1 to 2 is a hard dependency (runtime needs the table); Phase 3 needs 1+2 (fork writes metadata + switches sessions); Phase 4 needs 2 minimum
- Grouping follows architecture seams: pure logic (fork projection) separated from UI so 161 existing tests + replay parity extend naturally
- Every pitfall is assigned to exactly one phase spec - see PITFALLS.md phase table

### Research Flags

Needs /gsd:research-phase:
- **Phase 3 (Fork):** seq-space normalization + compaction remap is the trickiest pure logic; spec must encode the re-seq/remap rule and the turn_ended cut rule precisely
- **Phase 1 (Migration):** verify migration atomicity on tauri-plugin-sql + fixture-DB upgrade test plan

Standard patterns (skip research):
- **Phase 2:** all patterns traced to existing code (sessionRestore, chatConsoleStore)
- **Phase 4:** existing Select primitives, existing llm.rs path, ~15-line time formatter

## Confidence Assessment

| Area | Confidence | Notes |
|--------|------------|-------|
| Stack | HIGH | Direct code reads; zero-dep claim verified against 6 migrations + chatSession.ts |
| Features | HIGH | Claude/ChatGPT/Cursor behaviors from official docs; locked decisions honored |
| Architecture | HIGH | Direct reads of all touched files; invariants verified against existing tests |
| Pitfalls | HIGH | All codebase-traced, except clipboard specifics (MEDIUM) |

**Overall confidence:** HIGH

### Gaps to Address

- **Clipboard conflict (resolve in Phase 3/4 planning):** STACK.md says navigator.clipboard suffices (8 in-repo precedents, no plugin); PITFALLS.md #11 says packaged Tauri builds may lack clipboard capability and recommends @tauri-apps/plugin-clipboard-manager + capability entry. Recommendation: try navigator.clipboard first, verify in Windows packaged-build UAT, add plugin only if it fails. Either way: toast on failure, never silent.
- **StrictMode title dedupe:** key promise cache on sessionId (Pitfall 14) - must be in Phase 4 spec.
- **Pending-candidate fork inheritance:** v1 decision is strict session_id == X scoping (destructive candidates never inherit) - confirm in Phase 1 spec.

## Sources

### Primary (HIGH confidence)
- Direct reads: src/ai/events/eventStore.ts, src/ai/chatSession.ts, src/ai/sessionRestore.ts, src/stores/chatConsoleStore.ts, src/ai/confirmations.ts, src-tauri/migrations/0002_agent_events.sql, .planning/PROJECT.md
- Claude Code sessions docs (https://code.claude.com/docs/en/sessions) - title fallback chain, list metadata

### Secondary (MEDIUM confidence)
- Cursor fork forum thread (https://forum.cursor.com/t/fork-chat-support-for-cursor-agents-new-ui/158692)
- Raycast AI behavior (training data, unverified)
- Tauri v2 clipboard capability specifics in packaged builds

---
*Research completed: 2026-08-18*
*Ready for roadmap: yes*
