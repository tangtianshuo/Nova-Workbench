# SUMMARY — v0.2.0 Task/Schedule CRUD + Cross-Module Wiring

**Milestone scope:** Complete CRUD for `taskStore` and `scheduleStore`, replace hardcoded calendar with real month navigation, wire weak cross-module associations (Product ↔ Task ↔ ScheduleEvent).

**Research date:** 2026-08-10 | **Overall confidence:** HIGH

---

## 1. Stack Additions

### Install (4 packages, ~15KB gzipped total)

| Package | Why | Version |
|---------|-----|---------|
| `date-fns` | Tree-shakeable date math for real calendar | ^4.4.0 |
| `@dnd-kit/core` | Kanban drag-and-drop between columns | ^6.3.1 (legacy line) |
| `@dnd-kit/sortable` | Cross-container sortable for Kanban | ^5.3.0 |
| `@dnd-kit/utilities` | Peer dep of above | bundled |

React 19 compat: `@dnd-kit/core@6.3.1` works with React 19 in practice. Use `--legacy-peer-deps` if npm complains.

### Do NOT add

No form library, no Immer, no calendar library, no react-router, no TanStack Query, no test runner.

---

## 2. Feature Scope

### Table stakes (must have)

- Task edit, delete with confirmation, reopen (un-complete), reassign category
- Schedule event edit, delete with confirmation, creation dialog with DatePickerInput
- **Real month navigation** — replace hardcoded `daysInMonth=31, firstDayOfMonth=4, isToday=day===15`
- **ScheduleEvent.date model fix** — migrate from `date: number` to `date: string` (YYYY-MM-DD)
- Keyboard basics: Escape closes dialogs, Delete triggers delete flow

### Differentiators

- **“安排到日历”** — one-click task→event conversion with bidirectional weak refs
- **Relation badges** — visual pills on task cards and calendar events showing linked product/event
- **Smart delete** — orphan awareness when deleting a product

### Anti-features (deferred to v0.3+)

Cascade delete, DnD kanban reordering, calendar week view, recurring tasks/events, subtasks/nesting, templates, bulk operations, full-text search, URL routing/deep links, real user management

---

## 3. Architecture Integration

### Build order (3 phases, sequential)

```
Phase 5: Task CRUD (1-2d)  →  Phase 6: Schedule CRUD + Real Calendar (2-3d)  →  Phase 7: Cross-Module Wiring (1-2d)
```

**Phase 5 — Task CRUD** (self-contained, establishes patterns)
- Add `updateTask`, `deleteTask`, `reopenTask`, `moveTask` to taskStore
- Bump persist `version: 2`, add `projectId?` / `scheduledEventId?` via migrate
- Build TaskDialog (create + edit mode), wire Kanban column "+" and card context menu
- Fix ID generation: replace `Date.now()` with `crypto.randomUUID()` (P3)
- Add hydration guard to TaskKanban (P12)
- Clean up `getProjectTaskCount` to match by ID only (P10)

**Phase 6 — Schedule CRUD + Real Calendar** (highest-risk UI work)
- Add `updateEvent`, `deleteEvent` to scheduleStore
- **Critical: migrate `ScheduleEvent.date` from `number` to `string`** (P1/P20 — blocker)
- Bump persist `version: 2`, add `month?` / `year?` / `projectId?` / `taskId?`
- Rewrite ScheduleView calendar grid: real Date math, month navigation
- Build ScheduleDialog (create + edit mode)
- Extract calendar grid computation to utility/hook (P20)

**Phase 7 — Cross-Module Wiring** (integration only, no new CRUD)
- “安排到日历” button: creates event + sets bidirectional refs atomically (P11)
- Relation badges on task cards and calendar events with click-to-navigate
- Extend `deleteProductWrapped` to clear cross-module FKs (P7)
- Single `linkTaskToSchedule` / `unlinkTaskFromSchedule` helper (P8)
- Handle orphan references gracefully

### Key architectural decisions

- **Cross-module refs = optional FKs on data types**, not a separate association table
- **No cascade delete.** Delete product → clear FKs, keep tasks/events
- **Cross-store orchestration in components or AppContext wrappers**, not in stores
- **`task.project` (legacy name) retained** alongside new `task.projectId`. `projectId` authoritative for linking
- **Dialog form state stays in local `useState`**, never in Zustand stores

---

## 4. Watch Out For

### CRITICAL

| ID | Pitfall | Phase | Prevention |
|----|---------|-------|------------|
| P1 | `ScheduleEvent.date: number` is day-of-month, not a real date. Month navigation impossible. | 6 | Migrate to `date: string` (YYYY-MM-DD) + real Date math |

### HIGH

| ID | Pitfall | Phase | Prevention |
|----|---------|-------|------------|
| P2 | Task deletion scans nested `categories[].tasks[]` — O(n*m) or silent no-op | 5 | Add `findTaskCategory(taskId)` helper |
| P3 | `Date.now()` ID collision on rapid operations | 5 | Replace with `crypto.randomUUID()` |
| P5 | Migration function is passthrough no-op — new fields missing from persisted data | 5,6 | Bump `version: 2`, write real `migrate` functions |
| P7 | Delete product leaves orphaned `projectId` references | 7 | `deleteProductWrapped` clears FKs across stores |
| P8 | Bidirectional link inconsistency — one-way refs confuse users | 7 | Single `linkTaskToSchedule` helper sets BOTH sides |
| P11 | “安排到日历” must be atomic across two stores | 7 | Single exported function, both `set()` calls synchronous |
| P12 | Hydration race — flash of mock data before SQLite loads | 5 | Render `<ViewLoading />` until `_hasHydrated` is true |
| P17 | `task.project` (name) vs `task.projectId` (ID) dual-field confusion | 5 | `projectId` authoritative, `project` display cache. Shared helper |
| P20 | ScheduleView calendar entirely hardcoded | 6 | Extract `useCalendarDays(year, month)` hook or utility |

### MEDIUM

| ID | Pitfall | Phase | Prevention |
|----|---------|-------|------------|
| P10 | `getProjectTaskCount` matches on name OR category name | 5 | Match by `projectId` only |
| P13 | Edit dialog shows stale data if re-opened without reset | 5 | Reset form in `useEffect` keyed on `open` |
| P16 | AppContext casts to `any` — type errors swallowed | 5 | New CRUD actions via direct store hooks, not AppContext |
| P19 | “安排到日历” semantics underspecified | 7 | Document: reference not copy, no auto-sync in v0.2.0 |

---

## 5. Key Decisions for Requirements

These need explicit scoping before implementation:

1. **ScheduleEvent.date migration strategy** — STACK recommends full `date: string` replacement; ARCHITECTURE recommends additive `month?`/`year?` alongside existing `date: number`. **Decision needed:** which approach?
2. **Task edit UX** — inline in expanded card vs separate TaskDialog modal. Features recommends inline; Architecture specifies separate Dialog. **Decision needed.**
3. **DnD for Kanban** — STACK includes `@dnd-kit`; Features lists DnD as deferred anti-feature. **Decision needed:** is DnD in v0.2.0? (Recommendation: defer DnD, use category selector in edit dialog.)
4. **`task.project` legacy field** — PROJECT.md says defer removal. **Confirmation needed:** keep dual-field, add `getTaskProductDisplay()` helper.
5. **AppContext extension vs direct store access** — PITFALLS says do NOT add new AppContext actions (P16). Architecture says extend `deleteProductWrapped`. **Decision needed:** new CRUD via direct store hooks, cross-store orchestration in AppContext?
6. **Delete confirmation UX** — no undo stack in v0.2.0, just confirmation dialogs?

---

## Sources

- **STACK:** date-fns 4.4.0, @dnd-kit/core 6.3.1 — npmjs.com, dndkit.com, Reddit
- **FEATURES:** Linear, Notion, Asana, Todoist docs and UI patterns (2025-2026)
- **ARCHITECTURE:** Existing codebase patterns in taskStore, scheduleStore, productStore, AppContext, rndStore
- **PITFALLS:** 21 identified risks across store/persistence, cross-module, UI/UX, migration

---

*Synthesized: 2026-08-10 | For: v0.2.0 requirements and roadmap*
