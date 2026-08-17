---
phase: 13-event-log-toolloop
plan: 02
subsystem: agent-runtime
tags: [chat-session, event-sourcing, projection, replay, cjk-token-budget, lazy-emission]

# Dependency graph
requires:
  - phase: 13 plan 01
    provides: EventStore (getEventStore/append/listEvents), AgentEvent/AgentEventInput types, estimateTokens
provides:
  - "ChatSession as event-log projection: addMessage dual-writes, session_created lazy emission, fromEvents rebuild"
  - "getMessagesForLLM collapses consecutive tool_call assistant rows (single derived format)"
  - "setCorrelationId / recordTurnEnd / flushEvents API for turn-level event tracking"
  - "phase13ChatSessionProjection.test.ts — 6-test projection/replay/correlation/CJK-budget suite"
affects: [13-03 (toolLoop rewrite consumes the refactored ChatSession), 14 (session restore uses ChatSession.fromEvents)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy session_created emission: constructor never calls getEventStore(); ensureSessionCreatedEvent() once-guard emits session_created before the first message event"
    - "Per-session promise chain (lastEventPromise) serializes async appends from sync addMessage callers"
    - "fromEvents rebuilds with __emitEvents: false so replayed sessions never re-emit events"
    - "collapseToolCallAssistants collapses consecutive assistant-with-toolCallId rows into one LLM-visible message"

key-files:
  created:
    - src/ai/__tests__/phase13ChatSessionProjection.test.ts
  modified:
    - src/ai/chatSession.ts

key-decisions:
  - "Constructor zero-emission: ChatPanel.tsx:93 useRef(new ChatSession(...)) evaluates every render; constructor-time event emission would flood agent_events with orphan sessions"
  - "Internal __emitEvents flag (double-underscore) marks rebuilt sessions; not part of public API, documented via @internal JSDoc"
  - "collapseToolCallAssistants drops all but the first of consecutive assistant-with-toolCallId rows; preserves tool content verbatim as-is required for the LLM to see the tool responses"

requirements-completed: [EVT-03]

# Metrics
duration: 5min
completed: 2026-08-15
---

# Phase 13 Plan 02: ChatSession as Event-Log Projection Summary

**ChatSession refactored as an event-log projection: addMessage dual-writes to in-memory messages + EventStore, session_created lazily emitted on first real event, fromEvents rebuilds from stream, getMessagesForLLM collapses tool_call assistant rows, CJK-aware token budget replaces length/4**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- chatSession.ts refactored: addMessage dual-writes (in-memory push + EventStore.append via per-session serial promise chain); token estimation now uses CJK-aware `estimateTokens` from tokenEstimate.ts (length/4 removed entirely)
- session_created emitted lazily via ensureSessionCreatedEvent() once-guard, never in constructor — ChatPanel.tsx:93's `useRef(new ChatSession({ tokenBudget: 8_000 }))` (evaluated every render) no longer risks flooding agent_events with orphan sessions
- ChatSession.fromEvents() rebuilds a session as pure projection of its event stream; rebuilt sessions use `__emitEvents: false` to suppress all re-emission
- getMessagesForLLM applies collapseToolCallAssistants before returning — multiple tool_call assistant rows from a single model response collapse into one LLM-visible message
- New API surface: setCorrelationId(), flushEvents(), recordTurnEnd(), 5-arg addMessage positional overload with payload parameter
- phase13ChatSessionProjection.test.ts covers all 6 acceptance tests: lazy emission, tool pairing, projection collapse, replay parity, CJK budget, phase10 contract double-anchor

## Task Commits

Each task was committed atomically:

1. **Task 1: 重构 chatSession.ts 为事件日志投影** - `adea45d` (feat)
2. **Task 2: phase13ChatSessionProjection.test.ts — 投影与重建测试** - `8a6ba34` (test)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `src/ai/chatSession.ts` - Refactored to event-log projection: dual-write addMessage, lazy session_created, fromEvents rebuild, collapseToolCallAssistants, CJK token budget
- `src/ai/__tests__/phase13ChatSessionProjection.test.ts` - 6-test projection suite (node:test + node:assert/strict)

## Decisions Made
- **Constructor zero-emission** — ChatPanel.tsx:93 creates ChatSession inside `useRef(...)` which React evaluates on every render (ChatPanel re-renders per streamed token). Constructor-time emission would flood agent_events with orphan single-event sessions. session_created is instead emitted lazily by ensureSessionCreatedEvent() on the first real addMessage call.
- **`__emitEvents` internal flag** — fromEvents-built sessions need to suppress all event emission (including session_created). Implemented as an internal double-underscore field on ChatSessionOptions, documented with @internal JSDoc, not part of the public API.
- **collapseToolCallAssistants** — A single model response requesting N tools generates N assistant-with-toolCallId rows in the session; the LLM must see the response once. The function drops all but the first of consecutive assistant-with-toolCallId rows while preserving tool content verbatim.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Verification Results
- `npm run lint` — 0 type errors
- `npx tsx --test src/ai/__tests__/phase13ChatSessionProjection.test.ts` — 6/6 pass
- `npx tsx --test src/ai/__tests__/phase10PromptContext.test.ts` — 4/4 pass (zero regression on phase10 contract)
- Full regression (`npx tsx --test src/ai/__tests__/*.test.ts`) — 31/31 pass (0 fail)
- `cargo check --manifest-path src-tauri/Cargo.toml` — green
- Grep confirmations:
  - `length / 4` and `length/4` — 0 matches in chatSession.ts
  - `getEventStore()` only in ensureSessionCreatedEvent, recordTurnEnd, addMessage (NOT in constructor body)
  - All 6 event type strings present: session_created, user_message, assistant_message, tool_call, tool_result, turn_ended
  - Both constructor overload declarations preserved
  - `collapseToolCallAssistants` present

## Next Phase Readiness
- Ready for 13-03: toolLoop rewrite can now consume the refactored ChatSession (single source of truth) + setCorrelationId + recordTurnEnd + 5-arg addMessage with payload. toolLoop's internal `messages` array can be eliminated — LLM messages derive from session.getMessagesForLLM().
- Ready for 14: session restore uses ChatSession.fromEvents(events) to rebuild a session from SQLite agent_events.
- No blockers

## Self-Check: PASSED

- All 2 files (1 modified + 1 created) verified on disk
- `git log --grep="13-02"` returns 2 task commits (adea45d, 8a6ba34)
- Full gate: lint 0 errors, 31/31 tests pass, cargo check green

---
*Phase: 13-event-log-toolloop*
*Completed: 2026-08-15*
