---
status: testing
phase: 05-task-crud
source: [05-VERIFICATION.md, 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md]
started: 2026-08-11T15:30:00Z
updated: 2026-08-11T15:30:00Z
---

## Current Test

number: 1
name: 内联编辑 + 400ms 自动保存手感
expected: |
  展开任务卡片,修改标题,停顿 500ms,刷新页面 → 标题已保存,刷新后显示新值。
awaiting: user response

## Tests

### 1. 内联编辑 + 400ms 自动保存手感
expected: 展开任务卡片,修改标题,停顿 500ms(超过 debounce 阈值),刷新页面 → 标题已保存,刷新后显示新值。需观察实际 debounce 触发时机和视觉反馈(若有)。
result: [pending]

### 2. DnD 与 click-to-expand 8px 阈值手感
expected: 短距离(<8px)拖动卡片应触发 click-to-expand(展开详情);长距离拖动(超过 8px)应触发 DnD 列间移动。PointerSensor 阈值不冲突,两种交互可区分。
result: [pending]

### 3. ProductSummaryDrawer 动画 + 跳转
expected: 点击任务卡片上的产品徽章 → ProductSummaryDrawer(360px)从右侧滑入;点"打开详情" → 切到产品 tab 并打开产品详情视图。动画流畅,跳转后定位正确。
result: [pending]

### 4. 实时计数 Badge 动画 (D-06)
expected: 拖拽任务卡片时,源列与目标列的计数 Badge 实时增减(拖拽中可见);Badge 用 motion.span key={count} 实现数字切换动画。
result: [pending]

### 5. persist v1→v2 实际迁移
expected: 浏览器 devtools 检查 'nova-task' localStorage 的 version 字段 = 2;每个 task 含 projectId 字段(可能为 null)、scheduledEventId 字段。需要实际有 v1 旧数据的浏览器环境验证 migration 函数运行结果。
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

(none — batch UAT queued)
