# PITFALLS — Task/Schedule CRUD + Cross-Module Wiring

**Milestone:** v0.2.0 日常管理 CRUD + 弱关联
**Researched:** 2026-08-10
**Context:** Adding CRUD completions and cross-module wiring to 6 existing Zustand stores with SQLite persistence, legacy AppContext.tsx layer, and dual-field association model.

---

## Store / Persistence Pitfalls

### P1: ScheduleEvent.date is Day-of-Month Integer, Not a Real Date
**Risk:** CRITICAL — CRUD makes this unsalvageable
**Current state:** `ScheduleEvent.date: number` is a hardcoded day-of-month (e.g. `15`). ScheduleView hardcodes `daysInMonth = 31`, `firstDayOfMonth = 4`, `isToday = day === 15`. Month/year labels are static strings.
**What goes wrong:** The moment a user creates an event for "June 3rd" while viewing May, the integer `3` is meaningless without month context. Edit/delete operations cannot target events across months. Month navigation is impossible.
**Prevention:**
1. Replace `date: number` with `date: string` (ISO date `2025-05-15`) in the `ScheduleEvent` interface
2. Write a `migrate` function for `version: 2` that converts old `{ date: 15 }` → `{ date: '2025-05-15' }` (assume current mock month)
3. ScheduleView must compute `daysInMonth(year, month)` and `firstDayOfMonth(year, month)` from `Date` math, never hardcode
4. **Accept that INITIAL_EVENTS mock data must also be updated to ISO dates**
**Phase to Address:** Phase 6 (Schedule CRUD) — this is a blocker, not an enhancement

### P2: Task Deletion Requires Scanning Nested Category Structure
**Risk:** HIGH — O(n*m) scan or silent no-op
**Current state:** Tasks live inside `categories[].tasks[]`. There is no flat task index. `completeTask` works by scanning all categories.
**What goes wrong:** `deleteTask(taskId)` must scan all categories to find the parent. If a task ID somehow exists in multiple categories (ID collision — see P3), only the first match gets deleted. Performance degrades with many categories/tasks.
**Prevention:**
1. Add a helper `findTaskCategory(taskId): TaskCategory | undefined` that returns the parent category
2. `deleteTask` uses this helper then filters: `cat.tasks.filter(t => t.id !== taskId)`
3. Alternatively, maintain a `Map<taskId, categoryId>` index (but this creates a second source of truth — prefer the scan for now given data volume is low)
4. **Critical: addTask already has dedup (`some(t => t.id === newTask.id)`). Delete must be equally defensive.**
**Phase to Address:** Phase 5 (Task CRUD)

### P3: Date.now() ID Generation Risks Collision
**Risk:** MEDIUM — not theoretical, `Date.now()` is millisecond-resolution
**Current state:** Every ID generator in the codebase uses `Date.now()` (category IDs, product IDs, task IDs, event IDs, document IDs). No `crypto.randomUUID()` or `nanoid`.
**What goes wrong:** Rapid operations (double-click create, batch "schedule to calendar") produce identical timestamps → duplicate IDs → `addTask` dedup silently drops the second item → user thinks their action failed.
**Prevention:**
1. Replace `Date.now()` with `crypto.randomUUID()` for all new ID generation (available in Tauri WebView2/WKWebView/WebKitGTK)
2. For backward compatibility with existing IDs (e.g. `WXB-2025-001`), only change the generator for NEW entities; existing IDs stay as-is
3. Add a `generateId(prefix?: string)` utility in `src/lib/utils.ts` that all stores call
4. **Fallback:** If worried about WebView compatibility, use `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
**Phase to Address:** Phase 5 (Task CRUD) — fix the task ID generator first, then propagate to Phase 6

### P4: SQLite Persistence is Full-Blob JSON, Not Row-Level
**Risk:** MEDIUM — data loss window on crash
**Current state:** `sqliteStorage` stores each Zustand store as a single JSON blob in `kv_store` (one row per store: `nova-task`, `nova-schedule`, etc.). Every `set()` → `setItem()` → `INSERT OR REPLACE` serializes the entire store.
**What goes wrong:** If the app crashes mid-serialization after a complex multi-field update (e.g. updateTask + linkToSchedule), the blob may be partially written. On restart, the last successful blob is loaded. No transaction across stores.
**Prevention:**
1. Accept this as a known limitation for v0.2.0 (the risk is low for single-user desktop app)
2. Do NOT attempt optimistic update + rollback — it adds complexity for negligible user impact
3. **DO** ensure each CRUD action completes its `set()` atomically — never split a logical operation across multiple `set()` calls (see P11)
4. Future: if data volume grows, migrate from kv_store to per-entity tables
**Phase to Address:** All phases — this is a design constraint to respect, not fix

### P5: Migration Function is a Passthrough No-Op
**Risk:** HIGH — new fields silently missing from persisted data
**Current state:** All 6 stores have `migrate: (persisted, _version) => persisted as Partial<ScheduleState>`. Version is `1` everywhere.
**What goes wrong:** When Phase 5 adds `task.projectId?` and Phase 6 changes `scheduleEvent.date: string`, persisted data from v0.1.0 won't have these fields. The passthrough `migrate` returns old data as-is. Code that reads `task.projectId` gets `undefined`, which is "fine" because it's optional, but ScheduleView will crash if it tries to call `.split('-')` on a `number`.
**Prevention:**
1. **Bump `version: 2` in stores that change shape** and write real `migrate` functions:
   ```ts
   migrate: (persisted, version) => {
     if (version < 2) {
       // Convert ScheduleEvent.date from number to ISO string
       return {
         ...persisted,
         events: (persisted.events || []).map(e => ({
           ...e,
           date: typeof e.date === 'number' ? `2025-05-${String(e.date).padStart(2, '0')}` : e.date,
         })),
       };
     }
     return persisted;
   }
   ```
2. **Task store version bump** — add `projectId` default:
   ```ts
   migrate: (persisted, version) => {
     if (version < 2) {
       return {
         ...persisted,
         categories: (persisted.categories || []).map(cat => ({
           ...cat,
           tasks: cat.tasks.map(t => ({ ...t, projectId: undefined, scheduledEventId: undefined })),
         })),
       };
     }
     return persisted;
   }
   ```
3. **Test migration** by manually editing the SQLite `kv_store` to remove new fields, then verifying reload
**Phase to Address:** Phase 5 (task migration) and Phase 6 (schedule migration) — each phase bumps its own store version

### P6: Partialize Must Exclude Ephemeral UI State
**Risk:** LOW — already handled correctly in uiStore, but risk in new stores
**Current state:** `uiStore.partialize` correctly excludes `isSearchOpen`, `isNewTaskOpen`. Task/schedule stores partialize only domain data.
**What goes wrong:** If a new CRUD dialog component puts its form state into a store (instead of local `useState`), that state gets persisted. On reload, a half-filled edit form reappears.
**Prevention:**
1. **Enforce rule:** All dialog/modal form state stays in `useState` local to the component. NEVER put form drafts into Zustand stores.
2. If a store must track "currently editing" state (e.g. `editingTaskId`), put it in `uiStore` and exclude it from `partialize`
3. Add a code review checklist item: "Does this store's `partialize` only include persisted domain data?"
**Phase to Address:** Phase 5 — establish the pattern early

---

## Cross-Module Pitfalls

### P7: Delete Product Leaves Orphaned References in Task/Schedule
**Risk:** HIGH — user-visible broken state
**Current state:** `productStore.deleteProduct(id)` removes the product. `AppContext.deleteProductWrapped` also clears `selectedProductId`. But tasks with `project: 'ProductName'` or `projectId: 'abc'` are untouched.
**What goes wrong:** After deleting "WenXiBuddy 2.0":
- Tasks still show `project: 'WenXiBuddy 2.0'` (the legacy string field)
- Task badges with `projectId: 'abc'` point to a non-existent product
- Clicking the badge → navigation to nowhere / crash
- `getProjectTaskCount('abc')` returns 0 (correct but confusing — the tasks still exist)
**Prevention:**
1. **Decision already made:** weak association — delete product = warning toast + keep records + clear `projectId` fields
2. **Implementation:** `deleteProductWrapped` must also:
   - Clear `task.projectId` for all tasks where `task.projectId === deletedId`
   - Clear `event.projectId` for all events where `event.projectId === deletedId`
   - Clear `event.taskId` for events whose task's `projectId` was cleared
3. **Do NOT clear `task.project` (legacy string)** — this is intentional per design decision. But document this asymmetry clearly in the code.
4. **Toast message:** "产品已删除。相关任务和日程已保留但取消关联。" — explicit about what happened
5. **Edge case:** If a task has `project: 'WenXiBuddy 2.0'` AND `projectId: 'abc'`, after deletion: `project` stays `'WenXiBuddy 2.0'`, `projectId` becomes `undefined`. The display must handle this — show `task.project` (legacy name) but no clickable badge.
**Phase to Address:** Phase 7 (Cross-module wiring) — requires all three stores to have CRUD first

### P8: Bidirectional Link Inconsistency (task.scheduledEventId ↔ event.taskId)
**Risk:** HIGH — one-way links confuse users
**Current state:** Design calls for `task.scheduledEventId?` ↔ `event.taskId?` bidirectional reference.
**What goes wrong:** If "schedule to calendar" only sets `task.scheduledEventId` but forgets `event.taskId` (or vice versa), the link is one-way. The task shows "has schedule" badge but clicking it goes nowhere. The event shows "linked task" but the task doesn't know about it.
**Prevention:**
1. Create a single `linkTaskToSchedule(taskId, eventId)` helper function that sets BOTH sides atomically in one `set()` call (or as close as possible given separate stores)
2. Similarly, `unlinkTaskFromSchedule(taskId)` clears BOTH sides
3. **Never set one side without the other** — enforce via code review / shared utility
4. **Race condition mitigation:** Call `useTaskStore.getState()` and `useScheduleStore.getState()` from a single action function, not from a React component that might re-render between calls
**Phase to Address:** Phase 7 (Cross-module wiring)

### P9: Cross-Store Reads During Write Can See Stale State
**Risk:** MEDIUM — subtle inconsistency
**Current state:** Stores are independent Zustand instances. `useTaskStore.getState()` returns current state, but if called during a `useScheduleStore` `set()` callback, it may or may not reflect the latest task state depending on call order.
**What goes wrong:** Example: `deleteProduct` triggers a cascade that reads tasks to find linked events. If the task store's state is being written simultaneously (e.g. user also completing a task), the cascade may read stale data.
**Prevention:**
1. **Never nest store writes** — if action A needs to update store X and store Y, call them sequentially in the same synchronous function, not inside each other's `set()` callbacks
2. Use `getState()` for cross-store reads (not hooks — hooks are for components)
3. For the delete-product cascade: compute the full list of affected task/event IDs first (read), then apply all writes. Do not interleave reads and writes.
4. **This is sufficient for v0.2.0** — true transactions are overkill for a single-user desktop app
**Phase to Address:** Phase 7 — but be aware from Phase 5 onward

### P10: getProjectTaskCount Matches on Name OR Category Name
**Risk:** MEDIUM — false positive counts
**Current state:**
```ts
getProjectTaskCount: (projectIdOrName) => {
  // matches task.project === projectIdOrName OR cat.name === projectIdOrName
}
```
**What goes wrong:** If a product is named "需求评审" (same as a category name), ALL tasks in that category are counted as belonging to the product. Adding `projectId` matching creates a third match dimension.
**Prevention:**
1. **Deprecate `getProjectTaskCount`'s `cat.name` fallback** — it was a hack for the mock data era
2. New version: `getProjectTaskCount(productId: string)` matches ONLY `task.projectId === productId`
3. Keep old behavior behind a `legacyName?: string` parameter if backward compat is needed
4. **Or** rename to `getProjectTaskCountById` and create a separate `getCategoryTaskCount`
**Phase to Address:** Phase 5 (Task CRUD) — clean up when adding `projectId`

### P11: "Schedule to Calendar" Must Be Atomic Across Two Stores
**Risk:** HIGH — partial state is confusing
**Current state:** Creating a ScheduleEvent from a Task requires: (a) creating the event in scheduleStore, (b) setting `task.scheduledEventId` in taskStore. These are separate stores.
**What goes wrong:** If (a) succeeds but (b) fails (or vice versa), the user sees half the link. The task doesn't show "scheduled" badge, or the event appears without a task reference.
**Prevention:**
1. Implement as a single exported function `scheduleTask(taskId: string, eventData: Omit<ScheduleEvent, 'id' | 'taskId'>)` that:
   - Generates event ID
   - Calls `useScheduleStore.getState().addEvent({ ...eventData, taskId })`
   - Calls `useTaskStore.getState().updateTask(taskId, { scheduledEventId: eventId })`
   - Both calls are synchronous — Zustand `set()` is synchronous
2. **Wrap in try/catch** — if the second call fails (shouldn't, but defensive), rollback the first
3. **Do NOT use async/await between the two calls** — keeps the operation atomic
**Phase to Address:** Phase 7 (Cross-module wiring)

---

## UI / UX Pitfalls

### P12: Hydration Race Condition — Components Render Before SQLite Data Loads
**Risk:** HIGH — flash of initial mock data then replacement
**Current state:** `_hasHydrated` / `_setHydrated` pattern exists but is rarely consumed by views. Components render with `INITIAL_EVENTS` / `INITIAL_CATEGORIES` until SQLite data replaces them.
**What goes wrong:** After adding CRUD, a user creates a task → sees success toast → reloads → briefly sees INITIAL_CATEGORIES (without the new task) → then SQLite hydrates and the task appears. This "flash" is jarring and undermines trust in persistence.
**Prevention:**
1. **Add hydration guard to views** — render a `<Skeleton />` or `<ViewLoading />` until `_hasHydrated` is true:
   ```tsx
   const hasHydrated = useTaskStore((s) => s._hasHydrated);
   if (!hasHydrated) return <ViewLoading />;
   ```
2. **Alternatively**, suppress `INITIAL_EVENTS` / `INITIAL_CATEGORIES` when persisted data exists — the `persist` middleware handles this, but only if the storage read completes before first render (which async SQLite cannot guarantee)
3. **Accept the flash for v0.2.0** if it's < 100ms — but measure and set a budget
**Phase to Address:** Phase 5 (Task CRUD) — establish the pattern for all views

### P13: Edit Dialog Shows Stale Data If Re-Opened Without Reset
**Risk:** MEDIUM — confusing form state
**Current state:** No edit dialog exists yet. When Phase 5/6 adds `<TaskEditDialog>` and `<ScheduleEventDialog>`, they'll need to handle open/close cycles.
**What goes wrong:** User opens edit dialog for Task A → changes title to "Foo" → cancels → opens dialog for Task B → sees "Foo" in the title field because form state wasn't reset.
**Prevention:**
1. **Always reset form state in `onOpenChange`** — use `useEffect` keyed on dialog `open` state:
   ```tsx
   useEffect(() => {
     if (open && task) {
       setTitle(task.title);
       // ... reset all fields
     }
   }, [open, task]);
   ```
2. **Use `key={task.id}`** on the dialog component to force remount when editing a different entity
3. **Never use uncontrolled form inputs** with Zustand-derived default values
**Phase to Address:** Phase 5 (Task CRUD dialog) — establish pattern, reuse in Phase 6

### P14: Optimistic Delete Visual Reverts
**Risk:** LOW-MEDIUM — SQLite is fast but async
**Current state:** `sqliteStorage.setItem` is async. After `deleteTask()`, the Zustand state updates instantly (UI reflects deletion), but the SQLite write happens in the background.
**What goes wrong:** In theory, if the SQLite write fails (disk full, DB locked), the next reload shows the "deleted" task reappearing. User thinks delete didn't work.
**Prevention:**
1. **Do not over-engineer:** For v0.2.0, SQLite writes are near-instant on local disk. Accept this risk.
2. **Add error logging** in `sqliteStorage.setItem` — if it fails, log to `console.error` so debugging is possible
3. **Do NOT show "undo" toasts** unless you implement proper undo state management (too complex for v0.2.0)
4. **Future:** If write failures become observable, add a write-queue with retry
**Phase to Address:** All phases — awareness only

### P15: Kanban Date View Grouping Breaks Without Deadline Time Component
**Risk:** LOW — edge case
**Current state:** `TaskKanban` date view splits `task.deadline` by space: `task.deadline.split(' ')[0]`. Mock deadlines are `'2025-05-24 18:00'` format.
**What goes wrong:** If CRUD allows creating tasks with date-only deadlines (`'2025-05-24'` without time), the `split(' ')[0]` still works. But if deadline is empty or in a different format (`'May 24, 2025'`), grouping breaks.
**Prevention:**
1. Standardize deadline format as ISO date string (`'2025-05-24'`) — drop the time component from deadlines (use `time` field for time-of-day)
2. Add defensive parsing: `const dateStr = task.deadline ? task.deadline.slice(0, 10) : '无截止日期'`
3. Validate deadline format in the task creation/edit dialog
**Phase to Address:** Phase 5 (Task CRUD) — establish the format in the dialog

### P16: AppContext `setCategories` / `setEvents` are Cast to `any`
**Risk:** MEDIUM — TypeScript won't catch incorrect usage
**Current state:**
```ts
setCategories: setCategories as any,
setEvents: setEvents as any,
```
These are `Dispatch<SetStateAction<...>>` from Zustand's `set` but exposed as React-style dispatchers via `as any`.
**What goes wrong:** When new CRUD actions are added to AppContext (updateTask, deleteTask, etc.), developers might follow the `as any` pattern instead of properly typing them. Type errors silently swallowed.
**Prevention:**
1. **Do NOT add new actions to AppContext** — new CRUD actions should be accessed via direct store hooks (`useTaskStore()`, `useScheduleStore()`)
2. If AppContext MUST be extended (for backward compat), add proper types, not `as any`
3. **Plan to remove `as any` casts** as views migrate to direct store access
**Phase to Address:** Phase 5 — establish the "no new AppContext actions" convention

---

## Migration Pitfalls

### P17: task.project (Name) vs task.projectId (ID) Dual-Field Confusion
**Risk:** HIGH — the single most confusing aspect for developers
**Current state:** `Task.project: string` stores the product NAME (e.g. `'WenXiBuddy 2.0'`). New `Task.projectId?: string` will store the product ID (e.g. `'p-1234'`).
**What goes wrong:**
- Components display `task.project` but need `task.projectId` for navigation → two lookups
- Filtering by product: which field to match? Code that checks `task.project === productName` won't find tasks matched by `projectId`
- Editing a task: if user changes product association, which field(s) to update?
- Deleting a product: `task.project` (name string) is NOT cleared but `task.projectId` IS cleared → inconsistent
**Prevention:**
1. **Establish clear precedence rule:** `projectId` is authoritative for linking. `project` (name) is a denormalized display cache for legacy tasks without `projectId`.
2. **Display logic:**
   ```tsx
   // Preferred: resolve name from projectId
   const product = useProductStore(s => s.products.find(p => p.id === task.projectId));
   const displayName = product?.name || task.project || '未关联';
   ```
3. **Write a helper `getTaskProductDisplay(task): string`** in a shared utility — do not inline this logic in every component
4. **Create task:** if user selects a product, set BOTH `project: product.name` AND `projectId: product.id`. If no product selected: `project: ''` and `projectId: undefined`.
5. **Document this in CLAUDE.md** — it WILL confuse new developers
**Phase to Address:** Phase 5 (Task CRUD) — document and implement the convention early

### P18: No Rollback / Undo for Delete Operations
**Risk:** MEDIUM — user frustration
**Current state:** `deleteProduct` shows a warning toast before deleting (per design decision). But delete is immediate and permanent.
**What goes wrong:** User accidentally deletes a product with 20 linked tasks → all associations cleared → no way to recover without manually re-linking each task.
**Prevention:**
1. **For v0.2.0:** Accept this as a known limitation. The warning toast is sufficient.
2. **UX improvement:** Toast after delete should say "产品已删除 (Ctrl+Z 撤销)" — but only implement if undo stack is feasible
3. **Simpler alternative:** "Soft delete" — mark product as `deleted: true` instead of removing it. Show in a "回收站" view. This is a v0.3+ feature.
4. **Do NOT implement undo stack in v0.2.0** — scope creep
**Phase to Address:** Phase 7 (Cross-module) — at minimum, make the delete-product cascade message very clear

### P19: "Schedule to Calendar" Semantics Are Underspecified
**Risk:** MEDIUM — design ambiguity leads to inconsistent implementation
**Current state:** Design says "task → create ScheduleEvent with taskId back-reference." But key questions remain:
- Is the event a **copy** of the task or a **reference**? (Answer: reference)
- If the task's deadline changes, does the event auto-update? (Answer: probably not for v0.2.0, but users expect it)
- If the event is deleted, does the task's `scheduledEventId` get cleared? (Answer: yes)
- Can one task have multiple schedule events? (Answer: no, `scheduledEventId` is singular)
**Prevention:**
1. **Document the semantics explicitly** in PROJECT.md or a design doc:
   - "Schedule to calendar" creates a new event with `type: 'task'`, pre-filled from task title/deadline
   - Event and task are linked bidirectionally
   - Deleting the event clears `task.scheduledEventId`
   - Deleting the task clears `event.taskId` and optionally removes the event
   - Editing task deadline does NOT auto-update event (v0.2.0 — manual re-link)
2. **Add a "unschedule" action** on the task (clears link without deleting either)
3. **Show clear visual indicators** — badge on task showing "已安排到 5月15日", badge on event showing "关联任务: WXB-2025-001"
**Phase to Address:** Phase 7 (Cross-module wiring)

### P20: ScheduleView Calendar Computation Must Handle Real Dates
**Risk:** HIGH — current implementation is entirely hardcoded
**Current state:** `daysInMonth = 31`, `firstDayOfMonth = 4`, year/month are string literals. This works for the May 2025 mock but fails for any other month.
**What goes wrong:** Month navigation (prev/next buttons) cannot work without computing actual calendar data. Event placement on wrong days. Weekend detection impossible.
**Prevention:**
1. Maintain `currentMonth: Date` (or `{ year: number, month: number }`) in component state
2. Use `new Date(year, month + 1, 0).getDate()` for days in month
3. Use `new Date(year, month, 1).getDay()` for first day of week
4. Event filtering: parse ISO date string and match year/month, then place on correct day cell
5. **Consider extracting calendar math into a utility** (`src/lib/calendar.ts`) — this logic is reused if week view is added
**Phase to Address:** Phase 6 (Schedule CRUD) — this is a prerequisite for real calendar

### P21: Batch "Schedule Multiple Tasks" Has No UI Pattern
**Risk:** LOW — but worth noting for Phase 7 design
**Current state:** No batch operation pattern exists in the codebase.
**What goes wrong:** If a user wants to schedule 5 tasks to the same day, they must "schedule to calendar" 5 times individually. Tedious.
**Prevention:**
1. **For v0.2.0:** Single-task "schedule to calendar" is sufficient. Document as future enhancement.
2. **If implemented:** Add multi-select to TaskKanban (checkbox on each card) → batch action bar → "安排到日历" creates N events
3. **Ensure `scheduleTask` helper (from P11) is called in a loop** — do not try to batch store writes
**Phase to Address:** Phase 7 (nice-to-have, not blocking)

---

## Phase-to-Pitfall Mapping

| Phase | Pitfalls Addressed | Notes |
|-------|--------------------|-------|
| **Phase 5: Task CRUD** | P2, P3, P5 (task migration), P6, P10, P12, P13, P15, P16, P17 | Foundation phase — establishes patterns for all others |
| **Phase 6: Schedule CRUD** | P1, P5 (schedule migration), P20 | Calendar computation is the hardest part |
| **Phase 7: Cross-module** | P7, P8, P9, P11, P18, P19, P21 | Wire-up phase — depends on Phase 5+6 being solid |
| **All phases** | P4, P14 | Design constraints to respect, not fix |

## Quality Checklist

- [x] Pitfalls specific to adding CRUD to existing persistent stores — P1 through P6
- [x] Integration pitfalls covered (cross-module wiring risks) — P7 through P11
- [x] UI/UX pitfalls covered — P12 through P16
- [x] Migration pitfalls covered — P17 through P21
- [x] Prevention is actionable (specific code patterns, not "be careful")
- [x] Each pitfall mapped to the phase that should address it
- [x] Risk levels assigned (CRITICAL / HIGH / MEDIUM / LOW)
