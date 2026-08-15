# Phase 14: 持久化确认 + 会话恢复 + 上下文压缩 - Context

**Gathered:** 2026-08-15
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

应用崩溃或重启后,agent 的执行状态(待确认项、最近会话、未完成工具调用关系)可恢复且不会重复执行 — 可恢复执行底座闭环。

覆盖需求:EVT-04, EVT-05, CMP-01, CMP-02。

明确不在本 phase:记忆候选/知识库/FTS5(Phase 15)、context_injected 审计事件与记忆候选事件(Phase 15,依赖记忆层)、业务 store 变更与 agent 事件的关联 ID 全面打通(视 Phase 15 需要)。确认流的公开 API(create/confirm/consume/reject)与 ChatPanel/ProductKnowledgeTab 的消费方式保持兼容 — 只换存储底座。

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
表结构细节、恢复入口的挂载位置、压缩摘要的注入格式等实现层决策由 Claude 按 ROADMAP 目标、成功标准与现有代码约定自主决定。

### Locked by Requirements/Roadmap(不得重开)
- **EVT-05 确认候选持久化**:从内存 Map 迁移到 SQLite 持久化表;`params_hash = 规范化 JSON 的 SHA-256`、带过期时间(expires_at)、**原子条件 UPDATE 消费**(重启后待确认项仍可用;重复恢复/重复确认不重复消费)。两条候选流(knowledge write + destructive action)都要覆盖。
- **EVT-04 会话恢复**:应用重启后能恢复最近会话(含未完成审批和工具调用关系);**孤儿 tool_call 标记为 interrupted,绝不自动重试**造成重复业务写入;**加载时崩溃尾切到最后一个完整 turn**,不出现残缺消息。
- **CMP-01 压缩触发与切分**:token 压力 **≥0.8×上下文窗口**时触发 LLM 摘要压缩;**只在工具调用配对平衡处切分**(依赖 Phase 13 配对不变量);`agent_events` 原始事件**无任何丢失**(压缩只改变模型可见投影)。
- **CMP-02 摘要溯源**:压缩摘要必须记录覆盖的事件范围、生成时间和使用的模型;更早会话以**带来源摘要**形式进入上下文。
- **Phase 13 继承约束继续有效**:事件写入经 EventStore(seq SQL 侧分配、按会话串行);LLM messages 从 session 单一派生(不引入新的第二份历史);`runToolLoop`/`ToolLoopCallbacks` 公开签名不变;日志 append-only,修正通过新事件表达。
- **双实现模式延续**:Node 测试/web dev 走内存实现,与 EventStore 的 isTauri() 分支模式一致;测试必须在无 Tauri 环境可跑。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/confirmations.ts`(167 行)— 两条内存 Map 候选流:`pendingConfirmations`(KnowledgeWriteCandidate)+ `pendingDestructiveActions`(DestructiveActionCandidate);API: create/get/confirm/consume/reject × 2 + ConfirmationRequiredError。本 phase 迁移核心。
- `src/ai/events/eventStore.ts`(228 行)— EventStore 接口(append/listEvents/saveArtifact/getArtifact)+ Memory/Sqlite 双实现 + 按会话串行写链;恢复需要扩展会话枚举能力(如 listSessions/最近会话查询)。
- `src/ai/chatSession.ts`(272 行)— 事件日志投影;`fromEvents()` 已具备(重建不重发事件);本 phase 在其上挂恢复逻辑(崩溃尾切、interrupted 标记)。
- `src/ai/toolLoop.ts`(223 行)— 单历史事件驱动循环;启动恢复入口;消费 ConfirmationRequiredError → WAIT tool_result `{ ok: false, awaitingConfirmation: true, error }`。
- `src/ai/events/invariants.ts` — checkEventStream,压缩切分的配对平衡判定可直接复用。
- `src/ai/tokenEstimate.ts` — CJK 感知 estimateTokens,压力计算(≥0.8×窗口)基础。
- `src/lib/api.ts` — `chatWithTools`(Provider 化 LLM 调用,压缩摘要生成可复用)、`getActiveProvider`。
- `src/stores/storage/initializeDatabase.ts` — APP_SCHEMA_VERSION(当前 2)+ 启动编排;`src/stores/storage/lazySqlite.ts` — DB 句柄。
- `src-tauri/migrations/0001_init.sql`、`0002_agent_events.sql` — 迁移约定:forward-only additive、永不 DROP、幂等 seed;注册点 `src-tauri/src/lib.rs`。
- `src/ai/__tests__/phase13*.test.ts` — 3 个测试文件(含永久 replay parity),回归基线 44/44(npm test)。

### Established Patterns
- DB 写入在 TypeScript 侧(tauri-plugin-sql),Rust 只管迁移 DDL 与 LLM provider。
- 双实现模式:isTauri() 分支,内存实现供 Node 测试(`getMemoryEventStore`/`resetMemoryEventStore` 模式)。
- 前端组件模式见 .planning/codebase/CONVENTIONS.md。

### Integration Points
- 迁移 0003(确认候选表 + 压缩摘要相关)+ `lib.rs` 注册 + APP_SCHEMA_VERSION=3。
- 确认候选消费点:`src/ai/tools/knowledgeWrite*`(consumeKnowledgeWriteConfirmation)、destructive action 工具(consumeDestructiveActionConfirmation)、ChatPanel 确认 UI(onConfirmationRequired 回调)、ProductKnowledgeTab(知识候选确认界面)。
- 会话恢复挂载点:`src/components/ChatPanel.tsx`(line 93 `useRef(new ChatSession(...))` — 构造仍须保持无副作用,恢复走显式异步入口)。
- 压缩触发点:toolLoop 每轮请求前的 token 压力检查。

</code_context>

<specifics>
## Specific Ideas

- docs/AGENT_MEMORY_REFERENCE.md §6(上下文投影与压缩):压缩只改变模型可见投影,不删除原始事件;摘要必须记录覆盖的事件范围、生成时间和使用的模型。
- Phase 13 VERIFICATION.md 残留风险记录(SqliteEventStore.append 返回 seq:-1,真实 INSERT 仅 UAT 覆盖)— 本 phase 若新增 SQLite 写路径,优先补可自动化验证的断言。
- STATE.md TODO:⌘K + ChatPanel 并发会话测试尚不存在 — 本 phase 恢复语义涉及多会话枚举,可顺带补最小覆盖。

</specifics>

<deferred>
## Deferred Ideas

- 记忆候选/知识库版本与来源/FTS5 混合检索 → Phase 15
- context_injected 审计事件 → Phase 15(依赖上下文投影组装器)
- 多会话管理器(恢复任意历史会话,非仅最近一条)→ v2 UX-05
- 会话全文搜索 → v2 SEM-03

</deferred>
