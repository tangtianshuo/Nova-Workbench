---
phase: 30-workflow-templates
plan: 02
subsystem: workflow-templates
tags: [workflow-templates, pm-crud, sqlite-migration, hitl, parity]
requires: [29-pm-crud, 30-01-catalog-single-source]
provides: [workflow_templates-table, workflow_-tools, workflowStore, engine_list_workflows, builtin-templates-json, user-catalog-read-path]
affects: [src-tauri/src/engine/tools.rs, src-tauri/src/engine/loop_runner.rs, src-tauri/src/engine/commands.rs, src/stores/tabRunStore.ts, src/stores/chatConsoleStore.ts]
tech-stack:
  added: []
  patterns: [catalog-single-source-include_str (30-01), pm_store-SQL-layer, pm_write-HITL-reuse]
key-files:
  created:
    - src-tauri/migrations/0013_workflow_templates.sql
    - src-tauri/src/engine/workflow_store.rs
    - src/data/workflow-templates-builtin.json
    - src/stores/workflowStore.ts
    - src/ai/tools/workflow.ts
    - src/ai/__tests__/fixtures/projection-cases-workflow-pm-write.json
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/lib.rs
    - src/stores/storage/initializeDatabase.ts
    - src/ai/api.ts
    - src/ai/index.ts
    - src/stores/tabRunStore.ts
    - src/stores/chatConsoleStore.ts
    - src/ai/__tests__/registry.test.ts
decisions:
  - "workflow_delete 复用 pm_write kind + action 路由(29-03 事务收口),不加新 confirmation kind"
  - "内置模板不入 SQLite;tools.rs include_str! LazyLock 合并呈现(同 30-01 catalog 单源模式)"
  - "parity fixture 命名 projection-cases-workflow-pm-write.json — 双侧 glob 只认 projection-cases/realdb-sample 前缀"
metrics:
  duration: 55min
  completed: 2026-09-02
---

# Phase 30 Plan 02: 模板数据层 + 引擎 CRUD 工具 Summary

**One-liner:** migration 0013(workflow_templates + deliverable_catalog_user)+ workflow_store SQL 层 + 4 个 workflow_ 引擎工具(三档风险/cap-5 复用)+ TS workflowStore/registry/刷新接线 + pm_write 双侧 parity fixture。

## What Was Built

1. **Task 1 (d31af86)** — migration 0013(source CHECK 不含 builtin;skill_trigger/skill_tools_json D-08 预留)、workflow_store.rs(insert/update/delete/list + catalog code 查重 vs 内置 CATALOG)、builtin JSON 2 个占位模板(30-03 扩充)、lib.rs 注册 0013 + APP_SCHEMA_VERSION 12→13。
2. **Task 2 (e6e82c5)** — workflow_search(内置 include_str! ∪ SQLite)/create/update(轻写计 cap-5)/delete(pm_write 候选);generate_deliverable code 校验改为内置 ∪ deliverable_catalog_user;system prompt 注入 ≤30 条模板名短清单(>30 截断,TODO v0.4 FTS5)+ ROLE_AND_TOOL_RULES 追加风险句。
3. **Task 3 (14d5f4f)** — engine_list_workflows 读命令 + pm_write consume 增加 workflow_delete 分支(一事务);TS workflowStore(builtin 前置合并 + refreshFromSql)、executeTool 4 工具(webview 手动路径,lazySqlite 直写同表)、tabRunStore `startsWith('workflow_')` 刷新、chatConsoleStore pm_write 确认后刷新 + 标签;parity fixture 双侧跑通。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] parity fixture 命名改为 projection-cases-workflow-pm-write.json**
- **Found during:** Task 3
- **Issue:** plan 指定 `workflow-pm-write.json`,但双侧 glob(parity.rs / parity.rust.test.ts)只匹配 `projection-cases*` / `realdb-sample*` 前缀 — 按 plan 命名双侧测试都不会跑到它。
- **Fix:** 沿用 29-03 前缀约定命名;内容照 plan(候选→确认→tool_result 事件序列)。
- **Commit:** 14d5f4f

**2. [Rule 3 - Blocking] catalog_has_code 提前到 Task 1 落地**
- **Issue:** workflow_store::insert_catalog_user 的查重依赖 tools.rs 的 CATALOG,plan 把它排在 Task 2 — Task 1 无法编译。
- **Fix:** Task 1 先加 `pub fn catalog_has_code`(6 行),Task 2 原样复用。
- **Commit:** d31af86

**3. [Rule 1 - Bug] workflow_delete 候选 params 用 action 字段(非 plan 的 entity)**
- **Issue:** plan 写 `params_json { entity: "workflow_template", ... }`,但 29-03 的 consume 分发表按 `action` 键路由 — entity 键会落进 `unknown pm_write action` 错误分支。
- **Fix:** `{action: "workflow_delete", id, name}`,consume 分发表加 workflow_delete 分支。
- **Commit:** 14d5f4f

## Verification

- cargo test 221 passed(含 4 个 workflow 工具测试、cap-5 联动、consume workflow_delete、loop_runner prompt 注入/截断、parity fixture)
- npm test 全绿(registry.test.ts 期望列表 +4 工具)
- npm run lint 退出码 0
- 端到端(对话建模板→删模板确认卡)留 30-04 UAT 覆盖(plan 声明)

## Known Stubs

- `src/data/workflow-templates-builtin.json` 仅 2 个占位模板(1 步/2 步)— **计划内**:30-03 扩充为 4-5 个正式内容。
- `deliverable_catalog_user` 仅表 + 读路径(generate_deliverable 校验并入),写入工具/UI 留 v0.4 — **计划内**(SC-4 边界声明)。

## Self-Check: PASSED
