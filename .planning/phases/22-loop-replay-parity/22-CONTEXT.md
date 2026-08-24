# Phase 22: 引擎核心(loop 语义移植 + 事件唯一写者 + replay parity) - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

用户在现有 ChatPanel 发起对话,整轮 agent loop 由 Rust 常驻引擎完成,行为与 TS 引擎逐位一致。交付:Rust agent loop(toolLoop/compaction/contextAssembler 语义移植)、agent_* 表唯一写者接管、replay parity 永久测试、HITL 跨边界语义保持、崩溃恢复语义保持、PORT-01 孤儿 exec 第三态协议定稿。

边界:**不含**工具层实体工具(Phase 23)、多 run 调度器完整形态与托盘(Phase 24)、TS loop 删除(Phase 25)。TS toolLoop 代码保留不调用(规格作用)。

</domain>

<decisions>
## Implementation Decisions

### Rust 引擎代码组织与持久层(smart discuss 2026-08-24,用户全部接受)
- crate 组织 = **单 crate 内模块化**:`src-tauri/src/engine/` 目录(loop / scheduler / event_log / tools 各 mod);不拆 workspace
- SQLite = **rusqlite 单连接 + Mutex**;事件日志 append-only 天然串行,WAL 下 TS 读不阻塞
- migrations = **单源共享**:Rust 侧读同一 `src-tauri/migrations/` 目录(tauri-plugin-sql 已在用),杜绝 schema 漂移
- 事务 = **升级真事务**:rusqlite 真事务包住「事件 append + artifact 写 + candidate 落库」;顺手消除 v0.3.0 DELIV-04 补偿控制近似债

### 双引擎并存与切换(smart discuss 2026-08-24,用户全部接受)
- 切换 = **直接切换**:ChatPanel 调用点改走新 Rust command(`engine_run`);不做配置开关;parity 测试兜底
- 投影数据源 = **读路径不动**:ChatSession 投影仍从 SQLite(agent_events)读;仅流式增量走 Rust→webview 通道
- TS 217 测试 = **保留到 Phase 25**(移植规格与回归对照),随 TS loop 一起归档
- contextAssembler = **Phase 22 全移植读路径**:五段注入 + FTS5 检索(knowledgeRepo/memoryStore 只读部分)Rust 化,否则组不出相同 prompt、parity 过不了;memory_candidates 写路径随唯一写者一并 Rust 化

### 流式通道与取消信号(smart discuss 2026-08-24,用户全部接受)
- 通道 = **沿用现有 Tauri Channel 模式**:发起 run 时 webview 创建 Channel 传入 `engine_run`,与 llm.rs 现有流式路径同构
- 推送粒度 = **双消息类型**:token chunk(高频)+ 事件落库摘要(kind + seq);webview 收事件摘要从 SQLite 刷新投影
- 取消 = **cancel command + run 注册表**:`engine_cancel(run_id)` → CancellationToken 传播;确认等待态取消 = 现有候选取消语义
- PORT-01 幂等分类 = **随 tool_call 事件 payload 落盘**(可重跑/须先验证);旧事件无字段视为「须先验证」;不建单独表

### replay parity 验收机制(smart discuss 2026-08-24,用户全部接受)
- fixture = **单源共享**:`src/ai/__tests__/fixtures/` 同一批 JSON,Rust `#[test]` 与 TS `node:test` 双侧跑
- 对比层 = **投影 JSON 逐位 diff**(规范化:键序 + 时间戳字段白名单);不比事件序列(避免把 TS 投影 bug 锁进规格)
- 来源 = **合成 fixture 为主 + 真实 v0.3.x DB 抽样 1-2 份**端到端
- 锁定 = **永久 cargo test**,与 TS parity 测试同等地位;新语义分支 = 新 fixture 双侧加

### 已锁定的前置决策(ADR-0003 / ROADMAP,不重开)
- PORT-01 协议在第一个 plan 定稿(孤儿 exec unknown/interrupted 第三态、幂等分类落盘、unknown 先验证再重跑写进工具描述)
- Rig/GraphFlow 不引入;llm.rs 原地保留;omp 借模式不引依赖
- Rust 立即接管 agent_events / agent_artifacts / agent_confirmation_candidates / memory_candidates 唯一写者;业务表过渡期 TS 写 Rust 只读

### Claude's Discretion
- engine/ 模块内部文件切分、错误类型设计、Channel 消息结构细节
- fixture 具体用例清单(覆盖 HITL/压缩/fork/恢复/幂等分类分支即可)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets(移植规格源)
- `src/ai/toolLoop.ts`(282 行)— loop 主体语义
- `src/ai/compaction.ts`(181 行)+ `src/ai/contextAssembler.ts`(160 行)— 压缩与组装语义
- `src/ai/chatSession.ts`(357 行)+ `src/ai/events/`(eventStore 278 / invariants 83 / artifacts 52 / types 70)— 投影与配对不变量
- `src/ai/confirmations.ts`(449 行)+ `src/ai/fork.ts`(83 行)— HITL 与 fork 语义
- `src/ai/memoryStore.ts`(812 行)+ `src/ai/knowledgeRepo.ts`(416 行)— 读路径(FTS5 检索/五段注入)+ memory_candidates 写者
- `src-tauri/src/llm.rs`(678 行,保留)— provider-agnostic LLM 调用 + 现有 Channel 流式模式
- `src-tauri/src/`(commands 326 / file_ops 253 / workspace_scan 321 / state 74 / error 79)— Rust 侧既有 command 模式与 State 管理先例
- `src-tauri/migrations/0002..0007` — agent_* schema(迁移契约)

### Established Patterns
- 事件日志 append-only + seq + correlation_id;tool 配对五种违规码
- 原子条件 UPDATE 消费确认候选(并发恰一成功)
- 崩溃恢复:尾切不完整 turn、孤儿 tool_call interrupted 绝不重执行
- ≥0.8× 窗口配对边界压缩(coveredSeq/splitSeq 持久化,fork remap)
- Tauri command + Channel 流式(llm.rs 先例)

### Integration Points
- ChatPanel 提交路径(现调 TS toolLoop,改走 `engine_run` command)
- `src/store/chatConsoleStore` — streaming 守卫 / pending 卡片读路径(按 session 过滤)
- confirmations 消费点(确认卡片 → 现有原子 UPDATE,改由 Rust command 执行)

</code_context>

<specifics>
## Specific Ideas

- UAT 全部延后到 milestone 收口统一做(用户 2026-08-24 指令)——phase VERIFICATION 人工项只留档不阻塞

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
