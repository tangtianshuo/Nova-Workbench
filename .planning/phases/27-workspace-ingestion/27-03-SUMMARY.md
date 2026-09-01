---
phase: 27-workspace-ingestion
plan: 03
subsystem: workspace-ingestion-frontend
tags: [ingestion, hitl, webview, zustand]
requires: [27-01, 27-02]
provides: [ingestion-tab-run, ingestionStore, IngestionPanel, IngestionBatchCard, webview-applier]
affects: [src/stores/tabRunStore.ts, src/views/FileArchiveView.tsx, src/App.tsx]
tech-stack:
  added: []
  patterns: [TabRunKind 扩展复用 startTabRun, candidate 分流 ingestionStore, consume→addTask/addEvent applier]
key-files:
  created:
    - src/stores/ingestionStore.ts
    - src/components/workspace/IngestionPanel.tsx
    - src/components/workspace/IngestionBatchCard.tsx
  modified:
    - src/stores/tabRunStore.ts
    - src/views/FileArchiveView.tsx
    - src/App.tsx
    - src/ai/api.ts
    - src-tauri/src/engine/ingest.rs
    - src-tauri/src/engine/commands.rs
decisions:
  - ingestion run 复用 startTabRun('ingestion' kind)，候选按 kind 分流进 ingestionStore 而非 console PRD 链
  - web dev fallback 无引擎时摄取入口禁用（Phase 26 同款，不留 mock）
metrics:
  duration: 35m
  completed: 2026-09-01
  tasks: 3
  files: 10
---

# Phase 27 Plan 03: 摄取前端编排 + 批量 HITL UI Summary

前端编排与聚合确认 UI：ingestion TabRunKind + ingestionStore（三态投影/批量卡/徽章）+ FileArchiveView 摄取面板（勾选→进度→三态→聚合编辑→一次提交）+ 全局队列入口卡 + webview applier（consume 返回的 task/schedule 项调 addTask/addEvent 落库）。

## Tasks Completed

| Task | Name | Commit | Key Changes |
| ---- | ---- | ------ | ----------- |
| 1 | tabRunKind 'ingestion' + ingestionStore + API 桥 | 19356dc | TabRunKind 扩展、useIngestionStore（startIngestion/submitBatch/dismissScan/refreshBadge）、engineConsumeIngestionBatch invoke 封装、ingestion_batch 候选分流 |
| 2 | FileArchiveView 摄取区 + 聚合卡 + 队列入口卡 | aa003c2 | IngestionPanel（勾选/三态/聚合编辑视图/D-01..D-05,09..D-12）、IngestionBatchCard 全局入口、submitBatch→toast 汇总、applier 落 task/schedule |
| 3 | 端到端人工验证（ING-03/04/06） | —（见 Pending Human UAT） | 自动化门禁全绿；7 步人工 E2E UAT 待人执行（auto-advance 下 checkpoint 已放行） |

## Verification

- npm run lint（tsc）绿
- npm run build 绿
- cargo test 191/191 绿
- npm test 222/222 绿

## Pending Human UAT

Task 3 的 7 步手动端到端验证**尚未执行**，需 phase verifier 持久化为 HUMAN-UAT 条目：

前置：Tauri dev（npm run tauri:dev）、已选产品、工作区含中文 docx + 中文 pdf + 扫描件（27-01 fixtures 可复制进工作区）。

1. FileArchiveView：未选产品时摄取按钮禁用且提示 → 选中产品后可点
2. 勾选 2 个文档发起摄取：进度可见（扫描→分类→草稿），结束后三态列表正确（扫描件显示 failed+原因）
3. 全局队列出现「摄取批次待确认（N 项）」入口卡，点击跳回文件区并展开聚合视图
4. 聚合视图：全不选→提交 无落库；恢复全选、改一个标题、点开编辑一个知识 content→提交；toast 汇总数字正确
5. 知识库 FTS 中文检索：搜刚摄取文档的中文短语可命中（ING-06）
6. 任务页/日历立即可见确认的任务/日程草稿（ING/D-16）
7. 对同一批文件再次发起摄取：已摄取项被跳过（diff），扫描件 failed 仍重试（ING-05）

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

无（web dev fallback 无引擎时入口禁用，为设计行为非 stub）。

## Self-Check: PASSED
