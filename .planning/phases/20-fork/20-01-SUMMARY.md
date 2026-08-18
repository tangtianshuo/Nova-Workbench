---
phase: 20-fork
plan: "01"
subsystem: ai-fork
tags: [fork, event-sourcing, compaction, session-repo, tdd]
requires: [event-log, compaction, sessions-table-0007, session-restore]
provides: [buildForkEventStream, findForkCutSeq, resolveSessionEvents, createForkSession, parentTitle]
affects: [src/ai/sessionRestore.ts, src/ai/compaction.ts, src/ai/sessionRepo.ts]
tech-stack:
  added: []
  patterns: [projection-time-fork-normalization, two-case-compaction-seq-remap, child-space-persisted-coveredSeq]
key-files:
  created:
    - src/ai/fork.ts
    - src/ai/__tests__/fork.test.ts
  modified:
    - src/ai/sessionRepo.ts
    - src/ai/sessionRestore.ts
    - src/ai/compaction.ts
    - src/ai/__tests__/phase18SessionRepo.test.ts
decisions:
  - "Child compaction persists coveredSeq*/splitSeq in CHILD space (normalized - forkOffset); buildForkEventStream's +prefix.length remap restores them to normalized space at resolve time — round-trip locked by test 9"
  - "Gate order: NO_PREFIX_TURN checked before MID_TURN so a cut with no complete turn at/before it reports NO_PREFIX_TURN (MID_TURN preserved for cut-on-tool_call in multi-turn streams)"
  - "MemorySessionRepo computes parentTitle at read time (mirrors LEFT JOIN) so a parent title set after fork still shows through"
metrics:
  duration: 14m
  completed: 2026-08-18
---

# Phase 20 Plan 01: Fork Pure-Function Layer Summary

**One-liner:** TDD fork layer — buildForkEventStream (3 typed gates, seq normalization, two-case compaction remap) + recursive resolveSessionEvents wired into restore & compaction, plus sessionRepo fork metadata (createForkSession/getSession/parentTitle LEFT JOIN).

## What Was Built

- **src/ai/__tests__/fork.test.ts** (RED first, commit b839927): 11 tests — pairing invariants, seq normalization (prefix 1..cut identity, child +cut contiguous), compaction payload remap (prefix identity / child +prefix.length), replay parity via fromEvents, MID_TURN / NO_PREFIX_TURN / UNBALANCED rejection, fork-of-fork, findForkCutSeq, full round-trip through memory repos (fork → child turns → forced compaction → re-resolve → fromEvents parity, parent prefix enters the compaction transcript), memory + SQL parity for repo fork columns and parentTitle.
- **src/ai/fork.ts**: `buildForkEventStream` / `findForkCutSeq` / `resolveSessionEvents` (recursive fork-of-fork; degrades to own events with console.error on invalid cut — never throws mid-restore).
- **src/ai/sessionRepo.ts**: `getSession`, `createForkSession` (SESSION_FORK_INSERT_SQL, title_source 'fork'), SESSION_LIST_SQL gains LEFT JOIN for `parent_title` → `SessionMeta.parentTitle`; memory mirror + `getMemorySessionRepo`/`resetMemorySessionRepo` test hooks.
- **Wiring**: `sessionRestore.ts` (initial read + orphan re-read) and `compaction.ts` `maybeCompactSession` now use `resolveSessionEvents` — a forked child's LLM projection keeps the parent prefix, and child compaction summarizes it instead of dropping it (Pitfall 1).
- Zero parent-event copying anywhere; no writes to parent sessions (reference-style fork preserved).

## Verification

- `npm test`: 201/201 pass (190 existing + 11 new)
- `npm run lint` (tsc --noEmit): clean
- Acceptance greps: fork.ts exports, repo methods, both wiring sites, no remaining `listEvents(targetSessionId)` in sessionRestore

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test-authoring fixes during GREEN (RED file untouched)**
- **Found during:** Task 2
- **Issue:** RED suite had three self-inflicted bugs: test 4 compared full projections including the child turn against parent-only; test 3 replaced a tool_result with a compaction event (broke pairing → UNBALANCED); test 10b ran 0007 backfill without 0002 (agent_events missing) and under-bound the fork INSERT params.
- **Fix:** slice parity compare; replace an assistant_message instead; add 0002 migration + 7th bind param. Semantics unchanged.
- **Commit:** 7c083be

**2. [Rule 2 - Missing functionality] forkOffset subtraction for child-space persisted compaction payloads**
- **Found during:** Task 2
- **Issue:** Plan text said "写入的 coveredSeq* ... (normalized)", but storing normalized values in child rows would be double-shifted by buildForkEventStream's +prefix.length remap at re-resolve time (the exact Pitfall 6 space confusion).
- **Fix:** maybeCompactSession computes over the normalized stream but persists splitSeq/coveredSeqStart/coveredSeqEnd minus forkOffset (child space); remap restores them. Locked by round-trip test 9.
- **Commit:** 7c083be

## Known Stubs

None — pure-function layer is fully wired; UI (hover toolbar, forkFromMessage, clipboard) is Plan 20-02.

## Self-Check: PASSED

- Files exist: src/ai/fork.ts, src/ai/__tests__/fork.test.ts (verified via successful test runs)
- Commits exist: b839927 (RED), 7c083be (GREEN)
