---
phase: 18-session
plan: "02"
subsystem: ai-sessions
tags: [sessions, sqlite, event-stamping, confirmations]
requires:
  - "18-01 (migration 0007 sessions table)"
provides:
  - "getSessionRepo() memory/sqlite session metadata repo"
  - "workspaceId stamping on agent_events (SESS-06 write side)"
  - "sessionId stamping on confirmation candidates (SESS-05 data layer)"
affects:
  - src/ai/toolLoop.ts
  - src/ai/confirmations.ts
tech-stack:
  added: []
  patterns:
    - "dual memory/sqlite repo singleton with isTauri() gate (mirrors eventStore.ts)"
    - "ON CONFLICT(session_id) DO UPDATE SET last_active_at only"
key-files:
  created:
    - src/ai/sessionRepo.ts
    - src/ai/__tests__/phase18SessionRepo.test.ts
  modified:
    - src/ai/toolLoop.ts
    - src/ai/confirmations.ts
decisions:
  - "sessionRepo exports its SQL strings; parity test converts $N to ? for node:sqlite"
  - "NULL workspace_id = visible in all workspaces (matches 0007 backfill semantics)"
  - "computeParamsHash inputs untouched — sessionId excluded to preserve dedup of pre-upgrade pending candidates (Pitfall 6)"
metrics:
  duration: 12m
  completed: 2026-08-18
---

# Phase 18 Plan 02: Write-time stamping + sessionRepo Summary

Workspace/session stamping at write time plus a memory/sqlite sessionRepo with turn-start upsert, so every agent_event carries workspaceId, every confirmation candidate carries sessionId, and every session has a sessions row from its first turn.

## What Was Done

### Task 1: toolLoop workspaceId stamping + confirmations sessionId fix (4fd4ed9)
- `setEventScopeProvider` in `src/ai/toolLoop.ts` now reads `useWorkspaceStore.getState().activeWorkspaceId` (was hardcoded `null`) — all new agent_events stamped with the active workspace (SESS-06 write side).
- Both candidate factories in `src/ai/confirmations.ts` (`createKnowledgeWriteCandidate`, `createDestructiveActionCandidate`) now stamp `sessionId: getActiveAgentScope()?.sessionId ?? null` instead of `sessionId: null` (SESS-05 data layer). Direct read inside the factories fixes all callers at once.
- `computeParamsHash` inputs untouched (Pitfall 6: sessionId in the hash would break dedup of pre-upgrade pending candidates).

### Task 2: sessionRepo + turn-start upsert (f8fc84a RED, 62d4a00 GREEN)
- `src/ai/sessionRepo.ts` (~135 LOC): `SessionMeta`, `SessionRepo`, `MemorySessionRepo` (Map-based, INSERT OR IGNORE semantics), `SqliteSessionRepo` (`ON CONFLICT(session_id) DO UPDATE SET last_active_at` only — title/workspace never overwritten), `getSessionRepo()` singleton with the same `isTauri()` gate as eventStore. NULL workspace_id = visible in all workspaces (documented in header).
- `src/ai/toolLoop.ts`: fire-and-forget `upsertSessionMeta` at turn start (right after `setActiveAgentScope`), `.catch(() => {})` so repo failure never blocks a turn.
- `src/ai/__tests__/phase18SessionRepo.test.ts`: 4 tests — memory upsert/last_active_at semantics, title isolation, workspace listing (DESC + NULL-visible-everywhere), and SQL parity executing the repo's own exported SQL strings against a real DB built from `0001_init.sql + 0002_agent_events.sql + 0007_sessions.sql` via node:sqlite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SQL parity test needed 0002_agent_events.sql**
- **Found during:** Task 2 test run
- **Issue:** 0007 references `agent_events`, created by 0002 — 0001 alone fails with "no such table: main.agent_events".
- **Fix:** buildDb loads 0001 + 0002 + 0007.
- **Commit:** 62d4a00

**2. [Rule 1 - Bug] node:sqlite rejects $N placeholders with positional args**
- **Issue:** "column index out of range" when running the repo's `$1..$4` SQL (tauri-plugin-sql style) via node:sqlite `.run(...)`.
- **Fix:** parity test converts `$N` → `?` before prepare; the repo keeps `$N` for the plugin.
- **Commit:** 62d4a00

None of the deviations changed plan behavior; both were test-harness plumbing.

## Verification

- `npx tsx --test src/ai/__tests__/phase18SessionRepo.test.ts` — 4/4 pass
- Full `npm test` — 174/174 pass
- `npm run lint` (tsc --noEmit) — clean

## Self-Check: PASSED

- src/ai/sessionRepo.ts exists (FOUND)
- src/ai/__tests__/phase18SessionRepo.test.ts exists (FOUND)
- Commits 4fd4ed9, f8fc84a, 62d4a00 present in git log (FOUND)
