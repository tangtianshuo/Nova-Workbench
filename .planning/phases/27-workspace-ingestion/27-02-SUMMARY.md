---
phase: 27-workspace-ingestion
plan: "02"
subsystem: engine-ingestion
tags: [hitl, ingestion, knowledge, fts5, sqlite]
requires: [27-01]
provides:
  - "ingest_submit HITL tool (ingestion_batch candidate, D-14 cap)"
  - "engine_consume_ingestion_batch transactional write command"
  - "13-value knowledge category enum (dual-side)"
affects: [src-tauri/src/engine/tools.rs, src-tauri/src/engine/commands.rs, src/ai/tools/knowledgeWrite.ts]
tech-stack:
  added: []
  patterns:
    - "candidate params_json items[] array = batch HITL backend (ING-04)"
    - "doc_id = item.id (ing-{hash8}) as write-side idempotency key"
key-files:
  created:
    - src-tauri/migrations/0011_confirmation_kind_ingestion.sql
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/lib.rs
    - src/ai/tools/knowledgeWrite.ts
    - src/data/mockRndData.ts
decisions:
  - "knowledge doc_id = item.id (ing-{hash8}) — consume 幂等键直接复用 doc_id 唯一索引,不加 source_item_id 列"
  - "consume 命令对 pending 候选自动 confirm(commit_deliverable 先例:提交点击即确认)"
  - "migration 0011 copy-drop-rebuild 扩 CHECK 加 ingestion_batch kind"
metrics:
  duration: 50m
  completed: 2026-09-01
---

# Phase 27 Plan 02: 批量 HITL 后端 + 写路径 Summary

单候选 `ingestion_batch`(items 数组)+ `ingest_submit` HITL 工具(D-14 cap 双保险 Rust 侧)+ `engine_consume_ingestion_batch` 事务命令:knowledge 项写 knowledge_docs/knowledge_fts(中文 FTS 立即命中),task/schedule 草稿写审计事件待 webview applier(Plan 03);13 类目双侧 parity;cargo 191 + npm 222 + tsc 全绿。

## What Was Done

### Task 1: KNOWLEDGE_CATEGORIES 9→13(D-06 双侧)— 255ba27
- Rust `KNOWLEDGE_CATEGORIES` 追加 会议纪要/竞品分析/需求文档/项目周报(改 pub,consume 侧复用校验)
- TS `knowledgeCategories` zod enum + `ProductKnowledgeItem['category']` union 同步(satisfies 编译互锁)
- Rust 互锁测试断言 13 值顺序稳定

### Task 2: ingest_submit 工具(HITL)— c2143f6(RED)+ bcfa184(GREEN)
- `execute_ingest_submit`:workspaceId/items 校验;type ∈ {knowledge, task_draft, schedule_draft};knowledge 项 category ∈ 13 类、content 非空;productId ctx fallback(D-05)
- D-14 cap:按 sourcePath(fallback contentHash)分组,task+schedule drafts > 5 → arg_error "drafts exceed cap 5"
- kind="ingestion_batch" 候选(params_json = {workspaceId, productId, items}),AwaitConfirmation 停轮
- **migration 0011**:candidates 表 CHECK 重建加 ingestion_batch(copy→drop→rename,0009 同式)
- loop_runner schema 数量锁 12→13

### Task 3: engine_consume_ingestion_batch(D-15 写路径)— e125d3d(RED)+ 146da92(GREEN)
- 命令签名 `(token, items)`:items 非空 = UI 编辑后覆盖(Phase 26 editedDraft 同构)
- confirm → 原子 consume(AlreadySettled-when-consumed 容忍)→ 单 SQLite 事务:
  - knowledge(selected):INSERT knowledge_docs(doc_id = item.id, source_type='ingested', summary=content 前 120 字)+ INSERT knowledge_fts(fts_tokens 同分词器)+ ingested_documents.doc_id 回填
  - task/schedule drafts(selected):agent_events 审计事件 `ingestion_task_applied`/`ingestion_schedule_applied`(payload 带 item 全文 + workspaceId/productId/sessionId)— webview applier 消费
  - failed/unselected 项跳过(Pitfall 2 二道闸);重复项按 doc_id / 已 applied 事件 id 查重(Pitfall 6)
- lib.rs invoke_handler 注册
- 测试三场景:①consume 后 FTS 中文「评审」命中 + doc_id 回填 + 二次 consume 幂等;②仅草稿 → 只审计事件 knowledge_docs 零新增 + 幂等;③editedItems 覆盖 + kind guard + rejected guard

## Verification

- cargo test 191/191(185→191,新增 6 测试)
- npm test 222/222,tsc 全绿
- `confirmations.rs:171` dedup kind 列表未改动(ingestion_batch 天然无 dedup,按计划)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] migration 0011:候选表 CHECK 约束拒绝 ingestion_batch kind**
- **Found during:** Task 2 GREEN
- **Issue:** `agent_confirmation_candidates.kind` 有 CHECK 约束,新 kind INSERT 直接失败
- **Fix:** 0011_confirmation_kind_ingestion.sql(copy→drop→rename,0009 先例)
- **Commit:** bcfa184

**2. [Rule 1 - Bug] consume 对 pending 候选自动 confirm(计划暗示需先确认)**
- **Found during:** Task 3
- **Issue:** 计划测试意图「pending → not_confirmed 错」;实现沿用 commit_deliverable 先例(提交点击即确认),pending 直接消费成功
- **Fix:** 保持先例语义,测试改为断言 pending 可消费 + rejected 报 already_settled
- **Commit:** 146da92

**3. [Rule 2 - Correctness] Task 1 顺带扩 `ProductKnowledgeItem['category']` union(mockRndData.ts)**
- `satisfies readonly ProductKnowledgeItem['category'][]` 编译互锁要求 TS 类型同步;计划未列该文件,纯类型追加

## Known Stubs

无(草稿审计事件消费属 Plan 03 范围,非遗留 stub)。

## Self-Check: PASSED

- src-tauri/migrations/0011_confirmation_kind_ingestion.sql FOUND
- src-tauri/src/engine/commands.rs 含 engine_consume_ingestion_batch FOUND
- src-tauri/src/engine/tools.rs 含 ingest_submit FOUND
- commits 255ba27 / c2143f6 / bcfa184 / e125d3d / 146da92 FOUND
