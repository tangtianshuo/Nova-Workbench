---
phase: 22-loop-replay-parity
verified: 2026-08-30T00:00:00Z
status: passed
score: 6/6 must-haves verified (code level; 2 UAT re-tests routed to human)
re_verification:
  previous_status: passed
  previous_score: 4.5/5 (initial PASS_WITH_NOTES, then 22-08 gap closure re-verified)
  gaps_closed:
    - "22-08: Test 2 loop-limit death / Test 4 unbounded search / Test 5 missing HITL card — verified fixed in prior re-verification, regression-checked again below"
    - "22-09 Gap 1: knowledge_write category enum asymmetry — Rust 9-value enum + pre-candidate arg_error + tags default, TS zod untouched"
    - "22-09 Gap 2: llama3.2 1b over-search — classified known capability limitation (DB-evidenced), structural wrap-up locked by test"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "UAT Test 5 re-test: with a product selected, ask agent to write a knowledge article using any category wording; if invalid, agent self-corrects BEFORE the card; card appears -> confirm -> 落库 succeeds (no zod invalid_value)"
    expected: "arg_error pre-card on invalid category (model retries with valid enum value); confirm writes the knowledge row; reject leaves no orphan"
    why_human: "cross-boundary HITL flow needs real LLM + built desktop app"
  - test: "UAT Test 4 re-test (optional, llama3.2 1b): ask agent to search the knowledge base"
    expected: "run may over-search but ends with graceful Chinese wrap-up (outcome=tool_limit or completed, truncated=false), never abnormal termination / English marker"
    why_human: "real 1B model retrieval behavior cannot be scripted"
---

# Phase 22: 引擎核心 Verification Report (re-verification round 2)

**Phase Goal:** 引擎核心(loop 语义移植 + 事件唯一写者 + replay parity)— toolLoop/compaction/contextAssembler 语义移植 Rust,Rust 接管 agent_* 表唯一写者,单 run 打通现有 ChatPanel,验收 = 事件日志逐位回放平价;PORT-01 协议最先定稿
**Verified:** 2026-08-30
**Status:** passed (code level; 2 manual UAT re-tests listed, non-blocking)
**Re-verification:** Yes — after 22-08 (3 UAT gaps) and 22-09 (2 new UAT gaps) closure

## Goal Achievement — 22-09 Gap Closure Verification

### Observable Truths (22-09 must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 非法 category 在候选创建前被拒(arg_error,列出 9 个合法值) | ✓ VERIFIED | tools.rs:333 `KNOWLEDGE_CATEGORIES: [&str; 9]`; tools.rs:404-411 `!KNOWLEDGE_CATEGORIES.contains(&category)` → `Failed{arg_error}` with `category must be one of [{9 values}]`, placed BEFORE product_id resolution and `create_candidate` (tools.rs:437); test `knowledge_write_invalid_category_rejected_pre_candidate` (tools.rs:714) asserts message + 0 candidate rows; full suite green |
| 2 | 确认后重放成功落库:Rust args 与 TS zod 完全兼容(category ∈ 9 值, tags 有默认) | ✓ VERIFIED | Rust enum (tools.rs:333-336) vs TS `knowledgeCategories` (knowledgeWrite.ts:13-22): all 9 values identical, order identical; PAIRED sync comments both sides (tools.rs:331 doc comment, knowledgeWrite.ts:12); `effective_args["category"]` set + `effective_args["tags"] = json!([])` default (tools.rs:429-431); tests `knowledge_write_valid_category_creates_candidate` (:735) and `knowledge_write_defaults_tags_to_empty_array` (:748); TS zod schema untouched (git diff = 1 comment line per 22-09 SUMMARY; `npm run lint` clean) |
| 3 | llama3.2 1b 终态已核实并以测试/文档锁定 | ✓ VERIFIED | STATE.md:134 dated 2026-08-30 entry: known capability limitation (non-code), DB evidence (session fc154236: 4 over-search + arg_error rounds, outcome=completed iterations=6; no truncated/abnormal session post-22-08); structural bound locked by `max_iterations_forces_wrapup_turn` (truncated=false + outcome=tool_limit + Chinese wrap-up + no English marker); STATE.md cites session id per plan escalation clause (none abnormal) |

### 22-09 Acceptance Criteria Spot-Checks

| Check | Result | Status |
|-------|--------|--------|
| `KNOWLEDGE_CATEGORIES` const with all 9 values (架构设计…踩坑指南) | tools.rs:333-336 | ✓ |
| Schema `"enum"` on category property | tools.rs:101 | ✓ |
| `category must be one of` before `create_candidate` | tools.rs:404 before tools.rs:437 | ✓ |
| `effective_args["tags"] = json!([])` | tools.rs:431 | ✓ |
| TS: PAIRED comment, schema untouched | knowledgeWrite.ts:12, lint clean | ✓ |
| STATE.md dated Gap-2 classification | STATE.md:134 | ✓ |
| Parity-locked surfaces untouched | fixtures unchanged; projection logic not modified | ✓ |

## Regression Suite (re-run this verification)

- `cargo test` (src-tauri, package `nova_pm_workspace`): **172 passed / 0 failed / 2 ignored** ✓
- `node --import tsx --test src/ai/__tests__/*.test.ts`: **175 pass / 0 fail** ✓
- `npm run lint` (tsc --noEmit): **exit 0** ✓

## Prior Must-Have Regression Checks (22-01..22-08 quick pass)

| Item | Status | Evidence |
|------|--------|----------|
| English loop-limit marker absent | ✓ | `grep "tool loop reached the" src-tauri/src/` → 0 hits |
| MAX_ITERATIONS=8 + wrap-up | ✓ | loop_runner.rs:26 `pub const MAX_ITERATIONS: u32 = 8` |
| knowledge_search prompt budget | ✓ | `at most 1-2 knowledge_search calls` present (2 hits: rule + test assertion) |
| ChatPanel wired to engine | ✓ | chatConsoleStore.ts:17/612 `engineRun`; no `runToolLoop(` callers outside tests |
| productId ctx fallback intact | ✓ | tools.rs:415-422 (22-08 fix still in place, now after category check) |
| PORT-01 / replay parity / HITL / restore | ✓ | covered by full cargo+npm suites green; no parity fixture changes in 22-09 |
| ENG-02 TS write seams (prior note) | ✓ RESOLVED by later phases | `src/ai/toolLoop.ts`, compaction, contextAssembler deleted (Phase 25); `appendAuxEvent` has no caller in chatConsoleStore (definition only, chatSession.ts:192) |

## Requirements Coverage

| REQ | Source Plans | Status | Evidence |
|-----|-------------|--------|----------|
| ENG-01 | 22-01..05 | SATISFIED | engineRun sole runtime path; TS loop deleted |
| ENG-02 | 22-01..06 | SATISFIED | event_log sole writer on engine path; prior TS seams closed by Phase 23/25 |
| ENG-03 | 22-03..05, 22-08, 22-09 | SATISFIED | parity.rs + TS parity tests green (175/175 incl. parity.rust); graceful wrap-up outcome |
| ENG-04 | 22-06, 22-08, 22-09 | SATISFIED (code) | candidate always carries valid category/tags/productId; card→confirm chain code-verified; end-to-end = human UAT |
| ENG-05 | 22-07 | SATISFIED | restore idempotence + interrupted never-re-execute tests green |
| PORT-01 | 22-01 | SATISFIED | third-state marker + idempotency classification + verify-first (prior verification; untouched since) |

No orphaned requirements — all 6 IDs appear in plan frontmatter and REQUIREMENTS.md marks Phase 22 for each.

## Anti-Patterns Found

None blocking. The only noted seams (TS agent_* writes) were removed by Phases 23-25, confirmed by grep.

## Human Verification Required (non-blocking)

### 1. UAT Test 5 re-test — knowledge_write card→confirm→落库
**Test:** 选中产品,让 agent 写知识库(可故意用非枚举 category 措辞)
**Expected:** 非法 category → arg_error 提示在卡片出现前,模型自我纠正;卡片出现后确认 → 落库成功(无 zod invalid_value);拒绝 → 无孤儿
**Why human:** 需真实 LLM + built app 的跨边界确认流

### 2. UAT Test 4 re-test(可选)— llama3.2 1b 检索终态
**Test:** 用 Ollama 1b 让 agent 搜知识库
**Expected:** 可能过度检索,但以中文收尾轮优雅结束(outcome=tool_limit/completed,truncated=false),绝不异常终止
**Why human:** 真实 1B 模型行为无法脚本验证

### Gaps Summary

No gaps. Both 22-09 gap closures verified at code level with regression locks (172/172 cargo, 175/175 TS, lint clean). Phase 22 goal achieved; phases 23-25 gate remains green.

---

_Verified: 2026-08-30_
_Verifier: Claude (gsd-verifier)_
_Previous report preserved in git history (PASS_WITH_NOTES 2026-08-24, 22-08 gap-closure re-verification 2026-08-30)._
