---
phase: 29-pm-crud
plan: "03"
subsystem: engine/pm-write-hitl
tags: [hitl, pm-crud, parity, rust-engine]
requires: [29-01, 29-02]
provides: [engine_consume_pm_write, pm_write HITL 闭环, pm_write_applied parity]
affects: [src-tauri/src/engine/commands.rs, src-tauri/src/lib.rs, src/ai/api.ts, src/stores/chatConsoleStore.ts, src/components/AgentConsole.tsx]
tech-stack:
  added: []
  patterns: [consume_inner 事务先例 (ingestion 同构), exactly-once 审计 gate, 单源双侧 fixture glob]
key-files:
  created:
    - src/ai/__tests__/fixtures/projection-cases-pm-write.json
  modified:
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/lib.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
    - src/components/AgentConsole.tsx
decisions:
  - fixture 命名 projection-cases-pm-write.json(非计划的 pm-write-cases.json)— 双侧 glob 只认 projection-cases*/realdb-sample* 前缀
  - 确认路径不调 executeTool/engineAppendToolResult — Rust consume 已写 pm_write_applied 审计(ingestion 先例)
metrics:
  duration: 50m
  completed: 2026-09-02
  tasks: 2
  files: 5
---

# Phase 29 Plan 03: pm_write HITL 闭环 + parity 收口 Summary

**One-liner:** engine_consume_pm_write 单命令事务(confirm+consume+删行/轻写重放+pm_write_applied 审计),webview 确认卡接线,新事件种类双侧 parity fixture 锁定。

## What Was Built

### Task 1: Rust engine_consume_pm_write(8626db4)

- `consume_pm_write_inner`(commands.rs,ingestion 先例同构):kind 校验 → confirm/consume(AlreadySettled-when-consumed 容忍)→ exactly-once gate(按 confirmationToken 查 pm_write_applied)→ `unchecked_transaction` 内按 action 分派:
  - `task_delete` / `schedule_delete`:直接删行(delete_task 顺带清 schedules.task_id 弱链),affected=false 也算 applied(幂等)
  - `task_create|task_update|task_complete|schedule_create|schedule_update`:cap-5 升级轻写重放(从 params.args 取参调 pm_store)
  - 未知 action → Err
- 审计事件 `pm_write_applied` 落 candidate 自己的 session,payload {action, taskId|eventId, applied:true, confirmationToken}
- lib.rs invoke_handler 注册;5 条 cargo 测试(212 全绿)

### Task 2: TS 接线 + parity fixture(9e499e4)

- `api.ts`:`engineConsumePmWrite(token)` 封装
- `chatConsoleStore.ts`:`PmWriteCandidate` / `pendingPmWrite` / `confirmPmWrite`(成功消息「已删除任务「X」。」)/ `rejectPmWrite`;submit 的 onEvent 分支 + `result.pendingConfirmation` 兜底 + set 合并三处照抄 fs_write 模式;`routeEngineCandidateToConsole` 加 pm_write 分支(tab-run 候选也入全局队列);startNewSession/switchSession 清卡
- `AgentConsole.tsx`:pm_write 确认卡(「确认删除任务/删除日程/执行写入」+ title/summary + 确认/取消)
- fixture `projection-cases-pm-write.json`:pm_write await(modelText 逐字对齐 loop_runner wait 格式)+ pm_write_applied 不产生对话消息;cargo parity(5 cases)与 npm parity(223 tests)双侧纳管

## Verification

- `cargo test --lib`:212 passed, 0 failed
- `cargo test parity` / `cargo test consume_pm_write`:pass
- `npm run lint`(tsc):exit 0;`npm test`:223 pass

## Deviations from Plan

**1. [Rule 3 - Blocking] fixture 文件名改为 `projection-cases-pm-write.json`(计划写 `pm-write-cases.json`)**
- Found during: Task 2
- Issue: parity.rs 与 parity.rust.test.ts 的 glob 只匹配 `projection-cases*|realdb-sample*` 前缀,计划中的文件名不会被双侧扫描
- Fix: 采用 `projection-cases-` 前缀命名,零 glob 改动即单源双侧纳管
- Commit: 9e499e4

**2. [Rule 1 - Bug] 初始 state 误删 `autoRemembered: null`(编辑事故,lint 捕获)**
- Found during: Task 2 lint
- Fix: 补回;tsc exit 0 确认
- Commit: 9e499e4

## Known Stubs

None.

## Self-Check: PASSED
