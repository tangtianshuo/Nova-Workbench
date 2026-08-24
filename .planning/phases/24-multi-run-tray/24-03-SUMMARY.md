---
phase: 24-multi-run-tray
plan: "03"
subsystem: rust-run-engine
tags: [notification, background-gate, hitl, carry-in, sched-03]
requires: ["24-02 hide-on-close + tray + tray-open-session wire"]
provides: ["notify.rs notify_if_background(仅隐藏态 OS 通知 + last_notified_session 记录)", "run 完成/失败/等待确认 三点通知接线(cancel 不通知)", "通知点击 fallback = 窗口 Focused 时 emit tray-open-session(复用 24-02 webview 路径)", "tauri-plugin-notification 安装(Cargo/capability/lib.rs)", "listPendingExecApprovals/listPendingFsWrites + refreshExecFsCards(exec/fs 确认卡 restore,carry-in)"]
affects: [src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/src/lib.rs, src-tauri/src/notify.rs, src-tauri/src/state.rs, src-tauri/src/engine/commands.rs, src-tauri/capabilities/default.json, src/ai/confirmations.ts, src/ai/confirmationStore.ts, src/stores/chatConsoleStore.ts]
tech-stack:
  added: ["tauri-plugin-notification 2"]
  patterns: ["门控通知 = should_notify(is_visible) 纯函数 + notify_if_background 只在隐藏态发送", "点击回跳 = last_notified_session(AppState Mutex)在 WindowEvent::Focused(true) 消费并 emit tray-open-session(Windows toast 点击回调受限的已授权 fallback)", "确认卡 restore 走既有 card-refresh 管线(listActive + refresh*,TTL 过滤在 store 层)而非 sessionRestore 输出"]
key-files:
  created:
    - src-tauri/src/notify.rs
    - src/ai/__tests__/phase24Confirmations.test.ts
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/src/state.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/capabilities/default.json
    - src/ai/confirmations.ts
    - src/ai/confirmationStore.ts
    - src/stores/chatConsoleStore.ts
decisions:
  - "通知点击不做 per-notification payload:Windows toast 回调不可靠,采用 focus-gated fallback(窗口获得焦点 → 跳最后通知的 session);SC 的「可一键回到对应 session」由通知激活窗口 + 托盘列表(24-02)共同满足(plan context_notes 已授权)"
  - "确认事件通知收口在 engine_run 的 EventCallback 转发点(统一出口),Done/Error 通知在 command settle 处;cancel 分支不通知"
  - "exec/fs 确认卡 restore 走 memory/PRD 卡同款 refresh 管线(confirmations.ts listPending* + chatConsoleStore refreshExecFsCards),不动 sessionRestore.ts 输出结构 — 行为等价,文件清单偏离 plan"
  - "switchSession 现在显式清空 pendingExecApproval/pendingFsWrite(修掉跨 session 卡片泄漏的隐性 bug),refreshExecFsCards 再按本 session 候选重填"
metrics:
  duration: 35m
  completed: 2026-08-24
requirements-completed: [SCHED-03]
---

# Phase 24 Plan 03: 后台通知 + exec/fs 确认卡 restore Summary

**One-liner:** notify.rs 以 tauri-plugin-notification 落地隐藏态门控 OS 通知(should_notify 纯函数门 + last_notified_session 记录),engine_run 在 Done/Error/Confirmation 三点接线(前台不通知、cancel 不通知),点击回跳用 focus-gated fallback(窗口 Focused → emit tray-open-session 复用 24-02 webview 路径);carry-in 用 listPendingExecApprovals/listPendingFsWrites + refreshExecFsCards 把 exec/fs HITL 确认卡在 session 切换/重启后重现(24h TTL 过滤沿用 listActive),顺手修掉 switchSession 跨 session 卡片泄漏。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | notification plugin + 后台门控通知 | e614fbe | Cargo.toml/lock, notify.rs, lib.rs, state.rs, commands.rs, capabilities/default.json |
| 2 | carry-in — exec/fs 确认卡 restore | 198cba2 | confirmations.ts, confirmationStore.ts, chatConsoleStore.ts, phase24Confirmations.test.ts |

## Verification

- `cargo build`: 通过(新代码零 warning;exec_confirmed_inner unused 为 23-02 既有 test-helper warning)
- `cargo test`: **162 passed / 0 failed / 2 ignored**(基线 161 → +1:notify should_notify 门控测试)
- `npm test`: **243/243 pass**(基线 241 → +2:exec restore 过滤测试、fs restore + settled 消失测试)
- `npm run lint`(tsc --noEmit): 通过
- 结构 grep:notify_if_background 在 commands.rs 3 处调用(Done/Error/Confirmation 出口),`notification:default` 在 capabilities,plugin 注册在 lib.rs
- 通知点击/托盘回跳 UAT 按 phase 约定推迟至 milestone(24-04 gates 同)

## Key Behavior Locks

- 通知只在 main window `is_visible() == false` 时发送;窗口查询失败按 visible 处理(不通知,宁缺勿扰)
- 通知三点:run 完成、run 失败、等待 HITL 确认;用户主动 cancel 不通知
- last_notified_session 在 Focused(true) 一次性消费(take)后清空 — 重复聚焦不重复跳转
- exec/fs 卡 restore 数据 shape 与实时推送一致(同一 pendingExecApproval/pendingFsWrite 渲染分支),确认/拒绝仍走 engineExecConfirmed/engineFsApply/engineRejectCandidate(Rust 原子消费)

## Deviations from Plan

- **[文件清单调整] Task 2 未改 sessionRestore.ts**:plan 提议 restore 输出补候选或加只读 Rust command,但 memory/deliverable 卡既有 restore 管线是「confirmations.ts listPending* + store refresh*」(纯 TS,读 tauri-plugin-sql 同一张表,listActive 已含 TTL/未消费过滤)— 沿用该管线零 Rust 改动、行为等价。session_id 候选字段由 Rust 侧写入(23-02/23-03 已带),过滤可用。
- **[Rule 1 - Bug] switchSession 跨 session exec/fs 卡片泄漏**:set 未清 pendingExecApproval/pendingFsWrite,切走后旧卡残留。补 null 清空 + refresh 重填。
- **[Rule 3 - Blocking] spawn_blocking move 闭包提前捕获 app_handle/notify_title/notify_session**:clone 移到闭包外,settled 处通知可用原值。

**Total deviations:** 3(1 文件清单 + 1 顺手 bug + 1 语法修复). **Impact:** 无 — 全测试绿,行为与 SC 等价。

## Known Stubs

None.

## Self-Check: PASSED

- notify.rs / phase24Confirmations.test.ts 存在且已提交;e614fbe / 198cba2 `git log` FOUND
- cargo 162/0/2、npm 243/243、tsc clean
