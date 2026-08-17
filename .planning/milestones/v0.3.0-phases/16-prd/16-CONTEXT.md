# Phase 16: PRD 生产线 - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

PM 工作流主循环闭环 — 用户在 agent 对话中说"给当前产品生成 PRD"，收到携带当前产品上下文的 PRD 草稿；草稿经 HITL 确认 → MDXEditor 编辑 → 版本化落入研发中心 PRD 交付物卡槽，全程无手动复制粘贴；落槽带 AI 溯源标记；FTS5 索引与文档写入同一事务，落槽后立即在知识库检索命中。

不在本 phase：18 种交付物全量推广（DELIV-05）、多步全自动编排（DELIV-06）、inline 视图内 agent。

</domain>

<decisions>
## Implementation Decisions

### generateDeliverable tool 设计（DELIV-01）
- 泛化 `generateDeliverable({code, draft})`，本期只验证 PRD（code='prd'）路径 — rndStore 已有 18 种交付物目录，DELIV-05 推广时零改动
- agent 自身在对话中产出草稿全文，tool 参数携带 draft，只负责登记候选 — 与 knowledgeWrite 完全同构，tool 内不二次调 LLM
- 产品上下文复用 contextAssembler 当前选中产品注入（uiStore.selectedProductId）；未选产品时 tool 报错提示先选择
- 首次调用返回候选+确认 token（不落库）；paramsHash（canonical JSON SHA-256）去重防重复候选

### HITL 确认 → 编辑 → 落槽 流（DELIV-02）
- 确认走 Phase 14 confirmationStore 持久化候选 + ChatPanel 内联确认卡片（复用 Phase 15 proposeMemory 卡片模式，崩溃后可恢复）
- 确认卡片按钮 → 打开预填草稿的 MDXEditor 编辑 Dialog → 用户点"落槽"才写入卡槽（顺序：确认→编辑→落槽）
- 拒绝 = 关闭卡片 + 拒绝记录注入系统提示（同 MEM-02 防重复）
- 编辑器入口在 ChatPanel 卡片打开独立 Dialog（复用既有 MDXEditor 封装），不跳转研发中心

### 版本化与 AI 溯源（DELIV-02/03）
- PRD 正文真相源复用 Phase 15 knowledge_docs 版本链（version 自增 + superseded_at）；rndStore 交付物卡槽只存指针 + 当前版本投影
- 落槽时写 source: 'agent' + session_id + event_id + generated_at（knowledge_docs 既有来源列扩展）
- 研发中心溯源展示：卡槽 AI 徽章（Sparkle 图标）+ tooltip 显示生成时间与会话 ID
- agent 落槽 = 新版本 supersede 旧内容（版本链保留历史），非覆盖删除

### FTS5 同事务索引（DELIV-04）
- PRD 落槽走 Phase 15 knowledgeRepo 单一写 API（doc + FTS5 同一事务）— 只需复用，不另开写路径
- 知识库归类：category: 'deliverable' + tag: 'prd'（+产品关联），知识库现有筛选器无需改动
- 落槽后自动 FTS5 查询一次并在落槽事件 payload 记录命中数（可审计的"索引立即可检索"）

### Claude's Discretion
迁移编号、表列细节、tool schema 命名、卡片/编辑 Dialog 的具体组件拆分、投影同步时机等实现层决策。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/tools/knowledgeWrite.ts` — confirmationToken 两段式写模式，generateDeliverable 直接同构复制
- `src/ai/confirmationStore.ts` + `src/ai/paramsHash.ts` — Phase 14 持久化确认候选（paramsHash 去重、TTL、kind 单表判别）
- `src/ai/tools/proposeMemory.ts` + ChatPanel 内联确认卡片（Phase 15）— HITL 卡片 UI 模式
- `src/ai/knowledgeRepo.ts` — 单一写 API（doc + FTS5 同事务）、版本链、supersede
- `src/stores/rndStore.ts` — `buildInitialDeliverables`、18 种交付物目录（mockRndData.ts）、`syncDeliverableToDocs`
- `src/ai/contextAssembler.ts` — 五段上下文投影（含业务事实段的产品上下文）
- MDXEditor 封装（v0.2.0 全局替换 Textarea）

### Established Patterns
- tool 注册进 `src/ai/registry.ts`，Zod schema 校验参数
- 候选确认流：candidate → ChatPanel 卡片 → consume（原子 conditional UPDATE）
- zustand 投影 + SQLite 真相源（events/memories/knowledge_docs 同构）
- 事件日志 append-only：tool_call/tool_result 配对不变量、correlation_id

### Integration Points
- ChatPanel 确认卡片渲染管线（Phase 15 memory candidate cards 同管线）
- rndStore.deliverables[productId] 卡槽数据结构与研发中心 view 渲染
- KnowledgeBaseView FTS5 搜索（无需改动即可命中 PRD）

</code_context>

<specifics>
## Specific Ideas

无特殊指定 — 按成功标准与上述决策执行。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
