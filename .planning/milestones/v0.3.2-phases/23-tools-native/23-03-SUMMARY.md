---
phase: 23-tools-native
plan: "03"
subsystem: rust-run-engine
tags: [fs, hitl, path-safety, workspace-boundary]
requires: ["23-01 ToolCtx workspace_root", "23-02 candidate/confirmed-rerun 模式 + migration 0008 先例", "22-06 append_tool_result"]
provides: ["fs 工具六件套(fs_list/fs_read 自由读;fs_write/fs_mkdir/fs_delete/fs_move → fs_write HITL 候选)", "engine_fs_apply command(确认后 Rust 执行 + [confirmed rerun] settle)", "migration 0009 (kind CHECK +fs_write)", "resolve_deep 任意深度路径解析", "前端 pendingFsWrite 确认卡"]
affects: [src-tauri/src/engine/fs_ops.rs, src-tauri/src/engine/tools.rs, src-tauri/src/engine/commands.rs, src-tauri/src/engine/confirmations.rs, src-tauri/src/engine/mod.rs, src-tauri/src/file_ops.rs, src-tauri/src/lib.rs, src-tauri/migrations/0009_confirmation_kind_fs.sql, src/ai/api.ts, src/stores/chatConsoleStore.ts, src/components/AgentConsole.tsx]
tech-stack:
  added: []
  patterns: ["resolve_deep:逐段 canonicalize(每存在一级归一一次,symlink 逃逸仍被捕获)+ 缺失叶逐段拼接", "全同步 command(fs std::fs 无 await,无需 23-02 的 prepare/settle 拆分)", "候选 params 携带 root(对齐 exec 的 cwd)使 apply command 无引擎态可再解析"]
key-files:
  created:
    - src-tauri/src/engine/fs_ops.rs
    - src-tauri/migrations/0009_confirmation_kind_fs.sql
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/confirmations.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/file_ops.rs
    - src-tauri/src/lib.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
    - src/components/AgentConsole.tsx
decisions:
  - "migration 0009 CHECK +fs_write(0008 同构 copy→drop→rename)— 计划未列,Rule 3 阻塞修复(INSERT 直接违反 CHECK)"
  - "fs_ops 用本地 resolve_deep 而非直接复用 resolve_in_root:后者只容忍一层缺失叶,mkdir/write 到缺失父目录会被误判越界;resolve_in_root 仍按计划提为 pub(crate),两者语义一致(canonicalize+starts_with+.. 拒绝)"
  - "engine_fs_apply 全同步(std::fs 无跨 await),with_conn 直进 — 23-02 的 prepare/await/settle 三段拆分仅 exec 需要"
  - "fs_move 语义 = rename(src → dest 目标路径),非 file_ops::fs_move 的『移入目录』语义;agent 工具描述已写明"
metrics:
  duration: 45m
  completed: 2026-08-24
---

# Phase 23 Plan 03: fs 原生工具六件套 Summary

**One-liner:** fs 工具 Rust 全原生落地 —— fs_list/fs_read 工作区内自由读(1MB 上限,>4KB 自动 artifact 化),fs_write/fs_mkdir/fs_delete/fs_move 产生 fs_write 候选进 WAIT(params_hash dedup,候选携带 root 供无态再解析),越界路径(../、绝对路径)直接 arg_error 拒绝不给 HITL;确认后由全同步 engine_fs_apply command 在 Rust 执行 std::fs 操作并以 [confirmed rerun] settle,路径安全走逐级 canonicalize 的 resolve_deep,零 webview 依赖。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | fs 工具核心 + 注册 + 单元测试 | a9b99c3 | fs_ops.rs, tools.rs, mod.rs, confirmations.rs, file_ops.rs, 0009 migration, lib.rs |
| 2 | engine_fs_apply command + 确认卡 | 8ec4430 | commands.rs, lib.rs, src/ai/api.ts, chatConsoleStore.ts, AgentConsole.tsx |

## Verification

- `cargo test`: **141 passed / 0 failed / 2 ignored**(基线 131 → +10:fs_ops 8 + commands 2)
- `npm test`: **241/241 pass**;`npm run lint`(tsc): clean
- acceptance:`engine_fs_apply` 于 commands.rs / lib.rs / src/ai/api.ts 三处均命中;`grep -rn "invoke" src-tauri/src/engine/fs_ops.rs` 零命中(TOOL-04);`grep -c "fs_" tools.rs` = 17(≥6);`pub(crate) fn resolve_in_root` 命中

## Key Behavior Locks

- 边界三态测试锁定:fs_list/fs_read 自由命中;`../escape`、`a/../../escape`、绝对路径 → Failed("path escapes workspace", arg_error=true)且零候选产生;workspace_root None → Failed(arg_error=false)
- 四写工具全部产生 kind=fs_write 候选(params={operation, path/src/dest, content, root}),同 params 二次调用 dedup 同 token
- apply_operation 四操作(write/mkdir/delete/move)测试全过,apply 时再次 resolve_deep(拒绝确认参数中的逃逸)
- fs_apply_inner 链路测试:候选 → consume → 文件落盘 → tool_call([confirmed rerun], toolName=fs_write) + tool_result(ok)→ 二次 apply 报 already_settled;kind 非 fs_write 拒绝
- fs_read >1MB → arg_error;≤4KB 直接内联,>4KB 由 loop 的 prepare_tool_result artifact 化(既有机制)

## Deviations from Plan

- **[Rule 3 - blocking] migration 0009**:candidates CHECK 不含 fs_write,同 0008 先例 copy→drop→rename 重建,lib.rs 注册。
- **[Rule 1 - bug] resolve_deep 替代直接复用 resolve_in_root**:单测试暴露 mkdir "sub/deep" 被误判逃逸(resolve_in_root 只容忍一层缺失叶)。新增逐级 canonicalize 的 resolve_deep;file_ops::resolve_in_root 仍按计划 pub(crate)(验收 grep 命中),语义保持一致。
- **api 包装落点**:计划 files 写 src/lib/api.ts,实际引擎 IPC 自 22-06 起全在 src/ai/api.ts(与 23-02 同一致偏离),engineFsApply 落 src/ai/api.ts。
- fs_apply 无跨 await,直接同步实现(计划提示复用 23-02 拆分模式,实测不需要)。

## Known Stubs

- fs 候选确认卡不参与 sessionRestore 重投影(同 23-02 exec 候选)— 候选在 DB,TTL 24h 自然清理;需要时 23-05/Phase 25 补。

## Self-Check: PASSED

- 文件:fs_ops.rs / 0009 / tools.rs / commands.rs / confirmations.rs / mod.rs / file_ops.rs / lib.rs / src/ai/api.ts / chatConsoleStore.ts / AgentConsole.tsx 均已提交
- 提交 a9b99c3 / 8ec4430 FOUND;cargo 141/0/2、npm 241/241、tsc clean、全部 acceptance grep 通过
