# Nova-PM-Workspace — 架构文档

> 版本: 2.0
> 日期: 2026-08-17
> 状态: 现行架构真相源（v1.0 蓝图已废止，见 ADR-0001）

---

## 1. 产品定位

**Nova** 是一个 **AI native 的产品经理桌面工作台**（Tauri v2 + React 19）：让 PM 拥有一个懂你、能替你干活的桌面 AI Agent —— 不是 chatbot，而是能生成交付物、有可管理的长期记忆与知识库、关键节点 HITL 确认的一等执行者。约束：**零 sidecar**（不引入 Node.js 子进程做 LLM/工作流）、**本地优先**（SQLite 唯一持久层，敏感数据不出本地）、**混合架构**（本地存储 + 云端/本地 LLM API）。

## 2. 架构总览

现行架构一句话：**事件日志（真相源）+ tool loop（执行）+ FTS5（检索）+ HITL 确认队列（人审）+ Tauri 壳（承载）**。

```
┌──────────────────────────────────────────────────────────────────────┐
│  Tauri v2 壳（src-tauri/src/：llm.rs 多 Provider / keychain.rs / 迁移）│
├──────────────────────────────────────────────────────────────────────┤
│  前端 React 19 + zustand（6 store + AppContext 兼容层）                │
│  ChatPanel / ⌘K / AgentWorkspaceView / 产品·任务·日程·研发·知识库视图  │
├──────────────────────────────────────────────────────────────────────┤
│  TS Agent 运行时（src/ai/）                                           │
│  toolLoop（单历史，事件驱动）                                          │
│    → 事件追加 agent_events（append-only，seq 连续 + correlation_id）   │
│    → ChatSession 投影 → deriveMessages 派生 LLM messages（唯一来源）   │
│  contextAssembler（五段优先级投影 + context_injected 审计事件）        │
│  HITL：确认候选（知识写入/破坏性动作/记忆/交付物）→ 用户确认           │
│    → 原子条件 UPDATE 消费 → 工具执行/落库                              │
├──────────────────────────────────────────────────────────────────────┤
│  SQLite 持久层（src-tauri/migrations/，tauri-plugin-sql，WAL）         │
│  agent_events / agent_artifacts / agent_confirmation_candidates       │
│  memory_candidates / memories / knowledge_docs / knowledge_fts (FTS5) │
└──────────────────────────────────────────────────────────────────────┘
```

**核心数据流**：用户消息进入 `toolLoop` → 每一步（user/assistant 消息、tool_call、tool_result、审批、压缩）作为事件追加到 `agent_events` → `ChatSession` 作为事件日志的投影，每轮迭代从 `getMessagesForLLM()` 重新派生模型上下文 → 需要人审的动作先创建确认候选，经用户确认后原子消费再执行。重启后 `sessionRestore` 从事件日志恢复会话；长会话由 `compaction` 收窄模型可见投影（原始事件不动）。

## 3. 分层结构

### 3.1 Tauri 壳（Rust，src-tauri/src/）

- `llm.rs` — provider-agnostic LLM 调用（Ollama 生产 tool-call UAT 已通过；云 Provider 走 keychain API key）
- `keychain.rs` — API key 安全存储（不进客户端 bundle）
- `commands.rs` / `state.rs` / `error.rs` — Tauri command 与 IPC（Channel 流式输出）
- `migrations/` — SQLite schema 前向迁移（forward-only，永不 DROP）

### 3.2 前端（React 19 + zustand）

- 6 个 Zustand store（task/product/rnd/schedule/workspace/ui）承载业务事实，经 tauri-plugin-sql 持久化
- `src/store/AppContext.tsx` 兼容层仍在（30 处 useApp 调用者），随 view 迁移逐步移除
- ChatPanel（Drawer）+ ⌘K 唤起 + HITL 确认卡片是 agent 对用户的统一交互面

### 3.3 TS Agent 运行时（src/ai/）

| 模块 | 职责 |
|---|---|
| `events/`（eventStore / invariants / artifacts / types） | append-only 事件存储；tool_call/tool_result 配对不变量检查；>4KB tool 结果外置为 artifact（模型历史只留摘要 + artifact_id + 头部片段） |
| `toolLoop.ts` | 单历史执行循环：每迭代从 session 派生 messages，无第二份历史数组；确认 WAIT 也落 tool_result |
| `chatSession.ts` | ChatSession = 事件日志投影；`getMessagesForLLM()` 是 LLM messages 的单一派生来源 |
| `sessionRestore.ts` | 崩溃恢复：尾切到最后完整 `turn_ended`；孤儿 tool_call 以追加 tool_result 标记 interrupted，**绝不重试** |
| `compaction.ts` | 上下文压缩：≥0.8× 窗口触发，在配对平衡处切分，只改模型可见投影，事件无损 |
| `confirmationStore.ts` + `paramsHash.ts` | HITL 确认候选持久化：paramsHash = 规范化 JSON 的 SHA-256；消费为原子条件 UPDATE，重启/并发不会双消费 |
| `memoryStore.ts` | 长期记忆：候选队列（hash 去重、cap、TTL）、确认晋升、supersedes 版本链 |
| `knowledgeRepo.ts` + `ftsTokens.ts` | 知识文档版本化读写；FTS5 索引与文档写入同事务/同语句生命周期；索引/查询同源切分（quoted-token MATCH 免注入） |
| `contextAssembler.ts` | 五段优先级上下文投影（业务事实 → 未完成动作 → 已确认约束 → 检索结果 → 近期对话/摘要），每段注入落 `context_injected` 审计事件 |
| `tools/`（14 个） | 任务/日程/产品/工作区/知识读写检索/记忆候选/导航/交付物生成 |
| `tools/generateDeliverable.ts` | 两段式：先出候选（草稿），HITL 确认编辑后版本化落研发中心交付物卡槽；落槽 doc 记录生成 turn 的 correlation_id（`source_event_id`），可回放完整生成回合 |

### 3.4 SQLite 持久层（schema 真相见 src-tauri/migrations/）

| 迁移 | 表 | 要点 |
|---|---|---|
| 0002 | `agent_events` / `agent_artifacts` | `(session_id, seq)` UNIQUE；correlation_id 关联请求/工具/审批；WAL |
| 0003 | `agent_confirmation_candidates` | params_hash 去重；status 机 pending→confirmed→consumed；expired 为派生态 |
| 0004 | `memory_candidates` / `memories` / `knowledge_docs` / `knowledge_fts` | content_hash UNIQUE 去重；`(memory_id, version)` / `(doc_id, version)` 版本化 + supersedes/superseded_at；FTS5 standalone 虚表（doc_rowid UNINDEXED join 锚点），同时充当 FTS5 runtime probe |
| 0005 | `knowledge_docs.source_event_id` | AI 交付物溯源指针（correlation_id） |

## 4. 关键设计决策

1. **append-only 事件日志是 agent 运行的唯一真相源** — 模型看到的一切必须能从持久日志重建；日志追加后不可静默覆盖，修正通过新事件表达。
2. **投影可重建** — ChatSession、上下文、检索结果均为派生投影；损坏可从事件重放。
3. **孤儿 tool_call 绝不重试** — 崩溃恢复时以追加 tool_result（interrupted）了结，杜绝重复业务写入。
4. **>4KB artifact 外置** — 大结果进 `agent_artifacts`，模型历史只留摘要与引用，压缩与窗口控制因此可行。
5. **压缩无损** — compaction 只收窄模型可见投影，原始事件永久保留（带来源摘要）。
6. **FTS5 索引与文档写入同事务** — 索引永不指向失效版本；supersede 过滤在查询 WHERE 侧完成，不删 FTS 行。
7. **HITL 消费原子性** — 条件 UPDATE（`status='confirmed' AND consumed_at IS NULL`）保证恰一消费。
8. **零 sidecar** — agent 运行时在 TS 侧（webview），LLM/keychain 在 Rust 侧，无任何常驻子进程。

## 5. 真相源索引

| 文档 | 权威范围 |
|---|---|
| [docs/AGENT_MEMORY_REFERENCE.md](./AGENT_MEMORY_REFERENCE.md) | agent 记忆/知识/事件架构的权威设计参考（分层、晋升机制、明确不采用的做法） |
| [src-tauri/migrations/](../src-tauri/migrations/) | SQLite schema 真相（forward-only） |
| [CLAUDE.md](../CLAUDE.md) | 工程约定（技术栈锁定、设计 token、store 模式） |

## 6. ADR 索引

| ADR | 主题 |
|---|---|
| [ADR-0001 架构切换](./adr/ADR-0001-architecture-switch.md) | 事件日志 + tool loop + FTS5 取代 GraphFlow/Rig/LanceDB 旧蓝图（正式出局） |
| [ADR-0002 harness MIT 归属](./adr/ADR-0002-harness-mit-attribution.md) | deepseek-harness 设计/纯函数算法复用范围与 MIT 归属 |

## 7. 已否决方向

| 方向 | 一句话理由（详见 REQUIREMENTS.md Out of Scope） |
|---|---|
| GraphFlow 工作流引擎 | pre-1.0 crate 风险 + AGENT_MEMORY_REFERENCE §9 不采用其插件树；事件日志 + tool loop 取代（ADR-0001） |
| LanceDB / 向量库作为事实源 | 向量索引只是检索加速层；P2 仅评估其派生索引能力 |
| 静默自动写记忆 | 反功能：静默记忆是最受抱怨的行为；保存前确认是 Nova 差异化 |
| 无持久检查点的动态脚本工作流 | AGENT_MEMORY_REFERENCE §9 明确不采用 |
