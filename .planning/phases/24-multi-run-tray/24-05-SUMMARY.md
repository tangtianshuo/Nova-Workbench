---
phase: 24-multi-run-tray
plan: "05"
subsystem: rust-run-engine
tags: [cancel, sched-04, gap-closure, ui-wiring]
gap_closure: true
requires: ["24-04 engine_cancel 幂等 + 全链路集成测试"]
provides: ["engineCancel 生产调用方(cancelRun → invoke engine_cancel)", "activeRunId per-session run state(mint → 完成/出错/finally 清除)", "用户停止按钮(流式/排队中显示,点击取消)", "cancelRun store 测试 ×4"]
affects: [src/stores/chatConsoleStore.ts, src/components/AgentConsole.tsx]
tech-stack:
  added: []
  patterns: ["cancel fn 以可选参数注入 cancelRun(默认 engineCancel)— node:test 无模块 mock 设施,沿用 llm 注入模式"]
key-files:
  created:
    - src/stores/__tests__/phase24Cancel.test.ts
  modified:
    - src/stores/chatConsoleStore.ts
    - src/components/AgentConsole.tsx
decisions:
  - "cancelRun 只做本地 run state 复位(activeRunId/loading/isQueued/streaming),不重复投影 — engine_cancel 触发事件流收尾,engineRun promise 由 submit finally 走常规投影"
  - "cancel 失败仍复位本地状态:engine_cancel 幂等(未知 runId → Ok),复位后重发路径不受影响;错误仅 console.error"
metrics:
  duration: 20m
  completed: 2026-08-24
requirements-completed: [SCHED-04]
---

# Phase 24 Plan 05: UI 取消接线(SCHED-04 gap closure)Summary

**One-liner:** chatConsoleStore 在 engineRun 发起时将 mint 的 runId 存入 activeRunId(finally 清除),新增 cancelRun(invoke engineCancel + 本地 run state 复位,cancel fn 可注入以便测试),AgentConsole 流式/排队气泡内新增「停止」按钮 — engineCancel 从零调用方变为有生产调用方,SCHED-04 用户取消路径接通。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | runId 存储 + cancelRun action + 停止按钮 | a2e8337 | chatConsoleStore.ts, AgentConsole.tsx, phase24Cancel.test.ts |

## Verification

- `npm test`: **221/221 pass**(基线 217 → +4:cancel invokes+resets、cancel 失败仍复位、无 activeRunId no-op、跨 session no-op)
- `npm run lint`(tsc --noEmit): 通过
- grep:`engineCancel` 非测试命中 ≥2 处 — api.ts:90(定义)+ chatConsoleStore.ts:15/:768(import + cancelRun 默认参数调用)
- `停止` 按钮:AgentConsole 流式气泡内(排队中状态条同区域),activeRunId 非空时显示
- Rust 侧零改动(24-04 已测:165/0/2)

## Key Behavior Locks

- activeRunId 生命周期:submit mint runId → set → engineRun;finally(完成/出错)清除;cancelRun 手动清除
- cancelRun 守卫:仅 active session 且 activeRunId 非空才触发;其他 session / 空闲 no-op(不发 invoke)
- 取消后可立即重发(loading 复位,submit guard 通过)
- 排队中 run 同样可取消(Rust acquire cancel 分支,24-04 测试覆盖)

## Deviations from Plan

None - plan executed exactly as written.(api.ts 确认零改,如预期)

## Self-Check: PASSED

- src/stores/__tests__/phase24Cancel.test.ts 存在;chatConsoleStore.ts / AgentConsole.tsx 修改已提交
- commit a2e8337 在 git log 中(grep "24-05" 命中)
