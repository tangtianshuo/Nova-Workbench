---
status: testing
phase: 16-prd
source: [16-VERIFICATION.md, 16-03-PLAN.md Task 2]
started: 2026-08-17
updated: 2026-08-17
---

## Current Test

number: 4/5/6 组合验证
name: 溯源徽章 + 立即检索点击 + 版本链
expected: |
  4: 研发中心 DEL-REQ-01 卡片有 AI 徽章(Sparkle+AI),悬停「AI 生成 · 时间 · 会话 <8位>」;
  5: 知识库搜索 PRD 关键词 → 命中 → 点击能正常查看全文(4732a04 修复后);
  6: 再让 agent 生成一份内容有改动的草稿 → 落槽 → 版本链 supersede
awaiting: user response

## Tests

前置：`npm run tauri:dev`（SQLite 真路径；web 模式可验流程但步骤 7 须 tauri:dev）。

### 1. 生成 PRD 草稿卡片
expected: 侧栏选中任一产品 → ChatPanel 输入「帮我为当前产品生成一份 PRD 草稿」→ 模型调用 generateDeliverable 后出现「待确认的 PRD 草稿」卡片（产品名 + 3 行预览 + 来源时间），对话不中断
result: pass
note: |
  首测 issue(GAP-16-01,blocker):generateDeliverable 落库失败 — 0003 迁移 CHECK 未含
  'deliverable_draft'(单测走 MemoryStore 未拦截,真实 SQLite 才炸)。修复:migration 0006 表重建
  (数据保留)+ lib.rs v6 + APP_SCHEMA_VERSION=6 + node:sqlite 真实迁移 SQL 回归测试(0dbb2f1)。
  回归 pass:卡片出现,进入 Test 2。

### 2. 取消无损
expected: 「确认并编辑」→ Dialog 预填草稿 → 改动文字 → 「取消」→ 卡片仍在；再次打开内容为原始草稿（编辑未持久）
result: pass
note: |
  首测 issue(GAP-16-02):PrdDraftDialog 被 PRD 长文撑开无法预览 — DialogContent 无高度上限,
  MDXEditor 随内容无限长高。修复(4732a04):DialogContent flex max-h-[85vh] + DialogBody
  min-h-0 flex-1 overflow-y-auto,Header/Footer 固定。修复后取消/重开流程正常,卡片与原始草稿保留。

### 3. 落槽
expected: 编辑 → 「落槽至研发中心」→ toast「PRD 已落槽」、Dialog 关闭、卡片消失、助手追加「PRD 已落槽至研发中心,知识库立即可检索。」
result: pass
note: |
  用户确认落槽成功,助手消息与预期一致。Claude 代查:knowledge_docs 行 deliverable-p1-DEL-REQ-01
  v1(content 5021 字符,source_type=agent,source_event_id=17c95940);deliverable_committed 事件
  ftsImmediateHit:true ftsHitCount:1(Test 8 审计子项同步闭合)。
  随后发现 GAP-16-03:知识库搜索命中该 PRD 后点击查看失败 — currentItem 只在浏览投影 allItems 里
  查找,deliverable 按设计不进浏览列表 → 回退显示第一篇普通文章。修复(4732a04):搜索命中不在
  浏览列表时按需 getCurrentDocs() 取全文渲染,编辑按钮对 repo 来源禁用,清除筛选回选浏览列表。

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
passed: 3
issues: 0
pending: 5
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
  status: resolved(0dbb2f1,回归 pass)
- id: GAP-16-02
  test: 2
  severity: minor
  symptom: PrdDraftDialog 被 PRD 长文撑开,无法正常预览
  root_cause: DialogContent 无高度上限,MDXEditor 随内容无限长高
  fix: DialogContent flex max-h-[85vh] + DialogBody min-h-0 flex-1 overflow-y-auto
  status: resolved(4732a04,回归 pass)
- id: GAP-16-03
  test: 5
  severity: major
  symptom: 知识库搜索命中落槽 PRD 后,点击查看显示的是别的文档
  root_cause: currentItem 只在浏览投影 allItems 查找;deliverable 按设计不进浏览列表 → find 落空回退 allItems[0]
  fix: 搜索命中不在浏览列表时按需 getCurrentDocs() 取全文渲染详情面板;repo 来源禁用编辑;清除筛选回选浏览列表
  status: fixed(4732a04)— awaiting regression
```
