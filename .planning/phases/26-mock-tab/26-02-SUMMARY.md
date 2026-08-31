---
phase: 26-mock-tab
plan: 02
subsystem: engine-scheduler
tags: [scheduler, priority, engine-protocol, tab-run]
requires: [engine_run channel protocol (v0.3.2)]
provides: [Priority dual-queue scheduling, engine_run priority field, TS priority passthrough]
affects: [src-tauri/src/engine/scheduler.rs, src-tauri/src/engine/commands.rs, src/ai/api.ts]
tech-stack:
  added: []
  patterns: ["dual-queue priority scheduling (interactive > batch, each FIFO)"]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/scheduler.rs
    - src-tauri/src/engine/commands.rs
    - src/ai/api.ts
decisions:
  - "interactive 队列严格优先于 batch;队内各自 FIFO,不做加权(ponytail 标注升级路径)"
  - "priority 参数在 registry insert 之前校验,非法值不泄漏运行时状态"
metrics:
  duration: 15m
  completed: 2026-08-31
  tasks: 1
  files: 3
---

# Phase 26 Plan 02: 调度器双队列优先级 Summary

Rust 调度器双队列(interactive 严格优先于 batch,各自 FIFO)+ `engine_run` 可选 `priority` 字段(本 phase 唯一协议增量,默认 interactive 行为不变)+ TS `engineRun` 透传。

## What Was Done

### Task 1: scheduler 双队列 + engine_run priority 字段 + TS 透传 (c998eaf)

- **scheduler.rs**: 新增 `Priority { Interactive, Batch }`;`SchedState.queue` 拆为 `queue_interactive` + `queue_batch`;`promote` 先排空 interactive 队列再晋升 batch(队内各自 FIFO,不做加权);`acquire` 签名增加 `priority` 参数(on_queued 之前);cancel 清理经 `dequeue()` 辅助函数从两队列 retain;`snapshot`/`snapshot_detailed` 顺序 = active → interactive → batch(tray 反映排队优先级)。
- **commands.rs**: `engine_run` 参数列表增加 `priority: Option<String>`(core_context 之后);在 `engine_runs` registry insert **之前**解析(非法值 `unknown priority: {other}` 显式报错且不泄漏运行时状态);None/"interactive" → Interactive,"batch" → Batch。其余零改动。
- **api.ts**: `EngineRunParams.priority?: 'interactive' | 'batch'`;invoke 透传 `priority: params.priority ?? null`。
- **测试**: 新增 `interactive_jumps_batch_queue`(3 batch 占满 + 1 batch 排队 + interactive 到达 → 释放 slot 后 interactive 先获 permit,且 snapshot 中 interactive 排在 batch 前)与 `cancel_removes_batch_queued_run_from_batch_queue`;既有测试全部改用显式 `Priority::Interactive` 调用(FIFO 语义回归验证)。

## Verification

- `cargo test scheduler`: 8/8 通过(含 2 个新测试)
- `cargo test` 全量: **178 passed, 0 failed**(v0.3.2 收口 176 + 新增 2;replay parity 测试全绿 — priority 不落任何持久化事件,事件 shape 零改动)
- `npx tsc --noEmit`: 零错误
- 引擎协议增量仅 priority 一个可选字段;git diff 仅计划内三个文件

## Deviations from Plan

**1. [Rule 1 - Placement] priority 校验提前到 registry insert 之前**
- **Found during:** Task 1
- **Issue:** 计划将 priority 解析放在 scheduler gate 处(即 `engine_runs.insert` + `scheduler.register` 之后),非法值 early-return 会泄漏 registry 条目与 tray meta
- **Fix:** 解析移至 run_id mint 之后、任何状态插入之前
- **Files:** src-tauri/src/engine/commands.rs
- **Commit:** c998eaf

其余按计划执行。

## Known Stubs

None — 无占位/mock 路径。端到端 batch 标记由 26-04(tab run 调 `engineRun({ priority: 'batch' })`)完成,本计划只交付调度半边(符合 success_criteria)。

## Self-Check: PASSED

- 文件存在: scheduler.rs / commands.rs / api.ts 均为修改而非新建(已在 commit c998eaf 中)
- Commit 存在: c998eaf 已在 master
