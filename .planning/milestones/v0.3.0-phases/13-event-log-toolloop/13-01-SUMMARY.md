---
phase: 13-event-log-toolloop
plan: 01
subsystem: database
tags: [sqlite, event-sourcing, agent, invariants, artifacts, cjk, tauri-plugin-sql]

# Dependency graph
requires:
  - phase: 02-sqlite-persistence
    provides: tauri-plugin-sql migrations harness (lib.rs sql_migrations), lazySqlite singleton, meta/kv_store tables, APP_SCHEMA_VERSION guard
provides:
  - "agent_events + agent_artifacts tables (migration 0002, WAL, UNIQUE(session_id, seq), schema_version 2)"
  - "EventStore interface + SqliteEventStore (seq allocated SQL-side) + MemoryEventStore, per-session serialized write chain, scope provider"
  - "checkEventStream / assertEventStreamValid — tool_call↔tool_result pairing + seq contiguity invariants"
  - "prepareToolResult — >4KB tool results artifact-ized (summary + artifactId + 512-char head)"
  - "estimateTokens — CJK-aware token estimate (1 token per CJK char)"
  - "phase13EventLog.test.ts — 8-test foundation suite"
affects: [13-02 (ChatSession projection consumes EventStore + tokenEstimate), 13-03 (toolLoop rewrite consumes prepareToolResult + invariants + UUID toolCallId), 14 (session restore reads agent_events), 15 (memory events extend the same vocabulary)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "seq allocated SQL-side only — (SELECT COALESCE(MAX(seq), 0) + 1) inside INSERT, UNIQUE(session_id, seq) as backstop"
    - "per-session promise chain (sessionChains Map) serializes async appends; chain tail swallows rejections, returned promise preserves them"
    - "one isTauri() branch per store module — SQLite for Tauri, in-memory mirror with identical semantics for Node/web"
    - "executable invariants: violations reported via console.error + thrown Error, never silent"

key-files:
  created:
    - src-tauri/migrations/0002_agent_events.sql
    - src/ai/events/types.ts
    - src/ai/events/eventStore.ts
    - src/ai/events/invariants.ts
    - src/ai/events/artifacts.ts
    - src/ai/tokenEstimate.ts
    - src/ai/__tests__/phase13EventLog.test.ts
  modified:
    - src-tauri/src/lib.rs
    - src/stores/storage/initializeDatabase.ts

key-decisions:
  - "Missing-tool_result test scenario renumbers remaining seqs after filtering (a never-written result leaves no hole in an append-only log) — resolves a verbatim conflict between the plan's implementation and its test spec"

patterns-established:
  - "Event append API: AgentEventInput in, store assigns eventId/seq/createdAt; scope fallback via setEventScopeProvider"
  - "Model-visible text prefix convention preserved: `[tool_result <name>] ` (both inline and artifact-reference returns)"

requirements-completed: [EVT-01, EVT-02, EVT-06, EVT-07, EVT-08]

# Metrics
duration: 6min
completed: 2026-08-15
---

# Phase 13 Plan 01: Event Log 存储层与不变量 Summary

**SQLite agent_events/agent_artifacts migration (WAL, SQL-side seq) + EventStore dual implementation + executable tool-pairing invariants + >4KB artifact-ization + CJK token estimate fix, covered by 8 unit tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-15T09:56:13Z
- **Completed:** 2026-08-15T10:03:12Z
- **Tasks:** 4
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- Migration 0002 registers agent_events (10 §3 fields, UNIQUE(session_id, seq), WAL) and agent_artifacts as schema version 2; APP_SCHEMA_VERSION guard synced so the app boots
- EventStore interface with SqliteEventStore (Tauri, seq allocated SQL-side) and MemoryEventStore (Node/web) behind one isTauri() branch; per-session promise chain keeps seq contiguous under 10-way concurrent appends
- checkEventStream detects all five violation codes (MISSING_TOOL_RESULT / DUPLICATE_TOOL_CALL / DUPLICATE_TOOL_RESULT / RESULT_BEFORE_CALL / SEQ_GAP); assertEventStreamValid throws loudly
- prepareToolResult inlines ≤4096-char results and artifact-izes larger ones — model text keeps the `[tool_result <name>]` prefix with summary + artifactId + 512-char head; full content retrievable via getArtifact
- estimateTokens counts each CJK char as 1 token (8 hanzi = 8 tokens, not 2) — the length/4 replay-budget overflow is fixed

## Task Commits

Each task was committed atomically:

1. **Task 1: 迁移 0002 — agent_events + agent_artifacts + WAL,注册进 lib.rs** - `3df4734` (feat)
2. **Task 2: events/types.ts + events/eventStore.ts — EventStore 双实现与按会话串行写入链** - `ca5bc37` (feat)
3. **Task 3: invariants.ts + artifacts.ts + tokenEstimate.ts — 配对检查、artifact 化、中文 token 修复** - `6d32557` (feat)
4. **Task 4: phase13EventLog.test.ts — 存储层与纯函数单元测试** - `1eb4af1` (test)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `src-tauri/migrations/0002_agent_events.sql` - agent_events + agent_artifacts DDL, WAL, indexes, schema_version → 2
- `src-tauri/src/lib.rs` - migration 0002 registered as version 2 in sql_migrations()
- `src/stores/storage/initializeDatabase.ts` - APP_SCHEMA_VERSION 1 → 2
- `src/ai/events/types.ts` - AGENT_EVENT_TYPES vocabulary + AgentEvent/AgentArtifact/EventScope/EventStreamIssue shapes
- `src/ai/events/eventStore.ts` - EventStore, SqliteEventStore, MemoryEventStore, enqueue chain, scope provider, singletons
- `src/ai/events/invariants.ts` - checkEventStream + assertEventStreamValid
- `src/ai/events/artifacts.ts` - ARTIFACT_THRESHOLD_CHARS/ARTIFACT_HEAD_CHARS + prepareToolResult
- `src/ai/tokenEstimate.ts` - CJK-aware estimateTokens
- `src/ai/__tests__/phase13EventLog.test.ts` - 8-test foundation suite (node:test + node:assert/strict)

## Decisions Made
- **Renumber seqs when simulating a missing tool_result in tests** — the plan's verbatim test filtered the tool_result event out of a seq-1..5 stream and expected exactly 1 issue; but a hole at seq 3 makes the verbatim checker also report 2×SEQ_GAP (3 issues). In a real append-only log a result that was never written means the next append simply got seq 3 — no hole. The test now filters AND renumbers, which is the faithful missing-result scenario and isolates the pairing violation as intended. (See deviations.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan test spec contradicted plan implementation for the missing-tool_result scenario**
- **Found during:** Task 4 (phase13EventLog.test.ts)
- **Issue:** Filtering the tool_result event from the balanced stream leaves seqs [1,2,4,5]; the verbatim checkEventStream then reports 2×SEQ_GAP + 1×MISSING_TOOL_RESULT (3 issues), failing the spec's `issues.length === 1` assertion
- **Fix:** Renumber the remaining events' seqs after filtering (`map((event, index) => ({ ...event, seq: index + 1 }))`) with an explanatory comment — matches real append-only semantics where a never-written result leaves no gap
- **Files modified:** src/ai/__tests__/phase13EventLog.test.ts
- **Verification:** Test 4 passes asserting exactly 1 issue with code MISSING_TOOL_RESULT and toolCallId 'tc-1'; full suite 8/8
- **Committed in:** 1eb4af1 (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test specification)
**Impact on plan:** None on production code — all implementation modules are verbatim per plan. The fix aligns the test with append-only log semantics; no scope creep.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Verification Results
- `npm run lint` — 0 type errors
- `npx tsx --test src/ai/__tests__/phase13EventLog.test.ts` — 8/8 pass
- Regression (registry/knowledgeWrite/phase10/phase11Plan03/scheduleAdvanced/taskAdvanced/rndStore/settingsProvider) — 25/25 pass
- Full combined suite — 33/33 pass
- `cargo check --manifest-path src-tauri/Cargo.toml` — green
- Migration grep — no DROP/ALTER statements (comment mentions only)

## Next Phase Readiness
- Ready for 13-02: ChatSession projection can consume EventStore (append/listEvents), types vocabulary, and estimateTokens
- Ready for 13-03: toolLoop rewrite can consume prepareToolResult, invariants, and getEventStore(); scope provider registration point (setEventScopeProvider) awaits toolLoop wiring
- No blockers

## Self-Check: PASSED

- All 7 created source/test files + this SUMMARY verified on disk (`[ -f ]`)
- `git log --grep="13-01"` returns 5 commits (4 task commits + metadata)

---
*Phase: 13-event-log-toolloop*
*Completed: 2026-08-15*
