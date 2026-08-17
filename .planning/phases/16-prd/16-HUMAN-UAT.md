---
status: testing
phase: 16-prd
source: [16-VERIFICATION.md, 16-03-PLAN.md Task 2]
started: 2026-08-17
updated: 2026-08-17
---

## Current Test

number: 1
name: 生成 PRD 草稿卡片(修复后回归)
expected: |
  侧栏选中任一产品 → ChatPanel 输入「帮我为当前产品生成一份 PRD 草稿」→ 模型调用 generateDeliverable 后
  出现「待确认的 PRD 草稿」卡片(产品名 + 3 行预览 + 来源时间),对话不中断
awaiting: user response(after migration 0006 rebuild)

## Tests

前置：`npm run tauri:dev`（SQLite 真路径；web 模式可验流程但步骤 7 须 tauri:dev）。

### 1. 生成 PRD 草稿卡片
expected: 侧栏选中任一产品 → ChatPanel 输入「帮我为当前产品生成一份 PRD 草稿」→ 模型调用 generateDeliverable 后出现「待确认的 PRD 草稿」卡片（产品名 + 3 行预览 + 来源时间），对话不中断
result: issue
reported: |
  generateDeliverable 失败(trace 红色)
severity: blocker
resolution: |
  GAP-16-01(Claude 代查 agent_events seq 125-128):tool_error "CHECK constraint failed:
  kind IN ('knowledge_write', 'destructive_action')" — 0003 迁移的 CHECK 未含 Phase 16 的
  'deliverable_draft';单测走 MemoryConfirmationStore 故未拦截,真实 SQLite 才炸(与 Phase 13
  「真实 INSERT 无自动化覆盖」同类盲区)。
  修复:migration 0006(SQLite CHECK 不可 ALTER,canonical 建新表→拷数据→换名重建;数据保留)+
  lib.rs 注册 version 6 + APP_SCHEMA_VERSION=6 + 新增 sqlSchemaCheckConstraints.test.ts
  (node:sqlite 执行真实迁移 SQL,锁定应用层 kind 与 DDL 不再漂移)。161/161 绿。回归待验证。

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
issues: 1
pending: 7
skipped: 0
blocked: 0

## Gaps

```yaml
- id: GAP-16-01
  test: 1
  severity: blocker
  symptom: generateDeliverable 落库失败 — CHECK constraint kind IN ('knowledge_write','destructive_action') 拒插 deliverable_draft
  root_cause: Phase 16 应用层新增 ConfirmationKind='deliverable_draft' 但未重建 0003 的 SQL CHECK;单测走 MemoryStore 无 DDL 覆盖
  fix: migration 0006 表重建(数据保留)+ lib.rs version 6 + APP_SCHEMA_VERSION 6 + node:sqlite 真实迁移 SQL 回归测试
  status: fixed — awaiting regression(应用重启后重试 Test 1)
```
