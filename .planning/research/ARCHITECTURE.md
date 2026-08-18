# Architecture Patterns — v0.3.1 Multi-Session Integration

**Domain:** Multi-session agent conversations on the existing event-sourced runtime
**Researched:** 2026-08-18
**Confidence:** HIGH — based on direct read of `eventStore.ts`, `chatSession.ts`, `sessionRestore.ts`, `chatConsoleStore.ts`, `confirmations.ts`
**Supersedes:** v0.3.0 research (event log foundation — shipped; that architecture is the base being extended, not re-researched)

## Core Design Principle

**The DB never changes shape for forks.** `agent_events` stays one append-only table keyed `(session_id, seq)`. A forked child is a normal session (own seq 1..N) plus metadata in the new `sessions` table (`parent_session_id`, `fork_cut_seq`). Concatenation is a **pure projection-time function** — no event copying, no seq rewriting in the DB. Append-only truth and the per-session write chain are untouched.

## Recommended Architecture

### New / Modified Components

| Component | Status | Responsibility |
|-----------|--------|---------------|
| `migration 0007` (Rust migrations array) | NEW | `sessions` table: `session_id PK, workspace_id, title, parent_session_id NULL, fork_cut_seq NULL, created_at, last_active_at` |
| `src/ai/events/types.ts` — `EventScope` | MODIFY | `workspaceId` already resolved in `eventStore.ts:38-44` — register a real workspace provider (alongside productId) in toolLoop |
| `src/ai/sessionRepo.ts` | NEW (~80 LOC) | `upsertSession(meta)`, `listSessions(workspaceId?)`, `getSession(sessionId)`. Dual impl (Sqlite + Memory) mirroring the EventStore pattern |
| `src/ai/forkProjection.ts` | NEW (~60 LOC) | `buildForkEventStream(parentEvents, childEvents, forkCutSeq): AgentEvent[]` — the ONLY place prefix concatenation lives |
| `src/ai/chatSession.ts` | UNCHANGED | `fromEvents` takes a pre-ordered event array; no fork awareness leaks in |
| `src/ai/sessionRestore.ts` | MODIFY | `restoreLatestSession()` → `restoreSession(sessionId?)`; fork-aware event loading |
| `src/stores/chatConsoleStore.ts` | MODIFY | `activeSessionId`, `switchSession()`, `newSession()`, sessions upsert on turn end |
| ChatPanel / AgentWorkspaceView / recent-sessions panel | MODIFY/NEW | Selects, branch/copy affordances, session list |

### Tension Resolutions

**(1) Where prefix concatenation lives → new helper `buildForkProjection.buildForkEventStream`, never inside `fromEvents`.**

`fromEvents` sorts by `seq` (`chatSession.ts:295`). Parent and child both have seq 1..N — naive concatenation passed to `fromEvents` interleaves the streams wrongly. The helper produces a **normalized stream**:

```
buildForkEventStream(parent, child, forkCutSeq):
  prefix = parent.filter(e => e.seq <= forkCutSeq)   // cut guaranteed at turn_ended boundary
  combined = [...prefix, ...child]
  // Re-seq 1..N over the whole stream (clone events; DB rows untouched)
  // AND remap compaction_completed payload coveredSeqStart/coveredSeqEnd by the same offset
  return combined.map((e, i) => ({ ...e, seq: i + 1, payload: remapCompaction(e.payload) }))
```

Why full re-seq (not just offsetting child by parentMaxSeq): `fromEvents` filters `seq > coveredSeqEnd` using the payload value (`chatSession.ts:310`). A child-native coveredSeqEnd compared against offset seqs silently breaks the compaction boundary. Remapping both event seqs and compaction payload values in one pass keeps `fromEvents`, `findCrashTailCutSeq`, and `findOrphanToolCallEvents` **completely unchanged** — they all sort/scan by seq, so all invariants hold on the normalized stream.

Pairing invariants survive concatenation because `toolCallId` is UUID-per-call — zero cross-stream collision. Enforce **fork cut only at a `turn_ended` boundary** (reuse `findCrashTailCutSeq` on the parent) so the prefix can never contain an open tool_call: the parent segment needs no orphan settlement; orphan handling stays scoped to the child's own stream.

Replay parity: the permanent tests (`phase13ReplayParity.test.ts`, `phase14Integration.test.ts`) extend with one new case — *forked projection rebuilt twice yields identical projections, and equals the parent prefix projection plus child suffix*. Idempotency is structural: the helper is pure over `(parentEvents, childEvents, forkCutSeq)`.

**(2) Seq collision → none, by construction.** Child owns its seq namespace in the DB (`UNIQUE(session_id, seq)` is already per-session, `eventStore.ts:155`). Collision exists only in the projection and is resolved by normalization. `sessionChains` keyed by sessionId keeps write serialization correct for both streams independently.

**(3) Session switch lifecycle → `switchSession(sessionId)` in chatConsoleStore.**

| State | On switch | Why |
|-------|-----------|-----|
| `loading` (streaming lock) | **Guard**: switch refused while `loading === true` | Locked: streaming 中锁定切换 |
| `messages`, `streamingResponse`, `streamingTrace`, `input` | Reset, rebuilt from projection | Per-session |
| `pendingConfirmation`, `pendingDestructiveAction`, `pendingPrdDraft`, `prdDraftSnapshot` | Reset, re-surfaced filtered by `sessionId` | Candidate rows already carry `sessionId`, but some call sites stamp `null` (`confirmations.ts:152,217`) — must be fixed |
| `pendingMemory`, `autoRemembered` | **Persist** (global) | Locked: 记忆/知识库保持全局, list-level isolation only |
| `sessionRef.current` | Replaced by rebuilt session + `resumeEventEmission()` | Live events append to the child sessionId — emission target switches with the ref |
| `activeSessionId` | Set | New store field, drives UI |

`refreshMemoryCards` untouched (global queue).

**(4) Yes — `restoreLatestSession()` becomes `restoreSession(sessionId?)`.** App entry does NOT auto-restore (locked: 启动默认新 session): `restore()` creates a fresh `ChatSession` and sets `activeSessionId`. `restoreSession(id)` fires on-demand from the recent-sessions panel / Select. Internals: load `sessions` row → if `parent_session_id`, load both streams → `buildForkEventStream` → run crash-tail/orphan logic **against the child stream only** (parent prefix is immutable and boundary-safe per rule 1) → `fromEvents(normalized)` → `resumeEventEmission()`. Keep the module-promise dedupe for initial `restore()`; `switchSession` needs none (user-driven, serialized by the loading guard).

**(5) `lastActiveAt` / title → `sessionRepo.upsert` on turn end.** Hook: the `finally` of `chatConsoleStore.submit` (after `recordTurnEnd`), plus `switchSession`/`newSession` first activation. Fire-and-forget. LLM auto-title: when `title IS NULL` and turn count ≥ 1, background generation (small maxTokens) → success updates `sessions.title`; failure falls back to first user message truncated (~30 chars). Title failure never surfaces as an error toast.

## Data Flow (changed paths only)

```
Turn end (submit.finally)
  └─ sessionRepo.upsert({sessionId, workspaceId, lastActiveAt, title?})
       └─ if title null → LLM auto-title (bg) → fallback truncate

Session switch (user click)
  └─ switchSession(id): guard loading → load sessions row
       ├─ fork? → listEvents(parent) + listEvents(child) → buildForkEventStream
       └─ child-only crash-tail/orphan → fromEvents → resumeEventEmission
            → set messages/pending cards → activeSessionId

Fork (hover assistant card → branch icon)
  └─ newSessionId = uuid; sessions INSERT {parent_session_id, fork_cut_seq}
       └─ switchSession(newSessionId)  // projection = full parent prefix, empty child
```

## Anti-Patterns to Avoid

- **Copying parent events into the child session** — doubles storage, breaks audit provenance, diverges when the parent continues. Reference fork only.
- **Fork awareness inside `fromEvents`** — contaminates the projection purity that 161 tests + replay parity rely on. Concatenation is a separate pure function.
- **Auto-restoring latest session at app entry** — v0.3.0 behavior, replaced by new-session-on-start.
- **Filtering memory cards by session** — locked as global.
- **Allocating seq in JS for the child** — `eventStore.ts:149` is explicit: SQL-side only.

## Suggested Build Order (dependencies respected)

1. **Phase A — Data model + repo.** Migration 0007, `sessionRepo.ts`, workspaceId stamping via scope provider, `sessionId` stamped on ALL confirmation-candidate call sites. Foundation; nothing user-visible.
2. **Phase B — Multi-session runtime.** `activeSessionId`, `restoreSession(sessionId?)`, `switchSession()` lifecycle, app-entry new session, session-scoped pending re-surfacing. Extends restore/pending tests.
3. **Phase C — Fork.** `buildForkEventStream` + tests FIRST (pairing invariants, compaction remap, replay parity, idempotency), then branch UI (hover icon → sessions INSERT → switchSession) + copy-to-clipboard. Highest-risk logic isolated as a pure function before any UI.
4. **Phase D — UI surfaces + titling.** ChatPanel workspace/session selects (Ctrl+Shift+K), recent-sessions panel, LLM auto-title with truncation fallback.

A→B hard dependency; C depends on A + B; D depends on B (selects) and C (branch badge). C and D can partially parallel after B.

## Open Risks

- Candidate `sessionId: null` at some call sites — Phase A must audit every `save*Candidate` caller or session filtering silently returns nothing.
- Compaction of a forked child: `maybeCompactSession` runs on the child's own stream; the normalized projection honors it only via payload remap — needs one dedicated test (Phase C).
- `EventStore.listSessions()` vs sessionRepo listing overlap: sessionRepo is the UI source (title/workspace); `listSessions()` stays as restore fallback.

## Sources

- Direct source reads (HIGH): `src/ai/events/eventStore.ts`, `src/ai/chatSession.ts`, `src/ai/sessionRestore.ts`, `src/stores/chatConsoleStore.ts`, `src/ai/confirmations.ts` (grep), `src/ai/__tests__/phase13ReplayParity.test.ts` / `phase14Integration.test.ts` (grep), `.planning/PROJECT.md`
