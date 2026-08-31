# Phase 27: 工作区文档摄取 - Research

**Researched:** 2026-08-31
**Domain:** 纯 Rust 文档提取 (docx/pdf) + 摄取编排 run + 批量 HITL + 内容 hash 幂等 + FTS5 中文检索
**Confidence:** MEDIUM-HIGH(pdf_oxide CJK 质量是唯一 MEDIUM 项,已设计 PoC 兜底)

## Summary

引擎基础设施比预期更完备,Phase 27 的增量几乎全部是"新工具 + 新 candidate kind + 新表",协议零改动成立:`scan_workspace_folder` 命令已存在(workspaceStore.ts:194 在用);确认队列的 `params_json` 是任意 JSON Value,天然支持多 item 批量 payload;FTS5 `knowledge_fts` + Rust 侧 per-char CJK 分词(fts_tokens.rs)已就绪,摄取文档走既有 knowledge_docs/knowledge_fts 插入路径即可被中文检索命中,无需 reindex。依赖树上已有 sha2(Cargo.toml:50),幂等 hash 直接用,不引 blake3。

PDF 提取:pdf_oxide(0.3.x,MIT,活跃维护)是当前纯 Rust 生态的正确选择——内置 CMap/ToUnicode/CJK 解码,releases 明确含 CJK 修复(含 tategaki 列比较器、扫描件不再崩溃)。lopdf 无文本提取(自建需数千行 ISO 32000 代码),pdf-extract 较慢且维护弱。唯一保留:vendor 声明(100% pass / CJK 完备)无第三方独立验证,plan 必须含 Wave 1 中文 PDF PoC(真实中文 PDF fixture + 断言提取含预期中文子串)。DOCX:zip + quick-xml 解析 `word/document.xml` 是成熟定式,风险低。

**Primary recommendation:** 加 `pdf_oxide`、`zip`、`quick-xml` 三个 crate;Rust 侧新增确定性工具 `ingest_scan`(扫描+提取+hash,三态)+ 新 candidate kind `ingestion_batch`(params_json 装 N 个 item);摄取编排 = 普通引擎 run(priority=interactive),LLM 步做分类/草稿抽取,复用 tabRunStore 新 TabRunKind;hash 用 sha2 对文件字节。

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ING-01 | 纯 Rust docx/pdf 提取 | pdf_oxide(内置 CJK/CMap)+ zip + quick-xml;三 crate 均纯 Rust 零外部进程 |
| ING-02 | 三态 extracted/partial/failed | 按页提取,页级文本量 + 字符映射失败计数映射三态(见 Architecture Patterns §三态) |
| ING-03 | 摄取编排 run 全程可见 | 普通引擎 run + ingest_scan 工具事件流;复用 tabRunStore(Phase 26 模式)+ Channel 事件投影 |
| ING-04 | 批量 HITL 聚合卡 | params_json 任意 JSON → 单 candidate 携 items 数组;atomic conditional UPDATE 语义不变;编辑走 consume 时 params 覆盖(Phase 26 deliverable editedDraft 同构) |
| ING-05 | 内容 hash 幂等重扫 | sha2 已在依赖树;新表 ingested_documents(content_hash 唯一索引);重扫 = diff |
| ING-06 | 摄取完成即可 FTS5 中文检索 | knowledge_fts 插入是增量 INSERT(fts_tokens Rust 侧分词),走既有 knowledge_docs 提交路径即命中 |
</phase_requirements>

## Standard Stack

### Core(新增 Rust 依赖)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdf_oxide | 0.3(当前 0.3.40) | PDF 文本提取(含 CJK/CMap/ToUnicode、加密、容错解析) | 纯 Rust 生态最快且唯一内置完整字体解码的提取库;100% pass(3830 PDF corpus,vendor 声明);MIT;活跃维护 |
| zip | 2.x | 解开 .docx(= zip 容器) | Rust 事实标准 zip 库,纯 Rust |
| quick-xml | 0.3x | 解析 word/document.xml | Rust 事实标准 XML 拉式解析器,纯 Rust |
| sha2 | 0.10(**已在依赖树**) | 内容 hash 幂等 | Cargo.toml:50 已存在,params_hash 在用;不引 blake3 |

**Installation:**
```bash
cd src-tauri && cargo add pdf_oxide zip quick-xml
# sha2 已存在,勿重复添加
```

**Version verification:** pdf_oxide 0.3.40 来自 crates.io 当前列表(2026-08-31 检索);写入 plan 前以 `cargo add` 解析到的最新 0.3.x 为准。

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pdf_oxide | lopdf | 否——lopdf 无文本提取,自建 CMap/字体解码数千行,20% corpus 解析失败 |
| pdf_oxide | pdf-extract | 否——慢 5×(pdf_oxide benchmark),维护弱于 pdf_oxide |
| pdf_oxide | parangi / pdf-text-extract | 备选——均声称 ToUnicode/CJK,但生态小、无 benchmark 背书;若 PoC 失败再评估 |
| pdf_oxide | pdfium-render | **违规**——绑定 C++ pdfium 二进制,违反"纯 Rust 零 sidecar"硬约束 |
| sha2 | blake3 | 否——blake3 不在树上,sha2 已在且性能足够(摄取是用户发起的低频操作) |

## Architecture Patterns

### 推荐结构
```
src-tauri/src/engine/
├── ingest.rs          # 新:扫描+提取+hash+三态(docx via zip+quick-xml, pdf via pdf_oxide)
├── tools.rs           # 注册 ingest_scan 工具(确定性,非 HITL)
└── confirmations.rs   # 复用;kind="ingestion_batch" 由 create_candidate 直接支持(kind 是自由 String)
src-tauri/migrations/
└── 0010_ingested_documents.sql   # content_hash TEXT UNIQUE, path, status, extracted_at, doc_id?
src/stores/
├── tabRunStore.ts     # 新 TabRunKind 'ingestion'(复用 startTabRun/独立 sessionId/interactive priority)
└── ingestionStore.ts  # 新:摄取结果投影、三态列表、批量卡状态
src/components/product/ (或 workspace) IngestionPanel / IngestionBatchCard
```

### Pattern 1: 提取 = 确定性 Rust 工具,不做 LLM 工作
**What:** `ingest_scan(workspaceId)` 是 Readonly 类工具:遍历 docx/pdf → sha2 文件字节 → 查 ingested_documents 跳过已摄取(diff)→ 提取 → 三态标注 → 结果作为 tool_result 事件进入 run 上下文。
**When to use:** 所有机械步骤(hash/提取/三态)都在这里;LLM 只消费提取后的文本做分类与草稿抽取。
**Why:** 提取是确定性的,可重放、可测;塞给 LLM 浪费 token 且不可靠。

### Pattern 2: 三态映射(ING-02)
**What:** 提取按页(pdf_oxide `extract_text(page)`)或按块(docx 段落)进行:
- **extracted**:提取文本 ≥ 阈值(建议:非空白字符数 ≥ 页数 × 50,或全页有文本)
- **partial**:部分页有文本层、部分页空(典型:图文混排 + 扫描插页)→ 标注 `pages_empty: [n..]`
- **failed**:全部页无文本层(扫描件)或解析错误 → 显式 reason("scanned_pdf_no_text_layer" / "parse_error: ..."),**绝不建档**
**When to use:** 每个文档提取完即标注;failed 文档进三态列表但不产生候选 item。
```rust
// 语义示意(非逐字 API)
let per_page: Vec<String> = (0..page_count).map(|i| doc.extract_text(i)).collect::<Result<_>>()?;
let empty_pages: Vec<usize> = per_page.iter().enumerate()
    .filter(|(_, t)| t.trim_chars().count() < 10).map(|(i, _)| i).collect();
let status = if empty_pages.len() == page_count { Failed("scanned_pdf_no_text_layer") }
    else if !empty_pages.is_empty() { Partial(empty_pages) } else { Extracted };
```

### Pattern 3: 批量 HITL = 单 candidate + items 数组(ING-04)
**What:** 确认队列的 `params_json` 是任意 `serde_json::Value`(confirmations.rs:67/97),consume 是原子条件 UPDATE(confirmations.rs:230)。发一个 `kind="ingestion_batch"` candidate:
```json
{ "workspaceId": "ws-1", "productId": "p1", "items": [
  { "id": "ing-1", "type": "knowledge", "title": "...", "content": "...", "selected": true },
  { "id": "ing-2", "type": "task_draft", "title": "...", "dueHint": "...", "selected": true },
  { "id": "ing-3", "type": "schedule_draft", "title": "...", "selected": false }
]}
```
UI 全选/全不选 = 翻转 `selected`;逐项编辑 = 改 title/content;一次提交 = `engine_confirm` → `engine_consume_ingestion_batch(token, editedItems)`(新 Tauri 命令,事务内:选中项写 knowledge_docs/knowledge_fts、task/schedule 草稿写各自存储,标记 ingested_documents.doc_id,标记 consumed)。
**注意 dedup:** create_candidate 的 dedup 只对固定 kind 列表生效(destructive_action/deliverable_draft/exec_approval/fs_write,confirmations.rs:171),`ingestion_batch` 不在其中 → 天然无 dedup,同 run 重试会出双卡;plan 需在 UI 侧或 consume 侧容忍(与 knowledge_write 同语义,可接受)。

### Pattern 4: 摄取编排 run 复用 tab-run(ING-03)
**What:** `startTabRun({ tabId: 'workspace-ingest', kind: 'ingestion', priority: 'interactive', userMessage, coreContext: { workspaceId, productId } })`。run 内 LLM 步:①调 `ingest_scan` → ②对每个 extracted/partial 文档调 LLM 分类(产 knowledge candidate 内容)→ ③抽取任务/日程草稿 → ④调新工具 `ingest_submit`(HITL,产出 ingestion_batch candidate)。进度经既有 Channel 事件投影(TabRunPanel 同构),新 panel 展示三态列表 + 批量卡。

### Pattern 5: hash 幂等(ING-05)
**What:** sha2-256 对**文件字节**。存 ingested_documents(content_hash UNIQUE, path, size, status)。重扫 = ingest_scan 时按 hash 查表:命中 → skip(diff 语义);未命中且 path 已有旧记录 → 同 path 新 hash = 文档变更,更新记录并允许重新摄取。
**选字节 hash 而非提取文本 hash:** 重扫时字节 hash 在提取前即可短路跳过已摄取文件,免全文提取;代价是"重新保存但内容不变"会再次提取——用提取文本 hash 二次比对去重(便宜,提取已发生)。

### Anti-Patterns to Avoid
- **把提取塞进 LLM/多步 run**:提取是确定性 IO,工具化一次完成。
- **为批量卡发明第二套确认机制**:params_json + atomic UPDATE 就是批量卡的后端;别建新队列表。
- **OCR 兜底**:Out of Scope(REQUIREMENTS 明示);failed 三态显式暴露即达标。
- **摄取后重建 FTS 全索引**:knowledge_fts 是增量 INSERT,别碰 rebuild。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF 字体/CMap/ToUnicode 解码 | 自建内容流解析 | pdf_oxide | ISO 32000 深水区,数千行,CJK 必炸 |
| docx 解压 | 自写 zip | zip crate | deflate64/加密等边角 |
| XML 解析 | 字符串 split/regex | quick-xml | 实体、CDATA、命名空间边角 |
| 幂等 hash | 引 blake3/xxhash | sha2(已在树) | 已有依赖,性能足够 |
| 确认队列/批量提交 | 新队列表 | agent_confirmation_candidates + params_json | 原子 UPDATE + 过期 + 审计日志全都有 |
| run 进度投影 | 新事件通道 | tabRunStore + Channel 事件 | Phase 26 刚验证过的模式 |
| 中文分词/FTS | 新分词器 | fts_tokens.rs + knowledge_fts | 索引与查询共享同一分词器(parity 铁律) |

## Runtime State Inventory

> 本 phase 是新增能力(非 rename/migration),仅需确认承接点:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | workspaceStore persist v1(zustand/sqliteStorage,含 INITIAL_WORKSPACES mock 数据) | 摄取结果不入 workspaceStore persist;mock files 由扫描覆盖(scan_workspace_files 已如此) |
| Live service config | 无外部服务 | — |
| OS-registered state | 无 | — |
| Secrets/env vars | 无新增 | — |
| Build artifacts | 新 crate 增加 cargo 依赖;pdf_oxide 纯 Rust 无 C 构建 | cargo build 即可;确认 pdf_oxide 无 cc 传递依赖(PoC 顺带验证) |

## Common Pitfalls

### Pitfall 1: pdf_oxide CJK 实际质量未独立验证
**What goes wrong:** vendor 声明 100% pass + CJK 完备,但无第三方验证;中文 CID 字体 PDF 是历史重灾区(pypdf #3799 同类 bug 仍存在)。
**How to avoid:** Wave 1 第一任务 = PoC:取 2-3 份真实中文 PDF(含 Word 导出的 docx→pdf、扫描件)跑 `cargo test` 断言提取文本包含预期中文子串。失败 fallback:评估 parangi/pdf-text-extract,或在 ingest.rs 隔离 trait `PdfExtractor` 便于换实现。
**Warning signs:** 提取出乱码/CID 码位(\u{fffd} 或 PUA 区字符)。

### Pitfall 2: 扫描件静默产出空文档
**What goes wrong:** extract_text 对无文本层 PDF 返回空串而非错误 → 空知识文档入库,ING-02 直接违约。
**How to avoid:** 三态判定在 ingest.rs 硬编码(空文本 → failed + reason),knowledge_docs 写入只允许 selected 且非 failed 的 item;单测覆盖"全空页 PDF → failed 不建档"。

### Pitfall 3: 大文档撑爆 run 上下文
**What goes wrong:** 几百页 PRD 全文塞进 LLM 步,context 爆炸、费用失控;compaction 是会话级兜底,不适合 ingestion 单文档。
**How to avoid:** ingest_scan 返回的每文档文本做**截断策略**:首部 N 字符(建议 12k chars ≈ 3k tokens,estimate_tokens 在 token_estimate.rs:23)+ "…(全文已存,共 X 字)"。分类/抽取只需开头与结构;全文完整落 knowledge_docs(供 FTS 检索),LLM 只见截断版。

### Pitfall 4: docx 解析漏表/漏修订
**What goes wrong:** word/document.xml 里 `w:tbl` 表格、`w:ins/w:del` 修订、`w:tab/w:br` 被当纯文本丢结构。
**How to avoid:** quick-xml 事件流处理:`w:p` → 段落、`w:tbl` → 逐行拼接、`w:ins` 内容保留、`w:del` 跳过、`w:tab`→空格。headers/footers 首版跳过(记 pitfall 不记需求)。

### Pitfall 5: 双真相源复发(Phase 26 刚裁定的债)
**What goes wrong:** 摄取知识文档绕过 knowledge_docs 另写一份数据(如直接进 rndStore 内存)。
**How to avoid:** knowledge 类产物只落 knowledge_docs(+fts);task/schedule 草稿确认后走各自 store 的既有写路径,sessionId/溯源(source_event_id)照 Phase 26 deliverable 模式填。

### Pitfall 6: 重扫双卡(dedup 不覆盖新 kind)
**What goes wrong:** ingestion_batch 不在 create_candidate dedup 列表,重试/重扫产生重复批量卡。
**How to avoid:** consume 幂等:以 items[].id(ing-{hash8})做写侧去重(唯一索引/查表跳过),重复 consume 不重复建档。

## Code Examples

### DOCX 提取(定式)
```rust
// zip + quick-xml 提取 word/document.xml 段落
use quick_xml::events::Event;
let f = std::fs::File::open(path)?;
let mut zip = zip::ZipArchive::new(f)?;
let mut xml = zip.by_name("word/document.xml")?;  // 不存在 → failed("not_a_docx")
let mut buf = Vec::new(); std::io::Read::read_to_end(&mut xml, &mut buf)?;
let mut rdr = quick_xml::Reader::from_reader(&buf[..]);
let mut out = String::new(); let mut in_text = false;
loop { match rdr.read_event_into(&mut Vec::new()) {
    Event::Start(e) => match e.local_name().as_ref() {
        b"w:t" | b"w:tab" => { in_text = true; out.push(' '); }
        b"w:p" => out.push('\n'),
        _ => {}
    },
    Event::Text(t) if in_text => { out.push_str(&t.unescape().unwrap_or_default()); in_text = false; }
    Event::Eof => break,
    _ => {}
}}
```

### PDF 三态(pdf_oxide,语义示意)
```rust
use pdf_oxide::PdfDocument;
let mut doc = PdfDocument::open(path)?;              // Err → failed("parse_error")
let n = doc.page_count()?;                            // 以 docs.rs 实际 API 为准(PoC 校准)
let texts: Vec<String> = (0..n).map(|i| doc.extract_text(i).unwrap_or_default()).collect();
// → Pattern 2 三态映射
```
⚠️ 以上 API 形状来自 vendor 文档示例(`PdfDocument::open` / `extract_text(0)`);PoC 任务第一动作是对照 docs.rs 校准真实签名。

### sha2 hash + 幂等查表
```rust
use sha2::{Digest, Sha256};
let mut h = Sha256::new(); std::io::copy(&mut std::fs::File::open(path)?, &mut h)?;
let content_hash = format!("{:x}", h.finalize());
// SELECT 1 FROM ingested_documents WHERE content_hash = ?1 → 命中即 skip
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pdf-extract/lopdf 手搓提取 | pdf_oxide(内置 CJK、加密、容错) | 2025-2026 持续迭代,当前 0.3.40 | 纯 Rust PDF 提取首次达到生产可用声明;仍需 PoC 独立验证 |
| 全量 FTS rebuild | 增量 INSERT(项目既有) | Phase 15 起 | ING-06 零额外工作 |

**Deprecated/outdated:** lopdf 文本提取路线(自建 CMap)——2026 年不该再走。

## Open Questions

1. **pdf_oxide 真实 API 签名与 CJK 质量**
   - What we know: vendor 文档示例 + 活跃 release(含 CJK 修复)
   - What's unclear: 真实中文 PDF(Word 导出、WPS 导出、扫描件)的提取质量无独立数据
   - Recommendation: Wave 1 PoC 任务(fixture: 2 中文 PDF + 1 扫描件),失败再启 fallback 评估——**不要跳过**
2. **task/schedule 草稿的确认后落点**
   - What we know: Phase 26 只裁定了 knowledge/deliverable 落点;taskStore/scheduleStore 是 zustand persist(SQLite storage),非 knowledge_docs 体系
   - What's unclear: 草稿确认写入是否需要 Rust 侧命令(与其他 Rust 写入保持唯一写者纪律)还是走 webview invoke store action
   - Recommendation: plan 阶段裁定;倾向 Tauri 命令写(kv_store/表),保持"Rust 是 agent 数据唯一写者"的 ADR-0003 纪律
3. **ingestion run 与 workspace 面板的挂载点**(FileArchiveView or 新 tab)
   - Recommendation: FileArchiveView(工作区文件已在此),UI hint 已开,plan 时定

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | 全部 | ✓ | 1.91.1 | — |
| cargo + crates.io 网络 | 新增 3 crate | ✓(历史 build 正常) | — | — |
| 中文测试 PDF fixtures | PoC/单测 | ✗(需自备) | — | 用 Word 手工导出 2 份 + 1 扫描件,入 src-tauri 测试资源 |

**Missing dependencies with no fallback:** 无。
**Missing dependencies with fallback:** 中文 PDF fixtures 需人工准备(plan 里列为 PoC 任务前置)。

## Sources

### Primary (HIGH confidence)
- 代码库实证:confirmations.rs(params_json 任意 Value/原子 consume/dedup kind 列表:171)、fts_tokens.rs(CJK per-char 分词)、Cargo.toml(sha2 已在)、workspaceStore.ts:184(scan_workspace_folder 已存在)、tabRunStore.ts(Phase 26 模式)、token_estimate.rs:23
- [crates.io/pdf_oxide](https://crates.io/crates/pdf_oxide) — 版本/许可/维护状态(2026-08-31 检索,0.3.40)
- [pdf_oxide GitHub releases](https://github.com/yfedoseev/pdf_oxide/releases) — CJK 修复记录(tategaki 列比较器、扫描件不崩溃)

### Secondary (MEDIUM confidence)
- [pdf.oxide.fyi vs lopdf](https://pdf.oxide.fyi/docs/comparison/vs-lopdf) — 能力对比与 API 示例(vendor 自述,CJK 声明未经独立复核)
- [docs.rs/pdf_oxide](https://docs.rs/pdf_oxide) — CJK 支持声明

### Tertiary (LOW confidence)
- parangi / pdf-text-extract 的 CJK 声明(仅检索摘要,仅作 fallback 候选)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH(docx/hash/FTS/HITL 全部代码库实证);MEDIUM(pdf_oxide CJK,vendor 声明 + 活跃维护,无独立 PoC)
- Architecture: HIGH(全部模式复用已 shipped 的 Phase 22-26 基础设施,协议零改动经代码核实)
- Pitfalls: HIGH(均来自代码库实证或同类库历史 issue)

**Research date:** 2026-08-31
**Valid until:** 2026-09-30(pdf_oxide 迭代快,PoC 前重查 changelog)
