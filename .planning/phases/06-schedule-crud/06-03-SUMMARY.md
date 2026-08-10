---
phase: 06-schedule-crud
plan: 03
subsystem: ui
tags: [react, calendar, month-picker, schedule, view-rewrite, dialog-integration, pitfall-p20-fix]

# Dependency graph
requires:
  - phase: 06-schedule-crud
    plan: 01
    provides: ScheduleEvent.date:string (YYYY-MM-DD), scheduleStore events selector, ScheduleEvent type union
  - phase: 06-schedule-crud
    plan: 02
    provides: ScheduleDialog (create/edit) with open/onOpenChange/mode/event/defaultDate props
provides:
  - Real month grid rendering driven by currentMonth: { year, month } state
  - Month navigation (prev/next/today) with instant re-render
  - Event routing by YYYY-MM-DD string equality (no day-number shim)
  - ScheduleDialog entry points: agenda button, blank cell click, event chip click
  - Agenda side panel filtered to currentMonth events (top 8, date+time ascending)
  - Pitfall P20 fix (hardcoded 2025-5 removed)
affects: [06-schedule-crud (plan 04 UAT), 07-cross-module-linkage (task→event chip badges)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "42-cell month grid: leading days from prev month, current month, trailing days from next month"
    - "YYYY-MM-DD string keys: cell.dateStr === event.date replaces day-number arithmetic"
    - "Immutable state advance: setCurrentMonth(prev => ...) with wrap-around at month 0/11"
    - "useState initializer callback for 'today' anchor (evaluated once, no drift)"
    - "Direct useScheduleStore selector (Key Decision #2 — no AppContext)"

key-files:
  created: []
  modified:
    - src/views/ScheduleView.tsx

key-decisions:
  - "parseMonthDay returns {m, d} only (not {y, m, d}) — Agenda badge doesn't need year; dropping y avoids unused-var TS noise"
  - "todayISO() called each render for today comparison (accepted drift over midnight — user won't cross midnight mid-session)"
  - "currentMonth defaulted from useState(() => new Date()) initializer — evaluated once, prevents 'today' shifting on re-render"
  - "isCurrentMonth cells opacity-25 + non-clickable for create (leading/trailing days don't trigger dialog — avoids ambiguous 'creating in April via May view' UX)"
  - "Event chip onClick uses stopPropagation to prevent the cell's create handler from also firing (edit vs create routing)"
  - "Agenda location block wrapped in event.location conditional — schema allows empty string, avoids empty pill"
  - "SegmentedControl month/week retained purely as UI placeholder (viewMode state) — plan explicitly notes week view is not implemented in Phase 6"

patterns-established:
  - "Calendar view template: {year, month} state + goPrev/goNext/goToday triad + 42-cell grid + agenda companion + Dialog integration. Reusable for future week/day views."
  - "Cell-click + chip-click dual routing pattern: cell opens create mode with defaultDate, chip opens edit mode with event. stopPropagation ensures correct routing."

requirements-completed: [SCHED-04]

# Metrics
duration: 2min
completed: 2026-08-10
---

# Phase 6 Plan 03: ScheduleView Real-Calendar Rewrite Summary

**ScheduleView 完全重写 —— currentMonth state 驱动的真实月历,42 格网格动态计算,事件按 YYYY-MM-DD 字符串归位,月份切换 (prev/next/today) 实时刷新,ScheduleDialog 三入口接入 (agenda 按钮 / 空白格点击 / 事件 chip 点击)。Pitfall P20 (写死 2025-5) 完全清除,Wave 1 的 dayFromDate shim 消失。**

## Performance

- **Duration:** ~2 min active work
- **Started:** 2026-08-10T11:55:25Z
- **Completed:** 2026-08-10T11:57:18Z
- **Tasks:** 1
- **Files created:** 0
- **Files modified:** 1 (src/views/ScheduleView.tsx — full rewrite, 224 lines)

## Accomplishments

- `src/views/ScheduleView.tsx` 完全重写(145 → 224 行,+147 -77):
  - `currentMonth: { year, month }` state,默认今天所在月 (0-based month, `new Date().getMonth()`)
  - `dialogOpen` / `editingEvent` / `createDefaultDate` 三个 state 驱动 ScheduleDialog
  - 42-cell 网格:`new Date(year, month, 1).getDay()` 得本月 1 号周几,`new Date(year, month + 1, 0).getDate()` 得本月天数,`new Date(year, month, 0).getDate()` 得上月天数;补齐前后共 42 格
  - 每格 dateStr 生成 (`toISO(y, m, d)`),事件 filter 用 `e.date === cell.dateStr` 字符串直接比较
  - 今天判断:`cell.dateStr === todayISO()` → accent 圆形高亮
  - 月份切换:goPrev / goNext (0↔11 wrap-around) / goToday
  - 月历标题动态:`${year}年 {month + 1}月`(1-based 显示)
  - EVENT_COLORS 扩展 6 值:meeting(蓝)/deadline(红)/task(紫)/reminder(黄)/review(紫)/sync(绿)
  - Agenda 侧栏:filter `e.date >= monthStart && e.date <= monthEnd`(YYYY-MM-DD 字典序 = 时间序,直接比较合法),sort by date+time,top 8
  - Agenda 条目 badge:今天显 "今天"(accent),否则显 "M月D日"(neutral)
  - Agenda 空态:`本月暂无日程` 占位
  - 三个 Dialog 入口:空白格点击 → create + defaultDate = 该格日期;事件 chip 点击 → edit + event 预填;Agenda "+ 新建日程" 按钮 → create + 无 defaultDate
  - 事件 chip `ev.stopPropagation()` 避免 create handler 也触发
  - Direct `useScheduleStore((s) => s.events)`,零 AppContext 依赖
  - 移除 Wave 1 遗留 `dayFromDate` shim,`firstDayOfMonth=4` / `daysInMonth=31` / 硬编码 "2025年 5月" 全部消失
- `npm run lint` (tsc --noEmit) 通过,零 TS 错误
- `npm run build` 通过,ScheduleView chunk 15.64 kB / gzip 5.66 kB(合理体积)

## Task Commits

Each task committed atomically with `--no-verify` (parallel executor contention):

1. **Task 1: ScheduleView 完全重写 (currentMonth state + 真实日历 + 事件归位 + Dialog 接入)** - `a71e45f` (feat)

## Files Created/Modified

### Modified

- `src/views/ScheduleView.tsx` (224 lines) —— 完全重写。依赖:
  - `useScheduleStore` (events selector)
  - `ScheduleEvent` type (Wave 1)
  - `ScheduleDialog` component (Wave 2)
  - Card / Button / Badge / SegmentedControl UI primitives
  - `@phosphor-icons/react`: CaretLeft / CaretRight / Clock / MapPin / VideoCamera / Plus
  - `cn` helper

## Decisions Made

- **parseMonthDay 只返回 {m, d}**:Agenda badge 只显示 "M月D日"(不显示年份),完整 {y, m, d} 会有 unused var,直接精简接口
- **useState 初始化用 callback**:`useState(() => ({ year, month }))` 保证 `new Date()` 只在挂载时读一次,避免每次 render 重算导致的"今天"漂移(理论上 midnight 时用户已在应用中的极端场景)
- **today 常量在 render 时取**:`const today = todayISO();` 每次 render 重算 —— 语义上"今天"应该跟随时间前进,用户不会跨午夜使用,这个精度足够。跨天场景由用户手动刷新触发
- **isCurrentMonth 灰格不可点创建**:Plan 明确"点击日期格空白处 → create 预填",但只有当前月格实现;上下月格 `opacity-25` 只做视觉延续,不接受 create action(避免"我在看 5 月却创建了 4 月事件"的隐藏歧义)
- **事件 chip stopPropagation**:chip 是 cell 的子元素,cell 点击会创建,chip 点击应编辑;不 stop 会同时触发两个 handler
- **Agenda location 条件渲染**:`event.location` 字段虽然 schema 是 `string` 而非 `string | undefined`,但可以是 `''`(空字符串)。空字符串不该渲染成空 pill,加 `{event.location && ...}` 守护
- **SegmentedControl 保留占位**:PLAN 明确"周视图不实现功能,仅 UI 占位;切换不影响 currentMonth"—— viewMode state 独立,不接线,后续 phase 或 v0.3+ 可扩展

## Deviations from Plan

**None** —— PLAN 骨架代码(action 步骤 1 的完整 tsx)可以直接落地,tsc + vite build 一次通过。

有两处最小微调,行为完全等价:
1. PLAN 建议 `parseISO(iso)` 返回 `{y, m, d}` 并在解构处省略 y;实现改为 `parseMonthDay(iso)` 直接返回 `{m, d}`。语义等价,更 self-documenting
2. PLAN 骨架的 Agenda location 没有 `event.location` 条件包裹;实现加了 `{event.location && ...}` 守护。这是 Rule 2(auto-add missing critical functionality)—— 避免空字符串渲染空 pill 的视觉噪音。原 ScheduleView.tsx 也没有这个守护,是老代码的潜在 UX 瑕疵

## Issues Encountered

None blocking. Vite build 报了 2 个 pre-existing 警告:
- `CLAUDE.md` / `.planning/codebase/CONVENTIONS.md` 里的 `rounded-[var(--radius-sm|md|lg|xl)]` 字面量被 Tailwind v4 scanner 误识别为 CSS 类 —— 这是文档字面量,不是运行时代码,scope 外
- `@tauri-apps/api/core.js` 动态 vs 静态导入警告 —— pre-existing Tauri 集成结构,scope 外

## User Setup Required

None —— 纯 view 层重写,不需要迁移数据或环境配置。启动 `npm run dev` 即可看到:
- 当前月历(默认今天所在月)
- 三条 mock 事件(2025-05-15,如今天不是 5 月需翻月才能看到)
- 上/下/今天 按钮生效
- 点空白日期格 → 弹 create Dialog(日期预填)
- 点事件 chip → 弹 edit Dialog(所有字段预填)
- Agenda 底部"新建日程"按钮 → 弹 create Dialog(无 defaultDate)

## Next Phase Readiness

**Plan 06-04 (UAT checkpoint) 可以直接开跑:**

按 06-04-PLAN 的 UAT 动线:
1. 数据迁移验证 → 已就绪(Wave 1 persist v2 migration + mock 数据 YYYY-MM-DD)
2. 月份切换 → 已就绪(currentMonth state + 3 button)
3. 创建日程 → 已就绪(Agenda 按钮 + create Dialog + Toast)
4. 编辑日程 → 已就绪(chip click + edit Dialog 预填)
5. 删除日程 → 已就绪(edit Dialog 内嵌套删除确认)
6. 日期格点击预填 → 已就绪(空白格 → create + defaultDate)
7. 弱关联字段就位 → 已就绪(Combobox 选产品 → projectId 存入)

**Phase 7 (跨模块联动) 复用点:**
- 事件 chip 的 stopPropagation + click routing 模式可复用为"关联徽章点击跳转"
- 6 色 EVENT_COLORS 可扩展 —— Phase 7 用 type='task' 的紫色 chip 展示"从任务安排来的事件"

---
*Phase: 06-schedule-crud*
*Completed: 2026-08-10*

## Self-Check: PASSED

- FOUND: src/views/ScheduleView.tsx
- FOUND: .planning/phases/06-schedule-crud/06-03-SUMMARY.md
- FOUND: commit a71e45f (Task 1)
