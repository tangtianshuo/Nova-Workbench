---
phase: 32-coding
plan: "02"
subsystem: engine-exec-security
tags: [exec, security, cp-6, cp-8, hitl, crash-recovery]
requires: ["32-01 (workspace_repo_roots + within_repo/resolve_repo)"]
provides: ["hardened exec spawn (which/env/git/pair)", "workspace-scoped exec whitelist", "orphan exec reaping + orphan_exec_killed audit"]
affects: [exec.rs, restore.rs, event_log.rs, commands.rs, loop_runner.rs, scheduler.rs]
tech-stack:
  added: []
  patterns: ["which::which_in + PATH scrub", "env_remove-based secret scrub", "json_set pid merge into tool_call payload"]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/exec.rs
    - src-tauri/src/engine/restore.rs
    - src-tauri/src/engine/event_log.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/scheduler.rs
    - docs/events/EVENT-SCHEMA-V0.4.md
decisions:
  - "pid 记录点 = spawn 成功即 json_set 进在途 exec tool_call(event_log::record_exec_pid);tool_result payload 亦带 pid"
  - "on_pid 回调走 DB path 自开 Connection(rusqlite !Sync,不能捕获 &Connection 跨 Send 边界)"
  - "engine_whitelist_add 备份路径保持 legacy 共键(无 session 上下文,不改 TS 签名)"
metrics:
  duration: "~50m"
  completed: "2026-09-04"
  tasks: 2
---

# Phase 32 Plan 02: exec 四绕过面收口 + CP-8 孤儿进程清杀 Summary

exec 工具的四个安全绕过面(PATH 劫持 / env 泄密 / git 危险 flag / 白名单过宽)全部闭合,外加崩溃恢复时按 pid 清杀存活孤儿 exec 进程并落 orphan_exec_killed 审计事件;npm.cmd 在 Windows 可解析执行。

## What Was Built

### Task 1: spawn 收口(src-tauri/src/engine/exec.rs 等,2895fd3)

- **which 解析**:`resolve_in(path, command, cwd, repo_root)` — `which::which_in` 对 repo 清洗后的 PATH 解析;解析结果落在 repo_root 内 → Failed(劫持面);找不到 → `command not found: {command}`。`.cmd/.bat` 由 std(≥1.77)自动 cmd.exe 转发,零手拼 `cmd /c`。
- **PATH 清洗**:`sanitized_path(repo_root)` 移除 repo 前缀 PATH 项;同一份清洗 PATH 同时用于 which 解析与子进程 PATH。
- **env scrub**:复制父 env,`env_remove` 掉 name 含 KEY/TOKEN/SECRET/PASSWORD(大小写不敏感)的变量 — 关键点是 `env()` 只增不清,必须显式 remove。
- **git 黑名单**:`GIT_DANGEROUS_FLAGS`(--output/--upload-pack/-c/--exec/--exec-path)前缀匹配 → 直接 Failed「已拒绝:git 危险操作({flag})」,不建候选、不可学习;confirmed 重放路径(execute_core)同样复查。
- **二元组学习**:`add_command_to_whitelist(conn, key, command, first_arg)` — 「总是允许」只学 command+首参数对(`npm install` ≠ `npm publish`);WhitelistEntry.subcommands 字段复用,schema 零改动。
- **workspace 级白名单键**:`whitelist_key_for_session` 从 sessions 表取 workspace_id → `agent.exec.whitelist.{wid}`;无 workspace 的 session 回退 legacy 共键(旧数据兼容)。
- **cwd 对齐(Pitfall 8)**:candidate params 的 cwd 与执行 cwd 同源 = repo_root(有绑定)/ workspace_root(无),confirmed 重放天然一致。
- **pid 落事件**:spawn 成功即 `event_log::record_exec_pid`(json_set 进在途 exec tool_call payload);CoreResult/Executed payload 携带 pid。
- 测试:env-scrub(cmd /c set 断言无 NOVA_TEST_API_KEY/TOKEN/PASSWORD)、黑名单、二元组、PATH 劫持(构造 repo 内假 npm.cmd)、键 scoped、normalize(.cmd/.bat)、command-not-found。

### Task 2: CP-8 恢复清杀(src-tauri/src/engine/restore.rs + event_log.rs,c30d651)

- `restore_session` 第 3 步 `reap_orphaned_execs`:孤儿 exec tool_call 的 payload.pid + args.command → sysinfo 查活 → 进程名含命令 basename(双保险防 PID 复用误杀)→ `taskkill /PID {pid} /T /F`。
- 每个发现(killed / not-running / pid-reused-name-mismatch / kill-failed)都落 `orphan_exec_killed` 审计事件(pid/command/action);reap 失败不阻断 restore。
- macOS/Linux kill(2) 留 TODO debt(注释注明,action=kill-failed 可观测)。
- 测试:死 pid 只审计不 kill、无 pid/非 exec tool 不触发、Windows 真进程(cmd /c ping 30s)集成 kill。

## Verification

- `cargo test --lib exec` — 24 passed
- `cargo test --lib restore` — 11 passed
- `cargo test --lib` 全量 — 236 passed / 1 failed:workflow_crud_via_tools_three_tiers(干净 HEAD 即失败的 pre-existing 回归,记于 deferred-items.md,非本 plan 引入)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] on_pid 回调不能捕获 &Connection**
- **Found during:** Task 1
- **Issue:** rusqlite Connection !Sync;spawn_core 若接收非 Send 回调,engine_exec_confirmed(tauri command,要求 Send future)编译失败;`drop(on_pid)` 对 Copy 的 `Option<&dyn Fn>` 无效(仍在 generator 状态里)
- **Fix:** 回调类型 `&(dyn Fn(u32) + Send + Sync)`;run() 侧闭包从 `conn.path()` 自开 Connection 写 pid(:memory: 跳过)
- **Files:** exec.rs
- **Commit:** 2895fd3

**2. [Rule 1 - Bug] env scrub 初版漏删变量**
- **Issue:** 只 `continue` 跳过 secret 变量,但 `Command::env()` 只增不清,子进程仍继承父 env(测试抓到 ANTHROPIC_AUTH_TOKEN 泄漏)
- **Fix:** 显式 `builder.env_remove(&k)`
- **Commit:** 2895fd3

**3. [Rule 1 - Bug] loop_runner exec 测试白名单键失配**
- **Issue:** ctx_root 的 session s1 带 workspace w1,run 时读 scoped 键但测试学进 legacy 键 → 误弹候选
- **Fix:** 测试先 upsert_session 再按 scoped 键学习(正是新语义的正确用法)
- **Commit:** 2895fd3

### 计划内偏差(记录)

- Task 2 真进程测试用 `cmd /c ping` 而非计划的 `cmd /c timeout`(timeout.exe 在重定向 stdin 下直接报错,ping 才可稳定复现长命进程)。
- `engine_whitelist_add` 备份命令保持 legacy 共键:签名无 session 上下文,改签名会动 TS 调用;主路径(engine_exec_confirmed)已是 workspace-scoped。
- EVENT-SCHEMA-V0.4.md:exec pid 与 orphan_exec_killed 已在 32-02 落地,但 fixture 按清单原分配保持 `pending-32-04`(realdb-sample 属 32-04;现在翻 yes 会破 interlock 测试)。

## Known Stubs

- **posix 孤儿 kill**:restore.rs `kill_tree_by_pid` 非 Windows 返回 false(action=kill-failed 审计可见)— 计划明示 TODO debt,mac/linux crash-recovery UAT 落地时补 kill(2)。
- **真机狗粮 UAT**(`npm run tauri:dev` 跑 `npm --version` exec run):无头环境不可执行,顺延至 32-04/phase UAT。

## Self-Check: PASSED

- exec.rs / restore.rs / event_log.rs / commands.rs / loop_runner.rs / scheduler.rs / EVENT-SCHEMA-V0.4.md 均存在且已修改
- 提交 2895fd3(Task 1)、c30d651(Task 2)均在 git log 中
