---
phase: 32-coding
plan: 01
subsystem: engine/coding-tools
tags: [cp-4, event-schema, repo-scope-lock, migrations, dunce]
requires: []
provides:
  - EVENT-SCHEMA-V0.4.md 增量清单 + parity CI 互锁(event_schema_fixture_interlock)
  - workspace_repo_roots 持久化(migration 0015)+ engine_workspace_bind_repo / engine_workspace_detect_repo 命令
  - code_ops.rs 边界层(detect_repo_root / resolve_repo / within_repo / is_nova_data_path)
  - ToolCtx.repo_root(loop_runner 每 run 从表读取)
affects: [32-02, 32-03, 32-04, 32-05, phase-33/34/35]
tech-stack:
  added: [dunce, similar, ignore, grep-searcher, grep-regex, which, sysinfo]
  patterns: [dunce segment-wise canonicalize (resolve_deep shape), Windows case-insensitive separator-boundary prefix compare]
key-files:
  created:
    - docs/events/EVENT-SCHEMA-V0.4.md
    - src-tauri/migrations/0015_workspace_repo_root.sql
    - src-tauri/src/engine/code_ops.rs
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/engine/parity.rs
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/exec.rs
    - src-tauri/src/engine/fs_ops.rs
    - src-tauri/src/lib.rs
decisions:
  - workspace repo 绑定落独立表 workspace_repo_roots(无 workspaces SQL 表,记录在 kv_store zustand blob)
  - 事件清单 fixture 豁免形态 = `fixture: pending-<plan>` 前缀;非 pending 条目必须被 fixture JSON 包含
metrics:
  duration: 约 45 分钟
  completed: 2026-09-04
---

# Phase 32 Plan 01: coding 工具地基(CP-4 门 + repo 作用域锁)Summary

一句话:一次建成 v0.4 事件 schema 增量清单 + CI 互锁断言,并交付 repo 作用域锁底座(workspace_repo_roots 持久化 + dunce 逐段 canonicalize 边界校验三件套测试)。

## What Was Done

### Task 1 — CP-4 流程门(b900be2)

- **7 个 crate 依赖**加入 `src-tauri/Cargo.toml`:dunce / similar / ignore / grep-searcher / grep-regex / which / sysinfo(sysinfo 取 0.33),`cargo check` 零 error。
- **`docs/events/EVENT-SCHEMA-V0.4.md`**:12 条增量条目(code_edit / code_read / code_grep / code_write 工具事件、exec `pid` payload 字段、confirmation kind `code_edit` + `reject_reason` 列、`orphan_exec_killed` / `code_edit_auto_rejected` 新 event_type、spawn / pipeline_gate / skill_injected 预留),每条注明落点表、双侧消费方、fixture 状态。
- **CI 互锁**:`parity.rs` 新增 `event_schema_fixture_interlock` 测试 —— 解析文档 `- event:` 条目,`fixture: yes` 条目名必须出现在 fixtures 目录至少一个 JSON;`pending-*` 豁免(32-01 阶段全部 pending,parser-drift 守卫 = 条目数 ≥ 12)。

### Task 2 — repo 绑定底座(f25b0c1)

- **migration 0015**:`workspace_repo_roots(workspace_id PK, repo_root, updated_at)`,已注册进 lib.rs `sql_migrations()`(registry 互锁测试通过)。
- **`code_ops.rs` 边界层**:
  - `detect_repo_root`:纯 fs 向上 walk 找 `.git`,dunce canonicalize,不调 git 二进制;
  - `resolve_repo`:fs_ops::resolve_deep 同构,逐段 dunce canonicalize(symlink/junction 中途跳变即被解析),越界返回 UI-SPEC 锁定文案「路径超出仓库范围,已拒绝:{path}」;
  - `within_repo`:Windows 小写 + 分隔符边界前缀比较(`C:\repo-evil` 不匹配 root `C:\repo`),非 Windows 字节比较;不存在的写目标走 parent-canonicalize + leaf 回附;
  - `is_nova_data_path`:Nova 数据目录永远拒绝(agent 不能自我手术);
  - `bind_repo_root` / `get_repo_root` 持久化读写。
- **ToolCtx.repo_root: Option<PathBuf>**:全部 45+ 构造点补 `None`(向后兼容);loop_runner 每 run 按 workspace_id 从表读取真实绑定。
- **命令**:`engine_workspace_bind_repo`(设置页改绑/解绑)、`engine_workspace_detect_repo`(workspace 打开后检测 .git 并写入),注册进 lib.rs invoke_handler。
- **三件套测试全绿**:junction 指向 repo 外 → 拒绝(Windows mklink /J;非 Windows symlink);repo_root 混写大小写判定一致(#[cfg(windows)]);Nova 数据库路径拒绝;另附 detect 向上 walk 与 bind/get roundtrip。

## Verification

- `cargo test --lib code_ops`:5/5 通过
- `cargo test --lib event_schema_fixture_interlock`:通过
- `cargo test --lib` 全量:226 passed / 1 failed / 2 ignored —— 唯一失败 `workflow_crud_via_tools_three_tiers` 为 **HEAD 上既有失败**(git stash 验证,与本 plan 无关,已记 deferred-items.md)
- `npm run lint`(tsc --noEmit):通过

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] migration 路径与表形态**
- **Found during:** Task 2
- **Issue:** plan 写 `src-tauri/src/engine/migrations/0015` + `ALTER TABLE workspaces`;实际 migrations 在 `src-tauri/migrations/`,且**不存在 workspaces SQL 表**(workspace 记录在 kv_store zustand blob)。
- **Fix:** migration 落正确目录,建独立 `workspace_repo_roots` 表(plan 自身预留了「若持久化在别表则改对应表」裁定)。
- **Files:** src-tauri/migrations/0015_workspace_repo_root.sql

**2. [Rule 3 - Blocking] 磁盘耗尽(os error 112)**
- **Found during:** Task 1 测试运行
- **Issue:** target 目录累积 40G,D: 仅剩 0.7G,cargo 无法编译。
- **Fix:** 删除 `target/debug/incremental`(6G);deps 陈旧产物记 deferred-items.md 建议 release 前 cargo clean。

**3. [Rule 3 - Blocking] lib.rs migration registry 漏注册**
- **Issue:** 新 migration 触发既有 `registry_matches_migration_files` 互锁测试(27-04 根因防线,按设计工作)。
- **Fix:** 0015 注册进 `sql_migrations()`。

## Known Stubs

None. 本 plan 是地基(边界层 + 持久化),工具实现按计划留 32-03。

## Self-Check: PASSED

- docs/events/EVENT-SCHEMA-V0.4.md FOUND
- src-tauri/src/engine/code_ops.rs FOUND(含 dunce::canonicalize / resolve_repo / within_repo / detect_repo_root / is_nova_data_path)
- src-tauri/migrations/0015_workspace_repo_root.sql FOUND(含 repo_root)
- commits b900be2、f25b0c1 FOUND
