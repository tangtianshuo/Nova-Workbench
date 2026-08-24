# Phase 22: 引擎核心(loop 语义移植 + 事件唯一写者 + replay parity) - Research

**Researched:** 2026-08-24
**Domain:** TS→Rust 语义移植(agent run engine, Tauri v2 + rusqlite + rig-core)
**Confidence:** HIGH(规格源 = 本仓库 TS 代码逐行精读,非外部知识)

## Summary

本 phase 是一次"可执行规格移植"工程:TS 侧 `src/ai/` ~3400 行代码就是规格,SQLite schema(0002-0007)是两侧共享契约。核心工作:(1) `src-tauri/src/engine/` 模块化移植 toolLoop/compaction/contextAssembler/ChatSession 投影/事件存储/确认队列/崩溃恢复/fork;(2) rusqlite 单连接 Mutex 接管 agent_* 表唯一写者,真事务包住 append+artifact+candidate;(3) ChatPanel 提交路径改走 `engine_run` Tauri command(复用 llm.rs 现有 Channel + CancellationToken 模式);(4) fixture 单源 `src/ai/__tests__/fixtures/`,Rust/TS 双侧跑投影 JSON 规范化逐位 diff。

**Primary recommendation:** 模块切分 `engine/{event_log, chat_session, loop_runner, compaction, context_assembler, confirmations, restore, fork, token_estimate, params_hash}`,每个纯函数模块配对移植 TS 测试;先做 PORT-01 协议定稿 + token/paramsHash/JSON 规范化三个"逐位复刻"基石,再做 loop 本体。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- crate 组织 = 单 crate 内模块化:`src-tauri/src/engine/` 目录(loop / scheduler / event_log / tools 各 mod);不拆 workspace
- SQLite = rusqlite 单连接 + Mutex;事件日志 append-only 天然串行,WAL 下 TS 读不阻塞
- migrations = 单源共享:Rust 侧读同一 `src-tauri/migrations/` 目录(tauri-plugin-sql 已在用),杜绝 schema 漂移
- 事务 = 升级真事务:rusqlite 真事务包住「事件 append + artifact 写 + candidate 落库」;顺手消除 v0.3.0 DELIV-04 补偿控制近似债
- 切换 = 直接切换:ChatPanel 调用点改走新 Rust command(`engine_run`);不做配置开关;parity 测试兜底
- 投影数据源 = 读路径不动:ChatSession 投影仍从 SQLite(agent_events)读;仅流式增量走 Rust→webview 通道
- TS 217 测试 = 保留到 Phase 25(移植规格与回归对照),随 TS loop 一起归档
- contextAssembler = Phase 22 全移植读路径:五段注入 + FTS5 检索(knowledgeRepo/memoryStore 只读部分)Rust 化;memory_candidates 写路径随唯一写者一并 Rust 化
- 通道 = 沿用现有 Tauri Channel 模式(与 llm.rs 现有流式路径同构)
- 推送粒度 = 双消息类型:token chunk(高频)+ 事件落库摘要(kind + seq);webview 收事件摘要从 SQLite 刷新投影
- 取消 = cancel command + run 注册表:`engine_cancel(run_id)` → CancellationToken 传播;确认等待态取消 = 现有候选取消语义
- PORT-01 幂等分类 = 随 tool_call 事件 payload 落盘(可重跑/须先验证);旧事件无字段视为「须先验证」;不建单独表
- fixture = 单源共享:`src/ai/__tests__/fixtures/` 同一批 JSON,Rust `#[test]` 与 TS `node:test` 双侧跑
- 对比层 = 投影 JSON 逐位 diff(规范化:键序 + 时间戳字段白名单);不比事件序列
- 来源 = 合成 fixture 为主 + 真实 v0.3.x DB 抽样 1-2 份端到端
- 锁定 = 永久 cargo test,与 TS parity 测试同等地位
- PORT-01 协议在第一个 plan 定稿;Rig/GraphFlow 不引入;llm.rs 原地保留;Rust 立即接管四张 agent_* 表唯一写者,业务表过渡期 TS 写 Rust 只读

### Claude's Discretion
- engine/ 模块内部文件切分、错误类型设计、Channel 消息结构细节
- fixture 具体用例清单(覆盖 HITL/压缩/fork/恢复/幂等分类分支即可)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENG-01 | Rust 完成整轮 agent loop,不经 TS toolLoop | §编码映射表:toolLoop.ts 逐函数映射 engine/loop_runner;llm.rs chat_with_tools 已支持 tool-call 聚合(含 delta accumulator + 空 args→{}),可直接被 loop 调用 |
| ENG-02 | Rust 是 agent_* 四表唯一写者,重启无孤儿无重复 | §事件 schema 契约 + §SQLite 并发;rusqlite 单连接 Mutex + 真事务;per-session 写链由 Mutex 天然串行(替代 TS enqueue 链) |
| ENG-03 | replay parity 永久测试 | §JSON parity 规范化规则 + §fixture 机制;现有测试全部 inline(无 fixtures/ 目录),Wave 0 需建目录并从既有测试抽取事件序列 |
| ENG-04 | HITL 跨边界,原子消费保持 | §确认卡片状态机;confirmationStore.ts 的三条条件 UPDATE SQL 原样照抄到 rusqlite |
| ENG-05 | 崩溃恢复语义保持 | sessionRestore.ts 逐函数映射(§编码映射表);启动执行点见 §关键技术结论#7 |
| PORT-01 | 孤儿 exec 第三态协议定稿 | §PORT-01 协议草案:tool_call payload 加 `idempotency` 字段 + interrupted tool_result 呈 unknown;需第一个 plan 定稿落 ADR-0003 附则 |
</phase_requirements>

## 精确编码映射表(TS → Rust)

| TS 规格(文件:行) | 语义 | Rust 目标(engine/ 模块) | 复刻要点 |
|---|---|---|---|
| tokenEstimate.ts:9-15 | CJK 感知 token 估算 | `token_estimate.rs` | 见 §算法逐位复刻#1 |
| ftsTokens.ts:7-24 | CJK 切分 + FTS match 串 | `token_estimate.rs`(或 `fts_tokens.rs`) | 见 §算法逐位复刻#2 |
| paramsHash.ts:9-36 | canonical JSON + SHA-256 | `params_hash.rs` | 见 §算法逐位复刻#3 |
| eventStore.ts:141-256 | SQLite append/seq SQL 侧分配/listEvents/listSessions/artifact 读写 | `event_log.rs` | 同一 INSERT 子查询分配 seq;per-session enqueue 链 → 单连接 Mutex 天然替代;append 返回 seq=-1 语义改为 `last_insert_rowid` 可拿真 seq(rusqlite 单连接优势,但保持不依赖) |
| eventStore.ts:37-44 | scope provider(workspace/product stamp) | `event_log.rs` | Rust 侧 scope 由 engine_run 参数传入(webview 提交时带上 activeWorkspaceId/selectedProductId),不需要全局 provider |
| invariants.ts:8-83 | 五种违规码 + seq 连续性 | `event_log.rs`(check_event_stream) | 纯函数,1:1;违规码字符串逐字相同 |
| artifacts.ts:24-52 | >4KB artifact 化 | `event_log.rs`(prepare_tool_result) | 4096/512 阈值常量;modelText 前缀格式 `[tool_result <name>] ` 逐字节相同 |
| chatSession.ts:54-111 | groupIntoTurns/trimToBudget/trimOversizedTurn/collapseToolCallAssistants | `chat_session.rs` | 纯投影函数,1:1;DEFAULT_MAX_TURNS=8, budget=8000 |
| chatSession.ts:166-201 | lazy session_created / addMessage 双写 / appendAuxEvent | `chat_session.rs` | once-guard + 链序(session_created 先于首条消息);Rust 侧由 loop 内事件队列保证顺序 |
| chatSession.ts:252-317 | rebuildMessages / fromEvents(compaction-aware) | `chat_session.rs` | replay 核心路径,parity 测试的对比对象就是 getMessagesForLLM 输出 |
| chatSession.ts:330-343 | getMessagesForLLM(compaction 摘要前置) | `chat_session.rs` | formatCompactionSummary 格式串逐字复刻(chatSession.ts:45-47) |
| toolLoop.ts:110-282 | runToolLoop 主循环 | `loop_runner.rs` | MAX_ITERATIONS=5;五处 addMessage payload 形状逐字段复刻(见下);endTurn outcome 四种;turn-end audit(checkEventStream)保留;session summary projection fire-and-forget |
| toolLoop.ts:47-58 | knowledge 检索 lazy + 降级 [] | `context_assembler.rs` | Rust 侧 try/catch → Result 降级 |
| toolLoop.ts:200,210,247-248,264-267 | 四种 tool 落库 payload | `loop_runner.rs` | 逐字段:tool_call `{toolCallId,toolName,args,content}`;WAIT `{ok:false,awaitingConfirmation:true[,summary|error]}` 且 waitText 前缀 `[tool_result name] `;错误 `{ok:false,error,retryAvailable}` + errorText 重试提示文案逐字 |
| compaction.ts:15-18,32-101 | 常量/tokenPressure/findSplitPoint/buildTranscript | `compaction.rs` | 0.8/0.5/12000/2000 常量;clampLines「首行必保」语义(kept.length>0 才 break) |
| compaction.ts:109-181 | maybeCompactSession(含 fork offset 落 child space) | `compaction.rs` | forkOffset = 非本 session 事件数;payload 字段在 child space 减 offset 落盘 — 必须复刻否则 fork parity 炸 |
| contextAssembler.ts:37-160 | 五段注入(core600/pending200/memories500/fts400/recent300) | `context_assembler.rs` | RECENT_DIALOG_RESERVED=1200, FTS_TOP_K=5, REJECTED_LIMIT=5;中文标题文案逐字(`## 待确认记忆候选` 等);clampToTokens 二分须在 char 边界(TS slice 按 UTF-16 码元,Rust 按 char — 见风险#1) |
| confirmations.ts 全部 | 候选创建/dedup/confirm/consume/reject/list | `confirmations.rs` | paramsHash dedup(destructive/deliverable 查 active 表比对 hash/字段);consume 从 candidate 原始字段重算 hash(deliverable 编辑后语义) |
| confirmationStore.ts:279-375 | 原子条件 UPDATE | `confirmations.rs` | 三条 UPDATE SQL 逐字照抄(§事件 schema 契约);rowsAffected==1 判定 → rusqlite `execute` 返回的受影响行数 |
| sessionRestore.ts:36-166 | 尾切/孤儿 interrupted/预算重建/pending 重现 | `restore.rs` | interrupted tool_result payload 逐字 `{ok:false,interrupted:true,reason:'app-restart',modelText:'[tool_result name] {"ok":false,"interrupted":true,"reason":"app restarted before tool completion"}'}`;PORT-01 要把这里改成 unknown 语义(见 §PORT-01) |
| fork.ts:27-83 | buildForkEventStream/forkCutSeq/resolveSessionEvents | `fork.rs` | SEQ_PAYLOAD_FIELDS=['splitSeq','coveredSeqStart','coveredSeqEnd'] 三字段 remap 规则;递归 resolve;invalid 三因 |
| memoryStore.ts:360-...(SQLite 分支只读) | listActiveMemories/listPending/listRejected | `context_assembler.rs` 内查询 | 同一 SQL;listActiveMemories newest-first(overflow drop tail) |
| knowledgeRepo.ts:327-416 | searchKnowledgeHybrid(FTS5 MATCH + filters) | `context_assembler.rs` 内查询 | 同一 SQL(knowledge_fts MATCH + superseded_at IS NULL) |
| api.ts chatWithTools(Tauri 分支) | LLM 调用边界 | 直接调 `llm::chat_with_tools` | 已存在,rust 内部调用零改造;ToolCallInfo{name,arguments} 就是 loop 期望形态 |
| sessionRepo.ts | sessions upsert(fire-and-forget) | `event_log.rs` | upsertSessionMeta 语义并入 |

**不需要移植**(Phase 22 边界外):tools/*(实体工具 = Phase 23;但 `registry.ts` 的 schema 生成与 `executeTool` 分发骨架需要 — 见风险#6)、sessionSummaryProjection.ts 与 titleGenerator.ts(投影侧,TS 保留即可;若 Rust loop 内需要则调用同名 LLM 通道 — 建议延后到后续)、CmdKPalette 调用点(第二个 runToolLoop 调用者,切 engine_run 时一并处理或暂留 TS — 建议一并切,代码同构)。

## 关键算法逐位复刻要点

### 1. tokenEstimate(Rust 等价)
```
cjk_count = text.chars().filter(is_cjk).count();
non_cjk   = text.chars().count() - cjk_count;
ceil(cjk + non_cjk / 4.0)
```
CJK 判定:TS regex 范围 `[⺀-⻳(U+2E80-U+2EFF 区段变体)　-〿(U+3000-303F)぀-ヿ(3040-30FF)㐀-䶿(3400-4DBF)一-鿿(4E00-9FFF)豈-﫿(F900-FAFF)＀-￯(FF00-FFEF)]`。Rust 用 `matches!(c, '\u{2E80}'..='\u{2EFF}' | '\u{3000}'..='\u{303F}' | '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}' | '\u{F900}'..='\u{FAFF}' | '\u{FF00}'..='\u{FFEF}')`。注意 TS `.length` 是 UTF-16 码元数 — 对 BMP 外字符( surrogate pair)TS 算 2、Rust chars() 算 1。**决策:Rust 按 chars() 计**(输入是 LLM/用户文本,BMP 外罕见;估算函数本就是启发式,误差 ±1 不破坏 parity —— 但必须在 fixture 里锁定一个含 emoji 的用例,双侧同 expected 值)。若 fixture 出现分歧,回退方案:Rust 用 `text.encode_utf16().count()` 精确对齐 TS length。

### 2. ftsTokens(Rust 等价)
- normalize:`to_lowercase()` + Unicode NFKC → Rust 需要 `unicode-normalization` crate(`nfkc()`);lowercase 顺序 = TS `toLocaleLowerCase().normalize('NFKC')`(先小写后归一 — 顺序复刻)。
- 提取:`[a-z0-9]+` 连续段 whole + `[㐀-鿿]`(U+3400-U+9FFF)逐字;去重保序(Rust: `IndexSet` 或 Vec + contains,规模小无所谓)。
- match string:每 token 双引号包裹、内部 `"`→`""`、空格 join。
- 依赖新增:`unicode-normalization = "0.1"`。

### 3. paramsHash(canonical JSON + SHA-256)
- canonical 规则:paramsHash.ts:9-25 — 每层对象键**字典序排序**、数组保序、`undefined` 丢弃、字符串走标准 JSON 转义。Rust:serde_json::Value 上手写 canonical 化(BTreeMap 遍历即有序;Value 无 undefined,天然对齐;注意 JS `JSON.stringify(number)` 对 1.0 输出 `1`、serde_json 对 f64 1.0 输出 `1.0` — **工具参数经 webview JSON IPC 已是解析后的 Value,数字以 serde 形态为准,双侧 fixture 断言 hash 相同即可锁定**)。
- SHA-256:`sha2` crate,输出小写 hex。**必须与 TS 既有存量 params_hash 值兼容**(v0.3.x pending 候选跨引擎 dedup)— fixture 里放一对 TS 算好的 (params, hash) 金样本验证。
- 依赖新增:`sha2 = "0.10"`。

### 4. seq 归一化(fork remap)
只有 `splitSeq / coveredSeqStart / coveredSeqEnd` 三个 payload 字段是数字时 remap(fork.ts:27);prefix identity、child `+= prefix.length`。compaction 落盘时在 child space(payload 减 forkOffset)。纯整数运算,零歧义。

### 5. clampToTokens 二分(contextAssembler.ts:51-61)
TS `text.slice(0, mid)` 按 UTF-16 码元切。Rust 必须在 char 边界切(`text.chars().take(n).collect` 或 char_indices);对含 emoji/代理对的文本切点可能差 1 — fixture 锁一个 CJK+emoji 用例;若 diff 出现,TS 侧 slice 会在代理对中间产生孤立代理(坏字符串)— 实践中配额内文本切点罕见落界,标记 LOW 风险即可。

## JSON 序列化 parity 规范化规则(投影逐位 diff)

**对比对象**:`ChatSession.getMessagesForLLM()` 输出(role+content 数组)+ 五段 audit(context_injected payload)+ compaction summary 文本,**不比事件序列**(锁定决策)。

规范化规则(两侧 diff 前各自应用):
1. **键序**:parse 后按 canonical(字典序)重新序列化 — 消除 TS JSON.stringify 插入序 vs serde_json BTreeMap 序差异。serde_json 默认 Map 即 BTreeMap(feature 无 preserve_order)→ **不要启用 `preserve_order` feature**,或 diff 前双侧 canonicalize。最稳:diff 函数输入是 `serde_json::Value` vs parse 后的 JSON,统一 canonical string 比对。
2. **时间戳白名单**:`timestamp`、`createdAt`、`generatedAt`、`startedAt`、`lastEventAt`、`eventId`、`artifactId`、`correlationId`、`toolCallId`、`confirmationToken` — diff 时置为 `"<ts>"/"<uuid>"` 占位(两侧都是"存在且格式正确"即可)。
3. **null vs 缺键**:TS `JSON.stringify` 丢 undefined 留 null;serde_json null 显式。规范化:对象内 null 与缺失键**视为不同**(payload 形状是规格的一部分,如 `{ok:true, artifactId:null}` 是 toolLoop 故意写的)— 但 projectId 侧 schema 三列可 NULL,列值 null ↔ payload 无该键,不参与投影 diff。
4. **数字**:整数按 i64 比对;payload 里 seq/pressure/threshold 等全部整数;若出现 f64(如 pressure 0.9123),Rust 序列化格式与 JS `Number.prototype.toString` 在常规值上一致(serde_json 用 ryu,JS 用最短表示 — 两者都是最短往返表示,通常一致;fixture 锁一个压力值样本)。
5. **modelText 内嵌 JSON**:`[tool_result name] {"ok":true,...}` 这种**字符串内嵌 JSON**必须逐字节 — 它进 LLM 上下文,键序也是语义(TS 故意 `ok` 前置)。Rust 侧构造该字符串时**手写 format! 而非 serde 序列化**,直接照抄 TS 字面拼接顺序(toolLoop.ts:209/247, artifacts.ts:51)。

## SQLite 并发结论(WAL / busy_timeout / 单连接 Mutex)

- **DB 路径**:tauri-plugin-sql `"sqlite:nova.db"` 解析到 app config dir 下的 `nova.db`(plugin 默认)。rusqlite 侧用 `app.path().app_config_dir()?.join("nova.db")` 在 setup 时解析(MEDIUM 置信 — plugin 版本行为需在 Wave 0 用一条 probe 验证:rusqlite 连接后 `SELECT COUNT(*) FROM meta`,看到 schema 即同库;这是本 phase 最关键的运行期假设)。
- **模式**:0002 已 `PRAGMA journal_mode = WAL`(持久化属性,一次设置库内生效)。rusqlite 连接时再执行一次无害。
- **rusqlite 连接**:`Connection::open` + `busy_timeout(Duration::from_millis(5000))` + `foreign_keys(true)`(如 schema 需要)。tauri-plugin-sql(sqlx)侧已有自己的池;WAL 下"多读单写"并发安全 — 写写冲突(rare: TS 写业务表 vs Rust 写 agent_*)由 busy_timeout 兜底。
- **单连接 Mutex**:`Mutex<Connection>` 全局一个(tauri State manage)。事件 append 天然串行,替代 TS per-session enqueue 链;跨 session 也串行(可接受,桌面单用户)。rusqlite Connection 非 Sync 但 Send — Mutex 包裹后可入 State(标准模式)。
- **真事务**:`conn.transaction()` 包「tool_result 事件 + artifact 行 + memory/deliverable candidate」;Rust 单连接下事务与其它写天然互斥,无双连接死锁面。注意:事务内不做 LLM 网络调用(事务只包落库瞬间)。
- **migrations 单源**:rusqlite 侧不建独立迁移;打开连接后读 `meta.schema_version` 断言 ≥7(tauri-plugin-sql 在 builder 阶段已跑完 0001-0007)。**顺序风险**:plugin migration 在 plugin initialize 时执行,setup 钩子在之后 — engine 首次拿连接时 schema 已就绪(lib.rs:96 builder 先于 setup)。
- 依赖新增:`rusqlite = { version = "0.32", features = ["bundled"] }`(bundled 免系统 sqlite 版本漂移;与 sqlx bundled sqlite 共存无冲突,只是二进制变大,可接受)。

## 事件 schema 契约(Rust struct 映射)

### agent_events(0002)
| 列 | 类型 | Rust 字段 |
|---|---|---|
| event_id | TEXT PK | event_id: String(uuid v4) |
| session_id | TEXT NOT NULL | session_id: String |
| seq | INTEGER NOT NULL, UNIQUE(session_id,seq) | seq: i64(SQL 侧 `(SELECT COALESCE(MAX(seq),0)+1 WHERE session_id=$2)` 分配 — 保持此 INSERT,勿在 Rust 分配) |
| event_type | TEXT NOT NULL | event_type: String(开放枚举:session_created/user_message/assistant_message/tool_call/tool_result/turn_ended/context_injected/compaction_started/compaction_completed + 未来扩展) |
| created_at | TEXT NOT NULL | ISO 8601 UTC 毫秒精度 — **TS `new Date().toISOString()` 格式 = `2026-08-24T12:34:56.789Z`(始终 3 位毫秒)**;Rust 用 `chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ")` 或手写;依赖 `chrono = "0.4"`(default-features off + clock)。毫秒位必须补零到 3 位 |
| workspace_id/product_id/project_id | TEXT NULL | Option<String> |
| correlation_id | TEXT NULL | Option<String>(每 turn 一个 uuid) |
| payload_json | TEXT NOT NULL | serde_json::Value → to_string。**序列化形态即落库形态:TS JSON.stringify 插入序;Rust 侧 payload 由 struct 序列化(serde 保 struct 字段声明序)— 两侧形状一致因字段集相同,列内容不做逐位比对(parity 只比投影),但 replay 读取时 parse 为 Value,序无关** |

### agent_artifacts(0002)
artifact_id TEXT PK / session_id / tool_name / byte_size INTEGER(= json 字符长度)/ content TEXT(完整 JSON)/ created_at TEXT。

### agent_confirmation_candidates(0003+0006)
confirmation_token PK / kind CHECK(枚举:knowledge_write, destructive_action, deliverable_draft)/ status CHECK(pending,confirmed,consumed,rejected)默认 pending / params_hash / params_json / summary NULL / session_id NULL / created_at / expires_at / confirmed_at / consumed_at / rejected_at。三条原子 UPDATE(confirm/consume/reject)SQL 逐字照抄 confirmationStore.ts:283-346,含 `COALESCE(confirmed_at,$2)`、`expires_at > $2` 条件;rowsAffected==1 判定。expires 24h(row TTL)。

### memory_candidates(0004,未精读 — Wave 0 补)
memories / knowledge_docs / knowledge_fts 同在 0004;memory_candidates 写路径(唯一写者接管对象)在 memoryStore.ts SQLite 分支 — **Open Question #1**。

### sessions(0007)
session_id PK / workspace_id / title NULL / title_source / parent_session_id / fork_cut_seq / created_at / last_active_at。Rust 侧 upsert(fire-and-forget 语义可保留为同步落库)。

### PORT-01 协议草案(第一个 plan 定稿)
1. **幂等分类**:tool_call payload 新增 `idempotency: 'rerunnable' | 'verify_first'` 字段(exec 工具注册时声明;Phase 22 无 exec 实体工具,字段与协议先落,exec 工具在 Phase 23 填真值);旧事件无字段 → 读取侧视为 `verify_first`。
2. **孤儿第三态**:sessionRestore 追加的 interrupted tool_result,`modelText` 由 error 味道改为 unknown:`[tool_result <name>] {"ok":false,"status":"unknown","interrupted":true,"reason":"app restarted before tool completion"}` — 命令可能已执行成功或未执行,模型不得假定失败。恢复 marker payload `{ok:false, interrupted:true, status:'unknown', reason:'app-restart', modelText:...}`。**同时更新 TS sessionRestore.ts 保持双侧一致**(TS 侧改的是未来崩溃恢复读路径的兼容呈现;或 TS 侧 Phase 25 随 loop 一起下线 — 建议 TS 同步改,一行 diff,保 parity)。
3. **工具描述约定**:registry 的工具 description 模板加一句:"若 tool_result 状态为 unknown,先验证(如查看文件/状态)再决定是否重跑;verify_first 类命令禁止未验证直接重跑"。写进工具描述生成处(Phase 22 改 schema 生成函数,Phase 23 exec 工具受益)。

## Channel 消息协议设计(engine_run)

复用 commands.rs `StreamChunk` 模式(tag="kind", content="data"),新增 engine 专用 enum(webview 侧 switch msg.kind):

```rust
#[derive(Serialize, Clone)]
#[serde(tag = "kind", content = "data")]
pub enum EngineEvent {
    #[serde(rename = "token")]       Token { text: String },            // 高频,LLM 流式
    #[serde(rename = "tool_start")]  ToolStart { name: String },        // trace UI(对应 onToolStart)
    #[serde(rename = "tool_end")]    ToolEnd { name: String, ok: bool },// 对应 onToolEnd(confirmation 时 ok=true — 0bbc3f2 金丝雀)
    #[serde(rename = "event")]       EventCommitted { seq: i64, event_type: String }, // 落库摘要 → webview 从 SQLite 刷新投影
    #[serde(rename = "confirmation")] Confirmation { candidate: Value }, // knowledge/destructive 卡片
    #[serde(rename = "done")]        Done { result: EngineRunResult },   // 对应 ToolLoopResult
    #[serde(rename = "error")]       Error { message: String },
}
```
- `engine_run(user_message, session_id, provider, ollama_model, workspace_id, product_id, on_event: Channel<EngineEvent>) -> EngineRunResult`(EngineRunResult = ToolLoopResult 同形:content/iterations/tool_calls_executed/truncated/pending 确认)。
- `engine_cancel(run_id)` → `AppState.runs: Mutex<HashMap<String, CancellationToken>>`(state.rs 先例,commands.rs generate_project 注册/清理模式照抄)。run_id 可 = correlation_id。
- 确认消费:`engine_confirm_candidate(token)` / `engine_reject_candidate(token)` command 调 confirmations.rs 原子 UPDATE;确认后的**工具重执行**仍走现有 TS executeTool(ChatPanel confirmDestructiveAction 路径,chatConsoleStore.ts:527-537)— Phase 22 确认后重执行留在 TS(读路径不动原则),仅候选落库/推送 Rust 化。**注意**:重执行产生的事件落库必须走 Rust(唯一写者)— ChatPanel confirm 流里 executeTool 后的落库调用改调 Rust command(小 command:`engine_append_tool_result`)。这是 Phase 22 最细的接缝,plan 时显式列出。
- webview 刷新:收 `event` 摘要后 chatConsoleStore 增量 `refreshProjection(sessionId)`(listEvents → 重建 messages)— 读路径函数 TS 已有(fromEvents),不动。

## 关键技术结论(回答 research 问题清单)

1. **CJK/估算**:见 §算法#1-2。Rust `unicode-normalization` + 手写 CJK range match。
2. **JSON parity**:见 §规范化规则。核心:diff 层 canonical 化(parse→canonical string);嵌在 modelText 字符串里的 JSON 手写 format! 保序。
3. **rusqlite 与 tauri-plugin-sql 并存**:同一 DB 文件(app_config_dir/nova.db,需 probe 验证),WAL,双方 busy_timeout 5s;Rust 单写 agent_*,TS 写业务表,写写不冲突。schema_version≥7 断言替代重复迁移。
4. **确认卡片两阶段状态机**:pending →(用户确认)confirmed →(工具执行 consume)consumed / rejected / TTL expired(派生态,不改行)。Rust `Confirmations` 模块照抄 SQL;状态机本体在 DB CHECK 约束里,Rust 无需独立状态机类型。
5. **时间戳**:TS `toISOString()` = UTC 毫秒 3 位 + `Z`。Rust chrono 格式串 `%.3f` 补毫秒。chatSession 内 timestamp 用 `Date.parse(event.createdAt)`(毫秒数)— Rust 侧投影 `DateTime::parse_from_rfc3339` 或直接透传 ISO 字符串(投影 diff 白名单覆盖)。
6. **LLM 流式 tool_call 聚合**:**已支持**。llm.rs stream_model 有 ToolCallDeltaAccumulator(internal_call_id 聚合 name+arguments、流尾 parse、空 args→`{}`,llm.rs:337-410)。loop 直接消费 `ChatResult.tool_calls`,无需新聚合。
7. **崩溃恢复执行点**:Rust `run()` 的 `.setup()` 钩子内 spawn(不阻塞窗口创建):对所有 session(或 latest——**决策建议:所有 session 扫孤儿 + 尾切是读侧投影行为,marker append 只需对所有含孤儿的 session 执行**;v0.3.x TS 是按需 restore 单 session。为 parity,建议 Rust 启动时仅对 latest session 做 marker append(对齐 TS no-arg 路径),其余 session 懒恢复(switchSession 时)。与 ENG-05 验收对齐即可)。
8. **fixture 机制**:现有测试全部 inline 构造事件对象,**没有 fixtures/ 目录、没有 JSON 日志文件**。Wave 0 需新建 `src/ai/__tests__/fixtures/*.json`(每文件 = 一个事件数组 + 期望投影 + 元数据 fork/budget)。Rust 侧路径:crate 相对路径 — `cargo test` CWD = `src-tauri/`,用 `env!("CARGO_MANIFEST_DIR")` 拼 `../src/ai/__tests__/fixtures/`(编译期常量,免运行期解析)。真实 DB 抽样:`SELECT * FROM agent_events WHERE session_id=? ORDER BY seq` 导出为 fixture JSON(手工一次性,1-2 个 session)。

## 风险清单

1. **clampToTokens/slice 的 UTF-16 vs char 边界**(MEDIUM):见 §算法#5;fixture 锁边界用例。
2. **plugin-sql 与 rusqlite DB 路径不同库**(HIGH 影响,易验证):Wave 0 probe(同库 meta/schema 断言)。若 plugin 路径解析不同(app_config vs app_data),以 plugin 实际路径为准。
3. **存量 pending 候选 params_hash 跨引擎兼容**(MEDIUM):sha2 + canonical 金样本测试(§算法#3)。
4. **TS↔Rust 双引擎窗口期写者违规**(MEDIUM):TS toolLoop 仍在代码里,若 ChatPanel/CmdKPalette 任一调用点漏切,出现双写者。对策:切换 plan 里穷举 runToolLoop 全部调用点(已知 2 处:chatConsoleStore.ts:456、CmdKPalette.tsx:69),切完后 grep 断言零调用;TS 写路径(confirmationStore/memoryStore SQLite 分支的 INSERT/UPDATE)在 Phase 22 结束时保持不被任何运行路径触达(代码保留)。
5. **confirmation 后工具重执行的事件落库接缝**(MEDIUM):见 §Channel 协议 — executeTool 留 TS、落库走 Rust `engine_append_tool_result`。容易漏,plan 显立任务。
6. **engine 内工具注册表骨架**(已知边界):Phase 22 loop 需要 toolsToSchemas + executeTool 等价物,但实体工具在 Phase 23。建议:Phase 22 落 `engine/tools/mod.rs` 注册表 trait + **knowledge_write/destructive 候选生成逻辑**(confirmations 依赖)+ 其余工具经最小 stub(调 TS?不 — Phase 22 直接切引擎,无桥)。**这暴露一个规格缺口:TS registry 的现有工具(createTask/scheduleCrud 等 PM CRUD)在 Phase 22 切换后必须可用,否则功能回归。** ADR-0003 把 TS 工具桥排在 Phase 23。→ **Open Question #2(必须 plan 前裁决)**:Phase 22 的 tool registry 只注册 Rust 侧可执行的工具(候选类工具 + knowledge 检索),PM CRUD 工具暂从 schema 列表消失(模型能力降级一个 phase),还是 Phase 22 提前引入最小工具桥?CONTEXT.md 说"不含工具层实体工具(Phase 23)"——倾向前者(降级),但需用户在 plan 时确认。
7. **serde_json 数字表示**(LOW):§规则#4,fixture 锁样本。
8. **compaction fork-offset 落 child space**(MEDIUM 易漏):compaction.ts:145/151/171 注释语义必须连带移植,fork parity fixture 必含"fork 后再压缩"用例。

## Don't Hand-Roll

| 问题 | 不要自建 | 用 |
|---|---|---|
| SHA-256 | 手写 | `sha2` crate |
| NFKC 归一 | 手写映射 | `unicode-normalization` |
| UUID v4 | 自造 | 已有 `uuid` crate(toolCallId/eventId 格式与 TS crypto.randomUUID 一致) |
| ISO 时间 | 手拼 | `chrono` format(格式串锁定 `%Y-%m-%dT%H:%M:%S%.3fZ`) |
| LLM 流/tool-call 聚合 | 新流层 | llm.rs chat_with_tools 原样调用 |
| 取消 | 新信号机制 | tokio_util CancellationToken(state.rs/commands.rs 先例) |
| 迁移 | Rust 侧第二套 migration | tauri-plugin-sql 单源 + schema_version 断言 |

## Code Examples

### event append(rusqlite,保 SQL 侧 seq 分配)
```rust
// engine/event_log.rs — INSERT 逐字对齐 eventStore.ts:150-168
pub fn append(conn: &Connection, input: &EventInput) -> Result<i64> {
    let event_id = uuid::Uuid::new_v4().to_string();
    let created_at = now_iso(); // chrono: %Y-%m-%dT%H:%M:%S%.3fZ
    conn.execute(
        "INSERT INTO agent_events
           (event_id, session_id, seq, event_type, created_at,
            workspace_id, product_id, project_id, correlation_id, payload_json)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_events WHERE session_id = ?2),
                 ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![event_id, input.session_id, input.event_type, created_at,
                input.workspace_id, input.product_id, input.project_id,
                input.correlation_id, input.payload_json /* serde_json::to_string(&Value) */],
    )?;
    Ok(conn.last_insert_rowid())
}
```

### canonical JSON + hash(params_hash.rs)
```rust
pub fn canonical_json(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::Bool(_) | Value::Number(_) | Value::String(_) => v.to_string(),
        Value::Array(a) => format!("[{}]", a.iter().map(canonical_json).collect::<Vec<_>>().join(",")),
        Value::Object(m) => format!(
            "{{{}}}",
            m.iter().map(|(k, v)| format!("{}:{}", Value::String(k.clone()), canonical_json(v)))
                .collect::<Vec<_>>().join(",")
        ), // serde_json Map = BTreeMap → 已字典序,与 TS sort() 对齐
    }
}
```

### fixture 路径(Rust 测试)
```rust
const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/ai/__tests__/fixtures");
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Rust | cargo test(src-tauri,纯函数 + fixture 回放;LLM/网络用 #[ignore] UAT) |
| TS | node:test(既有 33 个测试文件,`node --test src/ai/__tests__` 类命令,见 package.json) |
| 快命令 | `cargo test --manifest-path src-tauri/Cargo.toml` |
| lint | `npm run lint`(tsc --noEmit) |

### Phase Requirements → Test Map
| Req | Behavior | Test | Command | Exists? |
|---|---|---|---|---|
| ENG-03 | 投影 parity | fixture 回放 cargo test + TS node:test 双跑 | `cargo test parity` | ❌ Wave 0 |
| 算法基石 | token/ftsTokens/paramsHash 逐位 | 单测(含 TS 金样本) | `cargo test token_` | ❌ Wave 0 |
| ENG-02 | 唯一写者无孤儿 | runToolLoop 调用点 grep 断言 + 事件序列 checkEventStream cargo test | `cargo test event_log` | ❌ Wave 0 |
| ENG-04 | 原子消费恰一 | rusqlite 双线程并发 consume 测试 | `cargo test confirmations` | ❌ Wave 0 |
| ENG-05/PORT-01 | 尾切/孤儿 unknown | restore 单测 + fixture(含 v0.3.x 存量格式) | `cargo test restore` | ❌ Wave 0 |

### Sampling Rate
- Per task commit:`cargo test`(engine 相关 filter)
- Per wave:`cargo test` 全量 + `npm run lint` + TS 既有测试(确认未破坏规格源)
- Phase gate:全绿 + 真实 DB 抽样 fixture 双侧 diff 通过

### Wave 0 Gaps
- `src/ai/__tests__/fixtures/` 目录 + 首批 JSON(从 phase13/14/20 既有测试内联数据抽取)
- 依赖安装:`rusqlite(bundled)`、`sha2`、`chrono`、`unicode-normalization`
- DB 路径 probe(§风险#2)
- Open Question #2 裁决(工具集降级 vs 提前桥)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain | engine | ✓(Tauri 项目既有) | edition 2021 | — |
| cargo test | parity 测试 | ✓ | — | — |
| Ollama 本地 | LLM UAT | 未验证 | — | `#[ignore]` 标记,不阻塞 |
| v0.3.x 真实 DB | 抽样 fixture | ✓(开发机 app config dir nova.db) | schema 7 | 合成 fixture 为主 |

## Open Questions

1. **memory_candidates 表结构与写路径 SQL**(0004 + memoryStore SQLite 分支未精读)— planner 的唯一写者任务需要精确列清单。低风险(照抄 TS SQL),执行时读文件即可;建议 plan 的对应任务标注"规格源:memoryStore.ts SQLite 分支"。
2. **Phase 22 工具集边界**(见风险#6):PM CRUD 工具在切换后从模型 schema 消失一个 phase(降级),还是提前引入最小桥?CONTEXT.md 倾向前者;需在 plan 22-01 定稿 PORT-01 时一并确认。
3. **plugin-sql nova.db 实际目录**(app_config vs app_data)— Wave 0 probe 定案(风险#2)。

## Sources

### Primary (HIGH confidence)
- 本仓库精读:toolLoop.ts / compaction.ts / contextAssembler.ts / chatSession.ts / events/{eventStore,invariants,artifacts,types}.ts / confirmations.ts / sessionRestore.ts / fork.ts / tokenEstimate.ts / ftsTokens.ts / paramsHash.ts / confirmationStore.ts(关键 SQL)/ chatConsoleStore.ts(submit 路径)/ llm.rs / commands.rs / state.rs / lib.rs / Cargo.toml / migrations 0002/0003/0007
- 未读但已定位为规格源:migrations/0004/0005/0006、memoryStore.ts SQLite 分支全文、knowledgeRepo.ts 检索全文、sessionRepo.ts、registry.ts、tools/*

## Metadata

**Confidence breakdown:**
- 编码映射/语义规格: HIGH — 逐行精读规格源
- SQLite 并发/路径: MEDIUM — WAL/单连接结论可靠,DB 路径需 probe
- JSON parity 规则: MEDIUM — 规则明确,数字/UTF-16 边界靠 fixture 锁定

**Research date:** 2026-08-24
**Valid until:** 2026-09-24(仓库内规格,不随外部生态漂移)

## RESEARCH COMPLETE
