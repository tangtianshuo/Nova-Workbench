---
gsd_state_version: 1.0
milestone: v0.1.0
milestone_name: Recap
status: executing
stopped_at: Completed 07-01-PLAN.md (cross-module store contracts); ready for 07-02 (task→calendar UI)
last_updated: "2026-08-10T12:10:51.244Z"
last_activity: 2026-08-10
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 27
  completed_plans: 10
  percent: 37
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Current focus:** Phase 07 — cross-module

## Current Position

Phase: 07 (cross-module) — EXECUTING
Plan: 2 of 5
Status: Ready to execute
Last activity: 2026-08-10

Progress: [████░░░░░░] 37% (Phase 5 完成 5/5, Phase 6 完成 4/4, Phase 7 完成 1/5)

## v0.2.0 Execution Status

| Phase | Status | Plans | Notes |
|-------|--------|-------|-------|
| 5 Task CRUD | ✅ Complete (2026-08-10) | 5/5 | 9/9 verification passed; deferred to batch UAT |
| 6 Schedule CRUD | ✅ Complete (2026-08-10) | 4/4 | Plans 01-03 landed + UAT deferred to batch |
| 7 跨模块联动 | 🟢 Executing (1/5) | 1/5 | Plan 01 store contracts landed; Wave 2 (02/03/04) ready |
| 8 MDXEditor | 🟡 Plans ready | 0/3 | 3 plans, 3 sequential waves |
| 9 AI 基础 | 🟡 Plans ready | 0/6 | 6 plans, 6 waves (rig-core 多 provider 风险) |
| 10 AI 任务+日程 | 🟡 Plans ready | 0/4 | 4 plans, 3 waves (**强依赖 Phase 9**) |

**Execution order:** 6 → 7 → 8 → 9 → 10 (serial, due to dependencies)

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v0.2.0:

- [Milestone]: 弱关联模型 — 外键全部可选,不级联删除,删除产品只 warning + 清空关联字段
- [Milestone]: Task/Schedule 双向引用(projectId?/taskId?) — O(1) 跨模块跳转
- [Milestone]: 3 phase 拆分 — Phase 5 (Task CRUD) + Phase 6 (Schedule CRUD) + Phase 7 (跨模块联动)
- [Milestone]: Phase 4 (GraphFlow PoC) deferred 到 v0.3+ — pre-1.0 crate 风险,先跑通 CRUD
- [Milestone]: 保留 task.project:string legacy 兼容 — AppContext.tsx 依赖,不在 v0.2.0 删
- [Milestone]: ScheduleEvent.date 全量替换为 string(YYYY-MM-DD) — 比增量 month?/year? 更干净
- [Milestone]: 新 CRUD 走 direct store hooks — 不新增 AppContext actions(P16 规避)
- [Milestone]: 跨 store 编排走 AppContext wrapper(deleteProductWrapped 模式) — 避免 store 间循环 import
- [Milestone]: 任务编辑同时支持内联(展开卡片)和独立对话框(TaskDialog)
- [Milestone]: 看板拖拽使用 @dnd-kit/core@6.3.1(legacy line,React 19 兼容)
- [Milestone]: 删除用确认对话框(无 undo) — 本地优先 app 最简方案
- [Milestone]: "安排到日历"不自动同步截止日期变更 — 弱关联不是同步
- [Milestone]: 产品-研发联动采用弱关联模式 A — rndStore 已有 productId 索引,L5/L6/L7 在 v0.2.0 实施
- [Milestone]: 产品-研发联动 v0.2.0 实施范围:里程碑↔交付物状态(L5)、阶段↔phase 进度(L6)、删除产品级联清理 rndStore(L7)
- [前置调研]: Atomic Editor 否决 — v0.6.2 单人项目,非通用组件库; 推荐 MDXEditor 作为 Markdown 编辑器方案
- [前置调研]: Nova 6 处 react-markdown 使用中,仅 ProductKnowledgeTab + KnowledgeBaseView 有真正编辑需求
- [前置调研]: MDXEditor (250KB gzip selective) + React.lazy() 延迟加载;纯渲染场景保持 react-markdown (33KB)
- [前置调研]: 否决 Tiptap 因 Markdown 转换层开发量大(5-10天 vs 1-2天);否决 BlockNote 因 bundle 600KB+ 且 Tailwind 冲突
- [Phase 01]: themeStore + Linux GTK detection shim (Wave 1)
- [Phase 01]: SettingsView SegmentedControl + Header quick-toggle (Wave 2)
- [Phase 01]: CSS color transitions in tokens.css (Wave 1)
- [Phase 01]: Card dark variant rework + 47-component audit (Wave 2)
- [Phase 02]: Fix rndStore INITIAL.p1 fallback bug
- [Phase 02]: Stand up SQLite substrate (tauri-plugin-sql + adapter + dev fallback)
- [Phase 02]: Wrap all 6 Zustand stores in persist with partialize + _hasHydrated + migrate
- [Phase 02]: Wire startup orchestration (first-run seed + HydrationGate)
- [Phase 03]: Rust foundation + rig streaming spike
- [Phase 03]: 4 Tauri commands + frontend adapter
- [Phase 03]: ProjectCreateModal + SettingsApiKeySection UI wiring
- [Phase 03]: CSP + capabilities + Express 127.0.0.1 + smoke test
- [Phase 05]: Drawer built on Radix Dialog (translateX spring, width prop default 360) — Phase 9 reuses at width=480
- [Phase 05]: Plan 01: Task 类型扩展 projectId?/scheduledEventId? 弱关联 + taskStore 5 actions + persist v2 migration + AppContext 兼容层委托
- [Phase 05]: Plan 02: Drawer 可复用组件 + ProductSummaryDrawer 业务内容
- [Phase 05]: Plan 03: TaskDialog 双模式(create/edit) + Combobox 产品选择器 + 嵌套删除确认
- [Phase 05]: Plan 04: TaskKanban 重写 — inline 编辑 + DotsMenu + @dnd-kit DnD + 产品徽章
- [Phase 05]: Plan 05: UAT checkpoint (deferred to batch UAT)
- [Phase 06]: Plan 01: ScheduleEvent 类型扩展 (date number→string YYYY-MM-DD, projectId?/taskId? 弱关联, type 联合含 'task') + scheduleStore 3 CRUD action + persist v2 migration (May 2025 锚点) + AppContext 委托
- [Phase 06]: Plan 02: ScheduleDialog 单文件交付 — dual-mode (create/edit) + 6 字段表单 + Product Combobox + 嵌套删除确认 + Pitfall P13 修复。完整复用 Phase 5 TaskDialog 模式,tsc 一次通过
- [Phase 06-schedule-crud]: Plan 03: ScheduleView 完全重写 — currentMonth state 驱动的 42 格月历,月份切换 (prev/next/today) 实时刷新,事件按 YYYY-MM-DD 归位,ScheduleDialog 三入口接入 (agenda 按钮/空白格/事件 chip)。Pitfall P20 硬编码 2025-5 彻底清除,Wave 1 dayFromDate shim 消失。lint + build 一次通过
- [Phase 07-cross-module]: Plan 01: ScheduleEvent.status? + setEventStatus/clearTaskLink + persist v3 backfill (CROSS-05/07); rndStore.cleanupProduct + getDeliverableStatusForPhase (L6/L7); ProductMilestone.deliverableCodes? (L5)
- [Phase 07-cross-module]: Plan 01: taskStore.completeTask/deleteTask 跨 store 副作用 (get() 前置捕获 scheduledEventId 再 set + useScheduleStore.getState 副调用); taskStore.unlinkProjectTasks (CROSS-03)
- [Phase 07-cross-module]: Plan 01: AppContext.arrangeOnCalendar (task.deadline 'YYYY-MM-DD HH:mm' 拆分为 date/time) + 两阶段删除 getDeleteProductImpact/doDeleteProduct (级联顺序: unlinkTasks → detach event projectIds → rnd cleanup → deleteProduct → clear selection); deleteProduct 回退为 pure delegate

### Pending Todos

- [ ] 执行 Phase 6 (4 plans, 4 waves)
- [ ] 执行 Phase 7 (5 plans, 4 waves)
- [ ] 执行 Phase 8 (3 plans, 3 waves)
- [ ] 执行 Phase 9 (6 plans, 6 waves)
- [ ] 执行 Phase 10 (4 plans, 3 waves)
- [ ] v0.1.0 + v0.2.0 batch UAT (跨 phase 横向, 用户偏好)
- [ ] SEC-02/SEC-04/SEC-07 — UAT 完成后处理

### Blockers/Concerns

None blocking. Key risks per phase (executor MUST read PLAN files for full context):

- **Phase 6:** ScheduleView 在 Plan 01 lint ripple 后处于临时修补态,Plan 03 完整重写
- **Phase 7:** deleteProduct 入口位置 + ProductSummaryDrawer props 签名需 executor grep 确认
- **Phase 8:** Tailwind v4 共存(最高风险)+ bundle 控制约 250KB gzip
- **Phase 9:** rig-core 多 provider 集成 + 流式 tool call 完整性需运行时验证
- **Phase 10:** 强依赖 Phase 9 — plans 中已加 `<phase9_dependency>` 警示

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260810-jwv | 项目重命名为 Nova-PM-Workspace | 2026-08-10 | 29af7a5 | [260810-jwv-nova-pm-workspace](./quick/260810-jwv-nova-pm-workspace/) |

### Roadmap Evolution

- Phase 8/9 从 roadmap 中移出,改为前置调研即时执行 (2026-08-10)
- 调研结果输出到 `.planning/research/ATOMIC-EDITOR.md` 和 `.planning/research/PRODUCT-RND-LINKAGE.md`
- 调研完成后追加 Phase 9-11 (AI 驱动相关) 到 roadmap (2026-08-10 完成)
- v0.2.0 ROADMAP 最终化为 Phase 5-11 (7 phases)

### Key Pitfalls to Watch (v0.2.0)

| ID | Pitfall | Phase | Severity | Status |
|----|---------|-------|----------|--------|
| P1 | ScheduleEvent.date: number → string 迁移 | 6 | CRITICAL | Plan 06-01 已设计 migrate |
| P2 | Task 删除需要扫描嵌套 categories[].tasks[] | 5 | HIGH | ✅ 已处理 |
| P3 | Date.now() ID 碰撞 | 5 | HIGH | ✅ 改用 crypto.randomUUID() |
| P5 | persist migration 函数是 passthrough no-op | 5,6 | HIGH | ✅ Phase 5 修复,Phase 6 待执行 |
| P7 | 删除产品留孤儿引用 | 7 | HIGH | Plan 07-03 设计级联清理 |
| P8 | 双向链接不一致(task↔event) | 7 | HIGH | Plan 07-01 设计 wrapper |
| P11 | "安排到日历"跨 store 原子性 | 7 | HIGH | Plan 07-01 arrangeOnCalendar wrapper |
| P12 | Hydration race — mock data 闪烁 | 5 | HIGH | ✅ Phase 2 已通过 HydrationGate 处理 |
| P13 | 编辑对话框 form state 不复位 | 5 | MEDIUM | ✅ Phase 5 TaskDialog 已处理 |
| P17 | task.project vs projectId 双字段混淆 | 5 | HIGH | ✅ Phase 5 mirror 字段方案 |
| P20 | ScheduleView 日历计算全硬编码 | 6 | HIGH | Plan 06-03 完整重写 |

## Session Continuity

Last session: 2026-08-10T12:10:50.764Z
Stopped at: Completed 07-01-PLAN.md (cross-module store contracts); ready for 07-02 (task→calendar UI)
Resume action: `/gsd:execute-phase 06` (建议先 /clear 刷新上下文)
