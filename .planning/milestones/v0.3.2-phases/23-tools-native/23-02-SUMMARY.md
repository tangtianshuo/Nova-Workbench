---
phase: 23-tools-native
plan: "02"
subsystem: rust-run-engine
tags: [exec, whitelist, hitl, process-management, tokio]
requires: ["23-01 execute_async/ToolOutput/workspace_root", "22-06 append_tool_result"]
provides: ["exec 工具全集(spawn/树杀/超时/取消/流式/白名单/HITL)", "engine_exec_confirmed / engine_whitelist_add commands", "exec_approval 候选流 + kv_store agent.exec.whitelist 学习", "migration 0008 (kind CHECK +exec_approval)"]
affects: [src-tauri/src/engine/exec.rs, src-tauri/src/engine/tools.rs, src-tauri/src/engine/commands.rs, src-tauri/src/engine/confirmations.rs, src-tauri/src/engine/mod.rs, src-tauri/src/lib.rs, src-tauri/migrations/0008_confirmation_kind_exec.sql, src/ai/api.ts, src/stores/chatConsoleStore.ts, src/components/AgentConsole.tsx]
tech-stack:
  added: []
  patterns: ["tokio::select! 四路(双流逐行 + cancel + deadline)单循环进程核心", "纯 spawn 核心(spawn_core/execute_core)与 conn 候选路径(exec::run)分离,confirmed command 复用核心", "&Connection !Send → 同步 prelude/settle 夹住异步执行段", "kv_store 二元组白名单(command + 只读子命令限定)默认清单与学习清单合并"]
key-files:
  created:
    - src-tauri/src/engine/exec.rs
    - src-tauri/migrations/0008_confirmation_kind_exec.sql
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/confirmations.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/lib.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
    - src/components/AgentConsole.tsx
decisions:
  - "migration 0008 重开 agent_confirmation_candidates CHECK 加入 exec_approval(SQLite 无法 ALTER CHECK,复用 0006 copy→drop→rename 先例)— 计划未列,Rule 3 阻塞修复"
  - "engine_exec_confirmed 拆 exec_confirmed_prepare(同步)+ execute_core(await)+ exec_confirmed_settle(同步):&Connection !Send 不能跨 await,tauri command future 须 Send"
  - "白名单匹配 = argv[0] basename 小写归一去 .exe;subcommands=Some 时要求 args[0] ∈ 集合(堵 git push / 裸 git);学习条目仅 command 级"
  - "spawn 错误(命令不存在)直接回模型(spawn failed: …),白名单命中 ≠ 二进制存在 — 计划已裁定为 non-defect"
  - "确认卡文案落在 AgentConsole.tsx(卡片渲染处),chatConsoleStore 注释含同文案;api 包装在 src/ai/api.ts(计划写 src/lib/api.ts,但 22-06 起引擎 IPC 全在 src/ai/api.ts,跟随现状)"
metrics:
  duration: 55m
  completed: 2026-08-24
---

# Phase 23 Plan 02: exec 原生工具全集 Summary

**One-liner:** exec 工具 Rust 全原生落地 —— tokio::process 子进程核心(kill_on_drop、Windows taskkill /T 树杀带 ponytail 注释、120s 默认超时、CancellationToken select! 取消、stdout/stderr 逐行经 ToolOutput 流式)、只读白名单(git 五子命令 + dir/ls/type/cat/rg/grep/findstr/where/pwd,command+子命令二元组,kv_store 学习合并)、白名单外 exec_approval 候选进 WAIT,确认卡三选项(拒绝/仅本次/永久加入白名单)后由 Rust command 原生重执行并以 [confirmed rerun] settle,全程零 webview 回调。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | exec 核心模块(进程管理 + 白名单)+ 单元测试 | bc29ad9 | exec.rs, tools.rs, mod.rs, confirmations.rs, 0008 migration, lib.rs |
| 2 | engine_exec_confirmed / engine_whitelist_add + 确认卡 UI | b799a1d | commands.rs, lib.rs, exec.rs, src/ai/api.ts, chatConsoleStore.ts, AgentConsole.tsx |

## Verification

- `cargo test`: **131 passed / 0 failed / 2 ignored**(基线 119 → +12:exec 10 + commands 2)
- `npm test`: **241/241 pass**;`npm run lint`(tsc): clean
- `! grep -rnq "invoke" src-tauri/src/engine/exec.rs src-tauri/src/engine/tools.rs` → PASS(TOOL-04 结构性锁定)
- `grep -c taskkill exec.rs` = 2(实现 + ponytail 竞态注释);`engine_exec_confirmed` 于 commands.rs / lib.rs / src/ai/api.ts 三处命中;chatConsoleStore 有 exec_approval 分支与「永久加入白名单」文案(注释),AgentConsole 三按钮卡
- 23-01 过渡态 `#[allow(unused_variables)]` 已移除,cancel/on_event 被 exec 消费

## Key Behavior Locks

- exec ToolSpec:idempotency=verify_first,description 含 argv/无 shell/需 workspace/120s 超时 + PORT_01_SUFFIX
- 白名单测试锁定:git[status,diff,log,show,branch] 命中、`git push` 拦截、裸 git 拦截、`GIT.EXE`/全路径归一命中、`rm` 不命中;学习条目持久化 + 去重
- 进程核心测试:取消 → Failed("cancelled")、300ms 超时 → Failed("timeout after 300ms")、echo 流式产生 tool_output 事件、workspace_root None → Failed(arg_error=false)
- confirmed 流测试(整链):exec::run 候选 → confirm+consume → allow_permanently 学习入 kv → Rust 重执行(stdout 含 confirmed)→ 事件流 tool_call([confirmed rerun]) + tool_result(ok)→ 二次 consume already_settled
- 前端:pendingExecApproval 三选项卡;tool_output 行追加至运行中 trace 项(尾 50 行,stderr warning 色),纯展示不落库

## Deviations from Plan

- **[Rule 3 - blocking] migration 0008**:agent_confirmation_candidates 的 CHECK 约束不允许 exec_approval(INSERT 直接失败)。新增 0008_confirmation_kind_exec.sql(copy→drop→rename 重建,同 0006 先例),lib.rs + db.rs(目录自动扫描)注册。
- **[Rule 1 - bug] Send 约束重构**:计划设想的单一 exec_confirmed_inner 持 &Connection 跨 await — tauri command future 须 Send 而 &Connection !Send,编译失败。拆 prepare/await/settle 三段,inner 保留供测试。
- **api 包装落点**:计划 files 写 src/lib/api.ts,实际引擎 IPC 封装自 22-06 起全在 src/ai/api.ts — engineExecConfirmed/engineWhitelistAdd 落 src/ai/api.ts,与既有 engineRun 等同文件。
- **确认卡文案位置**:「永久加入白名单」按钮在 AgentConsole.tsx(所有候选卡的渲染处);chatConsoleStore 持 exec_approval 分支逻辑与注释文案。

## Known Stubs

- exec 确认卡不做 sessionRestore 恢复(knowledge/destructive 有恢复,exec 候选重启后不重投影)— 候选仍在 DB,过期 TTL 24h 自然清理;需要时 23-05/Phase 25 补。
- 白名单设置页编辑 UI:deferred(v0.3.3,23-CONTEXT 已定)。

## Self-Check: PASSED

- 文件:exec.rs / 0008 / tools.rs / commands.rs / confirmations.rs / mod.rs / lib.rs / src/ai/api.ts / chatConsoleStore.ts / AgentConsole.tsx 均已提交
- 提交 bc29ad9 / b799a1d FOUND;cargo 131/0/2、npm 241/241、tsc clean、零 invoke 门通过
