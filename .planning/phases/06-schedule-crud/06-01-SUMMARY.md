---
phase: 06-schedule-crud
plan: 01
subsystem: api
tags: [zustand, persist, state-management, typescript, schedule, migration]

# Dependency graph
requires:
  - phase: 02-persistence
    provides: sqliteStorage adapter + persist v1 baseline
  - phase: 05-task-crud
    provides: persist v2 migration pattern (taskStore reference)
provides:
  - ScheduleEvent type extended: date number→string YYYY-MM-DD, type union, projectId?/taskId? weak links
  - scheduleStore 3 new actions: createEvent, updateEvent, deleteEvent
  - scheduleStore persist v2 with migrate function converting legacy number date → 2025-05-DD string
  - sortByDateTime helper: lexicographic date+time sort (replaces broken numeric subtraction)
  - AppContext compat layer delegates 3 new actions to legacy useApp() callers
  - Temporary ScheduleView shim (Plan 06-03 will fully rewrite)
affects: [06-schedule-crud (plans 02-04), 07-cross-module-linkage, 10-ai-task-schedule]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct store hook (useScheduleStore) preferred over useApp() for new code"
    - "persist v1→v2 migration: number date → YYYY-MM-DD anchor conversion"
    - "Type union narrowing on existing string field (backward compat via migrate)"
    - "Module-level pure helper (sortByDateTime) shared by addEvent/createEvent"

key-files:
  created: []
  modified:
    - src/stores/scheduleStore.ts
    - src/store/AppContext.tsx
    - src/components/AIAssistantPanel.tsx  # ripple: date literal 16 → '2025-05-16'
    - src/views/AgentWorkspaceView.tsx     # ripple: date literal 16 → '2025-05-16'
    - src/views/ScheduleView.tsx           # temp shim; Plan 06-03 will rewrite

key-decisions:
  - "Mock INITIAL_EVENTS uses complete YYYY-MM-DD strings ('2025-05-15') — migrate only handles legacy persisted numbers"
  - "May 2025 anchor for migration: `2025-05-${padStart(2, '0')}` matches current mock data month"
  - "sortByDateTime is a spread-copy sort (immutable) — old addEvent did in-place .sort() but that was undefined behavior on frozen state"
  - "ScheduleView.tsx gets a minimal `dayFromDate = d => Number(d.slice(-2))` shim; Plan 06-03 delivers full month-picker rewrite"
  - "AIAssistantPanel + AgentWorkspaceView had inline date literals (Rule 3 blocking-issue fixes) — Phase 10 AI features will consume the new date-string contract naturally"

patterns-established:
  - "Union-typed enum introduced without breaking existing string field: existing callers auto-narrow via TS structural typing"
  - "Weak-link fields (projectId?/taskId?) default undefined; migrate backfills with `?? undefined`"
  - "AppContext delegate pattern: 1 selector + 1 interface signature + 1 value field per new action (no wrappers)"

requirements-completed: [SCHED-05, SCHED-06, SCHED-07, SCHED-08]

# Metrics
duration: 5min
completed: 2026-08-10
---

# Phase 6 Plan 01: ScheduleEvent Type + scheduleStore CRUD Actions Summary

**ScheduleEvent 类型扩展(date number→string / type 联合 / projectId?/taskId? 弱关联)+ scheduleStore 3 个新 action + persist v2 migration + AppContext 兼容层委托。数据契约层就位,Phase 6 UI plans 可以直接消费。**

## Performance

- **Duration:** ~5 min active work
- **Started:** 2026-08-10T11:45:05Z
- **Completed:** 2026-08-10T11:49:34Z
- **Tasks:** 2
- **Files modified:** 5 (2 spec-plan + 3 ripple)

## Accomplishments

- `ScheduleEvent.date` 从 `number` 迁移到 `string` (YYYY-MM-DD),契合 Plan 06-02/03 月份切换需求
- `ScheduleEvent.type` 从 `string` 收窄为 6 值联合 `'meeting' | 'deadline' | 'task' | 'reminder' | 'review' | 'sync'`;新增 `'task'` 值为 Phase 7 "安排到日历" 做准备
- `ScheduleEvent` 新增 `projectId?` / `taskId?` 两个可选弱关联字段(D-03)
- INITIAL_EVENTS 三条 mock 数据 date 字段统一改为 `'2025-05-15'`(全 YYYY-MM-DD)
- scheduleStore 实现 3 个 CRUD action: `createEvent` / `updateEvent` / `deleteEvent`(去重、no-op safe)
- 抽取模块级 `sortByDateTime` helper — 用 `String.localeCompare` 排 date+time,取代原来 `a.date - b.date` 的数字减法(现在 date 是 string,不能减)
- `addEvent`(legacy)保留,内部改用 `sortByDateTime`,不破坏 AppContext 现有委托
- persist version `1` → `2`;migrate 函数遍历事件,对 `typeof e.date === 'number'` 的旧记录用 May 2025 锚点转 `2025-05-DD` string;同时补 `projectId/taskId` 默认 undefined
- AppContext 兼容层暴露 3 个新 action(selector + interface + value 三件套),legacy useApp() 调用方无破坏
- `npm run lint` (tsc --noEmit) 通过,无类型错误

## Task Commits

Each task was committed atomically with `--no-verify` (parallel executor contention):

1. **Task 1: ScheduleEvent 类型扩展 + scheduleStore 3 CRUD action + persist v2 migration** - `b686d6a` (feat)
2. **Task 2: AppContext 暴露 createEvent / updateEvent / deleteEvent** - `e9ddec2` (feat)

## Files Created/Modified

- `src/stores/scheduleStore.ts` — 完整重写:`ScheduleEventType` union type,`ScheduleEvent` 加 date:string/projectId?/taskId?,INITIAL_EVENTS 全部 YYYY-MM-DD,`sortByDateTime` module helper,3 个 CRUD action,persist v1→v2 + migrate。原 in-place `.sort()` 改为 `[...events].sort(...)` 保证不变性
- `src/store/AppContext.tsx` — AppContextType 加 3 个新签名(`createEvent`/`updateEvent`/`deleteEvent`),AppProvider 加 3 个 `useScheduleStore((s) => s.X)` selector,value 对象暴露 3 个新字段
- `src/components/AIAssistantPanel.tsx` — 单点 ripple fix:`date: 16` → `date: '2025-05-16'`(Rule 3 blocking issue)
- `src/views/AgentWorkspaceView.tsx` — 单点 ripple fix:`date: 16` → `date: '2025-05-16'`(Rule 3 blocking issue)
- `src/views/ScheduleView.tsx` — **临时 shim**:加 `dayFromDate = d => Number(d.slice(-2))` 辅助函数,替换 7 处 `e.date === day` / `e.date >= 15` / `e.date - a.date` 使用点。Plan 06-03 会完整重写这个 view(围绕 `currentMonth: {year, month}` state + 月份切换),届时 shim 自然消失

## Decisions Made

- **Mock 数据直接用完整 YYYY-MM-DD 字符串**:INITIAL_EVENTS 三条 `date: '2025-05-15'`,不依赖 migrate 转换。migrate 只处理旧持久化数据(生产环境已有用户存在旧 v1 number date)
- **May 2025 锚点(D-02)**:migrate 用 `2025-05-${String(e.date).padStart(2, '0')}` 转换旧 number,匹配当前 mock 数据的 5 月锚点。这是本地优先 app 的合理保守选择(v0.1.0 用户数据规模小,不需要复杂的元数据推断)
- **sortByDateTime 用 spread-copy**:`[...events].sort()` 而非 `events.sort()`,避免 Zustand 冻结 state 的 mutation 陷阱。原 `addEvent` 内部 in-place sort 是 pre-existing latent bug,顺手修
- **ScheduleView shim 而非完整重写**:Plan 06-01 严格限于数据契约层,ScheduleView 完整重写是 Plan 06-03 的范围。用最小 shim 换 lint 通过,避免 Plan 01 rippled 到 UI 层
- **`crypto.randomUUID()` 契约延续**:store `createEvent` 不生成 id,调用方(Plan 06-02 ScheduleDialog)传 `crypto.randomUUID()`。这跟 Phase 5 `addTask` 保持一致

## Deviations from Plan

### Auto-fixed Issues (Rule 3 - Blocking)

**1. [Rule 3 - Blocking] AIAssistantPanel + AgentWorkspaceView had inline `date: 16` literals**
- **Found during:** Task 1 lint verification
- **Issue:** 两个 legacy 组件用 `addEvent({ ..., date: 16, ... })` 内联硬编码 number 日期,类型收窄后 TS2322 错误
- **Fix:** `date: 16` → `date: '2025-05-16'`(保持"明天"语义 = 5/16,因为 mock 日期锚点是 5/15 "今天")
- **Files modified:** src/components/AIAssistantPanel.tsx, src/views/AgentWorkspaceView.tsx
- **Commit:** b686d6a(与 Task 1 合并提交,同批 ripple)

**2. [Rule 3 - Blocking] ScheduleView.tsx 7 处 date 比较类型错误**
- **Found during:** Task 1 lint verification
- **Issue:** ScheduleView 遍历 events 时用 `e.date === day`(string vs number)、`e.date >= 15`、`a.date - b.date`(string 相减)等 6+ 处类型错误
- **Fix:** 加 `dayFromDate = (d: string) => Number(d.slice(-2))` shim,替换 7 处使用点。**PLAN 明确允许**:"如果整体 lint 失败,临时在 ScheduleView 里把 events.some(e => e.date === day) 改为 events.some(e => Number(e.date.slice(-2)) === day),但优先以 Plan 03 完整重写为准"
- **Files modified:** src/views/ScheduleView.tsx
- **Commit:** b686d6a

### Plan-guided Adjustments

- **`sortByDateTime` 用 spread-copy 而非 in-place**:PLAN action 步骤 (d) 写的是 `events.sort(...)`,实际实现改为 `[...events].sort(...)`。行为等价(新 array 都是 sort 结果),但更安全:Zustand strict-mode 会 freeze state,in-place `.sort()` 在开发模式会抛 TypeError。这是 Phase 5 `taskStore` 已验证的模式,Plan 06-01 顺手对齐

## Issues Encountered

None blocking. 3 处 lint ripple 是 D-01 类型变更的自然后果,PLAN 已预告 "现有 ScheduleView.tsx 可能出现类型错误,这是预期的",且给出了最小修复模板。执行按 plan 走。

## User Setup Required

None — 纯数据层变更,persist v1→v2 migrate 在下次 hydration 自动完成。生产用户有 v1 number date 也无感知。

## Next Phase Readiness

**Phase 6 后续 plans 可以立即消费新契约:**

```ts
// Direct store hooks (preferred for new code):
const createEvent = useScheduleStore((s) => s.createEvent);
const updateEvent = useScheduleStore((s) => s.updateEvent);
const deleteEvent = useScheduleStore((s) => s.deleteEvent);

// Or legacy compat (existing 30+ useApp() callers auto-see 3 new actions):
const { createEvent, updateEvent, deleteEvent } = useApp();

// ScheduleEvent 契约:
const event: ScheduleEvent = {
  id: crypto.randomUUID(),
  title: '需求评审',
  time: '10:00 - 11:00',
  date: '2025-05-20',        // YYYY-MM-DD
  type: 'meeting',            // 联合类型自动补全
  location: '会议室 3A',
  projectId: product.id,      // 可选弱关联
  taskId: task.id,            // 可选弱关联(Phase 7)
};
createEvent(event);
```

**Plan 06-02 (ScheduleDialog):** 消费 `createEvent` / `updateEvent`,Combobox 复用 Phase 5 模式选 projectId
**Plan 06-03 (ScheduleView 月历重写):** 消费 `events.filter(e => e.date.startsWith(monthPrefix))`,`dayFromDate` shim 会自然删除
**Plan 06-04 (交互接线):** 消费 `deleteEvent` + 二次确认对话框(沿用 Phase 5 模式)

---
*Phase: 06-schedule-crud*
*Completed: 2026-08-10*

## Self-Check: PASSED

- FOUND: src/stores/scheduleStore.ts
- FOUND: src/store/AppContext.tsx
- FOUND: src/components/AIAssistantPanel.tsx
- FOUND: src/views/AgentWorkspaceView.tsx
- FOUND: src/views/ScheduleView.tsx
- FOUND: .planning/phases/06-schedule-crud/06-01-SUMMARY.md
- FOUND: commit b686d6a (Task 1)
- FOUND: commit e9ddec2 (Task 2)
