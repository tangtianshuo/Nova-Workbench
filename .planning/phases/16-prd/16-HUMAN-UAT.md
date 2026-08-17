---
status: partial
phase: 16-prd
source: [16-VERIFICATION.md, 16-03-PLAN.md Task 2]
started: 2026-08-17
updated: 2026-08-17
---

## Current Test

[awaiting human testing — 按用户指令延后至统一 UAT 会话]

## Tests

前置：`npm run tauri:dev`（SQLite 真路径；web 模式可验流程但步骤 7 须 tauri:dev）。

### 1. 生成 PRD 草稿卡片
expected: 侧栏选中任一产品 → ChatPanel 输入「帮我为当前产品生成一份 PRD 草稿」→ 模型调用 generateDeliverable 后出现「待确认的 PRD 草稿」卡片（产品名 + 3 行预览 + 来源时间），对话不中断
result: [pending]

### 2. 取消无损
expected: 「确认并编辑」→ Dialog 预填草稿 → 改动文字 → 「取消」→ 卡片仍在；再次打开内容为原始草稿（编辑未持久）
result: [pending]

### 3. 落槽
expected: 编辑 → 「落槽至研发中心」→ toast「PRD 已落槽」、Dialog 关闭、卡片消失、助手追加「PRD 已落槽至研发中心,知识库立即可检索。」
result: [pending]

### 4. 溯源徽章
expected: 研发中心 → 产品详情 → 全生命周期交付物 → DEL-REQ-01 卡片阶段徽章后有 AI 徽章（Sparkle+AI），悬停显示「AI 生成 · yyyy-MM-dd HH:mm · 会话 <8位>」；相邻 mock 卡片无徽章
result: [pending]

### 5. 立即检索
expected: 知识库搜索 PRD 标题关键词（2 字词）→ 搜索结果命中该 PRD（来源 AI/agent），无等待窗口；deliverable 不进浏览列表/侧栏分类为预期行为（归属研发中心卡槽）
result: [pending]

### 6. 版本链
expected: 再生成一份（内容改动）→ 确认编辑落槽 → 知识库命中新版内容；DEL-REQ-01 内容更新、徽章仍在
result: [pending]

### 7. 重启恢复（tauri:dev）
expected: 生成草稿不确认 → 关闭应用 → 重启 → ChatPanel「待确认的 PRD 草稿」卡片恢复；确认落槽后重启，卡片不再出现（原子消费）
result: [pending]

### 8. 审计（可选）
expected: nova.db agent_events 每次成功落槽有一条 deliverable_committed 事件，payload 含 docId/version/ftsHitCount
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
