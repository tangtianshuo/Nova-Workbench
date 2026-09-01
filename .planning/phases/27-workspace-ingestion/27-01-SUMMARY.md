---
phase: 27-workspace-ingestion
plan: "01"
subsystem: engine/ingest
tags: [ingestion, pdf, docx, pdf_oxide, quick-xml, sqlite-migration]
requires: [engine tool registry (22-xx), migrations 0001-0009]
provides: [ingest::scan_workspace, ingest_scan tool, ingested_documents table, three-state mapping, file_sha256, truncate_for_llm]
affects: [tools.rs registry count, loop_runner schema-count lock]
tech-stack:
  added: [pdf_oxide 0.3.77, zip 8.6 (deflate-only), quick-xml 0.42]
  patterns: [PdfExtractor trait seam, pure classify_pdf, hash-idempotent scan]
key-files:
  created:
    - src-tauri/src/engine/ingest.rs
    - src-tauri/migrations/0010_ingested_documents.sql
    - src-tauri/tests/fixtures/ingest/README.md
    - src-tauri/tests/fixtures/ingest/chinese-1.pdf
    - src-tauri/tests/fixtures/ingest/chinese-2.pdf
    - src-tauri/tests/fixtures/ingest/scanned.pdf
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
decisions:
  - "pdf_oxide CJK PoC PASSED on real Word-exported Chinese PDFs — no fallback needed"
  - "zip pinned to default-features=false + deflate (avoids zstd-sys C build from default features)"
  - "truncate head is 12000-50 chars so head+marker stays ≤ 12000 total"
metrics:
  duration: "approx 1.5h (incl. Task 1 human fixture gate)"
  completed: 2026-09-01
---

# Phase 27 Plan 01: 纯 Rust 文档提取地基 Summary

pdf_oxide + zip + quick-xml 的纯 Rust 提取层:docx/pdf 文本、三态映射(extracted/partial/failed)、sha256 内容 hash 幂等、12000 字截断,加 0010 migration 与 ingest_scan 确定性工具;真实中文 PDF fixture PoC 通过。

## What Was Built

### Task 2: ingest.rs 提取+三态+hash+截断 (TDD)
- `extract_pdf`(经 `OxidePdfExtractor`):pdf_oxide 按页提取,单页失败降级为空页不中断
- `classify_pdf`:纯函数三态映射,空页=trim 后 <10 字符;全空→Failed("scanned_pdf_no_text_layer")
- `extract_docx`:zip + quick-xml 事件流(w:p→\n、w:tab→空格、w:del 跳过、GeneralRef 实体解码);无 word/document.xml→Err("not_a_docx")
- `file_sha256` 流式 hash;`truncate_for_llm` ≤12000 字含尾标
- **PoC 结果:两份真实 Word 导出中文 PDF 全部预期子串命中(文档自动化审核/验收报告/交付用印;数字见证/统筹统计分析/领导驾驶舱);扫描件正确进 Failed 态**
- Commit: dd48401 (RED) / 220f1d0 (GREEN)

### Task 3: migration 0010 + ingest_scan (TDD)
- `0010_ingested_documents.sql`:content_hash TEXT NOT NULL UNIQUE;failed 不写记录(D-04 每次重试)
- `ingest::scan_workspace`:递归枚举 .docx/.pdf(跳隐藏目录),hash 命中且非 failed→skip;INSERT OR REPLACE 写记录;text 经 truncate_for_llm
- tools.rs 注册 `ingest_scan`(Readonly/rerunnable,非 HITL),workspaceRoot 可省略回落 ctx.workspace_root
- 幂等三场景测试锁定:同 hash skip / 改字节重提取 / failed 重扫再试
- Commit: e7bb50d

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] zip 默认特性引入 zstd-sys(C 构建)**
- 发现:cargo add zip 默认特性带 zstd/bzip2/xz,违反纯 Rust 约束精神
- 修复:`cargo add zip --no-default-features --features deflate`;确认 cc 仅来自既有 reqwest/aws-lc 链
- pdf_oxide 本体无 C 构建

**2. [Rule 1 - Bug] quick-xml 0.42 API 与研究示例不符**
- local_name() 返回去前缀的 "t"/"p"(非 "w:t");实体引用是独立 Event::GeneralRef(非内联 Text);BytesText 无 unescape 方法
- 修复:按 0.42 真实 API 重写解析;实体重建 "&...;" 后 unescape

**3. [Rule 1 - Bug] 截断长度自相矛盾**
- Plan 行为要求 ≤12000 且含尾标,但"取首 12000+尾标"会超;取首 11950 使总和 ≤12000

**4. [Rule 1 - Bug] chinese-2.pdf 实际有一页空白 → Partial**
- 真实文档含空白页是合法 Partial;测试放宽为 Extracted|Partial(禁止 Failed)

**5. [Rule 3 - Blocking] loop_runner schema-count 锁需 11→12**
- 工具注册锁测试同步更新

## Verification

- `cargo test` 185 passed / 0 failed(含中文 fixture 断言、三态映射、幂等三场景)
- `cargo build` clean;tools.rs 含 "ingest_scan" 分发;0010 由 mem_conn migration runner 自动加载(测试建表断言)

## Known Stubs

None.

## Self-Check: PASSED

- 所有 created/modified 文件存在;commits dd48401/220f1d0/e7bb50d 均在 git log
