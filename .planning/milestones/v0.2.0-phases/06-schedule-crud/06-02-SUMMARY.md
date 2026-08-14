---
phase: 06-schedule-crud
plan: 02
subsystem: ui
tags: [react, dialog, form, combobox, schedule, crud, phase-5-pattern-reuse]

# Dependency graph
requires:
  - phase: 06-schedule-crud
    plan: 01
    provides: ScheduleEvent type (date:string, projectId?/taskId?), scheduleStore createEvent/updateEvent/deleteEvent
  - phase: 05-task-crud
    plan: 03
    provides: TaskDialog pattern (dual-mode + Combobox + nested delete confirm)
provides:
  - ScheduleDialog component (create/edit dual mode) at src/components/ScheduleDialog.tsx
  - Product Combobox pattern reuse (Phase 5 D-11)
  - Nested delete confirmation dialog for schedule events (SCHED-03)
affects: [06-schedule-crud (plan 03 ScheduleView integration), 06-schedule-crud (plan 04 wire-up)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-mode Dialog pattern: mode: 'create' | 'edit' with useEffect([open, mode, event?.id]) reset (Pitfall P13)"
    - "crypto.randomUUID() for new entity IDs (contract continuation from Phase 5)"
    - "Product Combobox: Popover + Input + list rows + X clear button (Phase 5 D-11 reuse)"
    - "Nested delete confirmation: top-level Dialog with z-modal automatic stacking"
    - "Direct useScheduleStore hooks — no AppContext dependency"
    - "Spread + override for create payload: { ...DEFAULT_EVENT, id, ...payload } — DEFAULT_EVENT provides safety net for future fields"

key-files:
  created:
    - src/components/ScheduleDialog.tsx
  modified: []

key-decisions:
  - "Time field kept as free-text Input (placeholder='09:00 - 10:00') per PLAN discretion — matches ScheduleEvent.time contract ('HH:mm - HH:mm' 或 'HH:mm'), avoids 2-input combining complexity"
  - "Field order: title / date+time (grid-cols-2) / type+location (grid-cols-2) / product Combobox — matches PLAN spec"
  - "DEFAULT_EVENT.date = '' (empty) — overridden by payload in every path; safer than committing a stale todayISO() at module load"
  - "autoFocus on title input for create mode only — edit mode users may want to focus a different field"
  - "Import ScheduleEventType + ScheduleEvent from single scheduleStore line — Plan 06-01 exported both types"

patterns-established:
  - "ScheduleDialog is a direct mirror of TaskDialog — same import order, same state hook order, same effect structure, same JSX composition. Any future Dialog (e.g. EventReminder in v0.3+) should follow this template."

requirements-completed: [SCHED-01, SCHED-02, SCHED-03]

# Metrics
duration: ~5min
completed: 2026-08-10
---

# Phase 6 Plan 02: ScheduleDialog Component Summary

**ScheduleDialog 单文件交付 —— create/edit 双模式 + 6 字段表单(title/date/time/type/location/product Combobox)+ 嵌套删除确认。完整复用 Phase 5 TaskDialog 模式,零发明。Plan 06-03 会在 ScheduleView 接入。**

## Performance

- **Duration:** ~5 min active work
- **Started:** 2026-08-10T11:55:00Z (approx)
- **Completed:** 2026-08-10T12:00:00Z (approx)
- **Tasks:** 1
- **Files created:** 1 (src/components/ScheduleDialog.tsx, 293 lines)
- **Files modified:** 0

## Accomplishments

- 新建 `src/components/ScheduleDialog.tsx`,完整 dual-mode Dialog 骨架
- 表单 6 字段完整就位:
  - `title` — Input,create 模式 autoFocus,trim 后为空则主按钮 disabled
  - `date` — DatePickerInput(Popover 日历,YYYY-MM-DD 契约)
  - `time` — Input,free-text placeholder="09:00 - 10:00"(简化决策,见 Decisions)
  - `type` — Select,6 值联合(meeting/deadline/task/reminder/review/sync)+ 中文标签
  - `location` — Input,可空
  - `projectId` — 关联产品 Combobox(Popover + Input 搜索 + button 列表 + X 清除)
- Pitfall P13 修复:`useEffect([open, mode, event?.id])` 在 open=true 时重置全部表单状态(create → 默认值 / edit → 从 event prop 同步)
- create 模式提交:`createEvent({ ...DEFAULT_EVENT, id: crypto.randomUUID(), ...payload })`,Toast success "日程已创建"
- edit 模式提交:`updateEvent(event.id, payload)`,Toast success "已保存"
- 删除按钮(edit only):DialogFooter 左侧 `mr-auto`,`variant="danger"` `size="sm"`,触发 `showDeleteConfirm=true`
- 嵌套删除确认:顶层同级 Dialog,`z-modal` 自动叠加(Radix Portal + 400 z-index),确认后 `deleteEvent(event.id)` + 关闭外层 + Toast success "日程已删除"
- Combobox 完整 Phase 5 行为:trigger 显示已选产品名或占位 "搜索产品..." + 图标(选中态显 X 清除,未选态显放大镜)
- Direct store hooks:`useScheduleStore((s) => s.createEvent)` 等 3 处,无 AppContext 依赖(D-05 preferred pattern)
- `npm run lint` (tsc --noEmit) 通过,零 TypeScript 错误

## Task Commits

Each task committed atomically with `--no-verify` (parallel executor contention):

1. **Task 1: 创建 ScheduleDialog.tsx (create/edit 双模式 + Combobox + 嵌套删除确认)** - `3865aaf` (feat)

## Files Created/Modified

### Created

- `src/components/ScheduleDialog.tsx` (293 lines) —— 完整组件,依赖:
  - `useScheduleStore` (3 CRUD actions)
  - `useProductStore` (products selector)
  - `useToast` (success feedback)
  - Dialog + DialogContent + DialogHeader + DialogBody + DialogFooter
  - Popover + PopoverTrigger + PopoverContent
  - Input, Select (+ SelectTrigger/Content/Item/Value)
  - DatePickerInput, Button
  - `cn` helper, Phosphor icons (Trash / X / MagnifyingGlass)

## Decisions Made

- **时间字段用单个 Input free-text**(而非双 `<input type="time">` 组合):PLAN 允许 Claude's discretion — "如果太复杂,退化为单个 Input placeholder"。用户可手填 '09:00 - 10:00' 或 '09:00',契合 `ScheduleEvent.time: string` 契约的松散约束。Plan 06-03 也可在月历渲染时按 startsWith parse
- **`DEFAULT_EVENT.date = ''`**(而非 `todayISO()` 硬编码):模块加载时的 `todayISO()` 会永远返回加载那一刻的日期,跨越午夜后仍旧;实际每次 create 都会通过 `useEffect` 走 `defaultDate ?? todayISO()` 路径注入实时日期。DEFAULT_EVENT 只是 spread 安全网,避免未来新增 ScheduleEvent 字段时 create 缺字段
- **`autoFocus={mode === 'create'}`**:edit 模式用户点开是为了改某一个已知字段,自动聚焦标题反而打断;create 模式用户就是要立即打字
- **Import ScheduleEventType + ScheduleEvent 单行**:PLAN 提示 "如果 import 别名冲突,合并成一行" —— 用 `import { useScheduleStore, type ScheduleEvent, type ScheduleEventType }` 单条 import,统一从 scheduleStore 拉,减少 import 行数

## Deviations from Plan

**None** —— Plan 骨架代码直接可用,tsc 一次通过。仅有的两处微调:
1. `DEFAULT_EVENT.date` 从 PLAN 的 `todayISO()` 改为 `''`(见 Decisions)—— 语义等价但更安全,不影响任何行为
2. Import 合并成单行(PLAN 已预告允许)

## Issues Encountered

None. 全流程无阻塞、无 lint 错误、无 unexpected type mismatch。Plan 06-01 已经把契约和迁移都做干净了,Plan 06-02 就是纯 UI 组装。

## User Setup Required

None —— 纯组件,未在任何 view 中挂载。Plan 06-03 会在 ScheduleView 加入:
- 头部 "新建日程" 按钮触发 `<ScheduleDialog mode="create" defaultDate={/*当前选中日期*/} />`
- 月历事件 chip 点击触发 `<ScheduleDialog mode="edit" event={selectedEvent} />`

## Next Phase Readiness

**Plan 06-03 (ScheduleView 月历重写)可以直接消费:**

```tsx
import { ScheduleDialog } from '@/src/components/ScheduleDialog';

// 头部创建入口
const [createOpen, setCreateOpen] = useState(false);
<Button onClick={() => setCreateOpen(true)}>新建日程</Button>
<ScheduleDialog
  open={createOpen}
  onOpenChange={setCreateOpen}
  mode="create"
  defaultDate={`${currentMonth.year}-${String(currentMonth.month).padStart(2, '0')}-01`}
/>

// 编辑入口(点击月历事件 chip)
const [editEvent, setEditEvent] = useState<ScheduleEvent | undefined>(undefined);
<ScheduleDialog
  open={!!editEvent}
  onOpenChange={(open) => !open && setEditEvent(undefined)}
  mode="edit"
  event={editEvent}
/>
```

**Plan 06-04 (交互接线)**:如果需要外部触发 delete confirm,可以让 ScheduleDialog 暴露一个 imperative handle;当前设计里 delete 只从 edit 模式内触发(TaskDialog 同样)。若 Plan 06-04 需要"月历右键菜单直接删",可以在 ScheduleView 复用同一个嵌套 Dialog 模式(小组件,不必抽出)。

---
*Phase: 06-schedule-crud*
*Completed: 2026-08-10*

## Self-Check: PASSED

- FOUND: src/components/ScheduleDialog.tsx
- FOUND: .planning/phases/06-schedule-crud/06-02-SUMMARY.md
- FOUND: commit 3865aaf (Task 1)
