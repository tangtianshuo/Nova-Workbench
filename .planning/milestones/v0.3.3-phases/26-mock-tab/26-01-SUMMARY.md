---
phase: 26-mock-tab
plan: 01
subsystem: tab-run infrastructure
tags: [tab-run, engine-run, projection, knowledge-docs, hitl]
requires: [engine_run IPC (v0.3.2), knowledgeRepo getCurrentDocs, chatConsoleStore pending cards]
provides: [useTabRunStore/startTabRun/cancelTabRun, hydrateDeliverableSlots, buildCoreContext(tabPayload), routeEngineCandidateToConsole]
affects: [src/stores/rndStore.ts, src/ai/context.ts, src/stores/chatConsoleStore.ts, src/stores/storage/initializeDatabase.ts]
tech-stack:
  added: []
  patterns: [store-level Channel onEvent callback, repo→slot projection (same shape as hydrateKnowledgeFromRepo), stable docId as projection key]
key-files:
  created:
    - src/stores/tabRunStore.ts
  modified:
    - src/stores/rndStore.ts
    - src/ai/context.ts
    - src/stores/chatConsoleStore.ts
    - src/stores/storage/initializeDatabase.ts
decisions:
  - "tab run candidates route to the global confirmation queue via chatConsoleStore pending fields (D-05) — new exported routeEngineCandidateToConsole reuses the submit() mapping"
  - "deliverable slot projection key = Phase 16 stable docId convention `deliverable-${productId}-${slotCode}`"
  - "persist v3 migrate keeps only ready slots WITH aiSource provenance; fabricated mock slots reset to empty"
metrics:
  duration: ~20m
  completed: 2026-08-31
  tasks: 2
  files: 5
---

# Phase 26 Plan 01: Mock 全清地基 — tabRunStore + deliverables 投影化 Summary

**One-liner:** Tab-triggered engine runs get their own store with independent sessionIds and store-level Channel callbacks, while deliverable slots become a pure knowledge_docs projection (fake ready seeds wiped via persist v3 migrate) and buildCoreContext gains an optional Tab Task Context segment.

## What Was Built

### Task 1 — tabRunStore (src/stores/tabRunStore.ts)
- `runs: Record<runId, TabRunRecord>` + `runsByTab` (1-run-per-tab guard: an active run is returned instead of starting a duplicate)
- `startTabRun` mints `runId` AND an independent `sessionId` via `crypto.randomUUID()` (TAB-05 — no chat session list import anywhere in the file); provider/ollamaModel/workspace resolution copied from chatConsoleStore.submit
- Store-level `onEvent`: run_status → status, confirmation → status='waiting-for-confirmation' + candidateCount+1 + candidate routed to the global queue, tool_start → currentStep `正在调用 X…`, token rows truncated to 80 chars, error/done terminal handling; 200-event rolling cap
- `cancelTabRun` (engineCancel, idempotent), `rehydrateTabRuns` (one-shot resolveSessionEvents per active run, no polling), `clearRun`
- New exported `routeEngineCandidateToConsole(candidate, sessionId)` in chatConsoleStore — maps knowledge_write/destructive/exec/fs candidates into the pending-card fields with the tab run's own sessionId embedded

### Task 2 — deliverables projection + tab context
- `buildInitialDeliverables`: all slots `draft` / `待生成` / `0 字` / empty content — the `idx < 6` fake-ready branch, `'2025-06-01 15:30'` and `Math.random()` word counts are gone (catalog metadata itself untouched, per CONTEXT)
- `hydrateDeliverableSlots`: filters `getCurrentDocs()` by `category === 'deliverable'`, maps by the Phase 16 stable docId `deliverable-${productId}-${slotCode}` → ready/content/updatedAt/wordCount; unmatched docs skipped
- persist `version: 3` + migrate: ready slots without `aiSource` provenance reset to empty slots (fabricated history wiped); committed slots (commitDeliverableDraft always stamps aiSource) survive
- Boot: `hydrateDeliverableSlots()` fires right after `hydrateKnowledgeFromRepo()` in initializeDatabase.ts
- `buildCoreContext(tabPayload?: { kind; instruction })` — optional param, all existing call sites unchanged; injects `## Tab Task Context` before `## User Preferences`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] chatConsoleStore.ts needed a routing entry point**
- **Found during:** Task 1
- **Issue:** The plan says to route tab-run confirmation candidates "照抄 chatConsoleStore 既有 confirmation 处理" into the global queue, but the candidate mappers were private and the queue is chatConsoleStore's pending fields — no public enqueue existed
- **Fix:** Added exported `routeEngineCandidateToConsole` to chatConsoleStore.ts reusing the existing `toKnowledgeWriteCandidate`/`toDestructiveCandidate` mappers (files_modified didn't list this file; ~45-line additive helper)
- **Commit:** 5002f84

**2. [Rule 2 - Known limitation] rehydrateTabRuns is a no-op after a webview reload**
- **Issue:** The plan mandates the store is NOT persisted ("run 是瞬态") yet also mandates reload rehydration — after a true reload `runs` is empty, so there is nothing to rehydrate
- **Handling:** Implemented per spec (iterates surviving active runs, one-shot event pull); if 26-03 decides to persist minimal run metadata, rehydrate becomes live with zero changes here
- **Files:** src/stores/tabRunStore.ts

## Verification

- `npx tsc --noEmit` — zero errors (after both tasks)
- `npm test` — 222/222 pass
- Acceptance greps: `sessionId: crypto.randomUUID()` hit, `engineRun(`/`engineCancel(`/`runsByTab` hit in tabRunStore; `2025-06-01` and `idx < 6` = 0 in rndStore; `hydrateDeliverableSlots` present with boot caller; `Tab Task Context` + `tabPayload?` present in context.ts

## Self-Check: PASSED

- Files: src/stores/tabRunStore.ts FOUND, all modified files committed
- Commits: 5002f84, 0265d97 FOUND
