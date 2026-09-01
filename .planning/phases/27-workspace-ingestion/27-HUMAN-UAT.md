---
status: partial
phase: 27-workspace-ingestion
source: [27-VERIFICATION.md]
started: 2026-09-01T09:35:00+08:00
updated: 2026-09-01T09:35:00+08:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. UAT-1 未选产品禁用入口
expected: FileArchiveView 摄取按钮禁用并提示「请先选择产品」，选中产品后可点
result: [pending]

### 2. UAT-2 发起摄取全程进度可见 + 三态正确
expected: 勾选中文 docx+pdf+扫描件发起摄取，进度（扫描→分类→草稿）可见，扫描件显示 failed+原因
result: [pending]

### 3. UAT-3 全局队列入口卡跳转
expected: 队列出现「摄取批次待确认(N 项)」卡，点击跳回文件区并展开聚合视图
result: [pending]

### 4. UAT-4 批量 HITL 编辑流
expected: 全不选提交无落库；全选+改标题+编辑 content 提交后 toast 汇总数字正确
result: [pending]

### 5. UAT-5 知识库 FTS 中文检索命中 (ING-06)
expected: 搜刚摄取文档中的中文短语可命中
result: [pending]

### 6. UAT-6 任务/日程立即可见
expected: 确认后任务页与日历立即出现确认的草稿
result: [pending]

### 7. UAT-7 重扫幂等 (ING-05)
expected: 同一批文件再次摄取：已摄取项跳过（diff），扫描件 failed 仍重试
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
