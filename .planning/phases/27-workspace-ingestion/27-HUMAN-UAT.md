---
status: diagnosed
phase: 27-workspace-ingestion
source: [27-VERIFICATION.md]
started: 2026-09-01T09:35:00+08:00
updated: 2026-09-02T00:00:00+08:00
---

## Current Test

[testing complete]

## Tests

### 1. UAT-1 未选产品禁用入口
expected: FileArchiveView 摄取按钮禁用并提示「请先选择产品」，选中产品后可点
result: pass

### 2. UAT-2 发起摄取全程进度可见 + 三态正确
expected: 勾选中文 docx+pdf+扫描件发起摄取，进度（扫描→分类→草稿）可见，扫描件显示 failed+原因
result: issue
reported: "生成完成 — 0 份候选已提交确认"
severity: major

### 3. UAT-3 全局队列入口卡跳转
expected: 队列出现「摄取批次待确认(N 项)」卡，点击跳回文件区并展开聚合视图
result: skipped
reason: 依赖 UAT-2 候选产出（0 候选，无可确认批次），待 UAT-2 修复后回归

### 4. UAT-4 批量 HITL 编辑流
expected: 全不选提交无落库；全选+改标题+编辑 content 提交后 toast 汇总数字正确
result: skipped
reason: 依赖 UAT-2 候选产出（0 候选，无可编辑批次），待 UAT-2 修复后回归

### 5. UAT-5 知识库 FTS 中文检索命中 (ING-06)
expected: 搜刚摄取文档中的中文短语可命中
result: skipped
reason: 依赖 UAT-2 候选落库（0 候选，知识库无新文档可检索），待 UAT-2 修复后回归

### 6. UAT-6 任务/日程立即可见
expected: 确认后任务页与日历立即出现确认的草稿
result: skipped
reason: 依赖 UAT-2 候选确认落库（0 候选），待 UAT-2 修复后回归

### 7. UAT-7 重扫幂等 (ING-05)
expected: 同一批文件再次摄取：已摄取项跳过（diff），扫描件 failed 仍重试
result: skipped
reason: 用户选择待 UAT-2 修复后与全链路一起回归

## Summary

total: 7
passed: 1
issues: 1
pending: 0
skipped: 5
blocked: 0

## Gaps

- truth: "勾选中文 docx+pdf+扫描件发起摄取，产出候选（知识/任务/日程草稿）进入批量确认，扫描件显示 failed+原因"
  status: failed
  reason: "User reported: 生成完成 — 0 份候选已提交确认（run 完成但 ingest_submit 提交 0 候选，docx+pdf 未产出任何草稿）"
  severity: major
  test: 2
  root_cause: "src-tauri/src/lib.rs sql_migrations() 注册表止于 0009，0010_ingested_documents.sql 与 0011_confirmation_kind_ingestion.sql 文件存在但未 include_str! 注册，真机 nova.db 缺 ingested_documents 表 → 每次摄取 run 的 ingest_scan 报 'no such table: ingested_documents'，LLM fallback 到 fs_read（docx 二进制读失败）/exec python（卡 HITL/超时），未产出任何条目也未调 ingest_submit，run 以 0 候选正常结束。单测全绿是因测试走 mem_conn 全量迁移，与生产注册表两条路径。"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      issue: "sql_migrations() Vec 漏注册 0010/0011（根因）"
    - path: "src-tauri/migrations/0010_ingested_documents.sql"
      issue: "文件在，未接线"
    - path: "src-tauri/migrations/0011_confirmation_kind_ingestion.sql"
      issue: "文件在，未接线；未应用意味着 candidates kind CHECK 不含 ingestion_batch，scan 修好后 submit 仍会被拒——必须与 0010 一起补"
  missing:
    - "在 sql_migrations() Vec 追加 0010/0011 两个 Migration 条目（include_str! 同款写法）"
    - "加一个『注册表数量 == migrations 目录文件数量』防复发断言（测试与生产两条路径导致的盲区）"
  debug_session: .planning/debug/ingestion-zero-candidates.md
