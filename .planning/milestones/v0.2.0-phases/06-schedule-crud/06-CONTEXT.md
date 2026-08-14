# Phase 6: Schedule CRUD + 真实日历 - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — used REQUIREMENTS.md + ROADMAP.md as spec, no interactive discuss)

<domain>
## Phase Boundary

用户拥有真实可用的月历视图,可以创建/编辑/删除日程事件,自由切换月份,日程事件支持可选的产品/任务弱关联。本 phase 不涉及跨模块联动 (Phase 7) 或 AI 驱动 (Phase 9-10),仅交付 scheduleStore 完整 CRUD + 月历真实渲染 + 月份切换 + ScheduleDialog + 弱关联字段定义。

</domain>

<decisions>
## Implementation Decisions

### 数据模型与迁移 (SCHED-05, SCHED-06, SCHED-07, SCHED-08)
- **D-01:** ScheduleEvent.date 全量从 `number(1-31, 仅日)` 迁移到 `string(YYYY-MM-DD, 完整日期)`。比增量 month?/year? 字段更干净。
- **D-02:** scheduleStore persist version 升级到 2,migrate 函数将旧 number 日期基于 May 2025 锚点转为 YYYY-MM-DD 字符串(因为 mock 数据写死 2025-05-XX)
- **D-03:** ScheduleEvent 新增 `projectId?: string`、`taskId?: string` 弱关联字段
- **D-04:** ScheduleEvent.type 枚举新增 `'task'` 值(为 Phase 7 "安排到日历" 做准备)

### Store Actions (SCHED-01, SCHED-02, SCHED-03)
- **D-05:** scheduleStore 新增 actions:`updateEvent`、`deleteEvent`、`createEvent`(若现有 addEvent 不够通用)。Direct store hooks 调用,不通过 AppContext
- **D-06:** AppContext.tsx 兼容层暴露新 actions(delegate 到 useScheduleStore)
- **D-07:** 删除用二次确认对话框(沿用 Phase 5 模式),无 undo

### 月历视图 (SCHED-04)
- **D-08:** ScheduleView 月历不再写死 2025-5。新增 `currentMonth: { year, month }` state(默认今天所在月),上/下月按钮 + "今天" 按钮回到当前月
- **D-09:** 月份切换通过 currentMonth state 驱动重新渲染日历网格。事件按 date 字符串(YYYY-MM-DD)过滤显示在对应日期格

### ScheduleDialog (SCHED-01, SCHED-02)
- **D-10:** 新建 `src/components/ScheduleDialog.tsx`,创建 + 编辑双模式(参考 Phase 5 TaskDialog 模式)
- **D-11:** 表单字段:标题(Input)、日期(DatePickerInput)、时间(Input type="time")、类型(Select:meeting/deadline/task/reminder)、地点(Input)、关联产品(Combobox 复用 Phase 5 模式)
- **D-12:** "新建日程"按钮入口在 ScheduleView 头部;编辑入口在月历上点击事件

### Claude's Discretion
- 月历网格视觉细节(weekend 颜色、今天高亮、事件 chip 排列规则)
- 时间字段格式(24h vs 12h)
- 月份切换动画
- 事件 chip 颜色映射(type → color token)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目级约束
- `.planning/PROJECT.md` — Core Value, Constraints, Key Decisions(弱关联模型 / direct store hooks / 3 phase 拆分)
- `.planning/REQUIREMENTS.md` — SCHED-01..08 详细需求 + Key Decisions 1, 2, 3, 6, 7
- `.planning/STATE.md` — Decisions 区段
- `.planning/phases/05-task-crud/05-CONTEXT.md` — Phase 5 模式参考(TaskDialog、persist v2、Combobox)

### 架构与代码规范
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/CONCERNS.md`

### ROADMAP
- `.planning/ROADMAP.md` §Phase 6

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (新增自 Phase 5)
- `src/components/ui/Drawer.tsx` — Phase 5 已建立,本 phase 不直接用
- `src/components/ui/DatePickerInput.tsx` — 日期选择器,本 phase 主用
- `src/components/ui/Dialog.tsx` — ScheduleDialog 基座
- `src/components/ui/Combobox` 模式 — Phase 5 TaskDialog 内联实现,本 phase 可抽组件或复制模式
- `src/components/TaskDialog.tsx` — 双模式 Dialog 参考实现
- `src/components/ui/Input.tsx` / `Select.tsx` / `Badge.tsx` — 表单字段

### Established Patterns
- Zustand store + persist: `src/stores/scheduleStore.ts` (现有 version 1,本 phase 升到 version 2)
- persist v2 migration 模式:参考 `src/stores/taskStore.ts`(Phase 5 已实施)
- Direct store hooks 优先:`useScheduleStore()`
- 创建/编辑 Dialog 模式:参考 `src/components/TaskDialog.tsx`(create/edit mode + Combobox + 嵌套确认)
- Dialog 嵌套删除确认:Phase 5 TaskDialog 已实现

### Integration Points
- `src/stores/scheduleStore.ts` — 新增 actions、ScheduleEvent 类型扩展、persist version 2
- `src/data/mockSchedule.ts` — ScheduleEvent 接口扩展 + mock 数据 date 转 string
- `src/views/ScheduleView.tsx` — 月历真实渲染 + 月份切换 state + ScheduleDialog 调起
- `src/store/AppContext.tsx` — 暴露新 actions
- 新增 `src/components/ScheduleDialog.tsx`

</code_context>

<specifics>
## Specific Ideas

- 月历交互参考 Apple Calendar / Notion Calendar 简洁感
- 事件 chip 颜色按 type 区分(meeting 蓝/deadline 红/task 紫/reminder 黄)
- "今天"按钮始终可见,提供快速回今天

</specifics>

<deferred>
## Deferred Ideas

- 周视图 / 日视图(REQUIREMENTS v2 CAL-01)
- 日程重复规则(CAL-02)
- 日程邀请参会人(v0.3+ 协作)
- 拖拽改日期(v0.3+)

</deferred>

---

*Phase: 06-schedule-crud*
*Context gathered: 2026-08-10 (autonomous mode)*
