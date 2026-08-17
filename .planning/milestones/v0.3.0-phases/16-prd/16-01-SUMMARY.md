---
phase: 16-prd
plan: 01
subsystem: ai-deliverable-pipeline
tags: [tool, confirmations, knowledge-repo, rnd-store, fts5, migration]
requires:
  - Phase 14 confirmationStore (atomic conditional-UPDATE consume)
  - Phase 15 knowledgeRepo (versioned docs + FTS5, migration 0004)
  - Phase 15 contextAssembler pending segment
provides:
  - generateDeliverable tool (two-phase: queue candidate / commit edited draft)
  - DeliverableDraftCandidate full lifecycle API (src/ai/confirmations.ts)
  - agentScope ambient sessionId/correlationId (src/ai/agentScope.ts)
  - rndStore.commitDeliverableDraft slot projection with aiSource pointer
  - knowledge_docs.source_event_id column (migration 0005)
  - contextAssembler deliverable anti-repropose injection
affects:
  - src/ai/toolLoop.ts (turn-entry setActiveAgentScope)
  - src/ai/contextAssembler.ts (pending segment now 4-way)
  - src/stores/rndStore.ts (hydrateKnowledgeFromRepo skips 'deliverable')
tech-stack:
  added: []
  patterns:
    - ambient scope module (agentScope) instead of threading provenance args
    - content-key dedup at API layer (no UNIQUE constraint on params_hash)
key-files:
  created:
    - src-tauri/migrations/0005_deliverable_source_event.sql
    - src/ai/agentScope.ts
    - src/ai/tools/generateDeliverable.ts
    - src/ai/__tests__/phase16DeliverableCandidates.test.ts
    - src/ai/__tests__/phase16GenerateDeliverable.test.ts
    - src/ai/__tests__/phase16ContextAssembler.test.ts
  modified:
    - src-tauri/src/lib.rs
    - src/ai/confirmationStore.ts
    - src/ai/confirmations.ts
    - src/ai/knowledgeRepo.ts
    - src/ai/toolLoop.ts
    - src/ai/index.ts
    - src/ai/contextAssembler.ts
    - src/ai/memoryStore.ts
    - src/stores/rndStore.ts
    - src/data/mockRndData.ts
decisions:
  - deliverable eventId rides in candidate params (survives restart) but is
    excluded from the dedup key; consume rehashes the FULL params shape from
    the candidate's original fields so it always matches row.paramsHash
  - stable docId `deliverable-<productId>-<slotCode>` — repeat commits of the
    same slot produce a new version and supersede the old one
  - memoryStore listActiveMemories gains a memoryRowid DESC tiebreak (see
    deviations) to keep newest-first deterministic on same-ms inserts
metrics:
  duration: ~35 min
  completed: 2026-08-15
---

# Phase 16 Plan 01: PRD Pipeline Backend Summary

Two-phase `generateDeliverable` tool on the Phase 14/15 substrate: first call only queues a `deliverable_draft` candidate (turn never interrupted); the confirmed + user-edited draft is atomically consumed, written as a versioned `knowledge_docs` row (category `deliverable` + tag `prd`, FTS5 indexed), projected into the rndStore `DEL-REQ-01` slot with an explicit `aiSource` (sessionId/eventId/generatedAt/docId/version) pointer, and the immediate FTS hit is audited in the tool result.

## What Was Built

**Task 1 — candidate storage foundation** (b3622e0, 71120d9)
- `migrations/0005_deliverable_source_event.sql`: `ALTER TABLE knowledge_docs ADD COLUMN source_event_id TEXT` + lib.rs registration (version 5).
- `src/ai/agentScope.ts`: ambient `AgentScope { sessionId, correlationId }` module (set by toolLoop each turn).
- `confirmationStore.ts`: `'deliverable_draft'` kind + `listRejected(kind, limit)` on interface, Memory and Sqlite implementations (rejected rows keep their 24h TTL so anti-repropose injection stays bounded).
- `confirmations.ts`: `createDeliverableDraftCandidate` (API-layer content dedup → same token, no new row), `get/confirm/reject/consume + listPending/listRejected` — all `deliverableFromRow`-isomorphic with the knowledge API.
- `knowledgeRepo.ts`: `sourceEventId` through `KnowledgeDocInput`/`KnowledgeDoc`/Memory upsert/SQLite row + INSERT ($11/$12 renumbered).

**Task 2 — generateDeliverable tool + slot commit path** (830c808, 75357f3)
- `src/ai/tools/generateDeliverable.ts`: zod `.strict()` schema (`code: z.enum(['prd'])`); queue branch guards `selectedProductId` with the exact UI-SPEC copy `请先选择一个产品,再生成 PRD。` and never throws `ConfirmationRequiredError`; commit branch does identity check (code/title) → idempotent confirm → atomic consume BEFORE any write → `upsertDoc` (stable docId `deliverable-<productId>-<slotCode>`) → `commitDeliverableDraft` slot projection → post-commit FTS search returning `ftsImmediateHit`/`ftsHitCount`.
- `rndStore.commitDeliverableDraft`: throws on unknown slot, sets `content/status 'ready'/generatedAt/wordCount/aiSource`.
- `hydrateKnowledgeFromRepo` now skips `category === 'deliverable'` docs (FTS-search-only surface, sidebar categories stay honest).
- `toolLoop.ts` stamps `setActiveAgentScope({ sessionId, correlationId })` right after `setCorrelationId`; `index.ts` registers the tool.

**Task 3 — contextAssembler anti-repropose segment** (e0c0be1, 8b06a0f)
- Pending segment is now 4-way (`Promise.all`, deliverable queries degrade to `[]` on failure): rejected deliverables render `不要再生成以下交付物草稿（用户已忽略）: PRD《title》` before the pending lines, pending ones render `- （待用户确认）PRD 草稿《title》`; audit `items` = memory + deliverable pending counts. Zero drift when no deliverable candidates exist (phase15 tests untouched and green).

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` (full suite) | 146/146 green (128 baseline + 18 new) |
| `npm run lint` (tsc --noEmit) | zero errors |
| `grep -c deliverable_draft` | confirmationStore.ts: 2, confirmations.ts: 5 |
| migration 0005 registered | lib.rs version 5 entry present |
| TDD discipline | every task: RED commit → GREEN commit |

New tests: 6 (candidates) + 8 (tool) + 4 (assembler) = 18, covering all 22 behavior bullets from the plan (several bullets asserted inside one test, e.g. version chain + supersede).

## Success Criteria Coverage

- **DELIV-01**: tool exists, carries current product context, exact no-product error (automated).
- **DELIV-03 (write side)**: doc `sourceType 'agent'` + sourceSessionId + sourceEventId (corr-16 asserted) + generatedAt; slot `aiSource` complete with docId/version pointer.
- **DELIV-04**: single-write API reuse; post-commit `search` hit asserted (`ftsImmediateHit: true`).
- **DELIV-02 (backend half)**: confirm → edit → commit atomic chain; edited draft ('EDITED') is the committed content; double-consume rejected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eventId persistence contradiction in plan pseudo-code**
- **Found during:** Task 1 implementation
- **Issue:** Plan's `createDeliverableDraftCandidate` stored `params = { code, productId, title, draft }` (so the dedup/consume hash equals `row.paramsHash`), but `deliverableFromRow` reads `row.params.eventId` — eventId would be silently lost, breaking the DELIV-03 provenance assertion (`aiSource.eventId 'corr-16'`) after any restore.
- **Fix:** eventId rides in the stored params (survives restart) but is excluded from the dedup key (direct field compare over the 4 content fields); `consumeDeliverableDraftConfirmation` rehashes the FULL params shape from the candidate's original fields, which always equals the stored `row.paramsHash`. Documented inline in `src/ai/confirmations.ts`.
- **Files:** src/ai/confirmations.ts
- **Commit:** 71120d9

**2. [Rule 1 - Bug] Flaky Phase 15 assembler overflow test (pre-existing, surfaced now)**
- **Found during:** Task 3 verification
- **Issue:** `listActiveMemories` sorted only by `confirmedAt DESC`; 30 tight-loop inserts share the same millisecond → stable sort kept insertion (oldest-first) order → assembler dropped the newest instead of the oldest. Failed intermittently depending on process timing, not on this plan's changes.
- **Fix:** `memoryRowid DESC` tiebreak in the shared sort (one line, root cause — all callers get deterministic newest-first).
- **Files:** src/ai/memoryStore.ts
- **Commit:** 8b06a0f

**3. [Rule 3 - Blocking] tsc TS2352 on params cast**
- **Found during:** Task 1 lint
- **Issue:** `row.params as DeliverableParams` failed — interfaces don't get implicit index signatures.
- **Fix:** `DeliverableParams` is a type alias (comment explains why).
- **Files:** src/ai/confirmations.ts
- **Commit:** 71120d9

## Known Stubs

None — every surface added in this plan is fully wired (tool registered, scope stamped, slot projection live, FTS audited). Plan 02 (ChatPanel candidate cards) and Plan 03 (AI badge) consume these exports next.

## Auth Gates

None.

## Self-Check: PASSED

All 6 created files exist on disk; all 6 task commits present in git log; npm test 146/146 green; lint clean.
