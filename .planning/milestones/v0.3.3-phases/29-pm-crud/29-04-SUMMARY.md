---
phase: 29-pm-crud
plan: "04"
subsystem: stores/sql-switch + e2e-uat
tags: [pm-crud, sql-migration, event-driven-refresh, uat]
requires: [29-01, 29-03]
provides: [task/schedule SQL 单真相源 (Tauri), refreshFromSql, 事件驱动视图刷新, 端到端 UAT 8/8]
affects: [src/stores/storage/pmRepo.ts, src/stores/taskStore.ts, src/stores/scheduleStore.ts, src/stores/storage/initializeDatabase.ts, src/stores/chatConsoleStore.ts, src/stores/tabRunStore.ts, src-tauri/src/engine/tools.rs, src-tauri/src/engine/loop_runner.rs]
tech-stack:
  added: []
  patterns: [条件 persist (isTauri ? base : persist), fire-and-forget SQL 写 + refreshFromSql 自愈, tool_end 前缀触发 refresh]
key-files:
  created:
    - src/stores/storage/pmRepo.ts
  modified:
    - src/stores/taskStore.ts
    - src/stores/scheduleStore.ts
    - src/stores/storage/initializeDatabase.ts
    - src/stores/chatConsoleStore.ts
    - src/stores/tabRunStore.ts
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
decisions:
  - UAT 中三处 gap 修复:system prompt 注入当前日期(f894b27)、task/schedule_create 缺 projectId 时兜底 ctx.product_id(3ae51a6)、cap-5 升级候选 params 预烧 projectId(c0fbb01)
  - cap-5 计数重置 gap(resume 后归零)记 tech debt 不当日修 — 每次 resume 需人工确认卡把关,风险低
metrics:
  duration: 240m (含 UAT 指导)
  completed: 2026-09-02
  tasks: 3
  files: 8
---

# Phase 29 Plan 04: store SQL 换轨 + 事件驱动 refresh + 端到端 UAT Summary

**One-liner:** Tauri 下 taskStore/scheduleStore 退役 persist、SQL 单真相源读写 + 首帧 hydration + tool_end 事件驱动刷新;用户分步 UAT 8/8 全过(含三处 UAT gap 修复)。

## What Was Built

### Task 1: pmRepo + 两 store 换轨 + hydration(dc57be4)

- `pmRepo.ts`:loadTasks(含 categories 分组 + 'cat-default' 兜底)/ upsertTaskRow(ON CONFLICT 全列)/ deleteTaskRow(顺带清 schedules.task_id)/ loadSchedules / upsertScheduleRow / deleteScheduleRow — 列名与 migration 0012 逐列对齐
- taskStore/scheduleStore:`taskBase`/`scheduleBase` + `isTauri() ? base : persist(...)` 条件化;mutations fire-and-forget SQL 写 + 本地乐观 set;公开 API 形状不变(views 零改动)
- initializeDatabase:首帧前 refreshFromSql hydration(竞态:Rust kv 搬移未完读到空表由下次 refresh 自愈,UAT 步骤 1/5 实证)
- deviation:upsertTaskRow 增 categoryId 参数(计划签名外,分组归属需要)

### Task 2: 事件驱动 refresh(7be219a)

- chatConsoleStore:tool_end 按 `task_` / `schedule_` 前缀触发对应 store refreshFromSql;confirmPmWrite 成功路径两 store 双刷
- tabRunStore:同款前缀判定(tab-run 内 pm 写也刷新视图)

### Task 3: 端到端 UAT(用户分步指导,8/8 + 取消路径全过)

| # | 步骤 | 结果 |
|---|------|------|
| 1 | 升级迁移(kv→关系表,重启不丢,kv 备份在) | ✅ |
| 2 | 免确认批量建任务 ×3(首测 exec `date` 失败 → f894b27 system prompt 注入日期,重测过) | ✅ |
| 3 | 日程创建(首测 projectId 未关联 → 3ae51a6 ctx 兜底,重测过) | ✅ |
| 4 | HITL 删除确认卡(确认删脏日程)+ 取消路径(数据不动) | ✅ |
| 5 | 重启持久化(任务/日程全在,删除不复活) | ✅ |
| 6 | UI 手动 CRUD 与 agent 写共存 | ✅ |
| 7 | cap-5:前 5 直落,第 6 条弹卡(首测第 6 条缺产品 → c0fbb01 候选 params 预烧;第 7 条模型未再发 tool call,非护栏缺陷) | ✅ |
| 8 | cargo 213 / npm 223 / tsc 全绿 | ✅ |

## Verification

- `cd src-tauri && cargo test`:213 passed, 0 failed
- `npm run lint`(tsc):exit 0;`npm test`:223 pass, 0 fail
- 人工 UAT 8 步 + 取消路径全过(2026-09-02,用户逐步确认)

## Deviations from Plan

**1. [Rule 3] UAT 三处 gap 修复(计划外,follow-up commits)**
- f894b27:build_system_prompt 注入当前日期 + 星期 + 「禁止用 exec 查询日期」(Windows 上 `date` 是 shell builtin 无可执行文件,模型为解析"明天"去 exec 必败)
- 3ae51a6:task_create/schedule_create 缺 projectId 时 `.or(ctx.product_id)` 兜底(对齐 knowledge_write 的 D-05 规则;模型常省略该参数)
- c0fbb01:escalate_if_capped 生成候选时把 ctx.product_id 烧进 task/schedule_create args(consume 重放无 run ctx,UAT 第 7 步第 6 条任务缺产品的根因)

**2. [Rule 1] upsertTaskRow 增 categoryId 参数** — 计划签名未含,分组归属必需(Task 1 当期处理)

## Known Stubs

None.

## Known Tech Debt(用户裁定记入 STATE.md)

- **cap-5 计数 resume 重置**:pm_writes_used 是 run 局部变量,弹卡确认恢复(new engine_run)后归零 — 理论每个「确认→恢复」周期可再免确认写 5 条。缓解:每次恢复需人工确认卡把关。后续改为从 agent_events 数该 session 已落轻写 tool_result(唯一真相源,天然跨恢复)。

## Self-Check: PASSED
