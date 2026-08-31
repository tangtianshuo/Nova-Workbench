---
phase: 23-tools-native
plan: "04"
subsystem: rust-run-engine
tags: [deliverable, hitl, system-prompt, seam-migration]
requires: ["23-02 candidate/consume 模式", "23-03 fs 工具 + 0008/0009 先例", "22-06 append_tool_result 模式"]
provides: ["generate_deliverable ToolSpec(纯候选入队,零 LLM)", "ROLE_AND_TOOL_RULES 适配版(工具清单 + PM CRUD 降级说明)", "engine_commit_deliverable command(接缝①迁移,TS 直写消灭)", "tools::slot_by_code(prd→DEL-REQ-01)"]
affects: [src-tauri/src/engine/tools.rs, src-tauri/src/engine/loop_runner.rs, src-tauri/src/engine/commands.rs, src-tauri/src/lib.rs, src/ai/api.ts, src/stores/chatConsoleStore.ts]
tech-stack:
  added: []
  patterns: ["AlreadySettled 容忍 + docId+version 幂等双闸:TS executeTool 与 Rust command 在同一用户动作内先后 consume 共享 nova.db,事件恰好一次由事件幂等保证而非消费幂等", "模型自带 confirmationToken 调 generate_deliverable = arg_error(commit 是 webview 用户动作,模型不得自提交)"]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/lib.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
decisions:
  - "无 migration 0010:deliverable_draft 已在 0006 CHECK 内(计划预判的条件分支未触发)"
  - "engine_commit_deliverable 的 AlreadySettled 容忍:TS executeTool 在同一落槽动作内已 confirm+consume(共享 nova.db),Rust consume 报 AlreadySettled;docId+version 事件幂等(同键已存在→Ok 跳过)保住恰好一次"
  - "命令自带 confirm 步:pending 候选由命令确认(用户的落槽点击即确认动作),测试锁定 rejected 候选仍报错"
  - "模型携带 confirmationToken 调 generate_deliverable → arg_error(防模型自提交;schema 仍保留该字段与 TS 逐字段一致)"
metrics:
  duration: 9m
  completed: 2026-08-24
---

# Phase 23 Plan 04: deliverable 原生工具 + 降级说明 + 接缝①迁移 Summary

**One-liner:** generate_deliverable 纯候选入队(模型在 args 给 draft,工具零 LLM,四键 dedup 复用既有 create_candidate)+ ROLE_AND_TOOL_RULES 适配版(11 工具清单 + "create them manually" PM CRUD 降级说明,schema 锁定无 CRUD 工具)+ engine_commit_deliverable 使 agent_events 的 deliverable_committed 事件 Rust 唯一写者(commitToSlot 的 appendAuxEvent+flushEvents 直写路径消灭)。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | generate_deliverable 工具 + 降级说明指南块 | 7aa57dd | tools.rs, loop_runner.rs |
| 2 | engine_commit_deliverable + 接缝① TS 直写消灭 | ff9b173 | commands.rs, lib.rs, src/ai/api.ts, chatConsoleStore.ts |

## Verification

- `cargo test`: **147 passed / 0 failed / 2 ignored**(基线 141 → +6:tools 2 + loop_runner 1 + commands 3)
- `npm test`: **241/241 pass**;`npm run lint`(tsc): clean
- grep gates:`appendAuxEvent('deliverable_committed'` 在 src/stores + src/ai(非测试)**零命中**;`engine_commit_deliverable` 于 commands.rs / lib.rs / src/ai/api.ts 三处命中;tools.rs 内零 llm 调用

## Key Behavior Locks

- schema 锁定 11 工具(knowledge_search/write、memory_write、exec、fs 六件套、generate_deliverable),断言无 createTask/updateTask/createSchedule 等 PM CRUD(TOOL-03 双证据之一)
- build_system_prompt 断言含 "manually" + "not available in this version" + 全部 11 个工具名(TOOL-03 双证据之二)
- generate_deliverable:候选 kind=deliverable_draft,dedup 四键(code/productId/title/draft)同 token 复用,编辑后 draft 新候选;无产品选中 → 非 arg_error Failed
- commit_deliverable_inner:kind 守卫 + code/title 身份守卫(TS :45-47 parity);TS 已 consume 路径(共享 DB 同一用户动作)与 Rust 自 consume 路径均落事件;重复 invoke 同 docId+version → Ok 且恰一事件;rejected 候选报 already_settled
- 事件 payload 与 TS :786-790 逐字段一致(docId/version/slotCode/code/ftsImmediateHit/ftsHitCount/sessionId/eventId),scope 继承 candidate 所在 session

## Deviations from Plan

- **migration 0010 未需要**:candidates CHECK 已含 deliverable_draft(0006),计划的条件分支未触发。
- **[Rule 1 - bug] 计划的 confirm→consume 与既有 TS executeTool 消费链冲突**:TS 落槽(executeTool)在同一次用户点击内已 confirm+consume 共享 nova.db 的候选,Rust 侧裸 consume 必报 AlreadySettled。修复 = AlreadySettled 容忍(仅当行状态确为 consumed)+ docId+version 事件幂等双闸,保住「consume→append 顺序不变 + 事件恰好一次」两条锁定不变量。
- **命令自带 confirm 语义**:plan 测试草案预期「未确认候选报 NotConfirmed」,但命令的 confirm 步(计划 action 1 原文)会把 pending 行确认掉——用户落槽点击即确认动作。测试改为锁定 rejected 候选报错路径。
- 模型带 confirmationToken 调 generate_deliverable = arg_error(schema 字段保留 TS parity,执行层拒绝自提交)——计划未明说,安全收紧。

## Known Stubs

- 无。落槽的业务写半边(knowledgeRepo upsert + rndStore 卡槽投影)仍走 TS executeTool,这是 CONTEXT 锁定的过渡期合法安排,非 stub。

## Self-Check: PASSED

- 文件:tools.rs / loop_runner.rs / commands.rs / lib.rs / src/ai/api.ts / chatConsoleStore.ts 均已提交
- 提交 7aa57dd / ff9b173 FOUND;cargo 147/0/2、npm 241/241、tsc clean、全部 grep gate 通过
