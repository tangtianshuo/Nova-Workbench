---
phase: 32-coding
plan: "03"
subsystem: engine/coding-tools
tags: [code_ops, hitl, code_edit, parity, migration]
requires:
  - "32-01 repo scope lock (resolve_repo/within_repo/workspace_repo_roots)"
  - "32-02 exec 收口 + ToolCtx.repo_root"
provides:
  - "code_read/code_grep 零确认 repo 侦察工具"
  - "code_write/code_edit → code_edit HITL 候选(kind 注册 + CP-2 params 锁形)"
  - "engine_code_apply(confirmed 重放 Rust 原生,CP-3 stale 重校验)"
  - "migration 0016(kind code_edit + reject_reason + base_hash)"
  - "run 取消级联 auto-reject + code_edit_auto_rejected 审计事件"
affects:
  - src-tauri/src/engine/tools.rs(registry +4 工具,30 schemas)
  - src-tauri/src/engine/confirmations.rs(reject 带 reason;Candidate +2 列)
  - src-tauri/src/engine/commands.rs(engine_reject_candidate 增 reason 参数)
tech-stack:
  added: [similar, ignore, grep-searcher, grep-regex(32-01 已加依赖,本 plan 消费)]
  patterns:
    - "base_hash 列做 apply 时 stale 检测(params JSON 保持 CP-2 锁形)"
    - "similar::udiff::unified_diff(context 3)作为候选展示字段(不进 params)"
key-files:
  created:
    - src-tauri/migrations/0016_confirmation_code_edit.sql
    - src/ai/__tests__/fixtures/projection-cases-code-edit.json
    - src/ai/__tests__/phase32CodeEdit.test.ts
  modified:
    - src-tauri/src/engine/code_ops.rs
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/confirmations.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/loop_runner.rs(仅 schema 计数测试 26→30)
    - src-tauri/src/lib.rs(migration 0016 注册 + engine_code_apply)
    - docs/events/EVENT-SCHEMA-V0.4.md
decisions:
  - "CP-3 stale 检测用候选行 base_hash 列(sha256)而非 params 快照 — params JSON 保持五键锁形,dedup 语义不受文件变化影响"
  - "取消级联落点 = commands.rs engine_run 的 Cancelled 分支(plan 写 scheduler.rs,但 scheduler 无 DB 访问;run settle 路径在 commands)"
  - "migration 0016 一个文件同时承载 kind CHECK 重建 + reject_reason + base_hash 三增量"
metrics:
  duration: 95m
  completed: 2026-09-04
  tasks: 3
  files: 10
---

# Phase 32 Plan 03: code_ops 四工具 + code_edit 确认管线 Summary

**One-liner:** code_read/code_grep 零确认侦察 + code_write/code_edit 过 HITL(code_edit 候选、unified diff 展示、apply 时 base_hash stale 重校验、run 取消级联 auto-reject 审计),双侧 parity fixture 同 commit。

## What Was Built

### Task 1 — code_read + code_grep(Readonly 零确认)
- `code_read`:repo 作用域锁(repo 绑定 → resolve_repo → nova-data-dir 兜底)→ 2000 行默认窗口 + offset/limit 分页,payload 含 totalLines/hasNext;NUL/UTF-8 二进制守卫,4MB 上限
- `code_grep`:`ignore::WalkBuilder`(.gitignore 生效,隐藏目录跳过)+ `grep_regex`/`grep_searcher`,file:line:text 结构,MAX_GREP_RESULTS=200 截断附「收窄 pattern 或 path」提示
- 注册 ToolKind::Code(新 variant),rerunnable,描述含「研究类工具,先侦察后行动」(ENGINE-01)
- 7 条行为测试全绿(分页/逃逸/nova 路径/gitignore/截断/未绑定文案)

### Task 2 — code_write/code_edit 候选 + migration 0016 + unified diff
- migration 0016:agent_confirmation_candidates 重建(kind CHECK + `code_edit`,新增 `reject_reason`、`base_hash` 列)
- confirmations.rs:`reject(conn, token, reason: Option<&str>)`(现有调用传 None);dedup matches! 含 code_edit;`stamp_base_hash`(first-writer-wins)
- `code_edit`:字节精确匹配;0 命中 → `old_string not found in {path} — re-read the file and retry`;多命中 → `found {n} times ... lines: [..]`;唯一命中 → 候选 params 恰为 {operation, path, old_string, new_string, root}(CP-2)
- unified diff(similar,context 3)作为候选展示字段(candidate payload `diff`),不进 params
- CP-2 测试:同文件两 edit 两 token / 同 edit 重试同 token

### Task 3 — apply_edit + engine_code_apply + 取消级联 + parity fixture
- `apply_edit`:重跑 resolve_repo(TOCTOU junction 测试通过)→ 重读文件 → sha256 对比 base_hash → 漂移即 Failed `file changed since the edit was proposed: {path} — old_string now at line {n}; re-read the file and retry`,文件不动(CP-3 篡改测试)
- `engine_code_apply`(commands.rs,照 engine_fs_apply 先例):confirm → consume → apply → 配对 tool_result 落账;已注册 invoke_handler;TS executeTool 不实现 coding 工具(锁定)
- 取消级联:`auto_reject_pending_code_edits` — 该 session 未决 code_edit 候选批量 reject(reason「run 已取消」)+ 每张 `code_edit_auto_rejected` 审计事件;接线于 engine_run Cancelled 分支
- `projection-cases-code-edit.json` 3 用例(侦察 / 等确认+级联审计 / stale 失败)+ `phase32CodeEdit.test.ts`(TS 投影断言);EVENT-SCHEMA-V0.4.md 7 条 pending-32-03 翻 yes,`event_schema_fixture_interlock` 绿

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CP-3 stale 检测需要 base_hash 列**
- **Found during:** Task 2/3 设计
- **Issue:** plan 锁定候选 params 恰为五键(无全文快照),但 CP-3 要求「old_string 仍唯一但位置改变」也能检出 stale — 无任何 proposal-time 锚点则不可判定
- **Fix:** migration 0016 同时加 `base_hash TEXT`(sha256),apply 时重读比对;dedup 语义不受影响
- **Files:** src-tauri/migrations/0016_confirmation_code_edit.sql, confirmations.rs, code_ops.rs
- **Commit:** c3c8c63 / 4f8e423

**2. [Rule 3 - Blocking] 取消级联落点 commands.rs 而非 scheduler.rs**
- **Issue:** plan 指定 scheduler.rs,但 scheduler 无 Connection 访问;run 取消的真实 settle 点是 engine_run 的 Err(Cancelled) 分支(commands.rs)
- **Fix:** `auto_reject_pending_code_edits` 实现于 code_ops.rs(领域归属),commands.rs Cancelled 分支调用(open_run_conn)
- **Commit:** 4f8e423

**3. [Rule 3 - Blocking] migration 文件名与内容扩展**
- **Issue:** plan 命名 0016_confirmation_reject_reason.sql;实际增量为 kind CHECK 重建(SQLite 不能 ALTER CHECK)+ reject_reason + base_hash 三项
- **Fix:** 单文件 0016_confirmation_code_edit.sql 承载全部,已注册 sql_migrations()(registry 完整性测试通过)

**4. [Rule 1 - Bug] resolve_repo 拒绝带缺失父目录的 write 目标**
- **Issue:** within_repo 对不存在路径 canonicalize 失败 → new/mod.rs 被误判逃逸
- **Fix:** 段级 canonicalize 已覆盖全部存在段,末尾缺失段用 lexical prefix 兜底(root 已 canonical,非存在段不可能是链接)
- **Commit:** c3c8c63

**5. [Rule 3] 注册表计数测试更新**
- tools/loop_runner 中 schemas 数量断言 26 → 30(+4 code 工具)

## Verification

- `cargo test --lib`:251 passed / 1 failed — 唯一失败 `workflow_crud_via_tools_three_tiers` 为 32-01 记录的 pre-existing 失败(deferred-items.md),非本 plan 回归
- `npm test`:240 passed / 0 failed(含 parity.rust.test.ts 17 用例、phase32CodeEdit 3 用例)
- `npm run lint`(tsc --noEmit):通过
- EVENT-SCHEMA interlock:7 条 code_edit 相关条目翻 yes 后全绿

## Known Stubs

None — 无占位实现;HITL diff 审批卡 UI 属 32-04(webview 侧)范围。

## Self-Check: PASSED

- migrations/0016_confirmation_code_edit.sql、projection-cases-code-edit.json、phase32CodeEdit.test.ts 存在
- commits caca77d / c3c8c63 / 4f8e423 均在 git log
