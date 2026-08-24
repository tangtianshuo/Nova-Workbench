---
phase: 22-loop-replay-parity
verified: 2026-08-24T00:00:00Z
status: passed
verdict: PASS_WITH_NOTES
score: 4.5/5 must-haves verified (SC-3 partial, bounded deviation)
notes:
  - "SC-3 literal '唯一写者' has two bounded TS runtime write seams remaining, both documented in 22-06 and deferred to Phase 23: (a) deliverable commit appendAuxEvent -> eventStore.append -> INSERT INTO agent_events (chatConsoleStore.ts:786); (b) memory confirm confirm()/consumeIntoMemories() -> UPDATE memory_candidates (chatConsoleStore.ts:713-715, memoryStore.ts:675). Both touch agent_* tables, NOT only business tables. These are user-action seams (PRD 落槽卡片 / 记忆确认卡片), not loop writes; runToolLoop runtime callers are zero, so no duplicate/orphan events on the engine path. Phase 23 tool bridge must migrate both before Phase 25 deletion."
human_verification: []
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
