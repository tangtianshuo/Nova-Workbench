---
phase: 24-multi-run-tray
verified: 2026-08-24T00:00:00Z
status: passed
verdict: PASS_WITH_NOTES
score: 4/4 must-haves verified
notes:
  - "All gates re-run by verifier: cargo 165/0/2, npm 243/243, tsc clean. Structural evidence for all 4 SC confirmed in current tree (scheduler.rs, tray.rs, notify.rs, commands.rs, chatConsoleStore.ts). GUI/OS-interaction behaviors (tray visuals, toast appearance, click-through, hide-on-close feel) deferred to milestone UAT per user directive — tracked in Deferred UAT list."
gaps: []
human_verification:
  - test: "Milestone UAT — dual parallel runs + close window + background notifications + tray jump"
    expected: "Two sessions stream in parallel without crosstalk; close → runs continue; background Done/Error/Confirmation notifications (cancel silent); notification/tray click returns to correct session"
    why_human: "OS tray/notification rendering and click-through cannot be verified headlessly"
---

# Phase 24: 多 run 并行 + 后台运行(托盘) Verification Report

**Phase Goal:** 用户可以多 session 并行跑 agent、关窗后 run 继续、后台完成有通知 — Rust 常驻引擎的核心收益兑现
**Verified:** 2026-08-24
**Status:** PASS_WITH_NOTES (4/4)
**Re-verification:** No — initial verification

## Test Baseline (re-run this verification)

- `cargo test --manifest-path src-tauri/Cargo.toml`: **165 passed / 0 failed / 2 ignored** — matches 24-04 claim
- `npm test`: **243/243 pass** — matches
- `npm run lint` (tsc --noEmit): clean

## Per-Criterion Verdicts

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | SCHED-01: 双 session 并行流式,事件/确认卡互不串扰 | **PASS** | scheduler.rs:15 `MAX_CONCURRENT: usize = 3`;:78/:157 cap gate;:240 `cap_three_then_fifo_promotion`、:282 `cancel_queued_dequeues_without_consuming_slot`、:317 `cancel_running_releases_slot_via_permit_drop` 单测;loop_runner.rs:833 `two_runs_parallel_file_db_streams_isolated` 两 run 并行文件 DB 隔离集成测试(commit 16f2448,当前树确认存在)。per-run Connection 替代单 slot:`grep "engine busy" src-tauri/src` 仅命中 scheduler.rs:6 注释("is gone"),零代码路径。chatConsoleStore.ts:196 isQueued + :619 `run_status` 事件分支;AgentConsole「排队中」状态条(24-01 commit 2987e66)。串扰防线 = v0.3.1 per-session streaming guard + WAL/busy_timeout(event_log.rs 注释改写) |
| 2 | SCHED-02: hide-on-close 后 run 继续;重开投影一致 | **PASS_WITH_NOTES** | lib.rs:158-159 `CloseRequested { api, .. } → api.prevent_close()` + hide(一律拦截,退出仅托盘);tray.rs:43 `TrayIconBuilder::with_id(TRAY_ID)`、:46 `show_menu_on_left_click(false)`(Windows 左键=显示窗口)、:108 `set_menu` 全量重建、:61 `app.emit("tray-open-session", entry.session_id)`;scheduler.rs:118 `snapshot_detailed()`、:134 `set_on_change`、:529 `detailed_snapshot_carries_meta_and_notifies_on_lifecycle` 测试(engine_run 三条退出路径 unregister,meta 不泄漏);chatConsoleStore.ts:1115 模块级 `listen('tray-open-session')` → 切 tab + session。run 继续 = per-run Connection + spawn_blocking loop 不依赖 webview 存活(TOOL-04 基础)。重开投影一致性由 replay/restore(Phase 22)+ exec/fs 卡 restore(24-03)结构保证;**实际关窗/重开体验 deferred to milestone UAT** |
| 3 | SCHED-03: 后台完成/待确认通知,可一键回 session | **PASS_WITH_NOTES** | notify.rs:20 `should_notify(is_visible) = !is_visible` 纯函数门控 + :45-47 单测(前台不通知);:28 `is_visible().unwrap_or(true)` 查询失败宁缺勿扰;commands.rs 3 处 `notify_if_background`(Done :271 / Error :281 / Confirmation :220,cancel 不通知);lib.rs:165 `Focused(true)` 消费 last_notified_session → emit tray-open-session(focus-gated fallback,CONTEXT 已授权)。一键回跳 = 通知激活窗口 + focus fallback + 托盘列表双路径。「托盘通知/角标」字面由 OS 通知 + 托盘 tooltip(`Nova — N 个运行中`)共同满足;**真实通知呈现/点击 deferred to milestone UAT** |
| 4 | SCHED-04: 取消(含后台),子进程清理、事件一致 | **PASS** | commands.rs:298 `engine_cancel` 壳 → :306 `engine_cancel_inner`(token cancel);scheduler.rs:396 `cancel_running_run_kills_exec_stream_stays_clean_siblings_unaffected`(exec 树杀 taskkill /T + check_event_stream 配对无孤儿 + 兄弟 run 不受影响 + FIFO 晋升 + scheduler/engine_runs 零残留)、:493 `cancel_queued_run_dequeues_immediately_and_frees_no_slot`、commands.rs:781 `engine_cancel_unknown_and_double_cancel_are_ok` 幂等锁 —— 三条全链路集成测试本验证 cargo 实跑通过(165 含)。后台 cancel:token/loop 均不依赖窗口可见性,与应用内同路径 |

## Carry-in Resolution(23-VERIFICATION note)

exec/fs 确认卡 sessionRestore 不恢复 — **已修复**:24-03 commit 198cba2,confirmations.ts `listPendingExecApprovals`/`listPendingFsWrites` + chatConsoleStore.ts:295 `refreshExecFsCards`(:480 session 切换 / :547 restore 后重填),沿用 listActive TTL/未消费过滤;npm 新增 2 测试(exec restore 过滤、fs restore + settled 消失)含在 243 内。顺手修掉 switchSession 跨 session 卡片泄漏(pendingExecApproval/pendingFsWrite 清空)。**判定:关闭,行为等价 plan 意图**(未改 sessionRestore.ts 输出,走既有 card-refresh 管线,理由成立)。

## Grep Gates (verifier re-run)

| Gate | Result |
|------|--------|
| `grep -rn "engine busy" src-tauri/src` | 仅 scheduler.rs:6 注释,零代码路径 PASS |
| `MAX_CONCURRENT: usize = 3` (scheduler.rs:15) | PASS |
| `prevent_close` (lib.rs:159) + `tray-icon` (Cargo.toml) + `TrayIconBuilder`/`set_menu`/`tray-open-session` (tray.rs) | 全命中 PASS |
| `should_notify` 门控 + `notify_if_background` 3 出口 + `notification:default` capability | 全命中 PASS |
| chatConsoleStore `run_status`(:619)/ `refreshExecFsCards`(:295)/ `tray-open-session`(:1115) | 全命中 PASS |

## Requirements Coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| SCHED-01 | SATISFIED | SC-1 |
| SCHED-02 | SATISFIED | SC-2 |
| SCHED-03 | SATISFIED | SC-3 |
| SCHED-04 | SATISFIED | SC-4 |

REQUIREMENTS.md checkboxes SCHED-01..04 与 Traceability 表已由本验证勾选/更新为 Complete ✓ verified。

## Deferred UAT(milestone gate,Phase 25 收口)

1. 双 run 并行 → 关窗后台 → 通知三点(Done/Error/等待确认;cancel 静默)→ 通知点击/托盘列表跳转对应 session
2. 后台取消 running run → 重开窗口确认卡恢复(exec/fs HITL restore)
3. 托盘菜单快照实时性(queued/running 状态、session 标题、tooltip 计数、点击跳转)
4. hide-on-close 实感(关窗不退程、托盘「退出」唯一出口)

## Anti-Patterns Found

无 blocker。历史 26 warnings 为既有遗留(exec_confirmed_inner unused 为 23-02 test-helper,非本 phase 引入)。

## Gaps Summary

无 gap。4/4 SC 结构性证据齐备 + 全链路测试实跑通过;23-VERIFICATION carry-in(exec/fs 卡 restore)确认关闭。OS 交互层(托盘/通知/关窗)按用户指令统一推迟至 milestone UAT(Phase 25 SC-3)。

---

_Verified: 2026-08-24_
_Verifier: Claude (gsd-verifier)_
