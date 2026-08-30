---
phase: 22-loop-replay-parity
plan: 09
subsystem: agent-engine
tags: [gap-closure, uat, hitl, enum-parity, capability-limit]
requires:
  - "22-08 gap closure (productId ctx fallback, wrap-up turn)"
provides:
  - "knowledge_write category 9-value enum (schema + pre-candidate arg_error) + tags default injection — confirm→replay chain closes"
  - "llama3.2 1b over-search classified as known capability limitation (DB-evidenced)"
affects:
  - src-tauri/src/engine/tools.rs
  - src/ai/tools/knowledgeWrite.ts
  - .planning/STATE.md
gap_closure: true
tech-stack:
  added: []
  patterns:
    - "PAIRED constant sync comment across Rust/TS (no cross-language single-source mechanism)"
key-files:
  created: []
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
    - src/ai/tools/knowledgeWrite.ts
    - .planning/STATE.md
decisions:
  - "Rust-side fix only: category enum + pre-candidate validation + tags default; TS zod schema untouched (one sync comment)"
  - "Gap 2 = known capability limitation (non-code): all post-22-08 Ollama 1b runs terminate gracefully (outcome=completed / structural tool_limit bound)"
metrics:
  duration: 30m
  completed: 2026-08-30
---

# Phase 22 Plan 09: UAT Gap Closure (round 2) Summary

**One-liner:** Closed the category enum asymmetry (Rust schema enum + pre-candidate arg_error + tags default) so knowledge_write survives card→confirm→replay; classified llama3.2 1b over-search as a capability limit with DB evidence.

## What Was Done

### Task 1: knowledge_write category enum parity (TDD) (f990e80, d435d1d)
- RED: 3 new tests — invalid category ("介绍") rejected pre-candidate with `category must be one of` + all 9 values + 0 candidate rows; valid category ("最佳实践") → AwaitConfirmation with candidate args; tags defaulted to `[]`. Watched 2 fail (valid-category test passed trivially pre-validation).
- GREEN: `KNOWLEDGE_CATEGORIES: [&str; 9]` const (PAIRED comment ↔ knowledgeWrite.ts:12); schema `category` gains `"enum"`; `execute_knowledge_write` validates category BEFORE product_id resolution → `Failed{arg_error}` listing all 9 values; effective_args sets category and defaults tags to `[]` (closes the same asymmetry class for the other required TS field).
- Existing tests updated to valid enum literal only: tools.rs (4 knowledge_write tests) + loop_runner.rs (2 scripted-args tests) — assertion semantics unchanged except `stored.params` now expects injected `tags: []`.
- TS touch: exactly one comment line above `knowledgeCategories`; zod schema untouched. `npm run lint` clean.

### Task 2: llama3.2 1b classification (1538175)
- `max_iterations_forces_wrapup_turn` verified: already asserts truncated=false, iterations=MAX+1, tool_calls_executed=MAX, content == scripted Chinese wrap-up, turn_ended outcome=tool_limit, no "iteration limit" in any payload, final assistant_message verbatim. No assertions missing — zero code change.
- Local DB (`%APPDATA%/com.nova.pm-workspace/nova.db`) evidence: no post-22-08 session terminated abnormally. Session fc154236 (08:36, 1b) did 4 knowledge_search + arg_error rounds yet ended `outcome=completed, iterations=6`. Session 02ab7d15 (09:12, Test 5 retest) shows the Gap 1 evidence live: model sent category "技术调研" (free text) and the card appeared anyway — exactly what Task 1 now rejects pre-card.
- STATE.md: dated entry classifying Gap 2 as **known capability limitation (non-code)**; structural bound (MAX_ITERATIONS=8 + no-tools Chinese wrap-up) is the engine guarantee; no 1B prompt-engineering.

### Task 3: full regression (no commit — verification only)
- `cargo test --lib`: 172 passed / 0 failed / 2 ignored (pre-existing Ollama UAT ignores).
- `npm run lint` (tsc --noEmit): clean.
- Parity fixtures already use valid enum literals ("最佳实践" in golden-paramsHash.json, realdb-sample-2.json) — zero fixture changes needed; projection logic untouched.

## Verification

- cargo full suite green; typecheck clean.
- Parity-locked surfaces untouched: Tool→User projection and "[requesting tools]" placeholder unchanged (loop_runner.rs diff = 2 test-arg lines only).
- UAT re-test pending (manual): Test 5 card→confirm→落库 with Task 1 in; Test 4 optional.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- Commits f990e80, d435d1d, 1538175 present on master.
- Modified files exist and are covered by the 172/172 green suite.
- SUMMARY at expected path; STATE/ROADMAP updated via gsd-tools.
