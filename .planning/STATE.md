---
gsd_state_version: 1.0
milestone: v0.2.0
milestone_name: 日常管理 CRUD + 弱关联
status: ready-for-planning
stopped_at: Roadmap created — ready for Phase 5 planning
last_updated: "2026-08-10"
last_activity: 2026-08-10
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-10)

**Core value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Current focus:** Milestone v0.2.0 — 日常管理 CRUD + 弱关联

## Current Position

Phase: 5 (Task CRUD 补全)
Plan: Not started
Status: Ready for planning
Last activity: 2026-08-10 — Roadmap created

Progress: [░░░░░░░░░░] 0%

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

### Pending Todos

- [ ] v0.1.0 各 Phase 运行时 UAT 待用户在 HUMAN-UAT.md 中确认
- [ ] SEC-02/SEC-04/SEC-07 — UAT 完成后处理

### Blockers/Concerns

None for v0.2.0.

### Roadmap Evolution

- Phase 8 added: 调研 Atomic Editor 用于知识库和 Markdown 编辑场景 (2026-08-10)
- Phase 9 added: 调研产品模块与产品研发模块的联动 (2026-08-10)

### Key Pitfalls to Watch (v0.2.0)

| ID | Pitfall | Phase | Severity |
|----|---------|-------|----------|
| P1 | ScheduleEvent.date: number → string 迁移 | 6 | CRITICAL |
| P2 | Task 删除需要扫描嵌套 categories[].tasks[] | 5 | HIGH |
| P3 | Date.now() ID 碰撞 | 5 | HIGH |
| P5 | persist migration 函数是 passthrough no-op | 5,6 | HIGH |
| P7 | 删除产品留孤儿引用 | 7 | HIGH |
| P8 | 双向链接不一致(task↔event) | 7 | HIGH |
| P11 | "安排到日历"跨 store 原子性 | 7 | HIGH |
| P12 | Hydration race — mock data 闪烁 | 5 | HIGH |
| P13 | 编辑对话框 form state 不复位 | 5 | MEDIUM |
| P17 | task.project vs projectId 双字段混淆 | 5 | HIGH |
| P20 | ScheduleView 日历计算全硬编码 | 6 | HIGH |

## Session Continuity

Last session: 2026-08-10
Stopped at: Roadmap created — ready for Phase 5 planning
Resume file: .planning/ROADMAP.md
