---
created: 2026-08-11T15:00:12.860Z
title: 优化日历单元格日程密度防止溢出
area: ui
files:
  - src/views/ScheduleView.tsx:212
  - src/views/ScheduleView.tsx:241
---

## Problem

月历 grid 单元格(`min-h-[90px]`,line 225)在日程事件多时,所有 events 直接堆叠渲染(line 241 附近 `cell.events.map(...)`),没有任何限制或截断机制。结果:

- 同一天有 4-5+ 个事件时,events 文字溢出单元格底部,被相邻格子覆盖
- 日历视觉混乱,用户难以一眼看清每日日程
- 当前 cell 高度固定 90px,无法适应不同密度

涉及位置:
- 单元格容器:line 212-301 (`grid grid-cols-7 ...` 整个月历)
- 单元格 event 渲染:line 241 `const c = EVENT_COLORS[e.type] || EVENT_COLORS.meeting;` 周边

## Solution

TBD — 候选方向(实施时再决定):

1. **"+N more" 截断**:单元格内只显示前 2-3 个 event,剩余折叠成 `+N` 链接,hover/click 弹出完整列表(Popover)
2. **单元格内 mini scroll**:单元格自身加 `overflow-y-auto max-h-[80px]`(可能造成视觉抖动)
3. **event pill 紧凑化**:把 event 文字简化为彩色 dot + 时间,完整标题靠 hover tooltip 展示
4. **自适应行高**:让月历 grid 行高根据当周最大事件数动态调整(可能撑高整个日历)

推荐方向 1(`+N more` + Popover),业界标准做法(Apple Calendar / Google Calendar 都这么做)。

## Captured During

Quick task 260811-vg6 跟进 — 用户测试 ScheduleView 高度调整后,发现日历内日程密度问题。该问题独立于容器高度,需要单独处理。

## Related Follow-up(同 todo 范围,执行时一并讨论)

用户在 260811-vg6 跟进对话中补充:**"日历需要能被日程撑开"**。当前实现 `h-[calc(100vh-220px)] min-h-[400px]` 把日历锁死在视口高度,导致月历单元格被压缩。

可能的意图(实施时与用户确认,三选一):
- **A. 撤销锁高,页面级滚动** —— 容器不限高,Agenda 内容驱动整体高度,Calendar 跟随撑开,超出视口走 `<main>` 滚动(不再是 Agenda 内部滚动)
- **B. 设上限但允许撑开** —— 容器 `min-h-[400px]` 起步,内容多时撑开 Calendar,只有撑到视口极限才出现 Agenda 内部滚动条
- **C. 只放宽 Calendar 单元格** —— 保持当前 Agenda 内部滚动逻辑,改的是 Calendar grid 单元格内部布局(让 events 在单元格内有更多展示空间)

A/B/C 与上面的"日程密度"问题强相关(都涉及 Calendar 单元格如何展示 events),实施时统一讨论方案。
