---
phase: 05-task-crud
plan: 04
subsystem: ui
tags: [dnd-kit, inline-edit, dropdown-menu, drag-drop, kanban, motion]

# Dependency graph
requires:
  - phase: 05-task-crud
    plan: 01
    provides: taskStore CRUD actions (updateTask/deleteTask/reopenTask/moveTask/setTaskProject) + Task.projectId? field
  - phase: 05-task-crud
    plan: 02
    provides: ProductSummaryDrawer (badge click target)
  - phase: 05-task-crud
    plan: 03
    provides: TaskDialog (DotsMenu "在对话框中编辑" target, edit mode)
provides:
  - "TaskKanban rewrite — inline edit (4 fields, 400ms debounced) + DotsMenu (4 items) + @dnd-kit/core cross-column DnD + product badge → Drawer"
  - "@dnd-kit/core@6.3.1 installed (PointerSensor distance:8 threshold protects click-to-expand)"
  - "Real-time count Badge (D-06) via derivedCount + motion.span key={count}"
  - "DragOverlay portal-rendered clone for clean source-column layout"
  - "Empty-state copy (暂无任务 / 点击 + 新建一个任务)"
affects: [05-task-crud (plan 05 UAT), 07-cross-module-linkage (badge click already demonstrates weak-link value)]

# Tech tracking
tech-stack:
  added:
    - "@dnd-kit/core@6.3.1"
  patterns:
    - "DndContext at parent + useDraggable per card + useDroppable per column + DragOverlay clone"
    - "Per-field debounced autosave via useRef<Record<key, timer>> + clearTimeout/setTimeout(400ms)"
    - "click-vs-drag disambiguation via PointerSensor activationConstraint.distance + DOM closest() guard"
    - "Real-time count derivation: derivedCount = base + (isOver ? +1 : 0) - (isSource ? 1 : 0)"
    - "KanbanColumn / KanbanCard extracted as sibling components — useDraggable/useDroppable must be called at component top level"

key-files:
  created: []
  modified:
    - src/components/TaskKanban.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "KanbanColumn / KanbanCard extracted as siblings of TaskKanban (not nested) — React hooks rule: useDraggable/useDroppable can't be conditionally called inside map()"
  - "Delete confirm uses top-level Dialog with DeleteConfirmButton subcomponent — keeps the store action call site ergonomic without prop-drilling deleteTask into KanbanCard"
  - "drop target visual = ring-2 ring-accent/40 + bg-bg-tertiary/50 — matches UI-SPEC §3"
  - "Source-column real-time count = derivedCount formula, not waiting for store mutation — avoids visual snap on drop"
  - "DragOverlay clone is intentionally minimal (id + title only) — full card clone would shadow source with stale state during drag"

patterns-established:
  - "Per-field debounce timer map (useRef<Record<key, ReturnType<typeof setTimeout>>>) — minimal viable autosave without flush-debounce lib"
  - "Card click guard via DOM closest('input,textarea,button,[role=menuitem],[data-no-expand]') — preserves click-to-expand for DnD-wrapped interactive cards"
  - "derivedCount + motion.span key={count} pattern — generic for any 'count that should animate during drag'"

requirements-completed: [TASK-01, TASK-05, TASK-06]

# Metrics
duration: 4min
completed: 2026-08-10
---

# Phase 5 Plan 04: TaskKanban Rewrite (Inline Edit + DotsMenu + DnD + Badge) Summary

**重写 TaskKanban 一站式集成 4 大能力:展开卡片 4 字段 inline 编辑 + DotsThree DropdownMenu 4 项操作 + @dnd-kit/core 跨列拖拽(8px 阈值保护 click-to-expand)+ 产品徽章 → ProductSummaryDrawer,落地 TASK-01/05/06 + D-01..D-07,D-11 全部决策。**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-08-10T08:50:54Z
- **Completed:** 2026-08-10T08:55:30Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- 展开卡片直接渲染 5 字段为可编辑控件:Title Input(borderless)/ Description Textarea / Priority Select / Deadline DatePickerInput / Category Select,400ms debounced autosave 每字段独立 timer,unmount 时 clear,无保存按钮(D-01, D-02)
- DotsThree DropdownMenu 在卡片右上角,4 项操作完整:在对话框中编辑 / 复制 ID(配 Toast)/ 重新打开(disabled when not 已完成)/ 删除(打开 confirm Dialog) (D-03)
- 底部"标记完成/已完成"主按钮与 DotsMenu 并存,Category Select 改动也调用 moveTask(D-04, D-07)
- @dnd-kit/core 6.3.1 安装并接入:DndContext + PointerSensor distance:8 + useDraggable per card + useDroppable per column + DragOverlay portal clone(D-05)
- 拖拽中实时刷新两列 Badge 计数(derivedCount 公式 + motion.span key={count} AnimatePresence y:-4/4 spring 400/25)(D-06)
- drop 目标列 ring-2 ring-accent/40 bg-bg-tertiary/50 视觉反馈,DragOverlay clone opacity-90 rotate-2 shadow-xl(UI-SPEC §3)
- 卡片显示产品徽章(only when task.projectId),点击触发 ProductSummaryDrawer,e.stopPropagation 防触发卡片 collapse(TASK-06, D-11)
- 空列显示"暂无任务 / 点击 + 新建一个任务"(UI-SPEC §empty state)
- 保留现有行为:SegmentedControl category/date 切换、dateGroups useMemo、Add Category 流程、AI 建议块、header 布局
- 618 行,远超 350 行 min_lines
- `npm run lint` 通过,零类型错误

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @dnd-kit/core@6.3.1 + rewrite TaskKanban (inline edit + DotsMenu + DnD + badge)** — `dc29222` (feat)

## Files Created/Modified

- `src/components/TaskKanban.tsx` — 完整重写:顶层 TaskKanban (DnD state + DotsMenu state + handlers);KanbanColumn (useDroppable + 实时计数);KanbanCard (useDraggable + inline 编辑 state + DotsMenu + drag transform + click-vs-drag guard);DeleteConfirmButton subcomponent (调 deleteTask + toast)
- `package.json` — 加 `"@dnd-kit/core": "^6.3.1"` 依赖
- `package-lock.json` — 锁定 @dnd-kit/core + 3 个子依赖

## Decisions Made

- **KanbanColumn / KanbanCard 提取为 TaskKanban 的 sibling components:** 不能用嵌套函数组件实现(每次 render 会重建组件类型导致 unmount/remount),也不能在 map() 内调 useDraggable/useDroppable(违反 hooks 规则)。提取为稳定组件 + props 传递。
- **DeleteConfirmButton 单独抽出:** deleteTask 在父级 TaskKanban 已经从 useTaskStore 拿,但 delete Dialog 是顶层渲染的;抽出 subcomponent 让 store action 调用与 toast 触发就近,避免 prop drilling。
- **DragOverlay clone 简化:** 只渲染 id + title,不克隆整张卡片。完整克隆会带 stale state(如编辑中的 input value)进 DragOverlay,反而误导用户。
- **drop target 视觉严格按 UI-SPEC §3:** ring-2 ring-accent/40 + bg-bg-tertiary/50 + border-accent/30。
- **real-time count 公式:** `derivedCount = tasks.length + (isOverThis ? 1 : 0) - (isSource && activeDragId ? 1 : 0)`。drop 完成后 store mutation 使 derived === persisted,无视觉跳变。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] KanbanColumn/KanbanCard 提取为 sibling components(非 nested)**
- **Found during:** Task 1
- **Issue:** Plan 骨架将 KanbanColumn / KanbanCard 写成 TaskKanban 内部的子函数(implicit nested components)。React 视 nested function component 为全新组件类型,每次 render 会触发 unmount/remount,丢失 useDraggable/useDroppable 内部 state 与 transform。
- **Fix:** 提取为模块顶层 sibling function declarations,通过 props 传入 active drag state / callbacks。useDroppable/useDraggable 在各自组件顶层调用。
- **Files modified:** src/components/TaskKanban.tsx
- **Verification:** `npm run lint` 通过,DnD hook 调用顺序稳定。
- **Committed in:** dc29222 (part of task commit)

**2. [Rule 3 - Blocking] 缺失 DialogBody import 路径修正**
- **Found during:** Task 1
- **Issue:** Plan 骨架的 delete confirm Dialog 引用了 DialogBody,但顶部 import 区只列了部分 Dialog 子组件;遗漏 DialogBody。
- **Fix:** Import 加 `DialogBody`(已存在于 ui/Dialog.tsx,barrel 已 export)。
- **Files modified:** src/components/TaskKanban.tsx
- **Verification:** `npm run lint` 通过。
- **Committed in:** dc29222

**3. [Rule 1 - Bug] DeleteConfirmButton 抽出避免 useToast/useTaskStore 重复**
- **Found during:** Task 1
- **Issue:** Plan 骨架在 delete confirm Dialog 内联 `onClick={() => { deleteTask(...); toast(...) }}`,但 deleteTask 没在父组件 destructure、也没在 KanbanCard 拿到。直接内联会让 JSX 拿不到 store action。
- **Fix:** 抽出 `DeleteConfirmButton` subcomponent,内部独立调用 useTaskStore/useToast。模式与 KanbanCard 一致。
- **Files modified:** src/components/TaskKanban.tsx
- **Verification:** `npm run lint` 通过。
- **Committed in:** dc29222

---

**Total deviations:** 3 auto-fixed (1 bug + 1 blocking + 1 bug)
**Impact on plan:** 0 scope change — all deviations are implementation refinements of the plan's draft code; final behavior matches plan spec 1:1.

## Issues Encountered

None. `npm run lint` passed on first try after the rewrite.

## User Setup Required

None — `@dnd-kit/core@6.3.1` is a runtime dependency installed via `npm install`, no env vars or external services needed.

## Next Phase Readiness

- Plan 05 (UAT) can now exercise all 4 kanban subsystems: inline edit (TASK-01), DotsMenu edit/delete/reopen/copy-id (D-03), DnD cross-column (TASK-05, D-05/D-06/D-07), product badge → Drawer (TASK-06, D-11)
- Phase 5 fully complete from a code perspective; ready for user UAT
- Phase 7 cross-module linkage will further leverage the weak-link fields (projectId/scheduledEventId) now wired through the kanban
- Drawer primitive (plan 02) proven reusable by being the click target here — Phase 9 chat panel can reuse with zero changes

## Self-Check: PASSED

**Files (3/3 found):**
- FOUND: src/components/TaskKanban.tsx
- FOUND: package.json (contains `"@dnd-kit/core": "^6.3.1"`)
- FOUND: package-lock.json (updated)

**Commits (1/1 found):**
- FOUND: dc29222 (feat(05-04): rewrite TaskKanban with inline edit, DotsMenu, DnD, product badge)

**Lint:** `npm run lint` passes with zero errors.

---

*Phase: 05-task-crud*
*Completed: 2026-08-10*
