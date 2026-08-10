# Roadmap: Nova PM Workspace — v0.2.0

## Overview

v0.2.0  milestone: **日常管理 CRUD + 弱关联**。三个 phase 完成任务管理 CRUD 补全、日程管理 CRUD + 真实日历、跨模块弱关联联动。所有 phase 均为前端 + store 层工作,无新基础设施。

**Phase numbering continues from v0.1.0 (Phases 1-4).**

### v0.1.0 Recap (completed)

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 1 | Dark Mode Wiring | ✅ Complete | 2026-08-08 |
| 2 | Persistence (Zustand persist + SQLite) | ✅ Complete | 2026-08-08 |
| 3 | Tauri IPC Migration + Security Baseline | ✅ Complete | 2026-08-08 |
| 4 | GraphFlow + Rig PoC | ⏸️ Deferred to v0.3+ | — |

## Phases

- [ ] **Phase 5: Task CRUD 补全** — taskStore actions (update/delete/reopen/move) + TaskDialog (create/edit) + TaskKanban 卡片菜单 + DnD 拖拽 + 弱关联字段 (projectId?/scheduledEventId?) + persist v2 migration
- [ ] **Phase 6: Schedule CRUD + 真实日历** — scheduleStore actions (update/delete) + ScheduleEvent.date 从 number 迁移到 string (YYYY-MM-DD) + 月历真实渲染 + 月份切换 + ScheduleDialog (create/edit) + 弱关联字段 (projectId?/taskId?) + type:'task'
- [ ] **Phase 7: 跨模块联动** — "安排到日历" (task→event 双向引用) + 关联徽章 (AssociationBadge) + 点击跳转 + 产品删除时关联清理 + 任务完成→日程同步标记

## Phase Details

### Phase 5: Task CRUD 补全
**Goal**: 用户可以在看板中完成任务的全生命周期操作 —— 创建、内联编辑、对话框编辑、删除(带确认)、重新打开、拖拽移动,并且任务开始支持可选的产品/日程弱关联
**Depends on**: Nothing (v0.1.0 Phase 1-3 已完成)
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, TASK-09
**Success Criteria** (what must be TRUE):
  1. 用户可以在 TaskKanban 卡片展开面板中内联编辑任务的所有字段(标题/描述/优先级/截止日期/分类)
  2. 用户可以通过独立对话框(TaskDialog)创建新任务或编辑现有任务,对话框支持产品选择器(设置 projectId 并镜像 project 名字段)
  3. 用户可以删除任务,触发二次确认对话框,确认后任务从看板消失
  4. 用户可以将"已完成"状态的任务重新打开为"未开始"状态(在卡片菜单或展开面板中)
  5. 用户可以在看板列之间拖拽任务卡片(@dnd-kit 实现),拖拽后任务的分类自动更新
  6. 任务卡片上显示关联产品的徽章(如有 projectId),点击可跳转到产品详情
  7. taskStore persist 版本升级到 2,旧数据通过 migrate 函数自动补充 projectId?/scheduledEventId? 可选字段,刷新/重启后数据完整
  8. 新建任务的 ID 使用 crypto.randomUUID() 生成,快速连续操作不会产生 ID 碰撞
**Plans**: TBD
**UI hint**: yes

### Phase 6: Schedule CRUD + 真实日历
**Goal**: 用户拥有真实可用的月历视图,可以创建/编辑/删除日程事件,自由切换月份,日程事件支持可选的产品/任务弱关联
**Depends on**: Phase 5 (复用 Dialog 模式;确立 persist v2 migration 模式)
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05, SCHED-06, SCHED-07, SCHED-08
**Success Criteria** (what must be TRUE):
  1. 用户可以点击"新建日程"按钮打开 ScheduleDialog,选择日期(通过 DatePickerInput)、时间、类型、地点,创建日程事件
  2. 用户可以点击日历上的日程事件进行编辑,对话框预填当前值(标题/日期/时间/类型/地点)
  3. 用户可以删除日程,触发二次确认对话框,确认后事件从日历消失
  4. 用户可以在月历上切换月份(上/下月按钮 + "今天"回到当前月),日历网格实时重新渲染,不再写死 2025年5月
  5. ScheduleEvent.date 已全量从 number(1-31)迁移到 string(YYYY-MM-DD),scheduleStore persist v2 migration 将旧 number 日期转为 YYYY-MM-DD 字符串(基于 May 2025 锚点)
  6. ScheduleEvent 支持 projectId?/taskId? 弱关联字段和 type:'task' 枚举值,为 Phase 7 跨模块联动做好准备
  7. 日历网格正确显示事件:事件出现在其 date 对应的日期格中,月份切换后事件位置正确
**Plans**: TBD
**UI hint**: yes

### Phase 7: 跨模块联动
**Goal**: 任务/产品/日程三个模块通过弱关联字段自然协作 —— "安排到日历"一键完成、关联徽章可视化、删除产品时关联清理、任务完成联动日程标记
**Depends on**: Phase 5 (Task CRUD) + Phase 6 (Schedule CRUD)
**Requirements**: CROSS-01, CROSS-02, CROSS-03, CROSS-04, CROSS-05, CROSS-06, CROSS-07
**Success Criteria** (what must be TRUE):
  1. 用户可以在任务卡片/对话框上点击"安排到日历",自动创建关联的 ScheduleEvent(type='task',日期取自任务截止日期),taskId 反向引用任务,标题同步任务标题
  2. 用户删除产品时看到提示"X 个任务、Y 个日程将失去关联",确认后保留所有记录但清空 projectId 字段(弱关联,不级联删除)
  3. 日程视图上,关联任务的日程显示任务徽章;任务卡片上显示关联产品/日程的徽章;所有徽章均可点击跳转到对应模块并定位
  4. 用户完成任务后,若有关联日程,日程自动同步标记完成(视觉降饱和,不删除)
  5. 删除已关联的日程时,任务的 scheduledEventId 自动清空;删除已关联的任务时,日程的 taskId 自动清空 —— 双向清理,不留孤儿引用
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Task CRUD 补全 | 0/TBD | Not started | - |
| 6. Schedule CRUD + 真实日历 | 0/TBD | Not started | - |
| 7. 跨模块联动 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-10*
*Granularity: coarse (3 phases for v0.2.0)*
*Coverage: 24/24 v1 requirements mapped, 0 unmapped*
*Previous milestone: v0.1.0 (Phases 1-4, see header)*
