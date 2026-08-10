# Architecture Research: v0.2.0 — Task/Schedule CRUD + Cross-Module Wiring

**Domain:** Completing CRUD for `taskStore` and `scheduleStore`, adding real calendar month-navigation, and wiring weak cross-module associations (Product ↔ Task ↔ ScheduleEvent).
**Researched:** 2026-08-10
**Confidence:** HIGH — all patterns derive from existing codebase conventions (Zustand 5 `persist`, `useXxxStore.getState()` cross-store reads, `partialize` + `migrate` adapter, AppContext delegation layer). No novel infra risk.

---

## Executive Summary

v0.2.0 is purely frontend + store-layer work. The existing architecture already supports everything needed:

1. **Store mutations** follow an immutable-spread pattern (`set((state) => ({ ... }))`) — adding `updateTask`, `deleteTask`, `updateEvent`, `deleteEvent` is mechanical.
2. **Cross-store access** has an established convention: `useProductStore.getState().products` inside `rndStore.ts` (the `getProd()` helper). The same pattern works for task ↔ schedule cross-references.
3. **Persistence** already uses `sqliteStorage` with `partialize` + `migrate` — adding optional fields to `Task` and `ScheduleEvent` is a migration-version bump, not a schema rewrite.
4. **AppContext** already wraps all stores and exposes a flat interface — new actions flow through the same delegation pattern.

**Key architectural decision:** Cross-module references are **optional foreign keys on the data types themselves** (`task.projectId?`, `event.taskId?`), not a separate association table. This keeps the "Zustand shape IS the source of truth" principle from ARCHITECTURE.md — no relational normalization, no join queries, no sync complexity. Delete = clear the FK, not cascade.

---

## 1. Integration Points

### 1.1 Store Layer (new actions)

| Store | New Actions | Notes |
|-------|-------------|-------|
| `taskStore` | `updateTask(taskId, updates: Partial<Task>)`, `deleteTask(taskId)`, `reopenTask(taskId)`, `moveTask(taskId, targetCategoryId)` | `completeTask` already exists; `reopenTask` is its inverse. `moveTask` supports drag-between-columns later. |
| `scheduleStore` | `updateEvent(eventId, updates: Partial<ScheduleEvent>)`, `deleteEvent(eventId)`, `setCurrentMonth(year, month)` | `addEvent` and `setEvents` exist. Month state is new — needed for real calendar navigation. |
| `productStore` | _(no new actions)_ | `deleteProduct` already exists; v0.2.0 adds cross-module cleanup (see 1.3). |

**Pattern to follow:** Every mutation uses the existing `set((state) => ({ ... }))` immutable-spread pattern. See `productStore.updateProduct` (line 51-56) as the canonical template.

### 1.2 Type Changes (weak association fields)

```typescript
// src/data/mockTasks.ts — Task interface
export interface Task {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  time?: string;
  status: string;
  description: string;
  project: string;              // KEEP — legacy, used by AppContext getProjectTaskCount
  projectId?: string;           // NEW — weak FK → Product.id
  scheduledEventId?: string;    // NEW — weak FK → ScheduleEvent.id
  assignee: string;
  assigneeAvatar: string;
  deadline: string;
  aiSuggestions: string[];
}

// src/stores/scheduleStore.ts — ScheduleEvent interface
export interface ScheduleEvent {
  id: string;
  title: string;
  time: string;
  date: number;                 // EXISTING — day-of-month (needs real Date for cross-month)
  month?: number;               // NEW — 0-indexed month (for real calendar)
  year?: number;                // NEW — full year (for real calendar)
  type: string;                 // EXISTING — 'meeting' | 'review' | 'sync'; ADD 'task'
  location: string;
  projectId?: string;           // NEW — weak FK → Product.id
  taskId?: string;              // NEW — weak FK → Task.id
}
```

**Why both `task.project: string` and `task.projectId?: string`:**
- `project` is the display name used by `getProjectTaskCount` and mock data. Changing it breaks AppContext consumers.
- `projectId` is the stable FK for cross-module wiring. It's optional — a task can exist without a product.
- Per PROJECT.md Key Decisions: "保留 task.project:string 做 legacy 兼容... 推到下下里程碑"

### 1.3 Cross-Module Wiring (delete cleanup)

When a Product is deleted, tasks and events referencing it should NOT be deleted (weak association). Instead:

```
deleteProduct(id) triggers:
  1. Clear task.projectId where task.projectId === id (in taskStore)
  2. Clear event.projectId where event.projectId === id (in scheduleStore)
  3. Clear uiStore.selectedProductId if it was the deleted product
```

**Where this logic lives:** In `AppContext.tsx`'s `deleteProductWrapped` (line 220-224). This is already the established pattern — `addProject` in AppContext calls `useRndStore.getState().initDeliverablesForProduct(project)` as a cross-store side effect. The delete wrapper should be extended to do cross-store FK cleanup.

**Rationale:** Putting cross-store orchestration in AppContext (not in productStore) avoids introducing store-to-store import cycles. `rndStore` already uses this exact pattern (`getProd()` helper reads `useProductStore.getState()` without importing productStore at module level for writes).

### 1.4 ScheduleEvent.date Model Change

**Current:** `date: number` — hardcoded day-of-month (15 = "today"), no month/year. The calendar in `ScheduleView.tsx` is hardcoded to "2025年 5月" (line 45), `daysInMonth = 31`, `firstDayOfMonth = 4`, `isToday = day === 15`.

**Required for real calendar:** Events need a full date (year + month + day) so the calendar can navigate months. Two approaches:

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| A. Add `month?: number` + `year?: number` to ScheduleEvent | Backward compatible — existing `date: number` still works for mock data; new events use all three fields. Migration is additive. | Two sources of truth for "when" during transition period. | **Recommended for v0.2.0** |
| B. Replace `date: number` with `date: string` (ISO) | Clean model. | Breaks all existing mock data, ScheduleView rendering, and any consumer. Large blast radius. | Defer to v0.3+ |

**Migration strategy:** Approach A. Existing mock events get `month: 4` (May, 0-indexed) and `year: 2025` added via `migrate` function. New events from the dialog always set all three fields. The calendar renders from `month`+`year` filter, falling back to `date` for legacy events.

### 1.5 `type: 'task'` for ScheduleEvent

When a task is "scheduled to calendar", a `ScheduleEvent` is created with `type: 'task'` and `taskId` set. This allows the calendar to render task-events with distinct styling (e.g., a different color in `EVENT_COLORS`) and provides a jump-link back to the task.

---

## 2. New Components

### 2.1 TaskDialog (`src/components/TaskDialog.tsx`)

**Purpose:** Create/edit modal for tasks. Replaces the current "no create flow" — today, tasks can only be added via mock data or `addTask` from store.

**Props:**
```typescript
interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: Task;                    // undefined = create mode; defined = edit mode
  categoryId?: string;            // target category for new tasks
}
```

**Internal state:** Local `useState` for form fields (title, description, priority, deadline, project selector). On save: calls `taskStore.addTask()` or `taskStore.updateTask()`.

**Composition:** Uses `<Dialog>` + `<DialogContent>` + `<DialogHeader>` + `<DialogFooter>` — same pattern as `CreateProductModal.tsx`.

**Product selector:** Dropdown populated from `useProductStore((s) => s.products)`. Sets `task.projectId` (and mirrors to `task.project` for legacy).

**Opens from:**
- `TaskKanban` column header "+" button (currently a no-op `<Button variant="ghost" size="xs"><Plus .../>`)
- `TaskKanban` card context menu (new — for edit/delete)
- `TaskManagementView` header "新建任务" button (if added)

### 2.2 ScheduleDialog (`src/components/ScheduleDialog.tsx`)

**Purpose:** Create/edit modal for schedule events.

**Props:**
```typescript
interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: ScheduleEvent;          // undefined = create; defined = edit
  presetDate?: { year: number; month: number; day: number };  // from calendar click
}
```

**Product/Task selectors:** Two dropdowns at the bottom. Setting a task auto-fills product. Setting a product filters task list.

**Opens from:**
- `ScheduleView` "+ 新建日程" button (currently a no-op `<Button>`)
- Calendar day cell click (creates event on that date)
- Event card click in agenda sidebar (edit mode)
- TaskDialog "安排到日历" button (cross-module action, creates event with `taskId` pre-filled)

### 2.3 TaskContextMenu (`src/components/TaskContextMenu.tsx`)

**Purpose:** Right-click / overflow menu on TaskKanban cards for edit/delete/schedule actions.

**Could alternatively be inline:** A "..." Button on each card that opens a `<DropdownMenu>` (Radix). This is more discoverable on desktop and follows the `Sidebar.tsx` menu pattern already in the codebase.

**Actions:**
- 编辑 (Edit) → opens TaskDialog in edit mode
- 标记完成 / 重新打开 → calls `completeTask` / `reopenTask`
- 安排到日历 → opens ScheduleDialog with `taskId` pre-filled
- 删除 → calls `deleteTask` with confirmation toast

### 2.4 AssociationBadge (`src/components/AssociationBadge.tsx`)

**Purpose:** Small badge on Task/ScheduleEvent cards showing linked entity. Clicking jumps to the linked entity.

**Usage:**
```tsx
{task.projectId && (
  <AssociationBadge
    type="product"
    label={productNames.get(task.projectId)}
    onClick={() => { setSelectedProductId(task.projectId); setActiveTab('product'); }}
  />
)}
{task.scheduledEventId && (
  <AssociationBadge type="event" label="已安排" onClick={() => jumpToEvent(task.scheduledEventId)} />
)}
```

**Note:** This could also be inlined directly into TaskKanban and ScheduleView rather than being a separate component. Decision: separate component if used in 3+ places; inline if only 1-2.

---

## 3. Modified Components

### 3.1 TaskKanban (`src/components/TaskKanban.tsx`)

**Changes:**
- Add `TaskContextMenu` to each card (replace or augment the click-to-expand behavior)
- Column header "+" button opens `TaskDialog` (currently no-op)
- Add `AssociationBadge` for linked product on each card
- Add "安排到日历" action in expanded card view (next to "标记完成" button)

**State additions:** `const [editingTask, setEditingTask] = useState<Task | undefined>()`, `const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)`.

### 3.2 ScheduleView (`src/views/ScheduleView.tsx`)

**Changes (significant — real calendar):**
- Replace hardcoded `daysInMonth = 31` / `firstDayOfMonth = 4` / `isToday = day === 15` with real date calculations from `currentYear`/`currentMonth` state
- Month navigation: CaretLeft/CaretRight buttons update `currentMonth`/`currentYear` (currently no-op)
- "今天" button resets to `new Date()` year/month
- Day cell click opens `ScheduleDialog` with `presetDate`
- Event card click opens `ScheduleDialog` in edit mode
- Add `AssociationBadge` for linked product/task on event cards
- `EVENT_COLORS` needs a `'task'` entry
- "+ 新建日程" button opens `ScheduleDialog` (currently no-op)

**State additions:** `const [currentYear, setCurrentYear] = useState(2025)`, `const [currentMonth, setCurrentMonth] = useState(7)`, `const [editingEvent, setEditingEvent] = useState<ScheduleEvent | undefined>()`.

### 3.3 AppContext.tsx (`src/store/AppContext.tsx`)

**Changes:**
- Extend `AppContextType` interface with new actions:
  - `updateTask`, `deleteTask`, `reopenTask`, `moveTask`
  - `updateEvent`, `deleteEvent`
- Subscribe to new store actions (e.g., `const updateTask = useTaskStore((s) => s.updateTask)`)
- Extend `deleteProductWrapped` to clear cross-module FKs:
  ```typescript
  const deleteProductWrapped = (id: string) => {
    // Clear task.projectId references
    useTaskStore.getState().categories.forEach(cat => {
      cat.tasks.forEach(task => {
        if (task.projectId === id) {
          useTaskStore.getState().updateTask(task.id, { projectId: undefined });
        }
      });
    });
    // Clear event.projectId references
    useScheduleStore.getState().events.forEach(event => {
      if (event.projectId === id) {
        useScheduleStore.getState().updateEvent(event.id, { projectId: undefined });
      }
    });
    deleteProduct(id);
    if (selectedProductId === id) setSelectedProductId(null);
  };
  ```
- Re-export new types if needed

### 3.4 StatsRow (`src/components/StatsRow.tsx`)

**Changes:** Currently shows static counts. Should reflect real task counts from `taskStore.categories` — total tasks, completed, in-progress. No structural change needed if it already reads from `useApp().categories`.

---

## 4. Cross-Store Patterns

### 4.1 Established Convention (from `rndStore.ts`)

```typescript
// Pattern: read from another store via getState() — NEVER call hooks inside store actions
const getProd = (productId: string): Product | null => {
  const products = useProductStore.getState().products;
  return products.find((p) => p.id === productId) ?? null;
};
```

This pattern is used 11 times in `rndStore.ts`. It works because Zustand stores are module-level singletons — `getState()` returns the current snapshot without React render cycle involvement.

### 4.2 Application to v0.2.0

**Task store reading product names (for display):**
```typescript
// In taskStore — DO NOT import productStore for type reasons.
// Instead, do cross-store lookups at the component level.
// The taskStore itself stays self-contained.
```

**Cross-module actions (schedule-to-calendar):**
```typescript
// This is an orchestration action. Two options:

// Option A: In the component (recommended for v0.2.0)
const handleScheduleToCalendar = (task: Task) => {
  const newEvent: ScheduleEvent = {
    id: `evt-${Date.now()}`,
    title: task.title,
    time: task.time || '全天',
    date: /* extracted from deadline */,
    type: 'task',
    location: '',
    taskId: task.id,
    projectId: task.projectId,
  };
  addEvent(newEvent);
  updateTask(task.id, { scheduledEventId: newEvent.id });
};

// Option B: In a store action (cleaner but introduces cross-store import)
// taskStore.ts would import useScheduleStore — creates a dependency.
// Rejected: violates the "stores are self-contained" principle.
```

**Recommendation:** Option A. Cross-module orchestration lives in the component or in AppContext's wrapper functions. Stores stay self-contained. This matches the existing pattern where `addProject` in AppContext (not productStore) calls `useRndStore.getState().initDeliverablesForProduct()`.

### 4.3 Delete Orphan Handling

**No cascade.** Per PROJECT.md: "弱关联优先,外键全部可选,删除不级联".

**Pattern for each delete:**
```typescript
deleteTask: (taskId) => set((state) => ({
  categories: state.categories.map((cat) => ({
    ...cat,
    tasks: cat.tasks.filter((t) => t.id !== taskId),
  })),
})),
// After: caller (component or AppContext wrapper) must clear scheduledEventId
// and clean up any ScheduleEvent.taskId === taskId.
```

**Orphan references are harmless:** A `ScheduleEvent.taskId` pointing to a deleted task simply renders as "已删除的任务" or hides the badge. No crash, no data corruption. This is the "weak association" guarantee.

### 4.4 "Schedule to Calendar" Action Location

**Question:** Where does this shared logic live?

| Option | Where | Pros | Cons |
|--------|-------|------|------|
| Component | `TaskKanban.tsx` inline | Simple, no new files, easy to understand | Duplicated if also needed elsewhere |
| AppContext wrapper | `deleteProductWrapped` pattern | Centralized, follows existing pattern | AppContext is already a large file |
| Utility function | `src/lib/taskScheduleBridge.ts` | Reusable, testable, clean | New file for one function |

**Recommendation:** Component-level for v0.2.0. If the same logic is needed in 3+ places, extract to a utility. The action is: `addEvent(newEvent)` + `updateTask(task.id, { scheduledEventId })`. Two store calls — trivial to inline.

---

## 5. Data Migration

### 5.1 Adding Optional Fields to Persisted Stores

**Current state:** Both `taskStore` and `scheduleStore` use `persist` with `version: 1`, `sqliteStorage`, and a no-op `migrate` function:

```typescript
migrate: (persisted, _version) => persisted as Partial<TaskState>,
```

**Strategy:** Bump `version` to `2` and implement the `migrate` function to add default values for new fields:

```typescript
// taskStore.ts
persist(
  (set, get) => ({ /* ... actions ... */ }),
  {
    name: 'nova-task',
    version: 2,  // bumped from 1
    storage: sqliteStorage,
    partialize: (s) => ({ categories: s.categories }),
    migrate: (persistedState, version) => {
      if (version < 2) {
        // Add optional FK fields to existing tasks
        return {
          ...persistedState,
          categories: (persistedState as any).categories.map((cat: any) => ({
            ...cat,
            tasks: cat.tasks.map((task: any) => ({
              ...task,
              projectId: task.projectId ?? undefined,
              scheduledEventId: task.scheduledEventId ?? undefined,
            })),
          })),
        };
      }
      return persistedState as Partial<TaskState>;
    },
    onRehydrateStorage: () => (state) => {
      state?._setHydrated();
    },
  },
)
```

**Same pattern for `scheduleStore`:** Bump to `version: 2`, add `month`, `year`, `projectId`, `taskId` defaults.

### 5.2 Migration Safety

**Key property:** Zustand's `persist` middleware only runs `migrate` when the stored `version` < config `version`. Users on `version: 1` (existing installs) get the migration. New users start at `version: 2` directly. No data loss.

**Rollback safety:** If we need to revert `version: 2` → `version: 1`, the extra fields are ignored by the old code (they're optional). No destructive migration needed.

### 5.3 Mock Data Updates

`INITIAL_CATEGORIES` in `mockTasks.ts` and `INITIAL_EVENTS` in `scheduleStore.ts` should be updated to include the new fields for consistency:

```typescript
// mockTasks.ts — existing mock tasks get projectId based on project name
{ ..., project: 'WenXiBuddy 2.0', projectId: 'product-1', ... }

// scheduleStore.ts — existing mock events get month/year
{ ..., date: 15, month: 4, year: 2025, ... }  // May 2025 (0-indexed)
```

This is not strictly required (the fields are optional), but it makes the calendar work correctly with mock data during development.

---

## 6. Suggested Build Order

### Phase 5: Task CRUD Completion (est. 1-2 days)

**Why first:** Task CRUD is self-contained within `taskStore` + `TaskKanban`. No cross-module dependencies. Unblocks the "task dialog" component that Phase 7 needs.

**Scope:**
1. Add `updateTask`, `deleteTask`, `reopenTask`, `moveTask` to `taskStore`
2. Bump persist `version` to 2, implement `migrate` to add `projectId?` and `scheduledEventId?`
3. Build `TaskDialog` component (create + edit mode)
4. Wire `TaskKanban` column "+" → TaskDialog
5. Add `TaskContextMenu` (or inline DropdownMenu) to each card
6. Extend `AppContext` with new task actions
7. Update `StatsRow` to reflect real counts

**Validation:** Can create, edit, delete, complete, reopen tasks from the kanban UI.

### Phase 6: Schedule CRUD + Real Calendar (est. 2-3 days)

**Why second:** Schedule CRUD is self-contained within `scheduleStore` + `ScheduleView`. Builds on the same Dialog patterns from Phase 5. The calendar rewrite is the largest single piece of UI work in v0.2.0.

**Scope:**
1. Add `updateEvent`, `deleteEvent` to `scheduleStore`
2. Add `currentYear`/`currentMonth` state to `scheduleStore` (or local to ScheduleView)
3. Bump persist `version` to 2, implement `migrate` to add `month?`, `year?`, `projectId?`, `taskId?`
4. Rewrite `ScheduleView` calendar grid to use real `Date` calculations
5. Wire month navigation (CaretLeft/CaretRight/今天)
6. Build `ScheduleDialog` component (create + edit mode)
7. Wire "+ 新建日程" → ScheduleDialog
8. Wire calendar day click → ScheduleDialog with presetDate
9. Add `EVENT_COLORS['task']` for task-type events
10. Extend `AppContext` with new schedule actions

**Validation:** Can navigate months, create/edit/delete events, see events on correct dates.

### Phase 7: Cross-Module Wiring (est. 1-2 days)

**Why last:** Depends on both Phase 5 (TaskDialog exists) and Phase 6 (ScheduleDialog exists). All work here is integration, not new CRUD.

**Scope:**
1. Add `AssociationBadge` component (or inline badges)
2. "安排到日历" action in TaskDialog/TaskKanban → opens ScheduleDialog with `taskId` pre-filled
3. Product selector in TaskDialog (sets `task.projectId` + mirrors `task.project`)
4. Product/Task selectors in ScheduleDialog
5. Extend `AppContext.deleteProductWrapped` to clear cross-module FKs
6. Show association badges on TaskKanban cards and ScheduleView events
7. Click badge → jump to linked entity (switch tab + set selection)
8. Delete confirmation UX: when deleting a product, show count of linked tasks/events
9. Handle orphan references gracefully (badge shows "已删除" for dead FK)

**Validation:** Full round-trip: create task → link to product → schedule to calendar → navigate to event from task badge → delete product → see FKs cleared.

### Build Order Rationale

```
Phase 5 (Task CRUD)
    │
    ├──→ Phase 7 (Cross-Module Wiring)
    │        ↑
Phase 6 (Schedule CRUD) ──┘
```

Phases 5 and 6 are independent and could theoretically be parallelized, but sequential is recommended because:
- Phase 6's calendar rewrite is the highest-risk UI work — do it with full attention
- Phase 7 naturally needs both Phase 5 and Phase 6 artifacts
- The Dialog patterns from Phase 5 can be directly reused in Phase 6

---

## 7. Anti-Patterns to Avoid

### 7.1 Store-to-Store Import Cycles

**Bad:** `taskStore.ts` imports `useScheduleStore` and vice versa.
**Good:** Cross-store orchestration in components or AppContext wrappers.

### 7.2 Cascade Delete

**Bad:** `deleteProduct` also deletes all tasks/events with that projectId.
**Good:** Clear the FK, keep the task/event. User explicitly chose to delete the product — they may want to keep the tasks.

### 7.3 Normalizing Associations Into a Separate Table/Store

**Bad:** Creating a `taskEventAssociations` store or SQLite table.
**Good:** Optional FKs directly on `Task` and `ScheduleEvent`. The Zustand shape is the source of truth.

### 7.4 Replacing `task.project: string` With `task.projectId: string`

**Bad:** Removing `project` field, updating all consumers, breaking AppContext.
**Good:** Keep `project` for display. Add `projectId` for linking. Mirror both on save.

### 7.5 Putting "Schedule to Calendar" Logic in a Store

**Bad:** Adding `scheduleTask` action to `taskStore` that calls `useScheduleStore.getState().addEvent(...)`.
**Good:** Component calls both `addEvent()` and `updateTask()` sequentially. Two trivial store calls.

### 7.6 Hardcoding Calendar Math

**Bad:** `new Date(year, month, 1).getDay()` computed inline in JSX.
**Good:** Extract to a `useCalendarDays(year, month)` hook or a `getCalendarGrid(year, month)` utility. The calendar grid logic (42 cells, leading/trailing days from adjacent months) is non-trivial and deserves its own function.

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ScheduleView calendar rewrite is large | Phase 6 takes longer than estimated | Extract calendar grid to a `CalendarGrid` sub-component early; test with mock events before wiring Dialog |
| `persist` migration runs on every hydration | Performance concern if migration function is heavy | Migration only runs when `version < current`. Once migrated, it's a no-op. |
| AppContext grows too large | Harder to maintain | Acceptable for v0.2.0. Full AppContext removal is "下下里程碑" per PROJECT.md. |
| Orphan FKs create confusing UI | User sees "已删除的项目" badge | Make orphan badges visually distinct (muted style) and provide a "clear link" action |
| `date: number` + `month?` + `year?` dual model | Confusing during transition | Document clearly: `date` = day of month (legacy), `month`/`year` = full date context (new). Calendar reads all three. |

---

## Sources

- Existing codebase patterns in `taskStore.ts`, `scheduleStore.ts`, `productStore.ts`, `AppContext.tsx`, `rndStore.ts` — HIGH confidence
- Zustand `persist` middleware documentation (migrate function semantics) — HIGH confidence
- PROJECT.md Key Decisions table (weak association, legacy field retention) — HIGH confidence
- ARCHITECTURE.md Phase A persistence research (JSON-blob pattern, `sqliteStorage` adapter) — HIGH confidence

---
*Architecture research for: Nova-PM-Workspace — v0.2.0 Task/Schedule CRUD + Cross-Module Wiring*
*Researched: 2026-08-10*
