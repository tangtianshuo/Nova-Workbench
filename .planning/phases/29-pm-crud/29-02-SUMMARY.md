---
phase: 29
plan: 02
subsystem: engine/pm
tags: [pm-crud, tools, hitl, rust-engine]
requires: [29-01 (pm_store SQL layer + migration 0012 + pm_write kind)]
provides: [9 model-visible PM tools, cap-5 guardrail, is_pm_light_write, PM_WRITE_CAP]
affects: [src-tauri/src/engine/tools.rs, loop_runner.rs, pm_store.rs, confirmations.rs]
tech-stack:
  added: []
  patterns: [three-tier risk (read free / light write free / delete + cap-5 → pm_write HITL)]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/pm_store.rs
    - src-tauri/src/engine/confirmations.rs
    - src-tauri/src/engine/exec.rs
    - src-tauri/src/engine/fs_ops.rs
    - src-tauri/src/engine/commands.rs
decisions:
  - pm_write 加入 create_candidate dedup kind 列表(否则重复删除调用产生重复候选,计划 Test 6 要求 dedup)
  - task_complete 合并实现 per CONTEXT 自裁:独立工具名,内部走 update_task(status=已完成)
  - system prompt 降级文案移除(Rule 1:工具已注册,原文案与 registry 矛盾)
metrics:
  duration: ~35m
  completed: 2026-09-02
---

# Phase 29 Plan 02: PM CRUD 工具注册 + 三档风险 Summary

9 个 PM 工具(task/schedule 四件套 ×2 + search)注册进 Rust 引擎单一 registry,读/轻写免确认直落 tasks/schedules 表,delete 与 cap-5 超限写走 pm_write AwaitConfirmation HITL。

## What Was Built

**Task 1 — tools.rs 9 工具 + 三档风险执行 (5d44fd4)**
- `ToolKind::Pm` + 9 个 ToolSpec(schema 对齐 TS 字段名,id 服务端生成不进模型参数)
- 三档:task_search/schedule_search 读免确认(rerunnable);task_create/update/complete、schedule_create/update 轻写免确认直写 pm_store;task_delete/schedule_delete 先 SELECT title 供卡片摘要 → `create_candidate(conn, "pm_write", …)` → AwaitConfirmation(`CONFIRMATION_REQUIRED_PM_WRITE`),DB 行保留至确认
- `ToolCtx.pm_writes_used` + `PM_WRITE_CAP=5`(学 ingest INGEST_DRAFT_CAP 先例):轻写执行前查 cap,超限升级为 pm_write 候选(params={action:原工具名, args, reason:"cap-5 escalation…"},29-03 consume 按原语义执行)
- 共用 `pm_write_escalated()`:candidate JSON 展开 stored params 到顶层(action/taskId/title 或 action/args/reason)
- 删除 tools.rs 头部与 registry 尾部「PM CRUD NOT registered」注释块
- 参数校验全走 `arg_fail`(arg_error:true 可重试);未知 id → Failed{arg_error:false}
- exec.rs/fs_ops.rs/commands.rs/loop_runner 的 ToolCtx 构造点补 `pm_writes_used`(struct 新增必填字段)

**Task 2 — loop_runner cap-5 写计数 (c7a2334)**
- run 内局部 `pm_writes_used`(per engine_run,重启归零),传入 ToolCtx;`Executed` 分支按 `tools::is_pm_light_write(name)` 自增(升级 WAIT 不计入)
- loop 级测试:单 turn 6 次 task_create → 前 5 直落库、第 6 条 pm_write 升级、run 以 awaiting_confirmation 收束
- system prompt 更新:PM CRUD 工具已上线、三档语义写明、降级文案删除

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pm_store list_tasks/list_schedules 补 filter 列**
- 计划工具 schema 含 priority(task_search)/type(schedule_search)过滤,但 29-01 的 list 函数不支持
- 修复:各加一个 filter 元组行(各 1 行 diff)
- Commit: 5d44fd4

**2. [Rule 1 - Bug] pm_write 未进 create_candidate dedup 列表**
- 计划 Test 6 要求重复同参删除 dedup 同 token,但 confirmations::create_candidate 的 params_hash dedup 只覆盖 4 个旧 kind
- 修复:kind 匹配列表 + "pm_write"
- Commit: 5d44fd4

**3. [Rule 1 - Bug] system prompt 降级文案与 registry 矛盾**
- loop_runner ROLE_AND_TOOL_RULES 仍宣称「Task and schedule CRUD tools are not available」而 9 工具已注册
- 修复:改为列出 PM 工具三档语义;对应测试 `system_prompt_has_degradation_note_and_no_crud_tools` 改名重写为 `system_prompt_lists_native_and_pm_crud_tools`
- Commit: c7a2334

**4. [流程] TDD red/green 拆分合并为单 commit**
- ToolCtx 新增必填字段使测试与实现强编译耦合,拆分无意义;测试与实现同 commit,行为覆盖完整(9 组行为测试 + loop 级 cap 测试)
- Commit: 5d44fd4

## Verification

- `cargo test --lib` → 207 passed / 0 failed / 2 ignored(全绿,含 parity/fixture)
- `npm run lint`(tsc --noEmit)→ clean
- schemas() 投影自动带 PORT_01_SUFFIX(既有断言覆盖全部 22 工具)
- plan acceptance grep 全部满足:`create_candidate(conn, "pm_write"` 命中、`PM_WRITE_CAP|pm_writes_used|Pm` 命中、"are NOT registered" 无命中、9 工具名 registry+dispatch 双命中

## Known Stubs

None — 工具直写 SQLite 真表,非 mock。29-03 将实现 pm_write 候选的 confirm/reject consume 路径与 webview HITL 卡片(本 plan 交付候选创建侧)。

## Self-Check: PASSED

- Commits 5d44fd4, c7a2334 present in git log
- All modified files exist on disk
- Full test suite green at both commits
