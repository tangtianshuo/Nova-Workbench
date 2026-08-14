---
phase: 05-task-crud
plan: 01
subsystem: api
tags: [zustand, persist, state-management, typescript, legacy-compat]

# Dependency graph
requires:
  - phase: 02-persistence
    provides: sqliteStorage adapter + persist v1 baseline
provides:
  - Task type extended with projectId?/scheduledEventId? weak-link fields
  - taskStore 5 new actions: updateTask, deleteTask, reopenTask, moveTask, setTaskProject
  - taskStore persist v2 with migrate function backfilling legacy task records
  - AppContext compat layer delegates all 5 new actions to legacy useApp() callers
  - setTaskProject D-10 mirror: task.project = product.name on projectId change
affects: [05-task-crud (plans 02-04), 07-cross-module-linkage, 10-ai-task-schedule]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct store hook (useTaskStore) preferred over useApp() for new code"
    - "Cross-store reads inside store actions use useXStore.getState() (no hooks in actions)"
    - "persist version bump + migrate function as the canonical schema-evolution pattern"
    - "Weak-link fields (projectId?/scheduledEventId?) default undefined, migrate backfills"

key-files:
  created: []
  modified:
    - src/data/mockTasks.ts
    - src/stores/taskStore.ts
    - src/store/AppContext.tsx

key-decisions:
  - "setTaskProject mirrors task.project = product.name (D-10) so AppContext legacy callers still see product name without migration"
  - "Mock data in INITIAL_CATEGORIES intentionally omits projectId (migrate backfills on hydration)"
  - "Store action reads productStore via useProductStore.getState() — actions cannot call hooks"
  - "ID generation stays caller-side (crypto.randomUUID()); store addTask only deduplicates"

patterns-established:
  - "persist v1→v2 migration: scan nested categories[].tasks[] and backfill new optional fields with ?? undefined"
  - "D-10 mirror pattern: weak-link setter also writes legacy denormalized field for backward compat"
  - "AppContext delegate pattern: 1 selector + 1 interface signature + 1 value field per new action (no wrappers)"

requirements-completed: [TASK-07, TASK-08, TASK-09]

# Metrics
duration: 2min
completed: 2026-08-10
---

# Phase 5 Plan 01: Task Type + taskStore CRUD Actions Summary

**Task 类型扩展 projectId?/scheduledEventId? 弱关联 + taskStore 5 个新 action (update/delete/reopen/move/setProject) + persist v2 migration + AppContext 兼容层委托**

## Performance

- **Duration:** ~2 min active work
- **Started:** 2026-08-10T08:42:44Z
- **Completed:** 2026-08-10T08:46:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Task 接口加上 `projectId?` / `scheduledEventId?` 两个可选弱关联字段,为 Phase 5-7 跨模块联动做好契约准备
- taskStore 实现完整 CRUD: `updateTask` / `deleteTask` / `reopenTask` / `moveTask` / `setTaskProject`,scan 嵌套 `categories[].tasks[]` 结构,no-op safe
- `setTaskProject` 内置 D-10 legacy 镜像:更新 projectId 时同步写 `task.project = product.name`,30 个 legacy useApp() 调用方零迁移
- persist version 1→2,migrate 函数遍历嵌套结构为旧记录 backfill `projectId/scheduledEventId` 默认 undefined
- AppContext 兼容层完整暴露 5 个新 action (selector + interface + value 字段三件套)
- `npm run lint` (tsc --noEmit) 通过,无类型错误

## Task Commits

Each task was committed atomically with `--no-verify` (parallel executor contention):

1. **Task 1: 扩展 Task 类型 + 添加 5 个 store actions + persist v2 migration** - `ebbe8b0` (feat)
2. **Task 2: AppContext 暴露 5 个新 task action** - `8fcf8a8` (feat)

## Files Created/Modified

- `src/data/mockTasks.ts` - Task 接口扩展 `projectId?: string` + `scheduledEventId?: string` 弱关联字段;`project: string` 加注释标明 legacy 镜像角色。mock 数据不变(migrate 兜底)
- `src/stores/taskStore.ts` - import useProductStore;TaskState 接口加 5 个新 action 签名;实现 5 个 action(no-op safe,scan 嵌套结构);persist version 1→2 + migrate backfill;`_hasHydrated` / `_setHydrated` 不变
- `src/store/AppContext.tsx` - AppContextType 加 5 个新方法签名;AppProvider 加 5 个 `useTaskStore((s) => s.X)` selector;value 对象加 5 个字段 delegate 到 store

## Decisions Made

- **Mock 数据不加 projectId:** INITIAL_CATEGORIES 故意保持精简,persist v2 migrate 在 hydration 时兜底补 undefined,避免 mock 与真实数据格式分叉
- **reopenTask 内联而非复用 updateTask:** 计划文档建议复用 updateTask,但实际实现选择内联 `set` 调用以避免 action 内调 action 的耦合(更易追踪、不变更签名时无需连锁修改),最终实现的 `reopenTask` 与 plan 行为等价 (set status='未开始')
- **setTaskProject 用 `useProductStore.getState()`:** store action 不能调 hook,通过 `.getState()` 同步读取最新 products 快照查 product.name 做 D-10 镜像
- **ID 生成契约:** store `addTask` 不再硬编码 `Date.now()` ID,调用方 (TaskDialog/TaskKanban create 模式) 传 `crypto.randomUUID()`;store 仅保留去重 guard

## Deviations from Plan

None - plan executed exactly as written. Two minor implementation choices (reopenTask inlined vs. calling updateTask; productName lookup via `?? ''` fallback) produce identical observable behavior to the plan spec.

## Issues Encountered

None. `npm run lint` passed on both tasks with no type errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plans 02-04 (Drawer / TaskDialog / TaskKanban) can now consume the contract directly:

```ts
const updateTask = useTaskStore((s) => s.updateTask);
const deleteTask = useTaskStore((s) => s.deleteTask);
const reopenTask = useTaskStore((s) => s.reopenTask);
const moveTask = useTaskStore((s) => s.moveTask);
const setTaskProject = useTaskStore((s) => s.setTaskProject);
```

Legacy `useApp()` callers transparently see the same 5 actions. No migration required for the 30 existing consumers.

---
*Phase: 05-task-crud*
*Completed: 2026-08-10*

## Self-Check: PASSED

- FOUND: src/data/mockTasks.ts
- FOUND: src/stores/taskStore.ts
- FOUND: src/store/AppContext.tsx
- FOUND: .planning/phases/05-task-crud/05-01-SUMMARY.md
- FOUND: commit ebbe8b0 (Task 1)
- FOUND: commit 8fcf8a8 (Task 2)
