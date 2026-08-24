---
phase: 24-multi-run-tray
plan: "02"
subsystem: rust-run-engine
tags: [tray, hide-on-close, tray-icon, run-list, jump-to-session, sched-02]
requires: ["24-01 Scheduler::snapshot + RunStatus + run_status wire events"]
provides: ["hide-on-close(CloseRequested → prevent_close + hide;退出仅托盘「退出」)", "常驻托盘(tray.rs TRAY_ID=nova-tray,左键=显示窗口,菜单=右键)", "动态托盘 run 菜单(run 项 = session 标题 — running/queued)+ tooltip 运行计数,生命周期变化重建", "Scheduler::snapshot_detailed() -> Vec<RunEntry{run_id,session_id,title,status}> + register/unregister + set_on_change 回调", "wire 事件 tray-open-session(payload=String session_id)——托盘 run 项点击 → 显示窗口 + webview 跳转", "engine_run 新增 session_title: Option<String> 参数(默认 null 兼容)"]
affects: [src-tauri/Cargo.toml, src-tauri/src/tray.rs, src-tauri/src/lib.rs, src-tauri/src/engine/scheduler.rs, src-tauri/src/engine/commands.rs, src/ai/api.ts, src/stores/chatConsoleStore.ts]
tech-stack:
  added: ["tauri tray-icon feature"]
  patterns: ["scheduler on_change 回调(Option<Box<dyn Fn(&[RunEntry])>>)替代 AppHandle 耦合——测试传 None,lib.rs setup 注入 tray::rebuild 闭包", "MenuBuilder 动态 items(&[&dyn IsMenuItem]) + set_menu 全量重建(低频事件,无 debounce)", "show_menu_on_left_click(false) 解 Windows 左键=菜单 quirk(左键=显示窗口)"]
key-files:
  created:
    - src-tauri/src/tray.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/src/engine/scheduler.rs
    - src-tauri/src/engine/commands.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
decisions:
  - "scheduler 不持 AppHandle:on_change 回调注入(测试零 Tauri 依赖);回调在锁外触发,重入 snapshot_detailed 无死锁"
  - "notify 触发点 = acquire 快速路径(running)/ enqueue / cancel 分支 / Permit::drop(release,覆盖 finish+promote)——plan 的四点全覆盖"
  - "Windows 托盘 quirk:show_menu_on_left_click(false),左键单击 = 显示+聚焦窗口,菜单走右键"
  - "session 标题:engine_run 加 session_title 参数;TS 侧 = repo 已有 title,否则首条消息前 24 字符;未注册 meta 的裸 invoke run 回退 run_id 前 8 位显示(仍列出,跳转需 meta)"
  - "tray-open-session 监听放 chatConsoleStore 模块级(AgentConsole 双 host,useEffect 会双注册;isTauri 守卫,浏览器 dev 无操作)"
metrics:
  duration: 40m
  completed: 2026-08-24
requirements-completed: [SCHED-02]
---

# Phase 24 Plan 02: 托盘常驻 + hide-on-close + 动态 run 列表 + 点击跳 session Summary

**One-liner:** tray.rs 以 TrayIconBuilder 落地常驻托盘(Cargo 开 tray-icon feature,左键=显示窗口/右键=菜单),CloseRequested 拦截为 hide+prevent_close(run 不再随关窗而死,退出仅托盘「退出」);scheduler 扩 RunEntry(register meta + snapshot_detailed + on_change 回调)在 start/enqueue/promote/cancel/release 五点全量重建菜单(session 标题 — running/queued + tooltip 计数),点击 run 项 emit `tray-open-session(session_id)` 由 chatConsoleStore 模块级监听跳 tab+session。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | tray-icon feature + hide-on-close + 托盘骨架 + scheduler snapshot_detailed/on_change | 9b01a22 | Cargo.toml, tray.rs, lib.rs, scheduler.rs |
| 2 | run 列表动态重建接线 + engine_run session_title + webview 跳转监听 | 3daaddc | commands.rs, api.ts, chatConsoleStore.ts |

## Verification

- `cargo build`: 通过(零 error;tray.rs 无 warning)
- `cargo test`: **161 passed / 0 failed / 2 ignored**(基线 158 → +3:tray run_label/tooltip 2 个纯函数测试、scheduler detailed_snapshot+on_change 生命周期测试)
- `npm test`: **241/241 pass**(持平)
- `npm run lint`(tsc --noEmit): 通过
- 结构 grep:prevent_close(lib.rs)、tray-icon(Cargo.toml)、TrayIconBuilder/set_menu/tray-open-session(tray.rs)、register/unregister 三出口配对(commands.rs)均命中
- 人工 smoke(关窗→run 继续→托盘列表→点击跳转→托盘退出)按用户指令推迟至 milestone UAT(24-04 gates 同)

## Key Behavior Locks

- 关窗 = hide;`api.prevent_close()` 一律拦截(24-CONTEXT);dev 浏览器模式不受影响
- 托盘菜单顺序:run 项(running 前、queued 后,同 snapshot 序)+ separator + 显示 Nova + 退出;tooltip = `Nova — N 个运行中`
- `Scheduler::set_on_change(Box<dyn Fn(&[RunEntry]) + Send>)`:锁外触发;engine_run 三条退出路径(cancel / 线程 panic / 正常结束)均 unregister,meta 不泄漏
- wire:`app.emit("tray-open-session", session_id: String)`;webview `listen('tray-open-session')` → `setActiveTab('agent')` + `switchSession(payload)`

## Deviations from Plan

- **[任务边界调整] scheduler RunEntry/snapshot_detailed/on_change 随 Task 1 落地**:plan 将 scheduler 扩展排在 Task 2,但 tray.rs 的 rebuild/on_menu_event 直接依赖 RunEntry,不先落 scheduler 无法通过 Task 1 的 cargo build 门。行为与 plan 一致,仅提交归属移动。
- **[Rule 3 - Blocking] `///` 文档注释误放 engine_run 参数位**:Rust 不允许 fn 参数上的 doc comment,改 `//`。
- 其余按 plan 执行;engine_runs/scheduler 双注销在 panic 分支也补齐(plan 未明说,顺手补)。

**Total deviations:** 2(1 边界调整 + 1 语法修复). **Impact:** 无 — 全测试绿。

## Known Stubs

None.

## Self-Check: PASSED

- tray.rs 存在且提交;9b01a22 / 3daaddc `git log` FOUND
- cargo 161/0/2、npm 241/241、tsc clean
