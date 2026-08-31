---
phase: 26-mock-tab
plan: "04"
subsystem: rnd-tabs
tags: [tab-run, engine-wiring, mock-removal, hitl]
requires: ["26-01", "26-02", "26-03"]
provides: ["all-tabs engine wiring", "18-code generateDeliverable rollout", "mock-free rnd domain"]
affects: [src/components/product/, src/stores/rndStore.ts, src/stores/productStore.ts, src-tauri/src/engine/tools.rs]
tech-stack:
  added: []
  patterns: [26-03 startTabRun pattern replicated to 6 tabs + batch + skills; single multi-step batch run]
key-files:
  created: []
  modified:
    - src/components/product/UIPrototypeTab.tsx
    - src/components/product/CodeManagementTab.tsx
    - src/components/product/TestManagementTab.tsx
    - src/components/product/CompetitorAnalysisTab.tsx
    - src/components/product/FullDeliverablesTab.tsx
    - src/components/product/ProductSkillsTab.tsx
    - src/components/product/AIRequirementsTab.tsx
    - src/stores/rndStore.ts
    - src/stores/productStore.ts
    - src/store/AppContext.tsx
    - src/data/mockRndData.ts
    - src/ai/confirmations.ts
    - src/ai/tools/generateDeliverable.ts
    - src/ai/tools/rndAdvanced.ts
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
decisions:
  - generateDeliverable widened from prd-only to all 18 catalog codes on BOTH sides (TS + Rust parity, DELIV-05 rollout) — required for the TAB-06 single-run batch must_have
  - Competitor tab candidates go through knowledge_write (no competitor slot exists in the 18-item catalog); structured radar/SWOT buckets stay empty until native tools write them
  - Prototype/code tabs read committed catalog slots DEL-DES-01 / DEL-DEV-01 as their document source (26-03 slot-read pattern)
  - persist migrate wipes the five mock-only buckets (locked: delete, no migrate)
metrics:
  duration: 83m
  completed: 2026-08-31
  tasks: 2
  files: 16
---

# Phase 26 Plan 04: 其余 tab 接线 + mock 全清 Summary

All remaining R&D tabs (prototype/code/test/competitor), the one-click 18-deliverable batch (single multi-step run), and product skills now trigger real `engine_run`s; every rnd mock action, fabricate fallback and seed bucket is deleted. grep-audit across `src/` returns zero mock residue.

## What Was Built

### Pre-task deviation commit (ff6e30c): 18-code generateDeliverable
- Engine tool only accepted `code: "prd"` — the plan's batch must_have (per-deliverable candidates) was impossible without widening. Extended `SLOT_BY_CODE` to `prd` + all 18 `DEL-*` catalog codes in both `src-tauri/src/engine/tools.rs` and `src/ai/tools/generateDeliverable.ts` (bilateral parity), updated schema enums, tool descriptions and the system-prompt rule. `cargo test` 178 pass, `npm test` 222 pass.

### Task 1: 五 tab + FullDeliverablesTab + runProductSkill 接线 (dc74f30)
- **UIPrototypeTab**: rewritten around the 26-03 pattern — `startTabRun({tabId:'prototype', kind:'prototype'})`, TabRunPanel, run-disable + web-fallback tooltips, device/theme feed the userMessage; fabricated interactive sandbox/code-viewer/tokens panels deleted; content renders from committed slot `DEL-DES-01`; spec empty state 「还没有原型方案…」.
- **CodeManagementTab**: `kind:'code'`, preset selector feeds instruction (文档级 scaffold plan — real file writes stay v0.4 Out of Scope); reads slot `DEL-DEV-01`; empty state.
- **TestManagementTab**: `kind:'test'` (structured test-case doc, slot `DEL-TST-01`); `runTestCase`/`runAllTestCases` kept as documented debt; empty state on the list.
- **CompetitorAnalysisTab**: `kind:'competitor'`; candidates via `knowledge_write` (no competitor catalog slot); structured sub-views gated on real data, empty state otherwise.
- **FullDeliverablesTab**: 一键生成十八份交付物 = **one** `startTabRun` (kind `deliverable-batch`, catalog codes+titles enumerated in the instruction, per-deliverable candidates, explicit "不要合并为一份文档"); old onProgress percentage UI deleted (TabRunPanel events are the progress); per-card regenerate = `deliverable-single` with per-slot tabId; CTA label updated to UI-SPEC.
- **ProductSkillsTab**: skill run → `startTabRun({tabId:\`skill-${skill.id}\`, kind:'product-skill'})` with instruction built from skill name/code/description; fabricated result-modal fallback deleted; per-skill TabRunPanel mounted in the card (null-guarded); reactive running state via runsByTab subscription.
- Web fallback `!isTauri()` → disabled + 「此功能需要桌面引擎，请使用桌面版 Nova。」 on every AI button (8 occurrences across 7 files).

### Task 2: mock 全删 + fabricate 兜底清除 (9f6c170)
- rndStore: 7 `generate*AI` + `polishKnowledgeArticleAI` deleted (interface + impl + AppContext forwards/types); `getRequirement/Prototype/CompetitorForProduct` return `EMPTY_*` on any miss (P12 closed, `INITIAL_COMPETITOR_DATA.p1` reference gone).
- mockRndData: `INITIAL_REQUIREMENTS/PROTOTYPES/CODE_SCAFFOLDS/TEST_CASES/COMPETITOR_DATA` deleted entirely; `FULL_LIFECYCLE_DELIVERABLES_CATALOG` + all types kept (catalog = 目录定义, locked). Buckets init `{}`; seedData.ts inlines `{}`.
- persist migrate v3 wipes the five mock-only buckets (locked decision「直接删除,不迁移」).
- productStore `runProductSkill` deleted; `rndAdvanced.ts` mock-backed `generateDeliverable` TS tool removed (real two-phase tool is generateDeliverable.ts); phase11/rndStore tests updated accordingly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Engine generateDeliverable only accepted code "prd"**
- **Found during:** Task 1 prep
- **Issue:** The batch must_have requires per-deliverable candidates, but `SLOT_BY_CODE` had a single entry (both Rust and TS).
- **Fix:** Widened to `prd` + all 18 catalog codes on both sides (schema enum, descriptions, prompt rule). Plan anticipated DELIV-05 "加行即可".
- **Files:** src-tauri/src/engine/tools.rs, loop_runner.rs, src/ai/tools/generateDeliverable.ts, src/ai/confirmations.ts
- **Commit:** ff6e30c

**2. [Rule 1 - Bug] 26-03 requirements tab read a slot code that never matched**
- **Found during:** Task 1
- **Issue:** `AIRequirementsTab` looked up `d.code === 'prd'` but commits land on slot `DEL-REQ-01` (SLOT_BY_CODE mapping) — the PRD panel would always show the empty state.
- **Fix:** Read slot `DEL-REQ-01`.
- **Files:** src/components/product/AIRequirementsTab.tsx
- **Commit:** dc74f30

**3. [Rule 1 - Bug] Legacy mock generateDeliverable tool in rndAdvanced.ts**
- **Found during:** Task 2
- **Issue:** A Phase-11 TS tool still called the deleted `generateDeliverableAI` store mock.
- **Fix:** Removed the registration + its phase11 test block (real tool covered by phase16 tests).
- **Commits:** 9f6c170

## Verification

- `npx tsc --noEmit`: zero errors; `npm run build`: success; `npm test`: 221/221 pass; `cargo test`: 178 pass
- Residual grep (all seven generate*AI + runProductSkill + five INITIAL_* across `src/`): **0 lines**
- `deliverable-batch` present in FullDeliverablesTab with exactly 1 batch `startTabRun` entry; no per-deliverable run loop
- `startTabRun` in components: 10 occurrences; 「此功能需要桌面引擎」: 8 across 7 files
- runTestCase/runAllTestCases fake setTimeout passes retained by plan (explicit v0.4 coding-tools debt)

## Known Stubs / Limitations

- **Competitor structured buckets**: radar/SWOT/competitor cards render only when `competitorData` has content — nothing writes that bucket yet (candidates land in knowledge_docs via knowledge_write). Committing competitor analysis into structured buckets needs native tools (v0.4). Doc is searchable in Knowledge Base.
- **runTestCase / runAllTestCases**: still fake setTimeout pass-throughs (plan-scoped debt, coding tools v0.4).
- **PRD sub-tabs** (stories/use cases/boundary/flowchart) render empty once mock seeds are wiped — content arrives only when native tools project structured data (documented 26-03 limitation, now visible by design).

## Self-Check: PASSED

- Commits ff6e30c, dc74f30, 9f6c170: FOUND
- src/components/rnd/TabRunPanel.tsx (dependency): FOUND

