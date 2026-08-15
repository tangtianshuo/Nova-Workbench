# Phase 15: 长期记忆 + 知识文档 + FTS5 检索 - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning

<domain>
## Phase Boundary

PM 拥有可管理的第二大脑:记忆候选经用户确认入库、知识文档版本化带来源、中文 2 字关键词可经 FTS5 命中、每轮对话上下文按优先级投影注入并留 context_injected 事件可审计。覆盖 MEM-01..08 共 8 个需求。

不包含:PRD 交付物管线(Phase 16)、Agent 工作区/晨报/右键动作(Phase 17)、语义 embedding 检索(明确排除)。

</domain>

<decisions>
## Implementation Decisions

### 记忆候选流(MEM-01/02/03)
- 识别机制:`proposeMemory` tool 注册进既有 `ai/tools/` 注册表,LLM 结构化输出创建候选,与 knowledge write 确认流同构;模型推断只能创建候选,用户显式说"记住"才产生直接确认候选
- 拒绝反馈:拒绝列表注入系统提示(MEM-02 防重复提出的最低成本实现)
- 防轰炸去重:复用 Phase 14 canonical JSON + SHA-256(`paramsHash` 同款)做去重键
- 候选过期:7 天;队列上限 ~20(MEM-03,上限溢出时旧候选过期让位)

### 知识文档 + FTS5 存储(MEM-04/06/07)
- 真相源:SQLite 新表(版本化)+ zustand 投影,与事件日志同构;`rndStore.knowledgeBase` 变投影
- 混合检索:FTS5 `MATCH` + 结构过滤(标签/产品/时间)同一条 SQL `WHERE`
- 版本链:同表 `version` 自增 + `superseded_at`;被取代行保留可审计但移出 FTS 索引(`indexed=0`)
- mock 数据:首启动 seed 迁入 SQLite
- CJK 切分:逐字切分(MEM-06 已锁定),索引与查询共用同一 helper

### 上下文优先级投影(MEM-08)
- token 预算:固定比例(业务事实 30% → 待确认 10% → 已确认记忆 25% → FTS5 top-k 20% → 最近对话 15%),溢出截断
- `context_injected` 事件 payload:各段条数 + token 数 + 截断标记(不存全文快照)
- FTS5 注入:每轮按用户最新消息关键词自动检索注入 top-k=5
- `buildCoreContext()` 保留为"业务事实"段输入,外层新组装器编排五段

### UI 触达 + 数据保留
- 记忆候选确认:ChatPanel 内联确认卡片,复用 Phase 14 pending banner 模式
- 知识库搜索:`KnowledgeBaseView` 顶部加搜索框 + 标签/产品/时间过滤
- 产品删除保留策略:events 保留(append-only 审计),memories/知识文档/FTS 索引级联删除
- 记忆管理:本期最小列表(查看 + 删除,无编辑)

### Claude's Discretion
表结构细节、迁移编号、组装器实现方式、检索评分细节等实现层决策。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/confirmationStore.ts` + `src/ai/paramsHash.ts` — 持久化确认队列(原子条件 UPDATE 消费、TTL 派生过期、kind 单表判别),记忆候选队列直接同构复用
- `src/ai/confirmations.ts` — knowledge write 候选流(created/updated + reject)先例
- `src/ai/tools/` 注册表 — proposeMemory tool 挂载点;knowledgeRead/knowledgeSearch/knowledgeWrite 已存在
- `src/ai/context.ts` `buildCoreContext()` — 业务事实段输入
- `src/ai/compaction.ts` + `chatSession.ts` — 投影/派生模式先例
- `src/ai/events/` — eventStore/invariants/artifacts,context_injected 事件追加于此
- `src-tauri/migrations/0001-0003` — 迁移链,Phase 15 新增 0004+

### Established Patterns
- 双实现模式:Node 测试/web dev 走内存实现,isTauri() 分支切 Sqlite 实现
- 事件 append-only,seq SQL 侧分配,correlation_id 贯穿
- zustand store + mock seed 初始化

### Integration Points
- `src/ai/toolLoop.ts` — 每轮上下文组装注入点
- `src/views/KnowledgeBaseView.tsx`(240 行)— 搜索 UI 扩展点
- ChatPanel pending banner — 记忆确认卡片挂载点
- `src/stores/rndStore.ts` `knowledgeBase` — 改投影

### Research Flag 已解决(2026-08-15 静态证据链)
- FTS5 runtime 可用性:`tauri-plugin-sql/sqlite` → `sqlx/sqlite` → `sqlx-sqlite/bundled` → `libsqlite3-sys` vendored 编译带 `-DSQLITE_ENABLE_FTS5`(build.rs:129)。打包构建自带 FTS5,不依赖系统 SQLite。执行期留一次 `CREATE VIRTUAL TABLE fts5_probe` 验证(5 分钟)。
- CJK tokenizer:MEM-06 已锁定逐字切分,索引/查询共用 helper。

</code_context>

<specifics>
## Specific Ideas

无特定要求 — 按标准方案实现。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
