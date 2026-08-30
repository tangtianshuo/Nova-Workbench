---
phase: 22-loop-replay-parity
plan: 08
subsystem: agent-engine
tags: [gap-closure, uat, hitl, prompt-rules, loop-budget]
requires:
  - "22-05 loop_runner + tools (Llm trait, event log sole writer)"
  - "22-06 engine_run wiring"
provides:
  - "knowledge_write productId ctx fallback (HITL card appears without model-supplied id)"
  - "search-termination + failure-recovery prompt rules"
  - "MAX_ITERATIONS=8 with graceful no-tools wrap-up turn (outcome=tool_limit, truncated=false)"
affects:
  - src-tauri/src/engine/tools.rs
  - src-tauri/src/engine/loop_runner.rs
  - src-tauri/src/engine/commands.rs
  - src-tauri/src/engine/scheduler.rs
gap_closure: true
tech-stack:
  added: []
  patterns:
    - "ctx fallback mirroring (knowledge_write now symmetric with memory_write)"
    - "Llm::chat_no_tools seam — provider gets empty tools array to force a direct answer"
key-files:
  created: []
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/scheduler.rs
decisions:
  - "knowledge_write productId: model arg wins, ctx.product_id fallback, arg_error only when neither present"
  - "Budget exhaustion = one no-tools wrap-up LLM call (Chinese), not an English marker; parity-locked Tool→User projection and [requesting tools] placeholder untouched"
metrics:
  duration: 25m
  completed: 2026-08-30
---

# Phase 22 Plan 08: UAT Gap Closure Summary

**One-liner:** Closed the 3 diagnosed UAT gaps (Test 2/4/5) via knowledge_write ctx fallback, search-budget prompt rules, and a no-tools wrap-up turn at MAX_ITERATIONS=8.

## What Was Done

### Task 1: knowledge_write productId ctx fallback (28595e4)
- `execute_knowledge_write`: productId removed from required-key loop; resolved via `str_arg(args, "productId").or(ctx.product_id)` (memory_write parity); arg_error with "no product selected" message when neither present.
- Effective args (with resolved id) flow into `create_candidate` and the HITL card `args` — webview confirm path gets a concrete productId.
- Schema: productId carries "Optional when a product is selected" guidance; `required` = `["title", "content"]`.
- 3 new tools tests: ctx fallback (candidate + DB row), no-ctx arg_error, explicit id wins over ctx.

### Task 2: prompt rules + MAX_ITERATIONS=8 + wrap-up turn (85716cc)
- `MAX_ITERATIONS: u32 = 8`; header comment updated.
- ROLE_AND_TOOL_RULES + two rules: 1-2 knowledge_search budget ("STOP searching and answer"), fail-once-recovery ("Never invent confirmation prompts or numbered-choice menus").
- `Llm` trait gains `chat_no_tools`; EngineLlm adapter calls `llm::chat_with_tools` with an empty tools vec; both test FakeLlms (loop_runner, scheduler) pop the next scripted turn.
- Exhaustion path replaced: one no-tools wrap-up LLM call with a Chinese-answer directive → `assistant_message` + `turn_ended{outcome: "tool_limit"}` + `truncated: false`. The `[tool loop reached the {N}-iteration limit]` string is deleted from the codebase.

### Task 3: regression locks + full suite (85716cc)
- `system_prompt_has_degradation_note_and_no_crud_tools` extended to lock both new prompt rules.
- `max_iterations_truncates` → `max_iterations_forces_wrapup_turn`: 8 tool turns + wrap-up turn; asserts truncated=false, iterations=9, content == scripted Chinese text, no payload contains "iteration limit".
- New loop-level `knowledge_write_missing_product_id_uses_ctx`: ctx product_id=Some("p1"), model omits productId → pending_confirmation kind=knowledge_write with args.productId=p1, outcome=awaiting_confirmation, tool_calls_executed=0 (locks Test 5's exact failure shape).
- cargo test: 169 passed / 0 failed / 2 ignored. `npm run lint` (tsc --noEmit): clean.

## Verification

- `cargo test` full suite green (169/169, 2 ignored — pre-existing Ollama UAT ignores).
- Parity-locked surfaces untouched: Tool→User projection (loop_runner ~:249) and `[requesting tools]` placeholder (~:289) unchanged; `single_readonly_tool_turn` still green.
- UAT Test 2/4/5 remain to be re-verified manually in a built app (normal chat completes; search stops and answers; knowledge_write shows HITL card with buttons).

## Deviations from Plan

None — plan executed exactly as written. (Tasks 2 and 3 share one commit since Task 3's tests exercise Task 2's code; all test names and prompt text match the plan verbatim.)

## Known Stubs

None.
