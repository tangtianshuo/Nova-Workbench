---
status: pending
phase: 06-schedule-crud
source: [06-VERIFICATION.md]
started: 2026-08-10T12:15:00Z
updated: 2026-08-10T12:15:00Z
uat_strategy: batch (per user preference — MEMORY.md uat-strategy.md)
---

## Current Test

[queued for batch UAT after Phase 10]

## Tests

### 1. persist v2 migration with legacy v1 data
expected: 旧 v1 number date 在 SQLite (nova-schedule) 中持久化,下次加载时自动迁移到 '2025-05-DD' 字符串;导航到 2025 年 5 月网格后,三条 mock 事件(需求评审会/设计走查/团队周报对齐)保持可见于 5 月 15 日格。
result: [pending]

### 2. Month navigation UX feel (prev/next/today)
expected: 点击 prev/next 后标题立即更新;含前后月尾/首日的月份网格计算正确;'今天'按钮从任意位置立即回到今天所在月份;今天格显示 accent 蓝色圆形高亮。
result: [pending]

### 3. Create flow end-to-end (SCHED-01)
expected: 点'新建日程'打开 ScheduleDialog(create 模式,今天预填);填 6 个字段(标题/日期/时间/类型/地点/产品)后提交,Dialog 关闭,Toast '日程已创建';对应格出现事件 chip,颜色按 type;Agenda 列表更新。
result: [pending]

### 4. Edit flow prefill (SCHED-02)
expected: 点事件 chip 打开 edit 模式,所有 6 个字段从 event 预填(标题/日期/时间/类型/地点/关联产品);修改标题+类型 → 保存 → chip 更新 + Toast '已保存'。
result: [pending]

### 5. Delete flow with nested confirmation (SCHED-03)
expected: edit dialog → 点'删除'按钮 → 嵌套确认 Dialog 打开,z-index 正确叠加;'取消'返回 edit dialog;'删除'触发 deleteEvent、关闭双 dialog、Toast '日程已删除';事件 chip 从网格消失。
result: [pending]

### 6. Cell-click create with prefilled date
expected: 点当月空白日期格 → create dialog 打开,date 字段预填为该格 YYYY-MM-DD;非当月格(opacity-25)点击不触发 dialog。
result: [pending]

### 7. Weak-link fields (SCHED-06/SCHED-07) round-trip
expected: 创建事件带 projectId(通过 Combobox)→ 刷新后仍持久 → 再次编辑显示相同产品被选中。类型联合含 'task',Phase 7 的'AI 安排到日历'可构造 type:'task' 事件。
result: [pending]

### 8. Combobox product search + clear
expected: 产品 Combobox 打开 Popover 展示搜索框+列表;输入过滤产品;选中设置 projectId + 更新 trigger 显示;点 X 清除 projectId 回到 placeholder。
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

(none — batch UAT queued)
