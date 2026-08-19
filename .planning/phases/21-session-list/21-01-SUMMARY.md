---
phase: 21-session-list
plan: 01
subsystem: ai-session-data
tags: [session-list, sql, session-repo, utils]
requires: [phase-18-session-repo]
provides: [countMessagesBySession, guarded-updateTitle, formatRelativeTime]
affects: [src/ai/sessionRepo.ts, src/lib/utils.ts]
tech-stack:
  added: []
  patterns: ["exported SQL constant + memory parity", "dynamic IN-list placeholders"]
key-files:
  created:
    - src/ai/__tests__/phase21SessionList.test.ts
  modified:
    - src/ai/sessionRepo.ts
    - src/lib/utils.ts
    - src/ai/__tests__/phase18SessionRepo.test.ts
    - src/ai/__tests__/fork.test.ts
decisions:
  - updateTitle is write-once (WHERE title IS NULL); re-titles require explicit future API
  - SQLite countMessagesBySession builds $1..$n IN-list dynamically; exported constant is canonical text only
metrics:
  duration: 10m
  completed: 2026-08-19
  tasks: 2
---

# Phase 21 Plan 01: Session List Data Layer Summary

One-liner: Batch message-count aggregate SQL + overwrite-proof source-aware updateTitle in sessionRepo, plus formatRelativeTime for the session list UI.

## What Was Built

- `SESSION_MESSAGE_COUNT_SQL` + `countMessagesBySession(sessionIds): Promise<Map<string, number>>` — SQLite path is one aggregate query over `event_type IN ('user_message','assistant_message')` grouped by session; memory path counts via the in-memory event store (test/web-dev only, N+1 noted with ponytail comment).
- `updateTitle(sessionId, title, titleSource: 'llm' | 'fallback')` — SQL guard `WHERE session_id = $3 AND title IS NULL`, memory parity via `row.title === null` check; records `title_source`.
- `formatRelativeTime` in `src/lib/utils.ts` — 刚刚 / X 分钟前 / X 小时前 / X 天前 / M月D日.
- Tests: memory behavior + real-schema SQL parity (node:sqlite against migrations 0001/0002/0007), including no-overwrite assertion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] updateTitle signature change broke existing test callers**
- **Found during:** Task 1
- **Issue:** fork.test.ts and phase18SessionRepo.test.ts call the old 2-arg updateTitle (and phase18 parity test used TITLE_SQL with 2 params)
- **Fix:** Updated all call sites to the 3-arg signature
- **Files:** src/ai/__tests__/fork.test.ts, src/ai/__tests__/phase18SessionRepo.test.ts
- **Commit:** ed99336

## Verification

- `npx tsx --test src/ai/__tests__/phase21SessionList.test.ts src/ai/__tests__/phase18SessionRepo.test.ts src/ai/__tests__/fork.test.ts` — 21/21 pass
- `npm run lint` (tsc --noEmit) — clean

## Known Stubs

None.
