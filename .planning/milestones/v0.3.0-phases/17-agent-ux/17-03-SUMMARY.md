---
phase: 17-agent-ux
plan: 03
subsystem: agent-ux
tags: [ux, morning-report, tdd, pure-functions]
requires: [scheduleStore, taskStore, memoryStore, chatConsoleStore, AgentWorkspaceView page host]
provides: [reportSelectors, MorningReport, daily-once morning report surface]
affects: [AgentWorkspaceView]
tech-stack:
  added: []
  patterns: [pure selector module (zero react/zustand) tested via node:test, localStorage day-stamp written at View mount, empty report still counts as shown]
key-files:
  created:
    - src/stores/reportSelectors.ts
    - src/stores/__tests__/morningReport.test.ts
    - src/components/MorningReport.tsx
  modified:
    - src/views/AgentWorkspaceView.tsx
decisions:
  - Daily stamp written from AgentWorkspaceView mount only (not ChatPanel) — ⌘K entry never consumes the day's report; stamp isDue captured in useState initializer so StrictMode remount preserves it
  - Empty report still writes the stamp (no re-check on every tab switch); all-empty day renders null entirely
  - hasConversation subscription + effect auto-collapses hero to bar when conversation starts; collapse state is component-local and survives nothing
metrics:
  duration: ~7 min
  completed: 2026-08-17
---

# Phase 17 Plan 03: 晨报结构化卡片 Summary

**One-liner:** 晨报三段结构化卡片（今日日程/过期任务/待确认记忆候选）落地 Agent 工作区 — reportSelectors 纯函数 + 6 用例锁定自由文本 deadline 安全，每日一戳 localStorage 去重，会话开始折叠为横条，纯数据查询零 LLM。

## What Was Done

### Task 1: reportSelectors 纯函数（TDD）(137ca8a RED / cbb398f GREEN)
- RED: `src/stores/__tests__/morningReport.test.ts` 6 用例 — 过期/远期、不可解析与空 deadline、今日边界（严格早于今日才算）、status 排除（'已完成'/'done'）、今日事件按 time 升序、ISO 前缀按日期部分比较。确认失败后提交
- GREEN: `src/stores/reportSelectors.ts` — `isOverdueDeadline`（正则 `^(\d{4})-(\d{2})-(\d{2})` 头部解析，本地零点比较，不匹配一律 false 绝不 throw）、`selectOverdueTasks`、`selectTodayEvents`。零 react/zustand import；Task/ScheduleEvent type-only import
- 152/152 全绿（本计划 +6），lint 本计划文件零错误

### Task 2: MorningReport 组件 + 挂载 (9054502)
- `src/components/MorningReport.tsx`（~200 行）: 展开态 hero（Card variant="default" p-5，Sparkle text-accent + 晨报 + formatChineseDate）+ 折叠横条，17-UI-SPEC Surface 3 JSX 逐字
- 每日一次: `isDue` 在 useState initializer 读 `localStorage['morning-report:last-shown']`，当日首次 mount 立即写戳（空报告也写）；同日后续 mount 返回 null。戳只从 View mount 写
- 数据: events = selectTodayEvents(scheduleStore.events, todayKey)；overdue = selectOverdueTasks(taskStore 全量 tasks)；memory 候选 = useEffect 内 getMemoryStore().listPending()（alive 标志防卸载后 setState）。三段空段省略，全空整体 null
- 折叠: hasConversation = chatConsoleStore messages.length > 0 订阅；collapsed 初始 = 会话已存在；effect 监听翻转自动 setCollapsed(true)
- 跳转: schedule 条目 → setActiveTab('schedule')；task 条目 → setActiveTab('tasks') + setSelectedTaskId(id)；memory 条目 → setChatPanelOpen(true)。均 getState() 在 handler 内取，零额外订阅
- `AgentWorkspaceView.tsx`: `<MorningReport />` 插入 glass Card 之上（17-01 预留注释位替换）

## Verification

- `npm test` 160/160 全绿（含新 morningReport.test.ts 6 用例；160 = 152 本计划 + 8 来自并行 17-02 新测试）
- `npm run lint`: 本计划全部文件零错误（见 Deviations — 全仓 lint 有一处并行兄弟计划文件的错误，非本计划产物）
- grep 验证: `morning-report:last-shown`、`收起晨报`、`text-warning`、`listPending`、`setChatPanelOpen(true)`、折叠横条 `· 待确认 {memoryPending.length}` 全部命中；`runToolLoop|fetch|generate` 零命中（零 LLM 确认）
- reportSelectors.ts 无 react/zustand import（零命中）

## Deviations from Plan

**1. [Note] read_first 引用的测试风格文件不存在**
- **Found during:** Task 1
- **Issue:** plan 引用 `src/stores/__tests__/taskAdvanced.test.ts`，该文件不存在（src/stores/__tests__/ 仅有 rndStore/settingsProvider 测试）
- **Fix:** 以 `settingsProvider.test.ts` 的 node:test + assert/strict 风格为参照，测试结构不受影响
- **Commit:** 无代码影响

**2. [Note] 全仓 lint 有一处非本计划错误**
- **Found during:** Task 2 verify
- **Issue:** `src/ai/__tests__/phase17ContextCarry.test.ts:11` TS2305（mockTasks 无 Product 导出）— 并行 17-02 兄弟计划的文件
- **Action:** 按 scope boundary 不触碰，已记录 `.planning/phases/17-agent-ux/deferred-items.md`，由 17-02/verifier 处理

## Known Stubs

None — 无占位实现。

## Self-Check: PASSED

All 3 key files exist; all 3 task commits (137ca8a, cbb398f, 9054502) verified in git log.
