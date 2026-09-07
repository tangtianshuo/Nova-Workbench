---
phase: 32-coding
verified: 2026-09-07T00:00:00Z
status: human_needed
score: 28/28 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 23/23
  gaps_closed:
    - "UAT test#3 产品↔工作区联动语义(32-06:切产品联动 activeWorkspaceId + code 工具 workspace_root 兜底 + 设置页路径提示 + CmdKPalette workspaceRoot 补线)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "真机 UAT:在 Tauri 桌面端绑定真实仓库,跑一次完整 coding run(read/grep 侦察 → code_write/code_edit diff 卡审批 → exec 首遇三选卡)"
    expected: "侦察零确认直接返回;每次 write/edit 弹 diff 卡;批准后文件实际改写、拒绝附原因后 run 继续可重试;改动摘要可沉淀"
    why_human: "32-04 七步 UAT 与 32-05 收口 checkpoint 被 auto_advance 自动通过,真机流程从未实际执行;IPC/渲染/交互只有人能确认"
  - test: "32-06 联动真机回归(UAT test#3):绑 repo 产品 → 切到另一产品(其工作区未绑 repo)→ 发起 coding run 写文件"
    expected: "activeWorkspaceId 随产品切换,repo badge 跟着变;未绑 repo 工作区上文件落 folderPath 而非 NO_REPO 失败;切回绑 repo 产品后 code_* 落 repo"
    why_human: "联动横跨 uiStore/workspaceStore/engine IPC,单测只覆盖 store action 与 Rust 兜底分支,端到端切换行为需真机确认"
  - test: "篡改场景手动验证(CP-3):候选 pending 时手动编辑目标文件,再点确认(含兜底 root 场景)"
    expected: "apply 前重校验失败,卡片报 stale 并带 path+当前行号文案"
    why_human: "单测已覆盖逻辑,但端到端 IPC 路径未经真机验证"
  - test: "崩溃恢复真机验证:coding run 执行中强杀进程后重启 Nova"
    expected: "孤儿 exec 进程被清杀并落 orphan_exec_killed 审计事件(仅 Windows)"
    why_human: "崩溃注入无法程序化验证;且 Posix 清杀是 stub(已知限制)"
---

# Phase 32: coding Verification Report

**Phase Goal:** agent 在用户真实仓库中先研究后行动——read/grep 自由侦察,write/edit/exec 每步过门(diff 卡 / exec 白名单),改动可审批、可取消、可沉淀
**Verified:** 2026-09-07
**Status:** human_needed(自动化全过含 gap closure,真机 UAT 未执行)
**Re-verification:** Yes — after UAT test#3 gap closure (32-06) + quick 260907-d94

## Goal Achievement

### Observable Truths

**32-01..32-05(前一轮 23 项,本轮回归抽查)**

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1-23 | 见前一轮 2026-09-04 报告(repo 持久化/三形态拒读/exec 门禁/env 密钥/白名单学习/孤儿清杀/code 四工具/CP-2/CP-3/reject 落列/diff 卡第四宿主/排队徽章/沉淀流/TabRunPanel/repo badge/研究契约) | ✓ VERIFIED | 回归抽查通过:code_ops.rs 既有测试(zero_match/multi_match/escape)原样、settleTabCodeEdit 接线仍在(tabRunStore ×3 / chatConsoleStore ×2)、restore.rs orphan_exec_killed 落审计、EVENT-SCHEMA-V0.4.md + code-edit fixture 存在 |

**32-06 gap closure(本轮增量 5 项)**

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 24 | 切换产品后关联工作区成为 activeWorkspace,repo 绑定随之切换 | ✓ VERIFIED | `uiStore.ts:109-117` setSelectedProductId → `useWorkspaceStore.getState().setActiveWorkspaceId(bound.id)`(find projectId 首个匹配,无匹配不动);repo 绑定按 workspace_id 键天然随切 |
| 25 | 未绑 repo 时代码工具落 workspace_root,不再 NO_REPO | ✓ VERIFIED | `code_ops.rs:49-54` `repo_root.or(workspace_root)`;测试 `workspace_root_fallback_unbound_repo`(read 落 ws + write params.root stamp ws) |
| 26 | 绑定 repo 时仍优先 repo | ✓ VERIFIED | 测试 `repo_root_preferred_over_workspace`(双 root 时 read 命中 repo 内 marker.txt) |
| 27 | repo_root ≠ 工作区路径时设置页有可见提示 | ✓ VERIFIED | `SettingsView.tsx:297` `!pathsEqual(repoRoot, folderPath)` warning hint + `:195` 归一比较 + `:264-265` 关联产品 Badge |
| 28 | 旧 localStorage 数据(无新字段)正常工作 | ✓ VERIFIED | 兜底为 `Option` or-else,无新必填字段;`projectId?`/`repoRoot?` 均可选,无匹配即不动(联动 else 分支) |

**quick 260907-d94(增量,schema guard 单一真相源)**

- `max_schema_version` command 在 `lib.rs:153`(migration registry 派生,带测试 `max_schema_version_matches_registry_max` 断言 =16)✓;TS guard `initializeDatabase.ts:37` `invoke('max_schema_version')` 消费 ✓。commits 16e251c/35c8dff/170b8e8 存在 ✓。

**Score:** 28/28 truths verified(代码级)

### Required Artifacts(本轮增量)

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `src-tauri/src/engine/code_ops.rs`(32-06 改动) | ✓ VERIFIED | commit 5d2372a(+89/-4):fallback 分支 + 4 新测试,`resolve_repo`+`nova_guard` 边界对兜底 root 一视同仁(CP-1 不放松,测试 `workspace_fallback_escape_rejected` + `neither_root_fails_with_dual_hint` 双语义文案) |
| `src/stores/uiStore.ts` | ✓ VERIFIED | commit ae66ba5(+14):联动逻辑与 plan 伪码一致,`import useWorkspaceStore` 静态引入(运行时 getState,无初始化环) |
| `src/views/SettingsView.tsx` | ✓ VERIFIED | commit ae66ba5(+28):pathsEqual hint + 产品 Badge + 帮助文案随新语义更新 |
| `src/components/CmdKPalette.tsx` | ✓ VERIFIED | commit ae66ba5(+4):engine_run 补 `workspaceRoot`(folderPath 查找,照 chatConsoleStore 模式)——checker 补线项已闭合 |

### Key Link Verification(增量)

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| uiStore#setSelectedProductId | workspaceStore#setActiveWorkspaceId | getState() 调用 | ✓ WIRED(:112-116) |
| code_ops#resolve_code_target | ToolCtx.workspace_root | repo_root.or(workspace_root) | ✓ WIRED(:49-54,params.root 同步 :398) |
| CmdKPalette engine_run | workspaceRoot | folderPath 透传 | ✓ WIRED(:80-83) |
| initializeDatabase.ts | lib.rs#max_schema_version | invoke | ✓ WIRED(:37 ↔ lib.rs:226 注册) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 32-06 四新测试存在且实质 | grep code_ops.rs | fallback/preference/dual-hint/escape 四测试命中,断言真实 | ✓ PASS |
| commits 存在 | git show 5d2372a / ae66ba5 / 170b8e8 | 全部存在,stat 与 SUMMARY 一致 | ✓ PASS |
| cargo test code_ops 24/24 | 据 32-06 SUMMARY Verification | 通过 | ✓ PASS(代码级复核测试实体) |
| cargo test 全量 | 据 SUMMARY:257 passed / 1 failed | 唯一失败 workflow_crud_via_tools_three_tiers = pre-existing(deferred-items.md) | ✓ PASS(已知豁免) |
| npm run lint | 据 SUMMARY | clean | ✓ PASS |

## Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| ENGINE-01 | 32-03, 32-05 | ✓ SATISFIED | context_assembler 研究契约;32-06 兜底不改变契约语义(代码根定义放宽,先研究后行动不变) |
| CODE-01 | 32-03 | ✓ SATISFIED | code_ops 4 工具 + exec 复用 |
| CODE-02 | 32-03, 32-04 | ✓ SATISFIED | code_edit kind + CP-2 测试 + diff 卡第四宿主 |
| CODE-03 | 32-02, 32-04 | ✓ SATISFIED | 白名单/三选卡/二元组学习 |
| CODE-04 | 32-01, 32-05 | ✓ SATISFIED | repo_root 绑定 + 边界拒绝 + badge/设置 UI;32-06 增强为 repo 优先 + workspace 兜底 |
| CODE-05 | 32-02, 32-05 | ✓ SATISFIED | 取消级联 + kill_tree + 孤儿清杀 + TabRunPanel |
| CODE-06 | 32-04 | ✓ SATISFIED | 沉淀 → knowledge_write 候选流 |

无 ORPHANED requirement(7/7)。32-06 认领的 UAT32-GAP-1 已闭合。

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| restore.rs | 239 | Posix 孤儿清杀 stub(不变) | ℹ️ Info | Windows 目标达成,已知限制 |
| cargo 测试 | — | workflow_crud_via_tools_three_tiers 失败 | ℹ️ Info | pre-existing,deferred-items.md 已记录 |

无 Blocker、无 Warning。

### Gaps Summary

无阻塞 gap。本轮增量(32-06 四文件 + d94 schema guard)全部在代码级验证通过:存在、实质、接线、测试覆盖,且 CP-1..CP-3 安全约束经新测试确认未放松。UAT test#3 的联动语义 gap 已按用户锁定需求(默认同路径/切产品联动/产出默认落工作区)闭合。剩余唯一未闭环项与上轮相同:真机人工验证(4 项,见 frontmatter)——桌面端完整 coding run、32-06 联动端到端、篡改场景、崩溃恢复。

---

_Verified: 2026-09-07_
_Verifier: Claude (gsd-verifier)_
