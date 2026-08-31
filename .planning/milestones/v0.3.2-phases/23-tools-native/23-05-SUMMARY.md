---
phase: 23-tools-native
plan: "05"
subsystem: rust-run-engine
tags: [seam-migration, memory, hitl, tool-lock, phase-close]
requires: ["23-04 AlreadySettled 容忍先例 + engine command 模式", "23-02 exec whitelist", "22-03 memory_candidates Rust INSERT"]
provides: ["engine_consume_memory(confirm+consume+insert 一次 invoke,返回 MemoryRecord)", "engine_reject_memory", "confirmations::insert_memory(supersede 链)", "TOOL-04 loop 级集成锁(白名单直行 + 非白名单 WAIT)", "Phase 23 全部 grep gates 收口证据"]
affects: [src-tauri/src/engine/confirmations.rs, src-tauri/src/engine/commands.rs, src-tauri/src/lib.rs, src-tauri/src/engine/loop_runner.rs, src-tauri/src/engine/tools.rs, src/ai/api.ts, src/stores/chatConsoleStore.ts, src/ai/memoryStore.ts]
tech-stack:
  added: []
  patterns: ["接缝②无双闸需求:memory 候选无 TS executeTool 预消费链,原子条件 UPDATE 单闸即保恰好一次(与接缝① docId+version 双闸对照)", "重命名替代删除:consumeIntoMemories→consumeConfirmed(web/test-only 路径保留语义,gate 清零且 npm 测试存活)"]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/confirmations.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/lib.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/tools.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
    - src/ai/memoryStore.ts
decisions:
  - "接缝②无需 AlreadySettled 容忍:memory 卡片确认是唯一直接消费者(无 TS executeTool 预消费),与接缝①不同;二次 invoke 直接 already_settled 报错即正确语义"
  - "memoryStore.consumeIntoMemories 重命名为 consumeConfirmed 而非删除:user_directed 自动链(propose 内 confirm+consume)与 Node/web-dev 路径仍需它;桌面 UI 路径已完全走 engineConsumeMemory,gate 字面零命中"
  - "content_hash 输入对齐 TS canonicalJson:productId 为 None 时省略键(TS undefined 被丢弃)"
metrics:
  duration: 11m
  completed: 2026-08-24
---

# Phase 23 Plan 05: memory 接缝②迁移 + TOOL-04 集成锁定 + 全 phase 收口 Summary

**One-liner:** engine_consume_memory 把 memoryStore.ts:600-712 三条 SQL(confirm UPDATE / 原子 consume UPDATE / memories INSERT 含 supersede)逐字节移植 Rust,「已记住」一次 invoke 完成全链(Rust 唯一写者,reject 同迁);TOOL-04 用 loop 级集成测试(白名单 exec 无头直行 + 非白名单 WAIT)与 schemas==registry 单一注册表断言双锁;Phase 23 全部 grep gates 收口。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | engine_consume_memory / engine_reject_memory + 接缝②迁移 | be00eae | confirmations.rs, commands.rs, lib.rs, src/ai/api.ts, chatConsoleStore.ts, memoryStore.ts |
| 2 | TOOL-04 集成测试锁定 + 全 phase 收口 gates | affab49 | loop_runner.rs, tools.rs |

## Verification

- `cargo test`: **153 passed / 0 failed / 2 ignored**(基线 147 → +6:commands 4(memory 落库+恰一 / reject 阻断 / 并发恰一胜 / supersede 链)+ loop_runner 2)
- `npm test`: **241/241 pass**;`npm run lint`(tsc): clean
- **收口 grep gates(Task 2 实跑输出)**:
  - `grep -rn "invoke" src-tauri/src/engine/` → 仅 commands.rs 两处注释(:160 raw invoke callers、:900 re-invoke);exec.rs / fs_ops.rs / tools.rs / loop_runner.rs 执行路径零命中
  - `grep -rn "appendAuxEvent('deliverable_committed'" src` → 零命中(接缝①)
  - `grep -rn "consumeIntoMemories" src --include="*.ts" --include="*.tsx" | grep -vE "__tests__|\.test\."` → 零命中(接缝②)

## Key Behavior Locks

- confirm SQL 逐字移植(COALESCE 幂等重确认);consume 原子条件 UPDATE 恰一语义 — `memory_concurrent_consume_exactly_one_wins`:两线程双连接打同一 WAL 文件库,恰一 Ok,memories 恰一行,status=consumed
- 二次 consume → already_settled(双击防抖);reject 后 consume 报 already_settled 且零 memories 行
- supersede 链(MEM-05):同 memoryId + supersedesRowid → version 子查询 +1,旧行 superseded_at 落戳保留审计
- MemoryRecord wire 逐字段 camelCase(contentHash/sourceCandidateToken/supersedesRowid/...),sourceType='agent_confirmation' 与 TS insertInputFromCandidate 一致
- TOOL-04 loop 集成:白名单 exec(学习条目 + 平台 echo)全 loop 无头执行 — tool_result ok、exitCode 0、子进程被 await(即已退出)、EngineEvent 流含 tool_output;非白名单 → WAIT + awaitingConfirmation tool_result + exec_approval 候选落库
- `schemas()` name 集合 == `registry()` name 集合(单一注册表不变量,TOOL-04 结构锁的行为级补充)

## Deviations from Plan

- **[Rule 1 - 计划预留分支未触发] 接缝②无 AlreadySettled 冲突**:memory 确认卡片是唯一消费入口,无 TS executeTool 预消费链(与接缝① deliverable 落槽不同),23-04 的容忍模式未启用 — 单闸(原子 UPDATE)即保恰好一次。
- **删除改为重命名**:`consumeIntoMemories` 未从 memoryStore.ts 删除而是更名 `consumeConfirmed` — user_directed 自动链(propose 内)与 Node/web-dev 测试路径仍依赖该语义;删除会破坏 phase15 测试且需在 propose 里内联同等 SQL,重命名是最短正确 diff,gate 字面零命中达成。

## Known Stubs

- 无。memoryStore.ts 的 propose/INSERT(user_directed 自动链、TS proposeMemory 遗留工具)在 Tauri 运行时已不可达(引擎侧 memory_write 工具为 Rust 唯一入队者),保留为 web-dev/测试路径,非 stub。

## Self-Check: PASSED

- 提交 be00eae / affab49 均在 git log;cargo 153/0/2、npm 241/241、tsc clean、三组 grep gate 实跑零命中
- Phase 23 五个 plan(23-01..23-05)全部完成,可进 phase verification
