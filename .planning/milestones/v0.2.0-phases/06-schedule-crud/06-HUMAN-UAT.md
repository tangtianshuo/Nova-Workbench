---
status: passed
phase: 06-schedule-crud
source: [06-VERIFICATION.md]
started: 2026-08-10T12:15:00Z
updated: 2026-08-11T15:10:00Z
---

## Current Test

(none — all tests resolved; 7 passed / 1 skipped / 0 issues)

## Tests

### 1. persist v2 migration with legacy v1 data
expected: 旧 v1 number date 在 SQLite (nova-schedule) 中持久化,下次加载时自动迁移到 '2025-05-DD' 字符串;导航到 2025 年 5 月网格后,三条 mock 事件(需求评审会/设计走查/团队周报对齐)保持可见于 5 月 15 日格。
result: skipped
reason: v1 生命周期短(仅 Phase 4-5 之间数周),无真实用户数据需要迁移;migrate 函数在 scheduleStore.ts 单元测试中已覆盖;归入 tech_debt。

### 2. Month navigation UX feel (prev/next/today)
expected: 点击 prev/next 后标题立即更新;含前后月尾/首日的月份网格计算正确;'今天'按钮从任意位置立即回到今天所在月份;今天格显示 accent 蓝色圆形高亮。
result: passed
note: 2026-08-11 用户确认。

### 3. Create flow end-to-end (SCHED-01)
expected: 点'新建日程'打开 ScheduleDialog(create 模式,今天预填);填 6 个字段(标题/日期/时间/类型/地点/产品)后提交,Dialog 关闭,Toast '日程已创建';对应格出现事件 chip,颜色按 type;Agenda 列表更新。
result: passed
note: 2026-08-11 用户确认。

### 4. Edit flow prefill (SCHED-02)
expected: 点事件 chip 打开 edit 模式,所有 6 个字段从 event 预填(标题/日期/时间/类型/地点/关联产品);修改标题+类型 → 保存 → chip 更新 + Toast '已保存'。
result: passed
note: 2026-08-11 用户确认。修复 GAP-01(chip + agenda 显示 type/产品名)后通过。

### 5. Delete flow with nested confirmation (SCHED-03)
expected: edit dialog → 点'删除'按钮 → 嵌套确认 Dialog 打开,z-index 正确叠加;'取消'返回 edit dialog;'删除'触发 deleteEvent、关闭双 dialog、Toast '日程已删除';事件 chip 从网格消失。
result: passed
note: 2026-08-11 用户确认。

### 6. Cell-click create with prefilled date
expected: 点当月空白日期格 → create dialog 打开,date 字段预填为该格 YYYY-MM-DD;非当月格(opacity-25)点击不触发 dialog。
result: passed
note: 2026-08-11 用户确认。

### 7. Weak-link fields (SCHED-06/SCHED-07) round-trip
expected: 创建事件带 projectId(通过 Combobox)→ 刷新后仍持久 → 再次编辑显示相同产品被选中。类型联合含 'task',Phase 7 的'AI 安排到日历'可构造 type:'task' 事件。
result: passed
note: 2026-08-11 用户确认。

### 8. Combobox product search + clear
expected: 产品 Combobox 打开 Popover 展示搜索框+列表;输入过滤产品;选中设置 projectId + 更新 trigger 显示;点 X 清除 projectId 回到 placeholder。
result: passed
note: 2026-08-11 用户确认。

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

### GAP-01: 日程 chip 缺少类型 + 关联产品名称显示 ✓ RESOLVED

- **Test:** 4 (Edit flow prefill)
- **Severity:** low (UX polish,不影响功能)
- **Description:** 网格中事件 chip 当前只显示标题;用户期望 chip 内同时显示
  - 日程类型(meeting/deadline/reminder/social/task)— 当前仅通过背景色编码,无显式文字/图标
  - 关联产品名称(如有 projectId)— 当前完全不可见
- **Expected:** chip 内出现 type 标签(文字或图标 + 颜色)+ 产品名缩写(如有 projectId)
- **Actual:** 仅显示标题
- **Repro:** 创建一个带 projectId 的事件 → 观察网格 chip
- **Resolved:** 2026-08-11,`src/views/ScheduleView.tsx`:
  - 网格 chip 加 1 字中文 type 标签(`TYPE_TAG`,会/截/任/提/审/同/交)+ 产品名 button(max-w 48px,点击打开抽屉)
  - Agenda 卡片加完整中文 type pill(`TYPE_LABEL`,会议/截止/任务/...)+ 产品名 pill + 任务 pill
  - 删除 33 行废弃的 `renderAssociationButtons` 函数 + 未用的 `FolderSimple` import
- **Verification:** 用户在 Test 4 re-verify 中 `pass`。
