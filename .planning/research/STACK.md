# Stack Research — v0.2.0 CRUD Completion + Cross-module Wiring

**Domain:** Task/Schedule CRUD completion, real calendar, Kanban drag-and-drop, cross-module weak associations.
**Researched:** 2026-08-10
**Confidence:** HIGH — all recommendations are for well-established, stable packages or zero-dep patterns already proven in the codebase.

**Scope boundary:** Only what's NEW for CRUD completion. React 19 / Vite 6 / Tailwind v4 / Zustand 5 / Radix / Tauri v2 / motion 12 / Phosphor icons are already validated — DO NOT re-research.

---

## Packages to Add

### 1. `date-fns` ^4.4.0

| Field | Detail |
|-------|--------|
| **Why needed** | ScheduleView calendar is hardcoded to May 2025 (`const daysInMonth = 31; const firstDayOfMonth = 4`). Month navigation, real date math, and relative formatting ("今天"/"明天"/"3天后") require a date library. |
| **Why date-fns** | Tree-shakeable (only imported functions ship), 90M weekly downloads, modern Date-only API (no moment-style mutable global state), v4 has first-class TZ support. |
| **Why not native Date alone** | DatePickerInput already demonstrates native Date works for a simple picker. But ScheduleView needs: (1) month grid generation with correct first-day-of-week, (2) relative date labels in agenda sidebar, (3) "is today" / "is this week" classification, (4) cross-month event filtering. Native Date makes all of these error-prone (timezone leaks, DST edge cases, locale-specific formatting). |
| **Why not dayjs** | dayjs is moment-compatible (mutable API). date-fns is functional/immutable — better fit for Zustand's immutable `set()` pattern. |
| **Bundle impact** | ~3KB gzipped for the 5-6 functions we'll use (`format`, `startOfMonth`, `endOfMonth`, `eachDayOfInterval`, `isToday`, `isSameMonth`, `differenceInDays`). Tree-shaking drops the rest. |
| **Key functions used** | `startOfMonth`, `endOfMonth`, `eachDayOfInterval`, `getDay`, `format`, `isToday`, `isSameMonth`, `differenceInDays`, `addMonths`, `subMonths` |

**Install:**
```bash
npm install date-fns
```

### 2. `@dnd-kit/core` ^6.3.1 + `@dnd-kit/sortable` ^5.3.0

| Field | Detail |
|-------|--------|
| **Why needed** | TaskKanban needs drag-and-drop between columns (cross-category task moves). This is the defining interaction of a Kanban board — without it, users must use a context menu to move tasks, which is a degraded UX. |
| **Why @dnd-kit (legacy 6.x)** | (1) Stable, proven API with extensive documentation. (2) Works with React 19 in practice (no removed API usage in 6.x line). (3) Hundreds of community examples for Kanban patterns. (4) Accessible by default (keyboard DnD, screen reader announcements). (5) `@dnd-kit/sortable` provides exactly the column-reorder + cross-container pattern a Kanban needs. |
| **Why not new @dnd-kit/react 0.5.0** | Published June 2026 (< 3 months old). Pre-1.0, API still shifting, sparse documentation, no community examples yet. For a CRUD milestone focused on delivery, the proven legacy API is the right risk/reward tradeoff. Migration to v0.5+ can happen later if needed. |
| **Why not react-beautiful-dnd** | Deprecated (Atlassian abandoned it). No React 19 support. |
| **Why not react-dnd** | Heavier, imperative API, HTML5 drag backend has known mobile/touch issues. @dnd-kit is the modern successor. |
| **React 19 compat note** | `@dnd-kit/core@6.3.1` peer deps list `^16.8.0 || ^17.0.0 || ^18.0.0` — React 19 is NOT listed. However, the library works with React 19 because it doesn't use any removed APIs (no `findDOMNode`, no legacy refs). Multiple production projects use this combination. Use `--legacy-peer-deps` if npm complains, or add an `overrides` entry. |
| **Bundle impact** | ~12KB gzipped for core + sortable combined. |

**Install:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## Packages Already Sufficient (DO NOT add replacements)

### State Management

| Capability | Current Solution | Why it's enough |
|------------|-----------------|-----------------|
| Task CRUD actions | Zustand `taskStore` + `persist` + `sqliteStorage` | Add `updateTask`/`deleteTask`/`reopenTask`/`moveTask` as new actions — same immutable `set()` pattern as `productStore.updateProduct`/`deleteProduct`. No middleware changes. |
| Schedule CRUD actions | Zustand `scheduleStore` + `persist` + `sqliteStorage` | Add `updateEvent`/`deleteEvent` — same pattern. |
| Cross-module weak associations | Add optional fields to existing types (`Task.projectId?`, `ScheduleEvent.projectId?`, `ScheduleEvent.taskId?`) | Just type changes + store actions that set/clear these fields. No new state library. |
| Optimistic updates | Zustand stores ARE optimistic by default (synchronous in-memory `set()`, async `persist` to SQLite) | No special pattern needed. Store mutation is instant; SQLite write happens in background via `sqliteStorage`. |
| Store migration for new fields | `persist` middleware's `migrate` callback + bump `version` | Existing pattern in both stores. Add `projectId?` etc. as optional fields, bump version, migrate function is identity (new fields default to `undefined`). |

### Form Handling

| Capability | Current Solution | Why it's enough |
|------------|-----------------|-----------------|
| Task edit form | `useState` + controlled `<Input>` / `<Select>` / `<DatePickerInput>` inside `<Dialog>` | Same pattern as `CreateProductModal`. 4-6 fields max (title, priority, deadline, description, project, assignee). |
| Event edit form | Same `useState` + `<Dialog>` composition | 4-5 fields (title, date, time, type, location). |
| Validation | Early-return guard pattern: `if (!title.trim()) return` | Already used in `CreateProductModal`. Simple "required field" checks. No schema validation library needed. |

### UI Components

| Capability | Current Solution | Why it's enough |
|------------|-----------------|-----------------|
| Edit/Delete dialogs | `<Dialog>` + `<DialogContent>` + `<DialogHeader>` + `<DialogBody>` + `<DialogFooter>` | Full composition already available. See `CreateProductModal` for the pattern. |
| Delete confirmation | Compose a `<ConfirmDialog>` using existing `<Dialog>` | 30-line wrapper: `<Dialog open={...}><DialogContent><DialogHeader title="确认删除" /><DialogBody>确定要删除...</DialogBody><DialogFooter><Button variant="secondary" onClick={onCancel}>取消</Button><Button variant="danger" onClick={onConfirm}>删除</Button></DialogFooter></DialogContent></Dialog>`. No library needed. |
| Card context menu (edit/delete) | `<DropdownMenu>` (Radix) — already in `src/components/ui/DropdownMenu.tsx` | Full implementation with items, groups, separators, sub-menus. Attach to task cards via right-click or `...` button. |
| Date picker in forms | `<DatePickerInput>` — already in `src/components/ui/DatePickerInput.tsx` | Built for Tauri frameless window compatibility (native `<input type="date">` doesn't render in WebView2 layered windows). Uses Popover + month grid. Accepts `YYYY-MM-DD` string value. |
| Association badges | `<Badge>` variants (accent, success, warning, neutral) | Show `projectId` / `taskId` associations as small badges on cards. |
| Navigation between modules | `uiStore.setActiveTab('task')` + `uiStore.setSelectedProductId(id)` | Already have cross-tab navigation. Wire "jump to task" from schedule view via these actions. |

### ID Generation

| Capability | Current Solution | Why it's enough |
|------------|-----------------|-----------------|
| Unique IDs for new entities | `crypto.randomUUID()` (native browser API) | Returns UUID v4 string. Available in all modern browsers + WebView2. No package needed. Already used implicitly (current code uses `Date.now()` based IDs — upgrade to `crypto.randomUUID()` for better collision resistance). |

---

## Integration Points

### taskStore — New Actions

Model after `productStore.updateProduct` / `deleteProduct`:

```ts
// New actions to add to TaskState interface:
updateTask: (taskId: string, updates: Partial<Task>) => void;
deleteTask: (taskId: string) => void;
reopenTask: (taskId: string) => void;  // convenience: sets status back to '未开始'
moveTask: (taskId: string, fromCategoryId: string, toCategoryId: string) => void;
```

**Pattern:** `set((state) => ({ categories: state.categories.map(...) }))` — same immutable update pattern.

**Schema migration:** Bump `version: 2` in persist config. Add `projectId?: string` and `scheduledEventId?: string` to `Task` type. `migrate` function is identity (optional fields default to `undefined`).

### scheduleStore — New Actions + Date Model Overhaul

```ts
// New actions:
updateEvent: (eventId: string, updates: Partial<ScheduleEvent>) => void;
deleteEvent: (eventId: string) => void;
```

**Critical change:** The current `ScheduleEvent.date: number` (day-of-month, hardcoded to May 2025) must become a real date. Two options:

| Option | Change | Risk |
|--------|--------|------|
| **A (recommended):** Change `date: number` → `date: string` (YYYY-MM-DD) | Breaking change to event type. Migration function parses old format: assumes year=2025, month=05. | Clean. All new code uses string dates. DatePickerInput already uses YYYY-MM-DD. |
| **B:** Add `year`/`month` fields alongside `date` | More fields, awkward API. | Preserves old data shape but complicates queries. |

**Option A recommended.** The `migrate` function handles the transition:
```ts
migrate: (persisted, version) => {
  if (version < 2) {
    return {
      ...persisted,
      events: persisted.events.map(e => ({
        ...e,
        date: `2025-05-${String(e.date).padStart(2, '0')}`,
      })),
    };
  }
  return persisted;
}
```

Also add weak association fields: `projectId?: string`, `taskId?: string`, `type?: 'event' | 'task'` (to distinguish task-linked schedule entries).

### ScheduleView — Real Calendar

Replace hardcoded `daysInMonth = 31; firstDayOfMonth = 4` with date-fns:

```ts
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, format, isToday, isSameMonth, addMonths, subMonths } from 'date-fns';

const [currentMonth, setCurrentMonth] = useState(new Date()); // real month tracking
const monthStart = startOfMonth(currentMonth);
const monthEnd = endOfMonth(currentMonth);
const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
const firstDayOfWeek = getDay(monthStart); // 0=Sunday
```

Month navigation: `setCurrentMonth(addMonths(currentMonth, 1))` / `setCurrentMonth(subMonths(currentMonth, 1))`.

### TaskKanban — DnD Wiring

```ts
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';

// Wrap each task card in a sortable, columns as drop zones.
// On dragEnd: call taskStore.moveTask(taskId, fromCategory, toCategory).
```

### Cross-module Weak Associations

| Source | Target | Field | UX |
|--------|--------|-------|-----|
| Task → Product | `Task.projectId?: string` | Badge on task card showing product name |
| Task → ScheduleEvent | `Task.scheduledEventId?: string` | "安排到日历" button in task detail; creates linked event |
| ScheduleEvent → Product | `ScheduleEvent.projectId?: string` | Badge on event showing product name |
| ScheduleEvent → Task | `ScheduleEvent.taskId?: string` | Click event → jump to task in TaskManagementView |

**No cascading deletes.** Per PROJECT.md: "弱关联优先,外键全部可选,删除不级联". When a product is deleted, tasks/events with `projectId` pointing to it get the field cleared (or just show "已删除产品" — UX decision).

---

## What NOT to Add

| Package | Why not | Alternative |
|---------|---------|-------------|
| **React Hook Form + Zod** | Overkill for 4-6 field CRUD forms. The codebase already uses `useState` + early-return validation in `CreateProductModal`. Adding a form library introduces new patterns, new deps, and a learning curve for a problem that's already solved. | `useState` + controlled inputs + early-return guards. |
| **Immer** (Zustand middleware) | Current spread-operator patterns (`{ ...p, ...updates }`) are clear, explicit, and work fine for shallow-to-medium nesting. Adding Immer for CRUD is premature optimization. | Immutable spreads in `set()` callbacks. |
| **react-beautiful-dnd** | Deprecated by Atlassian. No React 19 support. | `@dnd-kit/core` (legacy 6.x). |
| **@dnd-kit/react 0.5.0** (new framework-agnostic rewrite) | Published June 2026. Pre-1.0, sparse docs, no community examples. Too risky for a CRUD delivery milestone. | `@dnd-kit/core` 6.x (proven, stable). |
| **Any calendar library** (react-big-calendar, FullCalendar, react-calendar) | Too heavy (50-200KB), breaks the Apple design aesthetic, forces opinionated HTML structures that fight Tailwind v4 tokens. DatePickerInput already shows native Date + Popover works perfectly. | Custom calendar grid (replicate DatePickerInput pattern) + date-fns for math. |
| **react-router** | Active tab switching via `uiStore.activeTab` is explicitly the chosen pattern. URL routing is out of scope. | `uiStore.setActiveTab()`. |
| **TanStack Query (React Query)** | No server-side fetching in this milestone. All data is local (Zustand + SQLite). React Query solves cache invalidation, refetching, optimistic server mutations — none of which apply to a local-first CRUD app. | Direct Zustand store calls. |
| **Nanoid / uuid** | `crypto.randomUUID()` is native, zero-dep, available in all target environments (browsers + WebView2). | `crypto.randomUUID()`. |
| **Any test runner** (vitest, jest) | Out of scope for this milestone. `npm run lint` (tsc --noEmit) is the only quality gate. Testing can be added later. | Manual verification + `tsc --noEmit`. |
| **Rich text editor** (tiptap, slate) | Task descriptions are short text. No markdown editing needed at this scale. | `<Textarea>` (plain text). |

---

## Summary: Exact Install Command

```bash
npm install date-fns @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Total new deps: 4 packages.** Everything else is built from existing Radix + Zustand + Tailwind + native browser APIs.

**Total bundle impact:** ~15KB gzipped (3KB date-fns tree-shaken + 12KB dnd-kit).

**No new devDependencies needed.** TypeScript types for date-fns are bundled. @dnd-kit types are bundled.

---

## Store Migration Checklist

| Store | Current Version | New Version | Changes |
|-------|----------------|-------------|---------|
| `taskStore` | 1 | 2 | Add `Task.projectId?: string`, `Task.scheduledEventId?: string`. Add `updateTask`/`deleteTask`/`reopenTask`/`moveTask` actions. |
| `scheduleStore` | 1 | 2 | Change `ScheduleEvent.date: number` → `string` (YYYY-MM-DD). Add `ScheduleEvent.projectId?: string`, `ScheduleEvent.taskId?: string`. Add `updateEvent`/`deleteEvent` actions. |
| `productStore` | 1 | 1 | No changes needed (full CRUD already exists). |
| `uiStore` | — | — | No schema changes. May add `selectedTaskId` / `selectedEventId` for cross-module navigation. |

---

## Sources

| Source | What it verified | Confidence |
|--------|------------------|------------|
| [npmjs.com/package/date-fns](https://www.npmjs.com/package/date-fns) | date-fns 4.4.0 current, 90M weekly downloads | HIGH |
| [date-fns.org](https://date-fns.org/) | Tree-shakeable, functional API, v4 TZ support | HIGH |
| [npmjs.com/package/@dnd-kit/core](https://www.npmjs.com/package/@dnd-kit/core) | @dnd-kit/core 6.3.1 current (legacy line) | HIGH |
| [dndkit.com](https://dndkit.com/) | Legacy vs new (v0.5.0) ecosystem structure | HIGH |
| [dndkit.com/legacy/introduction/installation](https://dndkit.com/legacy/introduction/installation) | Legacy packages still documented and supported | HIGH |
| [github.com/clauderic/dnd-kit](https://github.com/clauderic/dnd-kit) | Active maintenance, React 19 community usage confirmed | MEDIUM |
| [reddit.com/r/reactjs — React 19 + @dnd-kit + Zustand](https://www.reddit.com/r/reactjs/comments/1rn7aj1/built_a_visual_readme_editor_with_react_19_dndkit/) | March 2026: confirmed @dnd-kit works with React 19 + Zustand | MEDIUM |
| Existing codebase: `src/stores/productStore.ts` | `updateProduct`/`deleteProduct` pattern for task/schedule to follow | HIGH |
| Existing codebase: `src/components/ui/DatePickerInput.tsx` | Native Date calendar math pattern proven in codebase | HIGH |
| Existing codebase: `src/components/ui/Dialog.tsx` | Full dialog composition for edit/confirm dialogs | HIGH |
| Existing codebase: `src/components/ui/DropdownMenu.tsx` | Full dropdown menu for card context menus | HIGH |

---

*Stack research for: v0.2.0 Task/Schedule CRUD completion + cross-module weak associations*
*Researched: 2026-08-10*
