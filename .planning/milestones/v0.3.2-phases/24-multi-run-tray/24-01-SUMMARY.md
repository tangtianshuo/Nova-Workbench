---
phase: 24-multi-run-tray
plan: "01"
subsystem: rust-run-engine
tags: [engine, scheduler, concurrency, fifo, per-run-connection, run-status]
requires: ["22-06 engine_run/engine_cancel + engine_runs registry", "23-02 spawn_blocking + current-thread runtime shape"]
provides: ["Scheduler::acquire(run_id, CancellationToken, on_queued) -> Result<Permit, Cancelled> (FIFO + cap 3, Permit Drop promotes head)", "Scheduler::snapshot() -> Vec<(String run_id, RunStatus Queued|Running)> — tray menu (24-02) ready", "EngineEvent::RunStatusChange {run_id, status:'queued'|'running'} (kind=run_status)", "EngineDb(Mutex<Option<Connection>>, Mutex<Option<PathBuf>>) — db.1 path for open_run_conn", "AppState.scheduler shared Scheduler handle", "chatConsoleStore isQueued per-session flag + AgentConsole 排队中 status line"]
affects: [src-tauri/src/engine/scheduler.rs, src-tauri/src/engine/commands.rs, src-tauri/src/engine/channel.rs, src-tauri/src/engine/event_log.rs, src-tauri/src/engine/loop_runner.rs, src-tauri/src/state.rs, src-tauri/src/lib.rs, src/ai/api.ts, src/stores/chatConsoleStore.ts, src/components/AgentConsole.tsx]
tech-stack:
  added: []
  patterns: ["显式 VecDeque FIFO 队列 (非 semaphore — 队列内容需供托盘 snapshot 读取)", "per-run db::open(path) + WAL/busy_timeout 替代单 slot take/restore", "oneshot waiter + tokio::select! cancel 分支 (cancel-vs-promotion race 由 release 兜底)"]
key-files:
  created:
    - src-tauri/src/engine/scheduler.rs
  modified:
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/channel.rs
    - src-tauri/src/engine/event_log.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/state.rs
    - src-tauri/src/lib.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
    - src/components/AgentConsole.tsx
decisions:
  - "显式 VecDeque 而非 semaphore:FIFO 顺序 + 队列内容必须可读(托盘 24-02 snapshot),cancel 可从队列定点摘除"
  - "Permit Drop 释放槽并 promote 队首;cancel 与 promote 竞态时 permit 已入 active — cancel 分支检测 was_queued=false 则 release 兜底,槽不搁浅"
  - "EngineDb 扩 path 字段(tuple 第二项),managed 单连接保留给 with_conn 系命令(confirm/append/fs_apply 等快速非 run 命令不动);engine_run/engine_exec_confirmed 每次开 per-run Connection"
  - "take(:151-157) 与 restore(:209) 两处同删 — 只删 take 会让 run 完成覆盖托管连接(plan 澄清项落实)"
  - "event_log.rs seq 注释按新事实改写:per-session 单写者=TS streaming guard(SESS-04),跨 run 不同 session 经 WAL+busy_timeout 串行化"
  - "engine_cancel 语义不变(token cancel);queued run 由 acquire 的 cancel 分支出队,Permit 未发出不占槽"
metrics:
  duration: 45m
  completed: 2026-08-24
requirements-completed: [SCHED-01]
---

# Phase 24 Plan 01: 调度器核心(per-run Connection + FIFO 队列 + cap 3 + 排队 UI) Summary

**One-liner:** 拆除 EngineDb 单 slot "engine busy" 锁死 —— 每个 run 自开 WAL Connection,scheduler.rs 以显式 VecDeque FIFO 队列 + MAX_CONCURRENT=3 闸门管控并发,queued/running 生命周期事件(RunStatusChange, kind=run_status)推 webview,ChatPanel 显示「排队中」状态条;两 run 并行事件隔离有集成测试锁定。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (TDD) | 调度器模块 + per-run Connection 改造 + 单元/集成测试 | f8df008 (RED) / 16f2448 (GREEN) / 4da9ff0 (fix) | scheduler.rs, commands.rs, channel.rs, event_log.rs, loop_runner.rs, state.rs, lib.rs |
| 2 | webview 排队状态接收 + ChatPanel 排队中 UI | 2987e66 | api.ts, chatConsoleStore.ts, AgentConsole.tsx |

## Verification

- `cargo test`: **158 passed / 0 failed / 2 ignored**(基线 153 → +5:3 个 scheduler 单测 cap/FIFO/cancel、1 个两 run 并行文件 DB 隔离集成测试、1 个 run_status serde wire 测试)
- `npm test`: **241/241 pass**(与基线持平)
- `npm run lint`(tsc --noEmit): 通过
- `grep "engine busy" commands.rs`: 零命中;`MAX_CONCURRENT: usize = 3` 命中;chatConsoleStore `run_status` 分支(:560)与 AgentConsole「排队中」文案(:236)均在

## Key Behavior Locks

- `Scheduler::acquire(&self, run_id: &str, cancel: CancellationToken, on_queued: impl FnOnce()) -> Result<Permit, Cancelled>` — 槽满即入队并 fire on_queued;cancel 先到则出队返回 Err(Cancelled)
- `Scheduler::snapshot() -> Vec<(String, RunStatus)>` — active(running) 在前、queue(queued) 在后,24-02 托盘菜单直接消费
- Permit Drop = 释放槽 + promote 队首(FIFO);cancel-vs-promotion 竞态由 cancel 分支的 release 兜底
- wire:`{"kind":"run_status","data":{"run_id","status"}}`(serde 测试锁定)
- engine_run 顺序:register cancel token → scheduler.acquire(queued 事件) → running 事件 → open_run_conn → spawn_blocking loop → drop permit → 注销 token

## Deviations from Plan

- **[Rule 1 - Bug] engine_exec_confirmed 残留 busy 路径**(4da9ff0):GREEN 提交后复查发现 engine_exec_confirmed 仍走旧 take 路径(会与 per-run 模型冲突),改为 open_run_conn per-run 连接。Found during: Task 1 验证阶段。
- 其余按 plan 执行,含两处 plan 澄清项(take+restore 双删、event_log seq 注释改写)均落实。

**Total deviations:** 1 auto-fixed. **Impact:** 无 — 全测试绿。

## Known Stubs

None.

## Self-Check: PASSED

- 文件修改均提交(git status 无相关未跟踪源文件;仅剩 2 张用户 UAT 截图 png 未跟踪,属用户产物不入库)
- 提交存在:f8df008 / 16f2448 / 4da9ff0 / 2987e66 FOUND
- cargo 158/0/2、npm 241/241、tsc clean
