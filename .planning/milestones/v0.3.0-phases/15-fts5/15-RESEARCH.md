# Phase 15: 长期记忆 + 知识文档 + FTS5 检索 - Research

**Researched:** 2026-08-15
**Domain:** SQLite FTS5 全文检索 + 记忆/知识版本化存储 + 上下文优先级注入(基于既有事件日志/toolLoop 架构)
**Confidence:** HIGH(codebase 集成点全部实读)/ MEDIUM(FTS5 与 tauri-plugin-sql 行为细节,官方文档 + 仓库内经验证据)

## Summary

本 phase 的本质是三件事:(1) 把 Phase 14 的 confirmationStore 模式(原子条件 UPDATE + paramsHash 去重 + TTL 派生过期)复制到"记忆候选"域,并新增 memories/knowledge_docs 版本化表;(2) 用 FTS5 standalone 虚拟表做中文逐字切分检索;(3) 在 toolLoop 现有的 systemPrompt 组装点插入五段优先级注入器并落 `context_injected` 事件。**零新依赖**——全部构建在已验证的 tauri-plugin-sql + sqlx bundled SQLite(FTS5 已编译启用)之上。

研究发现的三个最关键架构约束:

1. **tauri-plugin-sql 不支持跨 `execute()` 调用的事务**(GitHub issue #886,连接池每次调用可能拿不同连接,裸 BEGIN/COMMIT 不安全)。这直接决定了 FTS5 表设计:**supersede 过滤必须在查询 WHERE 里做(join 回内容表),绝不依赖"从 FTS 索引删除"**。这样被取代的行永远不需要碰 FTS 表,每个生命周期操作都是单语句,原子性问题消失。
2. **0003 迁移的 `CHECK (kind IN ('knowledge_write','destructive_action'))` 约束使记忆候选无法复用 agent_confirmation_candidates 表**(SQLite 无法 ALTER CHECK,前向-only 规则禁止表重建)。记忆候选必须用**新表** `memory_candidates`,同构复制 confirmationStore 模式。
3. **proposeMemory tool 不能复用 `ConfirmationRequiredError` 路径**——那个路径会终止整个 turn(`awaiting_confirmation`)。记忆候选不应打断对话流:tool 返回普通成功结果给模型,UI banner 通过 store/回调另行通知。

**Primary recommendation:** migration 0004 建 4 个对象(`memories`、`memory_candidates`、`knowledge_docs`、`knowledge_fts` 虚拟表),FTS 用 standalone 模式 + join 回内容表过滤 `superseded_at IS NULL`;CJK 逐字切分 helper 复用 `knowledgeSearch.ts` 的 `lexicalTerms` 模式;注入器插在 `toolLoop.ts:101` 的 `buildSystemPrompt` 调用点(保留 `systemPromptOverride` 短路以不破坏既有测试)。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 识别机制:`proposeMemory` tool 注册进既有 `ai/tools/` 注册表,LLM 结构化输出创建候选,与 knowledge write 确认流同构;模型推断只能创建候选,用户显式说"记住"才产生直接确认候选
- 拒绝反馈:拒绝列表注入系统提示(MEM-02 防重复提出的最低成本实现)
- 防轰炸去重:复用 Phase 14 canonical JSON + SHA-256(`paramsHash` 同款)做去重键
- 候选过期:7 天;队列上限 ~20(上限溢出时旧候选过期让位)
- 真相源:SQLite 新表(版本化)+ zustand 投影,与事件日志同构;`rndStore.knowledgeBase` 变投影
- 混合检索:FTS5 `MATCH` + 结构过滤(标签/产品/时间)同一条 SQL `WHERE`
- 版本链:同表 `version` 自增 + `superseded_at`;被取代行保留可审计但移出 FTS 索引(`indexed=0`)
- mock 数据:首启动 seed 迁入 SQLite
- CJK 切分:逐字切分(MEM-06 已锁定),索引与查询共用同一 helper
- token 预算:固定比例(业务事实 30% → 待确认 10% → 已确认记忆 25% → FTS5 top-k 20% → 最近对话 15%),溢出截断
- `context_injected` 事件 payload:各段条数 + token 数 + 截断标记(不存全文快照)
- FTS5 注入:每轮按用户最新消息关键词自动检索注入 top-k=5
- `buildCoreContext()` 保留为"业务事实"段输入,外层新组装器编排五段
- 记忆候选确认:ChatPanel 内联确认卡片,复用 Phase 14 pending banner 模式
- 知识库搜索:`KnowledgeBaseView` 顶部加搜索框 + 标签/产品/时间过滤
- 产品删除保留策略:events 保留(append-only 审计),memories/知识文档/FTS 索引级联删除
- 记忆管理:本期最小列表(查看 + 删除,无编辑)

### Claude's Discretion
表结构细节、迁移编号、组装器实现方式、检索评分细节等实现层决策。

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
(Phase boundary: 不含 PRD 交付物管线 Phase 16、Agent 工作区 Phase 17、语义 embedding 检索)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | 记忆候选确认流(识别→候选→去重→确认→入库);模型推断只创建候选 | `memory_candidates` 新表(CHECK 约束逼出)+ confirmationStore 同构模式;proposeMemory tool 返回普通结果不终止 turn;origin 字段区分 model_inferred/user_directed |
| MEM-02 | 被拒候选永不进检索 + 反馈模型不重复提出 | rejected 行永久保留 + 检索 WHERE 过滤 status;拒绝列表注入系统提示待确认段 |
| MEM-03 | 防轰炸:去重/上限~20/过期 7 天 | paramsHash UNIQUE 索引;cap 溢出时原子 UPDATE 最旧行过期;TTL 派生(不写状态) |
| MEM-04 | 知识文档版本+来源;旧版本可审计,检索不返回失效 | `knowledge_docs` version 自增 + superseded_at;FTS join 过滤 `superseded_at IS NULL`(无需删 FTS 行) |
| MEM-05 | 记忆 supersedes 链替换,保留来源和版本 | `memories` 表同款 version + supersedes_memory_id + superseded_at 链 |
| MEM-06 | FTS5 混合检索,中文 2 字命中 | knowledge_fts standalone 虚拟表;共享 `toFtsTokens` helper(索引/查询同源);quoted-token MATCH 语法天然免疫注入 |
| MEM-07 | 检索结果带 source_type/source_id/version/scope/updated_at | 检索 SQL join 回内容表返回全部元数据列 |
| MEM-08 | 五段优先级上下文组装 + context_injected 审计事件 | 注入器插 toolLoop systemPrompt 组装点;事件投影安全(rebuildMessages default:break + invariants 只查 pairing/seq,均实读验证) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 双实现模式已确立:Node 测试/web dev 走内存实现,`isTauri()` 分支切 Sqlite 实现(eventStore/confirmationStore 先例,Phase 15 所有新 repo 照抄)
- 禁止纯白/黑、raw hex、text-gray-*;只用语义 token 类(UI spec 已锁定全部界面)
- Phosphor icons `weight="duotone"`;`cn()` 合并 className
- 新代码直接用 store hooks,不走 `useApp()`
- **无新 npm 依赖(UI spec Registry Safety: ZERO)** — FTS5 是 SQLite 内建,无需任何包
- Skill 检查:`.agents/skills/design-taste-frontend` 仅覆盖 landing page/portfolio,**明确排除 dashboard/产品 UI** — 本 phase 不适用,UI 以 15-UI-SPEC.md 为准

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLite FTS5 (libsqlite3-sys vendored) | 随 sqlx-sqlite bundled | 全文检索虚拟表 | build.rs 已带 `-DSQLITE_ENABLE_FTS5`(CONTEXT.md 已锁结论,静态证据链验证) |
| tauri-plugin-sql (@tauri-apps/plugin-sql) | 已装 | SQLite 访问 | 既有 eventStore/confirmationStore 全走它;migration Rust-side 注册 |
| zustand | 5.0.14 已装 | knowledgeBase 投影 + UI 状态 | 既有模式 |
| WebCrypto SHA-256 (`src/ai/paramsHash.ts`) | 已存在 | 候选去重键 | `computeParamsHash` 直接复用,零新代码 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| standalone FTS5 表 + join 过滤 | external-content FTS5 (`content=`) | 省存储但 UPDATE/DELETE 需特殊 `'delete'` 命令或触发器,且与"无事务"约束叠加后极易索引漂移 — 不值得 |
| standalone FTS5 表 | contentless (`content=''`) | contentless 单行删除需 SQLite ≥3.43 的 `contentless_delete` 选项;版本历史要保留行,本就不删 — 语义不匹配 |
| 逐字切分 + bm25 | trigram tokenizer | trigram 需 3 字起配,2 字中文词("需求")配不中 subsequence 查询要 LIKE 兜底;逐字切分已锁(MEM-06) |
| FTS5 rank (bm25) | 自定义评分 | FTS5 内建 `ORDER BY rank` 即 bm25;现有 knowledgeSearch 手工评分仅留作内存实现兜底 |

**Installation:** 无(`npm install` 零新增)。

## Architecture Patterns

### Recommended Project Structure

```
src-tauri/migrations/
  0004_memories_knowledge_fts.sql      # 新表 + FTS5 虚拟表 + schema_version=4
src/ai/
  memoryStore.ts                       # 双实现 repo: memories + memory_candidates(照抄 confirmationStore 结构)
  knowledgeRepo.ts                     # 双实现 repo: knowledge_docs + knowledge_fts 写/检索 API(单一写 API)
  ftsTokens.ts                         # CJK 逐字切分 + MATCH 查询串构造(索引/查询共用,纯函数)
  contextAssembler.ts                  # 五段优先级组装器(纯函数 + 可注入检索函数,便于测试)
  tools/proposeMemory.ts               # 候选创建 tool(返回普通结果,不抛 ConfirmationRequiredError)
  tools/knowledgeSearch.ts             # 改造:走 knowledgeRepo 检索(内存实现保留现有词法评分)
src-tauri/src/lib.rs                   # sql_migrations() Vec 加第 4 项
src/stores/storage/initializeDatabase.ts  # APP_SCHEMA_VERSION = 4 + 知识数据一次性迁移 gate
src/views/KnowledgeBaseView.tsx        # 搜索/过滤/记忆列表(UI spec Surface 2/3)
src/components/ChatPanel.tsx           # 记忆候选确认卡片(UI spec Surface 1)
```

### Pattern 1: Migration 0004 — 表设计(推荐)

```sql
-- src-tauri/migrations/0004_memories_knowledge_fts.sql
-- 前向 only;末尾 INSERT OR IGNORE meta schema_version='4' + UPDATE(照抄 0002/0003 惯例)

CREATE TABLE IF NOT EXISTS memory_candidates (
  candidate_token TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,          -- computeParamsHash({content, scope, productId})
  origin TEXT NOT NULL CHECK (origin IN ('model_inferred', 'user_directed')),
  scope TEXT NOT NULL DEFAULT 'global', -- 'global' | 'product'
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'consumed', 'rejected')),
  session_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,            -- 7 天 TTL,派生过期(照抄 confirmationStore)
  confirmed_at TEXT, consumed_at TEXT, rejected_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_candidates_hash
  ON memory_candidates (content_hash);   -- 去重键:pending 去重 + rejected 永久防重提,一索引双职
CREATE INDEX IF NOT EXISTS idx_memory_candidates_active
  ON memory_candidates (status, created_at);

CREATE TABLE IF NOT EXISTS memories (
  memory_rowid INTEGER PRIMARY KEY,
  memory_id TEXT NOT NULL,             -- 逻辑记忆 id(跨版本稳定)
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  scope TEXT NOT NULL,
  product_id TEXT,
  source_type TEXT NOT NULL,           -- 'agent_confirmation'(MEM-07 来源)
  source_session_id TEXT,
  source_candidate_token TEXT,
  supersedes_rowid INTEGER,            -- 前一版本 rowid(MEM-05 链)
  created_at TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  superseded_at TEXT,                  -- NULL = 当前有效
  deleted_at TEXT                      -- 用户删除(软删,链审计保留)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_id_version ON memories (memory_id, version);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  doc_rowid INTEGER PRIMARY KEY,
  doc_id TEXT NOT NULL,                -- 逻辑文档 id(跨版本稳定)
  version INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags_json TEXT NOT NULL,             -- JSON array
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'seed',  -- 'seed' | 'agent' | 'user'(MEM-07)
  source_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,            -- ISO 时间戳,不再是 '刚刚' 相对串
  superseded_at TEXT                   -- NULL = 当前版本
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_docs_id_version ON knowledge_docs (doc_id, version);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_product ON knowledge_docs (product_id, updated_at);

-- standalone FTS5(非 external-content、非 contentless — 见 Don't Hand-Roll 论证)
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title, content, summary, tags,       -- 均存"预切分"文本(toFtsTokens 输出)
  doc_rowid UNINDEXED                  -- join 锚点;版本过滤交给内容表,FTS 行永不更新
);
```

**关键设计论证 — 为什么 supersede 不碰 FTS 表:**

- tauri-plugin-sql 无事务(见 Pitfall 1)。若 supersede 需要 `UPDATE docs` + `DELETE FROM fts` 两条语句,崩溃在中间 = 索引漂移。
- 改为查询时过滤:supersede 只是一条 `UPDATE knowledge_docs SET superseded_at=$now WHERE doc_rowid=$r`,单语句原子。FTS 旧行物理留存但 join 条件 `d.superseded_at IS NULL` 使其永不出现(满足成功标准 4:"不再进入检索,但历史链完整保留")。
- 文档更新(新版本)= INSERT 新 docs 行 + INSERT 新 fts 行(引用新 doc_rowid)。旧 fts 行同理被 join 过滤。失败模式安全:若 fts INSERT 失败,新版本存在但暂不可搜,可用 rebuild 函数修复。

### Pattern 2: 混合检索 SQL(MEM-06/07)

```typescript
// Source: FTS5 官方文档 https://www.sqlite.org/fts5.html + 本仓库模式
const sql = `
  SELECT d.doc_id, d.version, d.title, d.category, d.tags_json, d.summary,
         d.product_id, d.source_type, d.updated_at, f.rank
    FROM knowledge_fts f
    JOIN knowledge_docs d ON d.doc_rowid = f.doc_rowid
   WHERE knowledge_fts MATCH $match
     AND d.superseded_at IS NULL
     AND ($productId IS NULL OR d.product_id = $productId)
     AND ($since IS NULL OR d.updated_at >= $since)
   ORDER BY f.rank
   LIMIT $limit`;
```

- `ORDER BY rank` = FTS5 内建 bm25(越小越相关);join 语境下用 `f.rank`。
- 标签过滤:`tags_json LIKE '"'+tag+'"'` 或取回后 JS 侧过滤(结果集 ≤50,JS 过滤最省事)。
- 无关键词(仅结构过滤)时跳过 FTS:`SELECT ... FROM knowledge_docs d WHERE ... ORDER BY updated_at DESC`(UI spec:filters alone also trigger search mode)。
- 检索结果元数据即 MEM-07 的 source_type/source_id(doc_id)/version/scope(product)/updated_at — UI spec Surface 2 的 `{productName} · v{version} · {updatedAt}` 行直接可渲染。

### Pattern 3: CJK 逐字切分 helper(MEM-06 核心)

`src/ai/tools/knowledgeSearch.ts:61-66` 的 `lexicalTerms()` 已经就是这个切分逻辑 —— 提出来共享:

```typescript
// src/ai/ftsTokens.ts — 索引与查询共用(MEM-06 锁定)
export function toFtsTokens(text: string): string[] {
  const normalized = text.toLocaleLowerCase().normalize('NFKC');
  const words = normalized.match(/[a-z0-9]+/g) ?? [];        // 拉丁词整词保留
  const cjk = normalized.match(/[㐀-鿿]/g) ?? [];    // CJK 逐字
  return [...new Set([...words, ...cjk])];
}

export function toFtsIndexedText(text: string): string {
  return toFtsTokens(text).join(' ');   // 写入 fts 列的形态:"需 求 评 审 api"
}

export function toFtsMatchString(query: string): string {
  // 每个 token 双引号包裹 = FTS5 quoted phrase;空格连接 = 隐式 AND。
  // 切分器只可能产出 [a-z0-9]+ 与单个 CJK 字符,FTS5 语法字符(引号/NEAR/OR/列过滤)
  // 在源头即被剔除 —— 用户输入不可能触发 FTS5 语法错误或注入。
  return toFtsTokens(query).map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
}
```

为什么必须预切分:FTS5 默认 unicode61 tokenizer 把无空格的 CJK 连续串("需求评审")当成**一个** token,2 字查询"需求"永远配不中。切成空格分隔单字后 unicode61 正确逐字建索引。"需求" → `"需" "求"` 隐式 AND,两字都出现的文档命中(高召回,bm25 排序保证精度)。这是 MEDIUM-HIGH 置信(官方 tokenizer 文档 + 仓库内 `lexicalTerms` 同款逻辑已运行)。

### Pattern 4: proposeMemory tool — 不走 ConfirmationRequiredError

`toolLoop.ts:193-208` 的确认路径会 `endTurn('awaiting_confirmation')` **终止整个 turn** — 对知识写入是对的(阻塞业务写),对记忆候选是错的(打断对话)。proposeMemory 应:

```typescript
registerTool({
  name: 'proposeMemory',
  description: 'Propose a long-term memory candidate. Never fabricates user confirmation; the user must approve in the UI banner.',
  schema: z.object({ content: z.string().min(1).max(500), scope: z.enum(['global', 'product']).optional() }).strict(),
  execute: async (args) => {
    // 1. 去重:content_hash UNIQUE 冲突 → { ok: true, deduplicated: true, reason }
    // 2. rejected 历史命中 → { ok: true, deduplicated: true, reason: 'previously_rejected' }(MEM-02)
    // 3. cap 满 → 原子 UPDATE 最旧 pending 行 expires_at=now 让位 → { ..., evictedOldest: true }
    // 4. INSERT pending 候选 → 通知 UI(store 回调,非 ConfirmationRequiredError)
    return { ok: true, candidateQueued: true, origin: detectOrigin() };
  },
});
```

UI 通知机制(Claude's discretion):最省事是 memoryStore 写后由 ChatPanel 在每轮 `onToolEnd` 后刷新 pending 列表,或一个极小的 zustand `pendingMemoryStore`(计数/bump 版本)。UI spec Surface 1 已锁定卡片形态与"一次一张"。

### Pattern 5: 五段上下文组装器(MEM-08)

插入点 `toolLoop.ts:101`:

```typescript
// 现状(同步、一次性):
const systemPrompt = args.systemPromptOverride ?? buildSystemPrompt({ coreContext: buildCoreContext() });
// 变为(runToolLoop 本就是 async,零签名变化):
const systemPrompt = args.systemPromptOverride
  ? await buildSystemPrompt({})   // 测试注入 override 的路径保持行为不变
  : buildSystemPrompt({ coreContext: await assembleInjectedContext(session, args.userMessage) });
```

`assembleInjectedContext`(src/ai/contextAssembler.ts):

1. **业务事实 30%**:`buildCoreContext()` 现有输出(锁定决策:保留为该段输入)
2. **待确认 10%**:pending 候选列表 + **被拒列表**(MEM-02 "不要再提出这些:" + 最近 N 条 rejected 内容)
3. **已确认记忆 25%**:`WHERE superseded_at IS NULL AND deleted_at IS NULL AND (scope='global' OR product_id=当前产品) ORDER BY confirmed_at DESC`,按预算截断
4. **FTS5 top-k 20%**:`toFtsMatchString(userMessage)` 检索 top-k=5(空 token 跳过;每段带 来源: 文档/版本/时间)
5. **最近对话 15%**:**不新增历史** — 该段语义已由 `getMessagesForLLM()` 的 turn 窗口承担;组装器只在预算记账里为它保留 15% 配额,把其余四段总预算压到 85%(避免与 history 双重注入 = 避免"第二历史"反模式)

预算基数建议:各段配额 = ratio × session.tokenBudget(默认 8000),另设总注入硬上限(如 2000 tokens)防 30% 段在长 prompt 下爆预算。溢出截断按段内从旧到新丢条目。所有计量用 `estimateTokens`(EVT-07 CJK 感知,`src/ai/tokenEstimate.ts`)。

`context_injected` 事件:

```typescript
await getEventStore().append({
  sessionId: session.sessionId,
  eventType: 'context_injected',      // 走 session 的 correlationId
  payload: {
    segments: [
      { name: 'core', items: 1, tokens: 412, truncated: false },
      { name: 'pending', items: 3, tokens: 96, truncated: false },
      { name: 'memories', items: 5, tokens: 310, truncated: true },
      { name: 'fts_topk', items: 5, tokens: 240, truncated: false, query: '需求 日程' },
      // 最近对话段: { name: 'recent_dialog', reservedTokens: ... }
    ],
  },   // 不存全文快照(锁定)
});
```

**投影安全性已实读验证**(这是 planner 最需要的一条):
- `chatSession.ts:267-268` `rebuildMessages` 的 `default: break` — `context_injected` 事件不产生消息,replay/EVT-04 恢复零影响
- `invariants.ts:8-71` `checkEventStream` 只检查 seq 连续性 + tool pairing — 新事件类型不触发违规;事件走既有 enqueue 链,seq 连续有保障
- compaction(`compaction.ts:82-100`)只转写 4 类事件,`context_injected` 进 transcript 被忽略(摘要不带它,可接受 — 审计走原始日志)

### Pattern 6: 数据迁移(kv_store blob → 关系表)

现状:`rndStore` 经 zustand persist → `sqliteStorage` → kv_store JSON blob 存 knowledgeBase;mock seed 走 `initializeDatabase.ts` 的 `has_seeded` gate。**陷阱:`has_seeded` 在既有安装上已是 'true'**,知识 seed 会被跳过。需要独立 gate:

```typescript
// initializeDatabase.ts 尾部追加:
const m = await db.select(`SELECT value FROM meta WHERE key='knowledge_seed_v15'`);
if (!m[0]) {
  // 优先从 kv_store 现有 rnd blob 的 knowledgeBase 迁入(用户已有数据),
  // 空则从 INITIAL_KNOWLEDGE_BASE seed;每行 version=1、updated_at 转 ISO
  await migrateKnowledgeIntoSqlite(db);
  await db.execute(`INSERT OR REPLACE INTO meta (key,value) VALUES ('knowledge_seed_v15','true')`);
}
```

之后 `rndStore.knowledgeBase` 变投影:启动时从 knowledgeRepo hydrate;`addKnowledgeItem/updateKnowledgeItem` 改走 knowledgeRepo 单一写 API(更新 = 新版本行 + 新 fts 行 + 旧行 superseded_at),rndStore 持久化桶里的 knowledgeBase 弃用(persist migrate 加一行剥离即可,不动其他桶)。注意 `rndStore.ts:535` 产品删除处改调级联。

### Pattern 7: 产品删除级联 — 必须应用层

**产品不是 SQL 行** — products 存在 kv_store JSON blob 里(productStore persist),DB 层触发器无从挂起。级联在 `productStore.deleteProduct`(或其调用点)应用层执行:

```typescript
await memoryStore.deleteByProduct(productId);    // UPDATE memories SET deleted_at / DELETE
await knowledgeRepo.deleteByProduct(productId);  // DELETE FROM knowledge_fts WHERE doc_rowid IN (SELECT ...); DELETE FROM knowledge_docs WHERE product_id=$1
await memoryStore.rejectPendingByProduct(productId); // 或过期让位
// events 不动(append-only 审计,锁定决策)
```

两条 DELETE 非原子(无事务)但方向安全:先删 FTS 再删 docs,失败残留最多是孤儿 docs 行(不可搜)。前向-only SQL 迁移里写触发器既做不到(无 products 表)也不必要。

### Anti-Patterns to Avoid

- **绝不用 `ConfirmationRequiredError` 实现 proposeMemory** — 会终止 turn,打断对话流(见 Pattern 4)
- **绝不往 agent_confirmation_candidates 插新 kind** — 0003 CHECK 约束会拒(见 Pitfall 2)
- **绝不往 session 塞注入用的假消息** — 注入只进 systemPrompt;消息历史永远从事件投影派生(EVT-03 单历史不变量)
- **绝不做"第二历史"** — 最近对话段不复制进组装器,只做预算预留(见 Pattern 5 第 5 段)
- **绝不用裸 `BEGIN`/`COMMIT` 跨 execute 调用** — 连接池不保证同连接(见 Pitfall 1)
- **绝不在 UI 硬编码 hex/灰阶** — UI spec 已锁定全部 token 类

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 相关性排序 | 手工评分函数进 SQL 路径 | FTS5 `ORDER BY rank`(bm25) | 内建、带列权重 `bm25(fts, w...)` 可调;现有 `scoreArticle` 词法评分仅留作内存实现 |
| 去重键 | 新 hash 方案 | `computeParamsHash`(paramsHash.ts) | Phase 14 已验证;canonical JSON + SHA-256 |
| token 计量 | length/4 | `estimateTokens`(tokenEstimate.ts) | EVT-07 CJK 感知,防中文 4-8 倍低估 |
| CJK 切分 | 新正则体系 | 提取 `lexicalTerms`(knowledgeSearch.ts:61)为共享 helper | 同款逻辑已在跑,索引/查询同源是 MEM-06 锁定要求 |
| 持久化候选队列 | 新存储 | 照抄 `confirmationStore.ts` 双实现结构 | 原子条件 UPDATE / TTL 派生 / kind 判别全有先例 + 9 个测试模式可仿 |
| 事件追加 | 直接 db.execute | `getEventStore().append`(经 enqueue 链) | 保 seq 连续不变量 |

**Key insight:** 本 phase 几乎每个子问题在 Phase 13/14 都有同构先例 — 复制结构比设计新结构快且安全。唯一真正"新"的东西是 FTS5 虚拟表和组装器,两者都是薄层。

## Common Pitfalls

### Pitfall 1: tauri-plugin-sql 无事务(GitHub issue #886)
**What goes wrong:** 跨 `execute()` 调用的 `BEGIN ... COMMIT` 可能落在连接池的不同连接上,静默失效;多语句字符串塞进一次 `execute()` 也依赖 sqlx prepared 路径,不可靠。
**How to avoid:** 每个 SQL 写操作设计成单语句原子(条件 UPDATE / INSERT);需要"多步一致"的场景改为查询时过滤(supersede 模式)或接受可修复的最终一致(先 docs 后 fts,rebuild 兜底)。
**Warning signs:** 任何 plan 任务里出现 `BEGIN TRANSACTION`。
(MEDIUM-HIGH 置信:官方 issue + 社区多方印证;仓库内既有代码从不使用事务,与此一致)

### Pitfall 2: 0003 的 CHECK 约束挡住 kind 扩展
**What goes wrong:** 往 `agent_confirmation_candidates` 插 `kind='memory_candidate'` 直接违反 `CHECK (kind IN ('knowledge_write','destructive_action'))`;SQLite 不能 ALTER CHECK,前向-only 规则禁表重建。
**How to avoid:** 新表 `memory_candidates`(本研究的推荐),结构同构。
**Warning signs:** plan 里出现"复用确认表加 kind"字样。

### Pitfall 3: `has_seeded` gate 已翻转,知识 seed 被跳过
**What goes wrong:** 既有用户 DB 的 `has_seeded='true'`,migration 0004 只建表不填数据,知识库检索空转。
**How to avoid:** 独立 meta gate `knowledge_seed_v15`(Pattern 6);迁移优先取 kv_store 用户数据,mock 只兜底。

### Pitfall 4: mock `updatedAt` 是相对串('刚刚')
**What goes wrong:** 直接迁入 SQLite 后时间过滤(`最近 7 天`)完全失效。
**How to avoid:** 迁移时统一转 ISO;投影层映射回显示串。UI spec 显示 `{updatedAt}` 原样可容纳。

### Pitfall 5: FTS5 MATCH 语法错误(用户输入)
**What goes wrong:** 裸拼用户串进 `MATCH` — `"`, `NEAR`, `col:`, `OR`, `-`, `^` 都是 FTS5 语法,轻则报错重则语义劫持。
**How to avoid:** Pattern 3 的 quoted-token 构造:切分器只产出 `[a-z0-9]+` 与单 CJK 字符,语法字符源头即被剔除;内部引号双写兜底。
**Warning signs:** 任何 `"MATCH '" + query + "'"` 拼接。

### Pitfall 6: schema_version 双点更新漏一处
**What goes wrong:** lib.rs 加了 Migration 但 `APP_SCHEMA_VERSION` 没 bump(或反之)— initializeDatabase 的 sanity/version guard 行为错乱。
**How to avoid:** 0004 迁移 + `sql_migrations()` 第 4 项 + `initializeDatabase.ts APP_SCHEMA_VERSION = 4` 三件套同任务提交。仓库惯例:迁移文件末尾 `INSERT OR IGNORE INTO meta ... schema_version` + UPDATE。

### Pitfall 7: sqlx migration 多语句 / FTS5 DDL — 已验证非问题
0002 迁移(PRAGMA + 5 条 CREATE)在产线运行 = 多语句 .sql 文件经 tauri-plugin-sql 迁移路径正常的经验证据;`CREATE VIRTUAL TABLE ... USING fts5` 是普通 SQL,同路径执行。**迁移 0004 本身就是 FTS5 probe**:若打包构建缺 FTS5,迁移失败 → initializeDatabase sanity 抛错 → 应用拒启(符合 D-04 哲学)。STATE.md 的"5 分钟 fts5_probe 验证"以此形式落地即可,不必单写 probe 代码。

### Pitfall 8: 记忆候选 cap/过期三件套"可观察"(成功标准 2)
防轰炸三项(去重/上限/过期)必须可观察 — 落地为:proposeMemory 返回值带 `deduplicated`/`evictedOldest` 标记 + `memoryStore.stats()`(pendingCount/dedupHits/evictions)供测试断言。不要只写行为不留计数。

### Pitfall 9: web dev / Node 测试路径
非 Tauri 环境 `initializeDatabase` 直接 return、走内存实现。内存 knowledgeRepo 实现可继续用现有 `scoreArticle` 词法评分(语义等价:同 toFtsTokens 切分 + contains 匹配),保证测试可跑且"2 字中文命中"在双实现都成立。

## Code Examples

### 检索(双实现签名,SQL 实现)
见 Pattern 2/3 — `toFtsMatchString(args.query)` 产出 `$match` 参数。

### cap 满时让位(单语句原子,SQLite 实现)
```sql
-- 满员时最旧 pending 行过期让位(app 层先 SELECT count,>20 才发此条;竞态窗口无害)
UPDATE memory_candidates
   SET expires_at = $now
 WHERE candidate_token = (
   SELECT candidate_token FROM memory_candidates
    WHERE status = 'pending' AND expires_at > $now
    ORDER BY created_at ASC LIMIT 1
 );
```

### 确认入库(candidate → memory,原子条件 UPDATE 消费)
```typescript
// 照抄 confirmationStore.consume 的条件 UPDATE 模式:
const r = await db.execute(
  `UPDATE memory_candidates SET status='consumed', consumed_at=$2
    WHERE candidate_token=$1 AND status='confirmed' AND consumed_at IS NULL AND expires_at > $2`,
  [token, now]);
if (r.rowsAffected !== 1) throw new MemoryConfirmationError('already_settled');
// 然后单语句 INSERT INTO memories (...version = COALESCE(MAX(version),0)+1 WHERE memory_id=...)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| knowledgeSearch 内存词法扫描(rndStore) | FTS5 混合检索(SQLite) | 本 phase | `searchKnowledgeBase`/`listKnowledgeArticles` tool 改走 knowledgeRepo;返回结构加 source 元数据(MEM-07) |
| knowledgeBase zustand blob 持久化 | SQLite 版本化表 + 投影 | 本 phase | 单一写 API;版本/来源/FTS 同源 |
| systemPrompt 仅 buildCoreContext | 五段优先级组装 + 审计事件 | 本 phase | MEM-08 |

## Open Questions

1. **注入预算基数**:30/10/25/20/15 的分母是 `session.tokenBudget`(8000)还是独立注入上限(如 2000)?建议 ratio × tokenBudget 且总注入硬上限 2000;若 planner 想更懒,固定绝对配额(600/200/500/400/300)也满足"固定比例"字面。实现层决策,不影响任务拆分。
2. **"最近对话 15%" 的语义**:按锁定五段列表它必须存在;本研究解读为预算预留而非重复注入(避免第二历史)。若 verify 阶段认为需要"摘要式最近对话段",组装器已留段位,加内容不动架构。
3. **同内容被拒后用户主动说"记住"**:UNIQUE(content_hash) 会挡住。建议:检测到 rejected 命中且 origin='user_directed' 时放行(软性复活);planner 可择优,边界场景。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| FTS5(打包 SQLite 内建) | knowledge_fts | ✓(静态证据链,CONTEXT.md) | vendored libsqlite3-sys | 无 — migration 0004 即运行时 probe,失败拒启 |
| Rust toolchain + tauri:dev | 手动 UAT(FTS 中文检索) | ✓(Phase 13/14 已用) | — | Node 测试覆盖内存实现 |
| Node + npm test | 全部新测试 | ✓(80/80 green 基线) | tsx --test | — |

**Missing dependencies with no fallback:** 无。

## Sources

### Primary (HIGH confidence)
- 仓库内实读:`src/ai/{toolLoop,context,compaction,confirmations,confirmationStore,paramsHash,tokenEstimate,prompts}.ts`、`src/ai/events/{eventStore,invariants}.ts`、`src/ai/chatSession.ts`、`src/ai/tools/knowledgeSearch.ts`、`src/stores/rndStore.ts`、`src/stores/storage/{lazySqlite,sqliteStorage,initializeDatabase}.ts`、`src-tauri/{src/lib.rs, migrations/0001-0003}`、`src/views/KnowledgeBaseView.tsx`
- [SQLite FTS5 官方文档](https://www.sqlite.org/fts5.html) — standalone/external-content/contentless 语义、MATCH 语法、rank/bm25、quoted phrase

### Secondary (MEDIUM confidence)
- [Tauri SQL 插件文档](https://v2.tauri.app/plugin/sql/) + [plugins-workspace issue #886(事务支持)](https://github.com/tauri-apps/plugins-workspace/issues/886) — 无原生事务、连接池行为
- [Stack Overflow: FTS5 external/contentless 非索引列](https://stackoverflow.com/questions/71748748/sqlite3-fts5-contentless-or-content-external-table-how-store-read-a-non-fts) — UNINDEXED 列与 join 回查模式
- sqlx 多语句迁移行为:以仓库内 0002(PRAGMA + 多 CREATE)产线运行为经验证据,未单独核源码

### Tertiary (LOW confidence)
- 无(本研究无仅单一来源且未验证的关键论断)

## Metadata

**Confidence breakdown:**
- Schema/存储架构: HIGH — 全部锚定实读代码 + 仓库先例;CHECK 约束、has_seeded gate、kv_store blob 均亲眼验证
- FTS5 设计: MEDIUM-HIGH — 官方文档 + 通行实践;standalone + join 过滤是保守选择,即使细节有偏差也无事务风险
- tauri-plugin-sql 事务限制: MEDIUM-HIGH — 官方 issue + 多源印证;且设计上已做到"不依赖该结论也安全"
- 上下文注入: HIGH — 插入点/投影安全性/不变量兼容逐行实读验证

**Research date:** 2026-08-15
**Valid until:** 2026-09-14(仓库事实稳定;FTS5/SQLite 文档长期稳定)
