---
phase: 24-multi-run-tray
plan: "04"
subsystem: rust-run-engine
tags: [cancel, integration-tests, sched-04, phase-gates]
requires: ["24-01 scheduler + queued-cancel", "23-02 running-cancel tree-kill", "24-02/24-03 tray + notify surfaces"]
provides: ["engine_cancel_inner 可测核心(engine_cancel 注入门控不变,TS 调用零影响)", "取消 running run 全链路集成锁(exec 树杀 + 事件流无孤儿 + 兄弟 run 不受影响 + 队列晋升 + 注册表/调度器零残留)", "取消 queued run 全链路复验(经 engine_cancel seam 立即出队不占槽)", "engine_cancel 幂等锁(未知 run_id / 双重 cancel 均 Ok)"]
affects: [src-tauri/src/engine/commands.rs, src-tauri/src/engine/scheduler.rs]
tech-stack:
  added: []
  patterns: ["全链路集成测试形状 = engine_run 生命周期减 Tauri 壳(engine_runs 注册 → scheduler.register → acquire → blocking-thread loop → 清理四件套),经 engine_cancel_inner 走真实取消路径"]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/scheduler.rs
decisions:
  - "engine_cancel 提取 engine_cancel_inner(&AppState, run_id) 可测核心:命令壳仅转发,语义(token cancel 触达 running unwind + queued dequeue 双路径)落在可测函数 —— 与 exec_confirmed_inner/fs_apply_inner 既有模式一致"
  - "取消后的事件流验证复用 check_event_stream(PORT-01):cancelled exec 落 Failed tool_result(error=cancelled)后循环在迭代顶 cancel 检查处 unwind —— 已配对、无孤儿,22-x 恢复侧无需改动"
metrics:
  duration: 25m
  completed: 2026-08-24
requirements-completed: [SCHED-04]
---

# Phase 24 Plan 04: 取消全链路集成测试 + Phase 收口 gates Summary

**One-liner:** engine_cancel 提取 engine_cancel_inner 可测核心后,以「engine_run 生命周期减 Tauri 壳」的形状补三条全链路集成测试:cancel running exec run(子进程树杀、事件流配对无孤儿、兄弟 run 不受影响、队列 FIFO 晋升、scheduler+engine_runs 零残留)、cancel queued run(经真实取消路径立即出队不占槽)、幂等(未知/双重 cancel 均 Ok);Phase 24 收口 gates(cargo build/test、npm test、tsc、grep 锁定)全绿。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | 取消全链路集成测试 + 收口 gates | 508de8e | engine/commands.rs, engine/scheduler.rs |

## Verification(收口 gates 输出)

- `cargo build`: 通过(新增代码零 warning;既有 26 warnings 为历史遗留,exec_confirmed_inner unused 为 23-02 test-helper)
- `cargo test`: **165 passed / 0 failed / 2 ignored**(基线 162 → +3:cancel_running 全链路、cancel_queued 全链路、engine_cancel 幂等)
- `npm test`: **243/243 pass**(与基线持平,本 plan 无 TS 改动)
- `npm run lint`(tsc --noEmit): 通过
- grep 锁定:`engine_cancel_inner` 在 commands.rs :299(命令壳转发)+ :306(定义,token cancel);scheduler.rs 队列移除经 acquire cancel branch(:172 retain);`cancel` 在 scheduler.rs 56 处(含 cancel 分支注释链)

## Key Behavior Locks

- cancel running run(含后台):token → loop 顶/工具内 cancel 检查 → exec 树杀(taskkill /T /F)→ Failed("cancelled") tool_result 落盘 → 迭代顶 unwind Err(Cancelled) → check_event_stream 配对平衡(PORT-01 无孤儿)
- 兄弟 running run 完全不受影响(独立 per-run Connection + 独立 token);被 cancel 释放的槽按 FIFO 晋升队列头
- cancel queued run:engine_cancel_inner → acquire cancel branch 立即出队,不占并发槽,scheduler snapshot 与 engine_runs 注册表零残留
- engine_cancel 语义 = 候选 REJECT 裁定不变(注释保留,幂等 Ok)

## Deviations from Plan

None - plan executed exactly as written.(plan 预留的「若发现真实缺口则修」未触发 —— 取消尾事件语义在 22/23 已完整,check_event_stream 验证通过。)

## Deferred UAT(milestone gate 清单,phase 约定推迟)

- 双 run 并行 → 关窗后台 → 通知(Done/Error/等待确认三点,cancel 静默)→ 通知点击/托盘列表跳转 session
- 后台取消 running run → 重开窗口确认卡恢复(exec/fs HITL restore)
- 托盘菜单快照实时性(queued/running 状态、点击跳转)

## Known Stubs

None.

## Self-Check: PASSED

- commands.rs / scheduler.rs 修改已提交;508de8e `git log` FOUND
- cargo 165/0/2、npm 243/243、tsc clean
