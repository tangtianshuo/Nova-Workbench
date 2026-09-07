---
phase: 32-coding
plan: "06"
subsystem: coding-agent/workspace-linkage
tags: [code-ops, workspace, product-linkage, uat-gap-closure]
requires: ["32-01 repo scope lock", "32-03 code_* tools", "32-05 repo binding UI"]
provides: ["workspace_root code-root fallback", "product→workspace switching", "repo≠workspace path hint"]
affects: [src-tauri/src/engine/code_ops.rs, src/stores/uiStore.ts, src/views/SettingsView.tsx, src/components/CmdKPalette.tsx]
tech-stack:
  added: []
  patterns: ["repo_root.or(workspace_root) same-boundary fallback (CP-1 preserved)", "store cross-link via getState() in action (no hook)"]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/code_ops.rs
    - src/stores/uiStore.ts
    - src/views/SettingsView.tsx
    - src/components/CmdKPalette.tsx
decisions:
  - "未绑 repo 时代码根 = workspace_root,repo 绑定优先(用户显式指定 = 绑定);resolve_repo + nova_guard 边界对兜底 root 一视同仁(CP-1 不放松)"
  - "NO_REPO_MSG 文案改双语义但常量名保留,避免 32-05 UI copy 引用断链;grep 确认 TS 侧无字符串相等断言"
  - "多 workspace 同 productId 取 find 首个(ponytail:选择 UI 待真实场景出现再加)"
metrics:
  duration: "~25 min"
  completed: 2026-09-07
  tasks: 2
  files: 4
  tests: "+4 Rust tests (code_ops 24/24)"
---

# Phase 32 Plan 06: 产品↔工作区联动 + 代码目标默认落工作区 Summary

关闭 UAT test#3 的三个根因缺口:code_* 工具在未绑 repo 时以 workspace_root 为代码根(repo 绑定优先)、切产品联动切工作区(repo 绑定随之切换)、设置页可见 repo≠workspace 路径差异与产品关联。

## What Was Done

### Task 1: resolve_code_target workspace_root 兜底(Rust,TDD)— 5d2372a

- `repo_root_or_fail`:`ctx.repo_root.or(ctx.workspace_root)`,皆 None 失败
- `NO_REPO_MSG` 文案改为双语义:"无可用代码根目录 — 工作区未指定且未绑定仓库"(常量名保留)
- `root_str`(code_write/code_edit params.root)同步用 effective code root,apply_edit 从 params.root 重解析,兜底路径下 stale 检测/边界重验照旧
- CP-1 不放松:resolve_repo + nova_guard 对兜底 root 一视同仁;CP-2 五键锁形不动(无 per-call root 参数);CP-3 base_hash 不动
- 4 个新测试:fallback read + write params.root 落 ws、repo 优先于 ws、双 None 双语义提示、兜底分支 `..` 逃逸拒绝
- TDD RED→GREEN 在本地一次运行内完成(RED 已确认 4 失败后再实现),单 commit 提交(偏离 TDD 双 commit 惯例,见 Deviations)

### Task 2: 切产品联动工作区 + 设置页提示(TS)— ae66ba5

- `uiStore.setSelectedProductId`:切产品后若有关联 workspace(Workspace.projectId 匹配,find 首个)则 `useWorkspaceStore.getState().setActiveWorkspaceId(bound.id)`(复用 SESS-04:streaming guard + 结束当前 session);无匹配不动
- 循环依赖 uiStore→workspaceStore→chatConsoleStore→uiStore:仅运行时回调引用,模块初始化无 top-level 使用,静态 import 安全
- CmdKPalette.tsx engine_run 补 `workspaceRoot` 传参(照 chatConsoleStore.ts:766 模式)——checker 补线项
- SettingsView WorkspaceRepoSection:repoRoot ≠ folderPath 时 warning hint(分隔符/尾斜杠/大小写归一比较);workspace.projectId 有值时显示关联产品名 Badge(reactive selector)
- "未绑定时 coding 工具会拒绝执行并提示" 帮助文案更新为 "默认落工作区目录执行"(与新语义一致)

## Verification

- `cargo test code_ops`:24/24 通过
- `cargo test` 全量:257 passed, 1 failed — 唯一失败 `workflow_crud_via_tools_three_tiers` 为已知 pre-existing(orchestrator brief 明示除外)
- `npm run lint`(tsc --noEmit):clean
- 手动 UAT 路径(回归 test#3)留真机:切产品 → 工作区/repo badge 联动;未绑 repo 工作区上 code_* 落 folderPath

## Deviations from Plan

### Auto-fixed Issues

**1. [流程] TDD RED/GREEN 合并为单 commit**
- Plan 未强制分 commit;RED 已实际运行确认失败(4 FAILED)后再实现。语义等价,少一个中间 commit。

**2. [Rule 1 - 测试修正] repo preference 测试断言 stat failed 而非 read failed**
- code_read 对缺失文件先 stat 后 read,错误前缀是 "stat failed";修正断言。

**3. [Rule 2 - 补全] SettingsView 帮助文案随语义更新**
- 原 copy "未绑定时 coding 工具会拒绝执行并提示" 在兜底语义下已不真,同步改为新语义,防误导。

## Known Stubs

None.

## Self-Check: PASSED

- 4 modified files 全部在 commit 5d2372a / ae66ba5 中(git show --stat 核对)
- cargo test code_ops 24/24、tsc clean、全量 cargo 仅已知 pre-existing 失败
