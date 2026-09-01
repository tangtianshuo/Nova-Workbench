# Phase 27: 工作区文档摄取 - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

用户对工作区 docx/pdf 发起纯 Rust 摄取：勾选范围 → `ingest_scan`（提取 + sha2 hash 幂等 + 三态 extracted/partial/failed）→ LLM 分类进知识库 + 抽取任务/日程草稿（编排 run 全程进度可见）→ 批量 HITL 聚合确认 → 落业务数据（knowledge_docs + FTS5 / taskStore / scheduleStore）；重扫以内容 hash 识别不重复建档。

不包含：反向创建产品（Phase 28）、OCR（failed 三态显式暴露即达标）、md/txt 等其他格式、task/schedule 全 Rust 原生化（999.6）、真写文件（v0.4）。

技术选型（crate、工具结构、批量卡后端、幂等机制、截断策略）已由 27-RESEARCH.md 锁定，本文档只记录产品/体验裁定。

</domain>

<decisions>
## Implementation Decisions

### 摄取入口与范围
- **D-01:** 入口与结果展示都内嵌 FileArchiveView（三态列表、聚合确认视图同屏），不做独立 tab 或子面板路由
- **D-02:** 用户勾选文件/文件夹发起摄取（提供"全选整个工作区"快捷方式，等价全扫）；不自动发起摄取
- **D-03:** 新文档提示 = 摄取按钮徽章计数（轻量探测：枚举 + hash 对比已摄取记录，不做提取、不自动摄取）；纯手动触发
- **D-04:** failed 文档（扫描件/解析错误）不进 hash 幂等跳过，每次摄取都重试——用户替换为带文本层的新版文件后自然被拾起

### 知识分类与落点
- **D-05:** 摄取的知识文档落**当前选中产品**（`knowledge_docs.product_id NOT NULL`，migration 0004）；无选中产品时摄取入口禁用并提示先选产品
- **D-06:** `KNOWLEDGE_CATEGORIES`（tools.rs:353，现有 9 类技术味）扩展 4 个 PM 类目：**会议纪要、竞品分析、需求文档、项目周报**；Rust + TS 双侧 const 同步改 + parity 测试更新
- **D-07:** 分类由 LLM 预填（run 内），聚合卡内逐项可改（与 ING-04 逐项编辑一致）
- **D-08:** 一份文件 = 一条知识文档；标题由 LLM 生成语义标题，源文件名进元数据溯源（不直接用 final_v2.docx 这类文件名当标题）

### 批量确认卡形态
- **D-09:** 全局确认队列只出**精简入口卡**「摄取批次待确认（N 项）」，点击跳 FileArchiveView 摄取区展开完整聚合编辑视图；确认动作在聚合视图内完成（保持 Phase 26 D-05「队列是 HITL 可见性之家」，大卡不挤爆队列）
- **D-10:** 聚合卡按**产物类型分组**（知识文档/任务草稿/日程草稿三组），组级全选/全不选；每项带源文件名徽章可溯源
- **D-11:** 逐项编辑三档：selected 开关 + 标题行内改 + 知识 content 点开编辑 Dialog（复用 Phase 16 PrdDraftDialog/MDXEditor 模式）；草稿字段（如截止时间）行内改
- **D-12:** 提交后 toast 汇总落库结果（N 知识 + M 任务草稿 + K 日程草稿），三态列表刷新，用户留在 FileArchiveView

### 草稿抽取与写路径
- **D-13:** 保守抽取：仅明确行动项（todo 标记、"需要完成 X"、责任人明确的任务）；独立出现的日期不成草稿；漏掉的内容靠知识文档 FTS 检索兜底（防轰炸先例：Phase 15 记忆候选三项）
- **D-14:** 每文档 task/schedule 草稿合计上限 **5**（LLM prompt 约束 + Rust 侧校验双保险）
- **D-15:** 混合写路径（23-04 过渡架构）：knowledge_docs / knowledge_fts / ingested_documents 由 `engine_consume` 事务内 Rust 写；task/schedule 草稿由 webview 调既有 store action 落库 + Rust 记审计事件——与 Phase 26 deliverable commit 同构；全 Rust 原生化留 999.6，本决定为其立先例但不提前实现
- **D-16:** 草稿确认落库即**正式任务/日程**（任务页/日历立即可见），无二次确认、无 draft 持活状态

### Claude's Discretion
- docx 表格/修订解析细节（研究 Pitfall 4 已有 quick-xml 定式）
- 三态判定阈值（研究建议：非空白字符 ≥ 页数 × 50，可按 PoC 校准）
- 徽章探测的触发时机（进入页面时/文件操作后，成本阈值内自定）
- PM 类目文案微调（若 PoC fixture 暴露明显盲区可增补，不超过 6 类）
- partial 文档的 `pages_empty` 呈现方式（研究 Pattern 2 语义不变前提下）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 定义与需求
- `.planning/phases/27-workspace-ingestion/27-RESEARCH.md` — 技术选型全部锁定项（pdf_oxide/zip/quick-xml、ingest_scan 确定性工具、ingestion_batch 单候选、sha2 字节 hash、12k 截断、六项 pitfalls）；planner 第一输入
- `.planning/REQUIREMENTS.md` §ING-01..ING-06 — 六条验收需求原文
- `.planning/ROADMAP.md` §Phase 27 — goal 与 success criteria

### 架构纪律（写路径裁定的依据）
- `docs/adr/ADR-0003-rust-run-engine.md` — Rust 引擎唯一写者纪律；D-15 是该纪律在过渡架构下的应用
- `.planning/phases/26-mock-tab/26-CONTEXT.md` — D-05 全局确认队列、knowledge_docs 唯一真相源、TabRunPanel 模式、23-04 TS applier + Rust 审计 seam
- `docs/ARCHITECTURE.md` — 系统全貌（新人入口）

### 代码锚点
- `src-tauri/src/engine/tools.rs:353` — `KNOWLEDGE_CATEGORIES` 9 类枚举（D-06 扩展点，双侧 parity）
- `src-tauri/src/engine/confirmations.rs` — params_json 任意 Value / 原子 consume / dedup kind 列表（:171，ingestion_batch 天然无 dedup，consume 幂等按 items[].id 去重）
- `src-tauri/migrations/0004_memories_knowledge_fts.sql` — knowledge_docs schema（product_id NOT NULL，D-05 依据）
- `src/views/FileArchiveView.tsx` — D-01 挂载点
- `src/stores/taskStore.ts` / `src/stores/scheduleStore.ts` — zustand persist（D-15 webview 写路径承接点）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tabRunStore.startTabRun`（Phase 26）— 摄取编排 run 直接复用（新 TabRunKind 'ingestion'，interactive priority）
- `agent_confirmation_candidates` + `params_json` — 批量卡后端零改动（items 数组装进单候选）
- Phase 16 PrdDraftDialog + MDXEditor — 知识 content 编辑 Dialog 直接同构复制
- 全局确认队列（confirmationStore）— 入口卡渲染位（D-09）
- `fts_tokens.rs` per-char CJK 分词 + `knowledge_fts` 增量 INSERT — ING-06 零额外工作
- `scan_workspace_folder` 命令（workspaceStore.ts:194）— 已存在，徽章探测可复用
- sha2（Cargo.toml:50 已在依赖树）— hash 幂等零新增依赖

### Established Patterns
- runId 由 webview mint（crypto.randomUUID）；Channel 事件投影在 store 级持有
- web dev fallback：无引擎时功能禁用 + 提示，不留 mock 路径（Phase 26 同款）
- knowledge 类产物只落 knowledge_docs（Phase 26 双真相源禁令）

### Integration Points
- `src-tauri/src/engine/` 新增 ingest.rs（扫描+提取+三态）+ tools.rs 注册 ingest_scan / ingest_submit
- `src-tauri/migrations/` 新增 0010_ingested_documents.sql（content_hash UNIQUE）
- `engine_consume_ingestion_batch` 新 Tauri 命令（事务：knowledge 写入 + ingested_documents 标记 + task/schedule 审计事件）
- FileArchiveView 摄取区（三态列表 + 聚合确认视图）+ 全局队列入口卡

</code_context>

<specifics>
## Specific Ideas

- 扫描范围从 ING-03 字面「扫描工作区」细化为「勾选发起 + 全选快捷」——语义仍是用户主动圈定工作区范围，非自动摄取
- 用户明确选择勾选而非全扫一键：大工作区首次摄取可分批、可控成本
- D-09 的「队列入口卡 + 内嵌大卡」是 Phase 26 D-05 在批量场景的演化，不是违背：队列保持可见性，编辑发生在专属面板
- D-15 是 999.6（PM CRUD 原生化）的先例锚点：本 phase 验证「webview applier + Rust 审计」在 task/schedule 域的可行性

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

### Reviewed Todos (not folded)
- 优化日历单元格日程密度防止溢出（area: ui）— 与文档摄取无关，弱匹配（仅 area 标签），留待 UI 相关 phase
- Setting 中填入 API Key 时增加连通性验证（area: ui）— 与文档摄取无关，弱匹配，留独立 quick 任务

</deferred>

---

*Phase: 27-workspace-ingestion*
*Context gathered: 2026-09-01*
</content>
