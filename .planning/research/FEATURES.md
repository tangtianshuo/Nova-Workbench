# Feature Research — Task CRUD, Schedule CRUD & Cross-Module Wiring

**Domain:** AI-native PM desktop workbench (Tauri v2 + React 19) — subsequent milestone adding Task CRUD completion, Schedule CRUD + real calendar, and cross-module weak-association wiring on top of existing v0.1.0 app.
**Researched:** 2026-08-10
**Confidence:** HIGH for table-stakes CRUD patterns (well-established across Linear, Notion, Asana, Todoist). MEDIUM for cross-module wiring UX (few open-source references; based on synthesis of commercial tool patterns).

## Scope of This Research

Nova v0.1.0 already ships: task creation (via Header NewTaskDialog + store `addTask`), task display as kanban board (`TaskKanban`), task completion (`completeTask`), schedule event creation (mock data only, `addEvent` in store), schedule display in hardcoded May 2025 calendar (`ScheduleView`), product full CRUD, and 7-tab sidebar navigation.

This milestone adds CRUD completion for tasks and schedules plus cross-module linking. This document categorizes only the **new** feature work.

The three research areas map to features as follows:

| Area | Feature scope |
|---|---|
| Task CRUD completion | Edit, delete, reopen, reassign product/category on existing tasks |
| Schedule CRUD completion | Edit, delete events; real month navigation (replace hardcoded May 2025); date picker for event creation |
| Cross-module wiring | "Schedule to calendar" from task, product association on delete, relation badges, orphan handling |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the app reads as broken or half-built. These are features every PM tool user takes for granted.

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| **Task edit via card context menu or detail panel** | Every PM tool (Linear `E` key, Notion inline edit, Todoist click-to-expand) lets users modify task properties after creation. A kanban card you can't edit is a sticky note, not a task manager. | LOW | Current `TaskKanban` already expands on click to show detail. Add edit fields (title, description, priority, deadline, category) into the expanded panel OR a dedicated edit dialog. Reuse existing `Input`, `Select`, `DatePickerInput` primitives. Store action: `updateTask(taskId, updates)`. ~1 day. |
| **Task delete with confirmation** | Accidental deletion destroys user work. Linear uses `⌘+Delete` + undo (no modal), Notion uses "Delete" in `...` menu with toast-undo, Asana requires multi-step deletion. For a desktop app with no server-side undo, a lightweight confirmation is appropriate. | LOW | Add `Trash`/`X` button on expanded card or right-click context menu. Show confirmation Dialog ("Delete this task? This cannot be undone."). Store action: `deleteTask(taskId)` removes from whichever category contains it. ~half day. |
| **Task reopen (un-complete)** | Todoist: uncheck completed task. Linear: `#` to restore. Users routinely complete tasks by mistake or change their mind. A completed task that's permanently locked feels broken. | LOW | Current `completeTask` sets `status: '已完成'`. Add `reopenTask(taskId)` that sets `status: '未开始'` (or previous status). UI: completed tasks in kanban show a "Reopen" button instead of disabled "已完成" button. ~half day. |
| **Task reassign category (move between kanban columns)** | Tasks evolve: a "需求评审" item becomes a "产品设计" item. Linear/Asana/Trello all support column movement. Without this, users must delete+recreate. | LOW-MEDIUM | Two UX options: (a) drag-and-drop between columns (requires DnD library — heavy), (b) select category in edit dialog/panel and move on save. Option (b) is simpler and matches Nova's click-to-expand pattern. Store action: `moveTask(taskId, fromCategoryId, toCategoryId)`. ~1 day. |
| **Schedule event edit via click** | Calendar events you can't edit are calendar decoration. Notion calendar: click event → edit in database row. Apple Calendar: double-click → inline edit. Any calendar without event editing is not a calendar. | LOW | Click event chip in calendar grid → open edit dialog pre-filled with current values. Store action: `updateEvent(eventId, updates)`. ~half day. |
| **Schedule event delete with confirmation** | Same rationale as task delete. Calendar events are commitments; accidental deletion is high-cost. | LOW | Right-click or `...` menu on event chip → "Delete" → confirmation dialog. Store action: `deleteEvent(eventId)`. ~half day. |
| **Real month navigation in calendar** | Current `ScheduleView` is hardcoded to "2025年 5月" with `daysInMonth = 31` and `firstDayOfMonth = 4`. This is a demo placeholder. A calendar that shows only one month is not a calendar — it's a screenshot. | MEDIUM | Replace hardcoded values with `useState` tracking `currentYear`/`currentMonth`. CaretLeft/CaretRight buttons (already rendered but non-functional) shift month. "今天" button resets to current month. Compute `daysInMonth` and `firstDayOfMonth` dynamically via `new Date(year, month, ...)`. Events filter by matching `date` field against displayed month. ~1-2 days. |
| **Schedule event creation dialog** | Current "新建日程" button in ScheduleView does nothing. Users expect to create events with title, date, time, type, location. | LOW | Open Dialog on button click. Fields: title (Input), date (DatePickerInput), time range (two time Inputs or single text), type (Select: meeting/review/sync), location (Input). Store action: already have `addEvent`. ~1 day. |
| **Event date model: full date, not just day-of-month** | Current `ScheduleEvent.date: number` is only day-of-month (1-31). This breaks the moment the calendar navigates past May 2025 — day 15 of May ≠ day 15 of June. Must migrate to full date string (`YYYY-MM-DD`). | MEDIUM | **Schema migration required.** Change `ScheduleEvent.date` from `number` to `string` (ISO date). Update `INITIAL_EVENTS` mock data. Update ScheduleView to parse and filter by month. Update any calendar-day matching logic. Add `version: 2` + `migrate` function to `scheduleStore` persist config to transform old `number` dates to `string` dates. ~1 day including migration. |
| **Keyboard support for core actions** | Linear's entire UX is keyboard-driven. At minimum: `Escape` closes dialogs, `Enter` confirms, `Delete` triggers delete flow. Users migrating from Linear/Notion will reach for these reflexively. | LOW | Most Dialog/Input primitives already handle Escape. Add explicit `onKeyDown` for Delete key on focused task cards. ~half day. |

### Differentiators (Competitive Advantage)

These are where Nova earns its "AI-native PM agent" positioning for the CRUD experience. Not required for "working app," but required for the value prop of "smart PM workbench."

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| **Cross-module "安排到日历" from task** | The headline cross-module feature. A task with a deadline should be one-click convertible to a calendar event. No other local-first PM tool does this automatically — Asana requires manual calendar entry, Todoist keeps tasks and calendar separate. | MEDIUM | Add "安排到日历" button on expanded task card. Click → creates a `ScheduleEvent` with `title` from task, `date` from task.deadline, `type: 'task'`, and bidirectional weak refs (`event.taskId = task.id`, `task.scheduledEventId = event.id`). UX: toast confirmation "已创建日程: {title}" with link to jump to Schedule tab. ~1-2 days. |
| **Relation badges on task cards** | Visual indicator that a task is linked to a product and/or a schedule event. Linear shows linked issue pills; Notion shows relation property chips. Without badges, weak associations are invisible — users won't know tasks are connected. | LOW | On kanban card: show small Badge with product name (if `task.projectId` set) and/or calendar icon (if `task.scheduledEventId` set). Click badge → navigate to related item's tab + scroll/focus. ~1 day. |
| **Relation badges on calendar events** | Same concept on the calendar side. An event linked to a task shows the task title; an event linked to a product shows the product name. | LOW | On calendar event chip: show small icon/badge for linked entity. Click → navigate to task card or product detail. ~half day. |
| **Smart delete: orphan awareness on product deletion** | When deleting a product, show how many tasks/events reference it. Let user choose: (a) unlink (set `projectId = null`), (b) cancel. This prevents silent orphans. Asana shows "This task belongs to 3 projects" on delete. | MEDIUM | In `deleteProduct` flow: before deletion, query task store + schedule store for references. Show dialog: "This product has 5 linked tasks and 2 linked events. Delete product and unlink all references?" with explicit "Unlink & Delete" button. ~1-2 days. |
| **Bidirectional navigation: click product badge on task → jump to product tab** | Cross-module links should be navigable both ways. Task → Product, Task → Schedule, Schedule → Task, Schedule → Product. | LOW | Badge click handlers call `setSelectedProductId(id)` + `setActiveTab('product')` or similar. Reuses existing UI store. ~half day. |
| **Inline date editing on task card (quick edit)** | Notion: click any property inline to edit. Rather than opening a full dialog, let users click the deadline on a kanban card to open the DatePickerInput inline. Faster than full edit flow for the most common change. | LOW-MEDIUM | In expanded card view, make the deadline display clickable → opens DatePickerInput popover inline. On change → `updateTask(taskId, { deadline: newDate })`. ~half day. |

### Anti-Features (Commonly Requested, Often Problematic)

Things that look like they belong in this milestone but should be **explicitly deferred** per PROJECT.md's Out of Scope and weak-association design principle.

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **Cascade delete (delete product → auto-delete all tasks/events)** | Seems logical: "if I delete the product, clean up everything." | Violates the weak-association principle in PROJECT.md. Tasks have independent value — a user may delete a product but want to keep the tasks as standalone items. Data loss risk is high and irreversible. | Orphan with notification: delete product → tasks survive with `projectId = null`, user sees "5 tasks unlinked" toast. User can manually delete if desired. |
| **Drag-and-drop kanban column reordering** | Trello/Linear/Jira all support DnD between columns. | Requires a DnD library (`@dnd-kit/core`, `react-beautiful-dnd`) adding ~30KB + complexity. Current kanban is click-to-expand, not DnD. MVP doesn't need it. | Use category selector in edit dialog to move tasks between columns. DnD can be added later if users demand it. |
| **Recurring tasks / events** | Todoist has recurring dates; Google Calendar has recurring events. | Complex date math (RRULE parsing), UI for recurrence patterns, edge cases around editing one vs. all instances. Not in v0.2.0 scope. | One-off tasks/events only. Recurring is a v0.3+ feature. |
| **Task subtasks / nested tasks** | Todoist and Linear support sub-task hierarchies. | Current `Task` type is flat. Adding `subtasks: Task[]` or parent-child refs doubles the data model complexity. Kanban display gets recursive. | Flat tasks only for v0.2.0. Categories serve as the primary grouping mechanism. |
| **Task/event templates** | Notion database templates, Linear issue templates. | Premature abstraction. Users haven't established workflow patterns yet. Templates optimize for repetition that doesn't exist yet. | Manual creation. Templates when users ask for them. |
| **Calendar week view** | SegmentedControl already shows "月视图" / "周视图" toggle but week view is not implemented. | Week view requires different grid layout (7 columns × 1 row with hourly rows), time-of-day rendering, scrollable time axis. Significant UI work that duplicates the month view's value. | Ship month view first. Week view is v0.3+ unless user feedback demands it sooner. |
| **Multi-select / bulk operations on tasks** | Linear: select multiple issues → batch delete/status change. | Requires selection state management, bulk action bar UI, confirmation flows for batch operations. Complexity scales non-linearly. | Single-task operations for v0.2.0. Bulk operations when task volume warrants them. |
| **Task assignment to team members** | Asana/Linear show assignee avatars. | Current `Task` has `assignee: string` and `assigneeAvatar: string` but no user management system. Real assignment requires user directory. | Keep assignee as free-text string. Real user management is a different product. |
| **URL routing / deep links to specific tasks or events** | "Share a link to this task." | Single-window desktop app with `activeTab` state. No URL bar. Deep links require router integration touching all views. | In-app navigation only (click badge → switch tab + focus). |
| **Full-text search across tasks and events** | Header already has a search button but search is unimplemented. | Search requires indexing strategy, relevance ranking, UI for results display. Can be done well later; doing it badly now wastes effort. | Ship CRUD first. Search is its own feature when data volume makes manual browsing painful. |
| **Strong referential integrity (foreign key constraints)** | "If taskId references a product, enforce that the product exists." | Violates weak-association principle. FK constraints + cascade rules = complex data model for a local-first app. | Weak refs only. UI checks for orphan references and shows badges. No store-level enforcement. |

---

## Edge Cases

### Orphan Records on Delete

| Scenario | Expected Behavior | Implementation |
|---|---|---|
| Delete product that has linked tasks | Tasks survive with `projectId = null`. Show toast: "{N} tasks unlinked from {product name}". | `deleteProduct` action queries task store for `task.projectId === product.id`, nullifies the field, then deletes product. |
| Delete product that has linked events | Events survive with `projectId = null`. Show toast: "{N} events unlinked from {product name}". | Same pattern as tasks. |
| Delete task that has a linked event | Event survives with `taskId = null`. Event is now a standalone calendar entry. | `deleteTask` checks if `task.scheduledEventId` exists, if so nullifies `event.taskId`. |
| Delete event that has a linked task | Task survives with `scheduledEventId = null`. Task is now unscheduled. | `deleteEvent` checks if `event.taskId` exists, if so nullifies `task.scheduledEventId`. |
| Delete task category | All tasks in category survive — they must be reassigned or the category deletion should be blocked. | Two options: (a) prevent deletion of non-empty categories, (b) force reassignment dialog before deletion. Option (a) is simpler for v0.2.0. |

### Date/Time Edge Cases

| Scenario | Expected Behavior | Implementation |
|---|---|---|
| Task deadline in the past | Show deadline normally but with visual indicator (e.g., `danger` badge or "overdue" text). Don't auto-complete or auto-delete. | In TaskKanban expanded card: compare `task.deadline` with `new Date()`. If past, show `<Badge variant="danger">已过期</Badge>`. |
| Event date in the past | Show in calendar normally. Past events are historical records. No auto-deletion. | Calendar cells render events regardless of date. Optional: dim past events slightly. |
| Event spanning midnight | Current `time: string` is free-text ("10:00 - 11:30"). No special handling needed for v0.2.0. | Keep time as string. Structured time parsing is v0.3+. |
| Schedule event on month boundary | Events on the 1st or last day should display correctly when navigating months. | Filter events by full `YYYY-MM-DD` date string, not just day-of-month number. |
| DatePickerInput in Tauri webview | Already handled — custom `DatePickerInput` component exists specifically because native `<input type="date">` doesn't work in Tauri transparent windows on Windows. | Reuse existing `DatePickerInput` for all date fields. |

### Cross-Module Wiring Edge Cases

| Scenario | Expected Behavior | Implementation |
|---|---|---|
| "安排到日历" on a task that already has a scheduled event | Don't create a duplicate. Either: (a) navigate to existing event, or (b) show "Already scheduled: {date}" with option to reschedule. | Check `task.scheduledEventId` before creating. If exists, show info toast + option to jump to schedule tab. |
| Link task to product that's already deleted (stale reference) | Badge should show "Unknown product" or simply not render. Don't crash. | Badge render checks `products.find(p => p.id === task.projectId)`. If not found, skip badge or show neutral "已删除产品" badge. |
| Circular reference: task A references event B which references task A | Prevent at creation time. When creating event from task, the event gets `taskId`, not the other way around. |单向创建: task → event creates event with `taskId = task.id`. The reverse (event → task) is not offered as a separate action. |
| Rapid-fire "安排到日历" clicks | Debounce or disable button after first click. | Disable button when `task.scheduledEventId` is set. Optimistic: set immediately on click, rollback if store action fails. |
| Edit task deadline after "安排到日历" | Changing task deadline does NOT auto-update the linked event's date. They're weakly associated, not synced. | Document this clearly in UI: "日程已创建，修改截止日期不会自动更新日程". Future: offer "sync date" option. |

### Calendar Navigation Edge Cases

| Scenario | Expected Behavior | Implementation |
|---|---|---|
| Navigate to month with no events | Show empty calendar grid. Don't crash or show error. | Events filter returns `[]` for that month. Grid renders normally with no event chips. |
| Navigate far into past/future | No practical limit, but very distant months may feel disorienting. | No hard limit. "今天" button always available to return to current month. |
| Today indicator in non-current month | Don't highlight today's date when viewing a different month. | `isToday` check only applies when viewing current month. Other months show dates without today highlight. |
| Month with 6 weeks (42 cells) vs 5 weeks | Grid must handle both. Some months span 6 weeks. | Always render 42 cells (6 rows × 7 cols). Cells outside current month show with reduced opacity (already implemented). |

---

## Complexity Notes

### Data Model Changes

**Task type additions (weak-association fields):**
```typescript
// Add to existing Task interface:
projectId?: string;         // optional FK to Product
scheduledEventId?: string;  // optional FK to ScheduleEvent
```

**ScheduleEvent type migration:**
```typescript
// BEFORE (v0.1.0):
interface ScheduleEvent {
  id: string;
  title: string;
  time: string;
  date: number;        // day-of-month only (1-31) — BROKEN for multi-month
  type: string;
  location: string;
}

// AFTER (v0.2.0):
interface ScheduleEvent {
  id: string;
  title: string;
  time: string;
  date: string;        // YYYY-MM-DD — full date
  type: string;
  location: string;
  projectId?: string;  // optional FK to Product
  taskId?: string;     // optional FK to Task
}
```

**Store migration required:** `scheduleStore` persist config needs `version: 2` + `migrate` function to convert old `number` dates to `string` dates. Use `INITIAL_EVENTS` date anchor (May 2025) for migration heuristic.

### New Store Actions Needed

| Store | Action | Signature |
|---|---|---|
| `taskStore` | `updateTask` | `(taskId: string, updates: Partial<Task>) => void` |
| `taskStore` | `deleteTask` | `(taskId: string) => void` |
| `taskStore` | `reopenTask` | `(taskId: string) => void` |
| `taskStore` | `moveTask` | `(taskId: string, toCategoryId: string) => void` |
| `scheduleStore` | `updateEvent` | `(eventId: string, updates: Partial<ScheduleEvent>) => void` |
| `scheduleStore` | `deleteEvent` | `(eventId: string) => void` |
| `scheduleStore` | `addEvent` | (already exists, needs signature update for full date) |

### Component Changes Needed

| Component | Change | Complexity |
|---|---|---|
| `TaskKanban` | Add edit/delete/reopen controls to expanded card. Add relation badges. | MEDIUM |
| `ScheduleView` | Replace hardcoded month with stateful navigation. Wire event click → edit dialog. Wire "新建日程" → create dialog. Update date rendering for `YYYY-MM-DD` format. | MEDIUM-HIGH |
| `Header` (NewTaskDialog) | Wire form to actually call `addTask` store action. Add product association select. | LOW |
| New: `TaskEditDialog` or inline edit panel | Reuse Dialog primitives + Input/Select/DatePickerInput. Pre-fill with current task values. | LOW-MEDIUM |
| New: `ScheduleEventDialog` (create/edit) | Same pattern as CreateProductModal. Handles both create and edit via `mode` prop. | LOW-MEDIUM |
| New: `DeleteConfirmDialog` (reusable) | Generic confirmation dialog with customizable message. Used for task delete, event delete, product delete-with-orphans. | LOW |

### Dependencies on Existing Features

```
[Task edit/delete/reopen] ──(uses)──> taskStore [EXISTING, needs new actions]
[Task edit/delete/reopen] ──(uses)──> TaskKanban expanded card [EXISTING UI pattern]
[Task reassign category] ──(uses)──> categories array in taskStore [EXISTING]

[Schedule event edit/delete] ──(uses)──> scheduleStore [EXISTING, needs new actions]
[Schedule month navigation] ──(uses)──> CaretLeft/CaretRight buttons [EXISTING UI, non-functional]
[Schedule event creation] ──(uses)──> DatePickerInput [EXISTING component]
[Schedule date model migration] ──(uses)──> scheduleStore persist migrate [PATTERN EXISTS from taskStore]

[Cross-module: 安排到日历] ──(needs)──> Task.scheduledEventId [NEW field]
[Cross-module: 安排到日历] ──(needs)──> ScheduleEvent.taskId [NEW field]
[Cross-module: 安排到日历] ──(needs)──> scheduleStore.addEvent [EXISTING action]
[Cross-module: relation badges] ──(needs)──> Task.projectId [NEW field]
[Cross-module: relation badges] ──(needs)──> useProductStore [EXISTING]
[Cross-module: orphan awareness] ──(needs)──> deleteProduct flow [EXISTING, needs enhancement]
```

---

## Feature Prioritization for v0.2.0

### Phase 5: Task CRUD Completion (P1 — must have)

- [ ] `taskStore`: `updateTask`, `deleteTask`, `reopenTask`, `moveTask` actions
- [ ] TaskKanban expanded card: edit fields (title, description, priority, deadline, category)
- [ ] Task delete with confirmation dialog
- [ ] Task reopen button on completed tasks
- [ ] Task category reassignment via edit dialog
- [ ] Task `projectId?` / `scheduledEventId?` weak-association fields

### Phase 6: Schedule CRUD + Real Calendar (P1 — must have)

- [ ] `scheduleStore`: `updateEvent`, `deleteEvent` actions
- [ ] `ScheduleEvent.date` migration: `number` → `string` (YYYY-MM-DD) + persist migration
- [ ] `ScheduleEvent.projectId?` / `taskId?` weak-association fields
- [ ] ScheduleView: real month navigation (stateful year/month, dynamic grid computation)
- [ ] ScheduleView: event click → edit dialog (pre-filled)
- [ ] ScheduleView: "新建日程" → create dialog with DatePickerInput
- [ ] Event delete with confirmation

### Phase 7: Cross-Module Wiring (P1 — must have, builds on Phase 5+6)

- [ ] "安排到日历" button on task card → creates linked event
- [ ] Relation badges on task cards (product badge, calendar badge)
- [ ] Relation badges on calendar events (task badge, product badge)
- [ ] Bidirectional navigation: click badge → switch tab + focus
- [ ] Product delete: orphan awareness dialog (count linked tasks/events, offer unlink)
- [ ] Reusable `DeleteConfirmDialog` component

### Deferred to v0.3+ (explicitly out of scope)

- [ ] Drag-and-drop kanban column reordering
- [ ] Calendar week view
- [ ] Recurring tasks/events
- [ ] Task subtasks/nesting
- [ ] Bulk operations / multi-select
- [ ] Full-text search across modules
- [ ] Task/event templates
- [ ] URL routing / deep links
- [ ] Real user management / assignment

---

## Competitor / Comparable Feature Analysis

Reference patterns from established PM tools that inform Nova's v0.2.0 design.

| Pattern | Linear | Notion | Asana | Todoist | Nova's Plan |
|---|---|---|---|---|---|
| **Task edit** | `E` key → inline edit or side panel | Click row → full-page or modal | Click task → side panel + inline fields | Click task → bottom sheet / modal | Expanded card inline edit (match Nova's existing click-to-expand pattern) |
| **Task delete** | `⌘+Del` → instant delete, restorable via `#` | `...` menu → Delete → toast with Undo | Right-click → Delete → no confirmation (risky) | Swipe left → Delete (mobile) / `...` → Delete | Confirmation dialog (no server-side undo in local app) |
| **Task reopen** | Change status back via status dropdown | Uncheck checkbox | Reopen via status change | Uncheck completed task | "Reopen" button on completed task cards |
| **Calendar month nav** | N/A (no calendar view) | Calendar view with month arrows | Calendar tab with month/week toggle | Calendar view (premium) | CaretLeft/CaretRight + "今天" button (existing UI, needs wiring) |
| **Event creation** | N/A | New database row in calendar view | Click on date → create event | Quick-add with natural language | "新建日程" button → dialog with DatePickerInput |
| **Cross-module linking** | Issue relationships (linked issues, blocks/blocked) | Relation property (bidirectional DB relation) | Task ↔ Project association, cross-project links | Task ↔ Project, no calendar linking | Weak-association fields + "安排到日历" + relation badges |
| **Delete with references** | Archive instead of delete; orphan issues become unassigned | Delete page → linked relations show "deleted" | Delete task → removed from all projects (strong ref) | Delete task → gone from all views | Orphan awareness: show count, offer unlink, don't cascade |
| **Date model** | `dueDate` as ISO date | Date property with timezone | Due date with time | Due date + recurring rules | Full `YYYY-MM-DD` string (migrating from day-of-month number) |

**Key takeaways for Nova:**
1. **Confirmation dialogs are appropriate** for local-first apps without server-side undo. Cloud tools can afford instant-delete-with-restore; local apps cannot.
2. **Weak association is the right model** for v0.2.0. Strong refs (Asana-style) cause data loss on delete. Notion-style relations are closer but require a more sophisticated data model.
3. **Calendar month navigation is trivial** — every tool has it. The current hardcoded month is a demo artifact, not a design choice.
4. **Inline editing > modal editing** for task cards. Nova's click-to-expand pattern is already inline — extend it, don't replace it with a separate dialog.
5. **"安排到日历" is a genuine differentiator** — no local-first PM tool does this one-click task→event conversion automatically.

---

## Sources

### Industry References (MEDIUM-HIGH confidence)
- [Linear Docs — Delete and archive issues](https://linear.app/docs/delete-archive-issues) — Delete semantics, restore with `#`
- [Linear Docs — Create issues](https://linear.app/docs/creating-issues) — Issue creation flow
- [Linear Docs — Select issues](https://linear.app/docs/select-issues) — Multi-select patterns
- [Linear — UI Refresh (March 2026)](https://linear.app/changelog/2026-03-12-ui-refresh) — Latest UI patterns
- [Linear — How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui) — Design philosophy
- [Notion — Calendar view databases](https://www.notion.com/help/calendars) — Calendar view behavior
- [Notion — Database properties](https://www.notion.com/help/database-properties) — Property types including relations
- [Notion — Database views, filters, sorts](https://www.notion.com/help/views-filters-and-sorts) — View management
- [Todoist — Introduction to sub-tasks](https://www.todoist.com/help/articles/introduction-to-sub-tasks-kMamDo) — Sub-task UX patterns
- [Todoist — Introduction to recurring dates](https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV) — Date handling patterns
- [Todoist — 2026 Changelog](https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd) — Latest feature updates
- [Asana Forum — Cross-project calendar](https://www.reddit.com/r/Asana/comments/1i5ui0k/crossproject_calendar/) — Cross-project calendar limitations
- [Nicelydone — Linear Deleting Project Update Flow](https://nicelydone.club/flows/966bfcd3-7a9e-462b-b962-71a982af99c3) — Captured delete confirmation flow

### Project-Internal Sources (HIGH confidence)
- `.planning/PROJECT.md` — Active requirements + Out of Scope for v0.2.0
- `src/stores/taskStore.ts` — Current task store shape and actions
- `src/stores/scheduleStore.ts` — Current schedule store shape and actions
- `src/stores/productStore.ts` — Product CRUD pattern reference (already complete)
- `src/data/mockTasks.ts` — Task type definition
- `src/components/TaskKanban.tsx` — Current kanban UI (click-to-expand pattern)
- `src/views/ScheduleView.tsx` — Current calendar UI (hardcoded May 2025)
- `src/components/ui/DatePickerInput.tsx` — Existing date picker (Tauri-compatible)
- `src/components/ui/Dialog.tsx` — Dialog primitives for edit/create forms
- `src/components/ui/Badge.tsx` — Badge variants for relation indicators
- `src/components/layout/Header.tsx` — NewTaskDialog pattern (unwired creation form)
- `src/components/product/CreateProductModal.tsx` — Reference pattern for create/edit dialog
- `src/store/AppContext.tsx` — `deleteProductWrapped` pattern (clears selection on delete)
- `src/stores/workspaceStore.ts` — Existing `projectId?` weak-association pattern on Workspace

---
*Feature research for: AI-native PM desktop workbench — Task CRUD + Schedule CRUD + Cross-Module Wiring milestone (v0.2.0)*
*Researched: 2026-08-10*
