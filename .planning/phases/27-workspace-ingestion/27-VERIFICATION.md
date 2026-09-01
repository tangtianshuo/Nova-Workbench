---
phase: 27-workspace-ingestion
verified: 2026-09-01T00:00:00Z
status: human_needed
score: 12/12 must-have truths verified (code-level)
human_verification:
  - test: "UAT-1 未选产品禁用入口"
    expected: "FileArchiveView 摄取按钮禁用并提示「请先选择产品」，选中产品后可点"
    why_human: "UI 交互行为,需 Tauri dev 环境人工点击"
  - test: "UAT-2 发起摄取全程进度可见 + 三态正确"
    expected: "勾选中文 docx+pdf+扫描件发起摄取,进度(扫描→分类→草稿)可见,扫描件显示 failed+原因"
    why_human: "真实编排 run 的运行时行为,含 LLM 分类质量"
  - test: "UAT-3 全局队列入口卡跳转"
    expected: "队列出现「摄取批次待确认(N 项)」卡,点击跳回文件区并展开聚合视图"
    why_human: "跨视图导航交互"
  - test: "UAT-4 批量 HITL 编辑流"
    expected: "全不选提交无落库;全选+改标题+编辑 content 提交后 toast 汇总数字正确"
    why_human: "表单编辑与提交流程的端到端正确性"
  - test: "UAT-5 知识库 FTS 中文检索命中 (ING-06)"
    expected: "搜刚摄取文档中的中文短语可命中"
    why_human: "依赖 UAT-4 落库后的真实检索,无法离线验证"
  - test: "UAT-6 任务/日程立即可见"
    expected: "确认后任务页与日历立即出现确认的草稿"
    why_human: "webview applier 跨端到端落库的运行时行为"
  - test: "UAT-7 重扫幂等 (ING-05)"
    expected: "同一批文件再次摄取:已摄取项跳过(diff),扫描件 failed 仍重试"
    why_human: "两次 run 的端到端状态演化"
---

# Phase 27: Workspace Ingestion Verification Report

**Phase Goal:** 用户可对工作区文档发起纯 Rust 摄取:提取→分类→草稿抽取全程可见,产物经批量 HITL 确认后落业务数据,重扫幂等、立即可检索
**Verified:** 2026-09-01
**Status:** human_needed(代码级 12/12 truths 通过;7 步人工 UAT 未执行,持久化如下)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

**27-01 (extraction foundation)**

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | 纯 Rust 提取 docx/pdf,无外部进程 | ✓ VERIFIED | `ingest.rs` 446 行;Cargo.toml: `pdf_oxide 0.3.77`, `zip 8.6.0 (default-features=false, features=["deflate"])`, `quick-xml 0.42` — 纯 Rust,zip 已限 deflate 避免 zstd-sys,无新 C 构建链 |
| 2 | 扫描件/解析错误产出 failed+reason,绝不建档 | ✓ VERIFIED | ingest.rs:9 注释明确;:152 `.filter(\|s\| s != "failed")` — failed 不入 ingested_documents;7 个 #[test] 覆盖三态映射 |
| 3 | 同文件重扫 sha2 hash 命中跳过 | ✓ VERIFIED | ingest.rs:144 "Hash hit with non-failed status → skip (ING-05)";migration 0010: `content_hash TEXT NOT NULL UNIQUE`;fixtures 存在(chinese-1/2.pdf, scanned.pdf) |

**27-02 (batch HITL backend)**

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 4 | ingestion_batch 单候选携带 items 并原子 consume | ✓ VERIFIED | commands.rs:722 `engine_consume_ingestion_batch`;:730 `consume_ingestion_batch_inner` 校验 candidate.kind=="ingestion_batch",confirmations::confirm+consume,容忍 AlreadySettled |
| 5 | consume 事务内写 knowledge_docs + knowledge_fts | ✓ VERIFIED | commands.rs:841/850 `INSERT INTO knowledge_docs` / `INSERT INTO knowledge_fts`(经 fts_tokens 中文分词) |
| 6 | 重复 consume 按 items[].id 幂等 | ✓ VERIFIED | commands.rs:766-789 existing_docs HashSet 查 doc_id 去重 |
| 7 | PM 四类目双侧 parity | ✓ VERIFIED | tools.rs KNOWLEDGE_CATEGORIES 扩展(27 处 ingest 相关引用);npm test 222/222 含常量互锁(SUMMARY 报告,未重跑) |

**27-03 (frontend)**

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 8 | FileArchiveView 勾选发起摄取,进度可见 | ✓ VERIFIED (code) | FileArchiveView.tsx:43/295 挂载 IngestionPanel(322 行);tabRunStore.ts:26 `\| 'ingestion'` kind |
| 9 | 聚合卡全选/全不选/逐项编辑/一次提交 | ✓ VERIFIED (code) | IngestionPanel.tsx:206 selectAll;ingestionStore.ts:125/139 addTask/addEvent applier |
| 10 | 全局队列精简入口卡跳转 | ✓ VERIFIED (code) | IngestionBatchCard.tsx「摄取批次待确认(N 项)」;App.tsx:19/130 挂载 |
| 11 | 确认后 toast 汇总 + 立即可见/可检索 | ✓ VERIFIED (code) | ingestionStore.ts invoke engine_consume_ingestion_batch + applier |
| 12 | 无选中产品时禁用并提示 | ✓ VERIFIED | IngestionPanel.tsx:216-229 `disabled={!selectedProductId...}` + title「请先选择产品」+ 提示区 |

**Score:** 12/12 (truths 8-11 为代码级验证,用户视角验收依赖 UAT-2/4/5/6)

### Required Artifacts

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `src-tauri/src/engine/ingest.rs` | ✓ VERIFIED | 446 行,extract_pdf/sha2/三态,7 tests |
| `src-tauri/migrations/0010_ingested_documents.sql` | ✓ VERIFIED | content_hash UNIQUE |
| `src-tauri/src/engine/tools.rs` | ✓ VERIFIED | ingest_scan(:266)+ingest_submit(:280) 注册与 dispatch(:365-366) |
| `src-tauri/src/engine/commands.rs` | ✓ VERIFIED | consume 事务命令,13 tests 覆盖 |
| `src/stores/ingestionStore.ts` | ✓ VERIFIED | 256 行,投影+批量提交+applier |
| `src/components/workspace/IngestionPanel.tsx` | ✓ VERIFIED | 322 行,挂载于 FileArchiveView |
| `src/components/workspace/IngestionBatchCard.tsx | ✓ VERIFIED | 42 行(设计即精简),挂载于 App.tsx |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| tools.rs | ingest.rs | dispatch | ✓ WIRED (`ingest::scan_workspace` :464) |
| engine_consume_ingestion_batch | knowledge_docs/fts | 单事务 INSERT | ✓ WIRED (:841/:850) |
| tabRunStore | engineRun | kind 'ingestion' | ✓ WIRED (:26, :210 ingestion_batch 路由) |
| ingestionStore | engine_consume_ingestion_batch | invoke | ✓ WIRED (api.ts + ingestionStore 各 1 处) |
| applier | taskStore/scheduleStore | addTask/addEvent | ✓ WIRED (ingestionStore.ts:125/139) |
| confirmations.rs | ingestion_batch | kind 校验 | ✓ WIRED (consume_inner 校验 kind) |

### Data-Flow Trace (Level 4)

数据流为 run 事件→投影→HITL→Rust 事务写库,非渲染静态数据组件;ingest_scan 读真实文件系统 + sha2,migration 表真实存在,无 hardcoded 空数据。tsc/build/cargo 191/191/npm 222/222 门禁绿(SUMMARY 报告;verifier 未重跑全量,代码检查与 fixtures 一致)。

### Behavioral Spot-Checks

Step 7b: SKIPPED — cargo test 全量编译超时预算;以代码级检查 + SUMMARY 报告的门禁结果替代,端到端行为归入人工 UAT。

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| ING-01 纯 Rust 提取 | 27-01 | ✓ SATISFIED (code) | truth 1 |
| ING-02 三态显式 | 27-01 | ✓ SATISFIED | truth 2 |
| ING-03 编排全程可见 | 27-03 | ✓ SATISFIED (code) / UAT-2 | truth 8 |
| ING-04 批量 HITL | 27-02+03 | ✓ SATISFIED (code) / UAT-4 | truths 4,9 |
| ING-05 重扫幂等 | 27-01+02 | ✓ SATISFIED (code) / UAT-7 | truths 3,6 |
| ING-06 FTS 中文命中 | 27-02+03 | ✓ SATISFIED (code) / UAT-5 | truth 5 |

无 ORPHANED 需求:REQUIREMENTS.md 的 6 个 ING ID 全部被 plan frontmatter 覆盖。

### Anti-Patterns Found

无。新文件无 TODO/FIXME/placeholder/空实现;web dev fallback 无引擎时入口禁用为设计行为非 stub。

### Human Verification Required

见 frontmatter `human_verification`(UAT-1..7,源自 27-03-SUMMARY Pending Human UAT,**均未执行**)。其中 UAT-2/4/5/6/7 直接决定 ING-03/04/05/06 的用户视角验收。

### Gaps Summary

无代码级缺口。唯一未闭环项是 7 步人工 E2E UAT(auto-advance 已放行 checkpoint 但人工步骤未跑)。自动化门禁(tsc/build/cargo 191/191/npm 222/222)全绿为 SUMMARY 声明,建议执行 UAT 前先重跑 `cargo test` 与 `npm test` 确认。

---

_Verified: 2026-09-01_
_Verifier: Claude (gsd-verifier)_
