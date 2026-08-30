---
phase: 22-loop-replay-parity
verified: 2026-08-30T00:00:00Z
status: passed
verdict: PASS_WITH_NOTES
score: 4.5/5 must-haves verified (SC-3 partial, bounded deviation)
notes:
  - "SC-3 literal '唯一写者' has two bounded TS runtime write seams remaining, both documented in 22-06 and deferred to Phase 23: (a) deliverable commit appendAuxEvent -> eventStore.append -> INSERT INTO agent_events (chatConsoleStore.ts:786); (b) memory confirm confirm()/consumeIntoMemories() -> UPDATE memory_candidates (chatConsoleStore.ts:713-715, memoryStore.ts:675). Both touch agent_* tables, NOT only business tables. These are user-action seams (PRD 落槽卡片 / 记忆确认卡片), not loop writes; runToolLoop runtime callers are zero, so no duplicate/orphan events on the engine path. Phase 23 tool bridge must migrate both before Phase 25 deletion."
human_verification:
  - { test: UAT-2 ChatPanel run completes (HITL card + no loop-limit marker), why_human: needs real LLM in built app }
  - { test: UAT-4 knowledge_search budgeted stop + graceful wrap-up, why_human: model behavior }
  - { test: UAT-5 knowledge_write HITL confirm/reject end-to-end, why_human: cross-boundary confirmation flow }
---

# Phase 22: 引擎核心 Verification Report

**Phase Goal:** 用户在现有 ChatPanel 发起对话,整轮 agent loop 由 Rust 常驻引擎完成,行为与 TS 引擎逐位一致
**Verified:** 2026-08-24
**Status:** PASS_WITH_NOTES (4.5/5)

## Test Baseline (re-run this verification)

- `cargo test`: **118 passed / 0 failed / 2 ignored** (UAT probes)
- `npm test`: **241 passed / 0 failed**
- `npm run lint` (tsc --noEmit): clean

## Per-Criterion Verdicts

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | PORT-01 协议定稿 | **PASS** | ADR-0003 附则 A (docs/adr/ADR-0003-rust-run-engine.md:68); 第三态 marker 字面量 restore.rs:23 `{"ok":false,"status":"unknown","interrupted":true,...}`; 幂等分类随 tool_call 落盘 loop_runner.rs:294 / commands.rs:329 (`tools::idempotency`); 工具描述 verify-before-rerun 后缀 tools.rs:23 PORT_01_SUFFIX; 旧/未知工具默认 verify_first (tools.rs:125); TS 侧 sessionRestore.ts marker 同步 (cargo+npm 全绿) |
| 2 | ChatPanel 全程走 Rust 引擎 | **PASS** | chatConsoleStore.ts:489 `engineRun({...})` (engine_run invoke + Channel, src/ai/api.ts:64); CmdKPalette.tsx:12 `engineRun`; HARD GATE 复验: `grep runToolLoop(` in src → 仅 toolLoop.ts:110 定义 + __tests__ 规格 (Phase 25 归档), store/components/views 零命中 |
| 3 | Rust 唯一写者 / 无孤儿无重复 | **PARTIAL → PASS_WITH_NOTES** | Loop 写路径已归 Rust (event_log.rs 事务 commit_turn, confirmations.rs, insert_memory_candidate)。但两处 TS 运行时写 agent_* 表残留: ① deliverable 落槽 `appendAuxEvent('deliverable_committed')` → INSERT INTO agent_events (chatConsoleStore.ts:786 → chatSession.ts:192 → eventStore.ts:151); ② 记忆确认 `confirm`+`consumeIntoMemories` → UPDATE memory_candidates (chatConsoleStore.ts:713-715 → memoryStore.ts:675)。22-06 已声明为 Known Stub,Phase 23 工具桥迁移。engine 主路径无孤儿/无重复 (runToolLoop 归零 + restore 幂等测试 restore.rs)。**判定: 违反 SC-3 字面唯一写者,但属用户动作接缝而非 loop 写;不阻塞 Phase 23 前进,Phase 25 删除 TS 前必须收口** |
| 4 | replay parity 永久测试 | **PASS** | parity.rs harness (canonical 键序 + ts/uuid 白名单 + modelText 逐字节 + null-vs-missing 严格); fixtures 11 例 (projection-cases.json 9 + realdb-sample-1/2 真实 v0.3.x nova.db v7 抽样 264/42 events); cargo `parity_projection_cases` 5 passed; TS parity.rust.test.ts 12/12 (npm 241 含); fixture 单源双侧 glob,新用例自动纳入 |
| 5 | HITL 跨边界 + 崩溃恢复 | **PASS** | engine_confirm_candidate / engine_reject_candidate / engine_append_tool_result / engine_cancel 全部接线 (api.ts:80-109; chatConsoleStore.ts:593-697 五处调用); 原子条件 UPDATE 并发恰一成功 (confirmations.rs `concurrent_consume_exactly_one_wins` 测试, named_params 保 TS SQL 逐字节); fresh tool_call_id 配对协议 (commands.rs 三分支 + `[confirmed rerun]` 测试); restore.rs: "NEVER re-execute a tool" 头注 + 孤儿 marker append + 尾切 find_crash_tail_cut_seq + 二次 restore 幂等测试; 启动接线 lib.rs:157 restore_latest_session |

## Requirements Coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| ENG-01 | SATISFIED | SC-2 |
| ENG-02 | PARTIAL (documented) | SC-3 — 两处 TS 写接缝延至 Phase 23 |
| ENG-03 | SATISFIED | SC-4 |
| ENG-04 | SATISFIED | SC-5 前半 (HITL 原子 UPDATE + 跨边界) |
| ENG-05 | SATISFIED | SC-5 后半 (尾切 + interrupted 不重执行) |
| PORT-01 | SATISFIED | SC-1 |

## Known Deviations Scrutinized (per verification request)

1. **memory confirm + deliverable commit TS 写** — 判定: **触 agent_* 表,非仅业务表**。consumeIntoMemories 的 UPDATE memory_candidates 是四表之一; appendAuxEvent 是 agent_events INSERT。严格读 SC-3 不满足;但 (a) 22-06 SUMMARY 明示Known Stub, (b) CONTEXT 只承诺业务表 TS 写,这两处是妥协残留, (c) 均为 HITL 用户动作路径,与 engine loop 写者不重叠,重启无孤儿/重复风险由 restore 幂等覆盖。结论: 合理边界但必须进 Phase 23 计划,不得再顺延。
2. **engine_run cancel 以 webview runId 为键** — 合理: correlation_id 对 engine_cancel 调用方不可知;chat requestId 模式同构;cancel 幂等有测试。
3. **engine_append_tool_result fresh-id 配对协议** — 正确: WAIT 的 tool_call 已被 awaitingConfirmation 结果配对,同 id 追加会触发 DUPLICATE_TOOL_RESULT 不变量;fresh id → 先追加 `[confirmed rerun]` tool_call 再 settle,commands.rs:385 测试锁定。

## Anti-Patterns / Gaps Summary

无 blocker。唯一实质性 gap = SC-3 两处 TS agent_* 写接缝(agent_events.deliverable_committed、memory_candidates confirm/consume),已文档化、Phase 23 范围。建议 Phase 23 plan 必须包含: appendAuxEvent → Rust command、confirmMemory → engine command(或 memory 工具桥)。

## Human Verification

无阻塞项(UAT 延后到 milestone 收口统一做,CONTEXT specifics 明确)。

---

_Verified: 2026-08-24_
_Verifier: Claude (gsd-verifier)_
---

# Gap Closure Re-verification (Plan 22-08, 2026-08-30)

**Trigger:** UAT found 3 issues (Test 2/4/5) post-initial PASS_WITH_NOTES; root causes diagnosed in 22-UAT.md; Plan 22-08 executed (commits 28595e4, 85716cc, a722c24).

## Code-Level Verification of the 3 UAT Gaps

| UAT Gap | Root Cause Fix | Status | Evidence |
|---|---|---|---|
| Test 2 (blocker): ChatPanel run 终死于 5-iteration limit | knowledge_write productId ctx fallback + search-budget prompt rules + MAX_ITERATIONS=8 + no-tools wrap-up turn | ✓ FIXED (code) | tools.rs:397 `str_arg(args, "productId").or(ctx.product_id)`; loop_runner.rs:26 `MAX_ITERATIONS: u32 = 8`; loop_runner.rs:423 `.chat_no_tools(...)` wrap-up path → `assistant_message` + `turn_ended{outcome:"tool_limit"}` + `truncated: false`; English marker `[tool loop reached the ...]` deleted — `grep "tool loop reached the" src-tauri/src/` returns **0 hits** |
| Test 4 (major): knowledge_search 无限检索直至截断 | prompt rule: "at most 1-2 knowledge_search calls per question, then STOP searching and answer directly ... Never enumerate the whole knowledge base" + budget raised to 8 + graceful wrap-up | ✓ FIXED (code) | loop_runner.rs:97 ROLE_AND_TOOL_RULES; locked by test assertion `prompt.contains("at most 1-2 knowledge_search calls")` (loop_runner.rs:547) |
| Test 5 (major): HITL 卡片无按钮(从未发出) | productId arg_error 在 create_candidate 之前拒绝 → 无 candidate → 无卡片。现在 ctx 兜底后 effective_args 带具体 productId 进入 create_candidate;另加 "Never invent confirmation prompts or numbered-choice menus" 防模型编造确认话术 | ✓ FIXED (code) | tools.rs:397-411 fallback + `effective_args["productId"] = json!(product_id)` 流入 candidate; loop 级测试 `knowledge_write_missing_product_id_uses_ctx` (loop_runner.rs:745) 锁定 pending_confirmation kind=knowledge_write + args.productId + outcome=awaiting_confirmation |

## Regression Suite (re-run)

- `cargo test`: **169 passed / 0 failed / 2 ignored** (matches executor report; 2 ignores = pre-existing Ollama probes)
- `npm run lint` (tsc --noEmit): clean
- Key regression tests present and passing: `knowledge_write_uses_ctx_product_id_when_model_omits_it` (tools.rs:689), `max_iterations_forces_wrapup_turn` (loop_runner.rs:713), `knowledge_write_missing_product_id_uses_ctx` (loop_runner.rs:745), prompt-rule assertions (loop_runner.rs:547-548)
- Parity-locked surfaces untouched: Tool→User projection and `[requesting tools]` placeholder per 22-08 SUMMARY; `single_readonly_tool_turn` green in suite

## Requirements Coverage (delta)

All 6 IDs (ENG-01..05, PORT-01) remain accounted for; 22-08 strengthens:
- **ENG-02** (loop 由 Rust 完成): wrap-up turn eliminates abnormal termination; marker string removed
- **ENG-03** (行为一致/正常完成): graceful tool_limit outcome with truncated=false
- **ENG-04** (HITL): knowledge_write candidate now always created when product selected → confirmation card reachable

## Verdict

**Status: passed (code-level).** All 3 diagnosed root causes verified fixed at code level with regression locks. The 3 UAT scenarios require manual re-test in a built app to confirm end-to-end behavior — listed below, non-blocking.

## Human Verification (manual UAT re-test required)

### 1. ChatPanel 对话正常完成
**Test:** 在 ChatPanel 发普通消息(涉及知识库写入,如"把这段总结写入知识库")
**Expected:** HITL 确认卡片出现且带「确认/拒绝」按钮;run 正常完成,无 "[tool loop reached the ...]" 英文 marker,消息持久化
**Why human:** 需真实 LLM + built app 交互,行为取决于模型对 prompt rules 的服从

### 2. knowledge_search 有预算地终止
**Test:** 让 agent"搜一下知识库里关于竞品的文章"
**Expected:** 1-2 次 knowledge_search 后停止并作答;即便打满预算,以中文收尾轮正常结束(outcome=tool_limit, truncated=false),非异常终止
**Why human:** 真实模型的检索行为无法用脚本验证

### 3. knowledge_write HITL 全链路
**Test:** 选中某产品后让 agent 写知识库,点「确认」→ 落库;点「拒绝」→ 取消路径
**Expected:** 卡片出现(candidate args 带具体 productId);确认后 knowledge 行落库;拒绝无孤儿事件
**Why human:** 跨 webview/Rust 确认流需真实交互

---

_Re-verified: 2026-08-30_
_Verifier: Claude (gsd-verifier)_
