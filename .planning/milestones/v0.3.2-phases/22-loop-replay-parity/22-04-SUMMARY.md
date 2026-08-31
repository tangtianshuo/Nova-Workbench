---
phase: 22-loop-replay-parity
plan: 04
subsystem: rust-run-engine
tags: [projection, compaction, fork, parity]
requires: ["22-02 estimate_tokens", "22-03 event_log AgentEvent/invariants"]
provides: ["ChatSession::from_events/get_messages_for_llm", "maybe_compact_session", "build_fork_event_stream/resolve_session_events", "projection-cases.json 双侧 parity fixture"]
affects: ["src-tauri/src/engine/mod.rs", "src-tauri/src/engine/event_log.rs"]
tech-stack:
  added: []
  patterns: ["TS 生成 expectedMessages 的单源 parity fixture 模式"]
key-files:
  created:
    - src-tauri/src/engine/chat_session.rs
    - src-tauri/src/engine/compaction.rs
    - src-tauri/src/engine/fork.rs
    - src/ai/__tests__/fixtures/projection-cases.json
  modified:
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/event_log.rs
decisions:
  - "parity 锁定对象 = getMessagesForLLM 投影(不比事件序列);fixture 由真实 TS 投影一次性生成,双侧单源"
  - "serde_json BTreeMap 键序差异仅影响 tool_call args token 估算(非持久文本),接受"
  - "CompactionSummarizer 为 FnMut 闭包注入(测试 fake / 生产 LLM 由 22-05 接线)"
metrics:
  duration: 45m
  completed: 2026-08-24
---

# Phase 22 Plan 04: 投影与压缩移植 Summary

ChatSession 投影函数群 + 0.8× 配对边界压缩 + fork seq remap 递归 resolve 移植 Rust,并以 TS 真实投影生成的 projection-cases.json(9 例含 fork-后-压缩)作为双侧逐位 parity 锁。

## What Was Done

### Task 1: chat_session.rs — 投影函数群 1:1 移植 (commit 45e7840)
- `group_into_turns` / `trim_to_budget` / `trim_oversized_turn` / `collapse_tool_call_assistants` 逐函数移植;`DEFAULT_MAX_TURNS=8`、`DEFAULT_TOKEN_BUDGET=8000`
- `format_compaction_summary` 与 chatSession.ts:45-47 模板逐字一致(测试锁定)
- `ChatSession::from_events` compaction-aware 重建 + `get_messages_for_llm` 摘要前置;`tool_call` 缺 content 回落 `[requesting tools]`
- addMessage/appendAuxEvent 事件发射留接口注释(22-05 loop 实现)
- 7 cargo tests(≥ TS 6 用例):collapse/rebuild/CJK 预算/8-turn 窗口/tiny budget/compaction 前置/格式串

### Task 2: compaction.rs + fork.rs + projection-cases.json (commit 199030d)
- `compaction.rs`:常量 0.8/0.5/12000/2000;`token_pressure` / `find_split_point`(suffix 预算 + 配对平衡 + ≥1 turn_ended 前缀)/ `build_transcript`(earlier summary carry-forward + 12000 截断)/ `maybe_compact_session`(forkOffset = 非本 session 事件数,payload seq 字段 child-space 落盘;summarizer 闭包注入)
- `fork.rs`:`SEQ_PAYLOAD_FIELDS=["splitSeq","coveredSeqStart","coveredSeqEnd"]` 两段式 remap(prefix identity / child += prefix.length);`build_fork_event_stream` 三门(NO_PREFIX_TURN→MID_TURN→UNBALANCED,与 TS 门序一致);`resolve_session_events` 经 sessions 表递归(fork-of-fork),invalid 回落 own events 不抛错
- `event_log.rs` 增 `check_event_stream_issues_free`(TS `.length===0` 语义)
- `projection-cases.json` 9 例:basic / tool-pairing / HITL pending 孤儿 tool_call / compaction 前置 / fork / **fork-compaction(child-space remap)** / restore unknown marker(22-01 第三态)/ 幂等分类 payload / 10-turn 窗口;expectedMessages 由真实 TS `ChatSession.fromEvents(...).getMessagesForLLM()` 一次性生成固化
- cargo `projection_cases_parity_fixture` 遍历 fixture,role+content 逐字段断言 —— 首跑即绿

## Verification

- `cargo test` 全量 84/84 通过(2 ignored 为 UAT probe)
- 验收项:`grep 8000/DEFAULT_MAX_TURNS/fn get_messages_for_llm chat_session.rs` ✓;`grep 12000 compaction.rs`、`grep splitSeq fork.rs` ✓;fixture ≥8 例且含 fork-compaction ✓

## Deviations from Plan

- **[Rule 3 - blocking]** TS `findCompactionSplitPoint` 导出名按 Rust snake_case 为 `find_split_point`;`findForkCutSeq` → `find_fork_cut_seq`(plan artifacts 列名 `fork_cut_seq` 微调,语义一致)
- **[Rule 1 - bug]** 测试辅助 `live_session` 需显式传 sessionId(fork 场景 from_events 默认取首事件 session_id = parent),否则 compaction 事件误落 parent —— 修正为 `Some(session_id)`
- 其余按计划执行;serde_json BTreeMap 键序对 args token 估算的微小差异已注释接受(与 22-02 决策一致)

## Known Stubs

- 无阻断性 stub。addMessage 双写 / appendAuxEvent / 默认 summarizer(LLM 调用)为 22-05 loop 计划内工作,本 plan 仅留接口注释 —— 属计划边界而非遗漏。

## Self-Check: PASSED

- 文件存在:chat_session.rs / compaction.rs / fork.rs / projection-cases.json ✓
- 提交存在:45e7840、199030d ✓
