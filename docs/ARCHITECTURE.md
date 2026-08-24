# Nova-PM-Workspace — 架构文档

> 版本: 3.0
> 日期: 2026-08-24
> 状态: 现行架构真相源（v1.0 蓝图已废止见 ADR-0001；agent 核心迁 Rust 引擎见 ADR-0003 Accepted）

---

## 1. 产品定位

**Nova** 是一个 **AI native 的产品经理桌面工作台**（Tauri v2 + React 19）：让 PM 拥有一个懂你、能替你干活的桌面 AI Agent —— 不是 chatbot，而是能生成交付物、有可管理的长期记忆与知识库、关键节点 HITL 确认的一等执行者。约束：**零 sidecar**（不引入 Node.js 子进程做 LLM/工作流）、**本地优先**（SQLite 唯一持久层，敏感数据不出本地）、**混合架构**（本地存储 + 云端/本地 LLM API）。

## 2. 架构总览

现行架构一句话（v0.3.2 起，ADR-0003 Accepted）：**Rust 常驻 run engine（执行）+ 事件日志（真相源）+ FTS5（检索）+ HITL 确认队列（人审）+ webview 投影/HITL UI**。

```
┌─────────────────────────── Rust 进程（常驻，src-tauri/）──────────────┐
│  Run Engine（src-tauri/src/engine/，v0.3.2 全量落地）                 │
│    scheduler 多 run 并行 → loop_runner agent 循环                      │
│    → event_log 事件追加 agent_events（append-only，唯一写者）          │
│    → chat_session 投影 / compaction / context_assembler               │
│    tools（exec / fs_ops / knowledge 检索）+ confirmations（HITL）      │
│  入口：engine_* commands（Channel 流式）；托盘常驻（tray.rs）          │
│  llm.rs 多 Provider / keychain.rs / notify.rs                         │
├──────────────── Channel/emit（token 流、事件、待确认推送）────────────┤
│  webview：投影 + HITL UI（React 19 + zustand）                        │
│  ChatSession TS 投影（fromEvents）/ ChatPanel / ⌘K / 确认卡片         │
│  TS 工具注册表（executeTool）：webview 用户动作 + 确认后重放           │
├──────────────────────────────────────────────────────────────────────┤
│  SQLite 持久层（src-tauri/migrations/，rusqlite 直写，WAL）            │
│  agent_events / agent_artifacts / agent_confirmation_candidates       │
│  memory_candidates / memories / knowledge_docs / knowledge_fts (FTS5) │
└──────────────────────────────────────────────────────────────────────┘
```

**核心数据流**：用户消息经 `engine_run` command 进入 Rust 引擎 → scheduler 排程、loop_runner 逐迭代执行 → 每一步（user/assistant 消息、tool_call、tool_result、审批、压缩）作为事件由 Rust 唯一写者追加到 `agent_events` → webview 经 `ChatSession.fromEvents` 投影渲染，engine 事件经 Channel 流式推送 → 需要人审的动作先创建确认候选，经用户在 webview 确认后原子消费再执行。重启后 engine/restore 从事件日志恢复会话；长会话由 Rust compaction 收窄模型可见投影（原始事件不动）。agent 语义由双侧 replay parity 测试锁定（fixture 单源 `src/ai/__tests__/fixtures/`）。

## 3. 分层结构

### 3.1 Rust 进程（src-tauri/src/）

**Run Engine（`engine/`，v0.3.2 全量落地，模块清单以 `engine/mod.rs` 为准）：**

| 模块 | 职责 |
|---|---|
| `scheduler.rs` | 多 run 并行调度：run 注册表、并发上限、状态机（running/等确认/done/cancelled）、cancel 传播 |
| `loop_runner.rs` | agent 执行循环（TS toolLoop 语义移植）：每迭代从 chat_session 投影派生 messages，单历史 |
| `tools.rs` | Rust 原生工具注册表：exec / fs_ops / knowledge 检索 / 候选类工具；idempotency 分类随 tool_call 落盘 |
| `exec.rs` | shell 命令执行：进程组、超时、流式输出、取消（借模式 oh-my-pi，不引依赖） |
| `fs_ops.rs` | 文件系统写操作（write/mkdir/delete/move），破坏性操作走 HITL 候选 |
| `event_log.rs` | 事件日志唯一写者：append-only 追加 `agent_events`，seq 连续 + correlation_id |
| `confirmations.rs` | HITL 确认候选持久化与原子条件 UPDATE 消费 |
| `chat_session.rs` / `compaction.rs` / `context_assembler.rs` / `fork.rs` / `restore.rs` | 投影、压缩、五段优先级上下文、fork、崩溃恢复（TS 语义逐项移植，parity fixture 锁定） |
| `channel.rs` | EngineEvent 流式通道（token、事件、待确认推送 → webview） |
| `commands.rs` | `engine_*` Tauri command 入口层 |
| `db.rs` / `params_hash.rs` / `fts_tokens.rs` / `token_estimate.rs` / `parity.rs` | rusqlite 连接与 SQL、参数哈希、FTS 切分、token 估算、replay parity 回放 |

**壳层：**

- `llm.rs` — provider-agnostic LLM 调用（Ollama 生产 tool-call UAT 已通过；云 Provider 走 keychain API key）
- `keychain.rs` — API key 安全存储（不进客户端 bundle）
- `tray.rs` / `notify.rs` — 托盘常驻（hide-on-close）与系统通知（后台 run 完成/待确认）
- `state.rs` / `error.rs` / `commands.rs`（壳层）— Tauri 状态与 IPC
- `migrations/` — SQLite schema 前向迁移（forward-only，永不 DROP）

### 3.2 前端（React 19 + zustand）

- 6 个 Zustand store（task/product/rnd/schedule/workspace/ui）承载业务事实，经 tauri-plugin-sql 持久化
- `src/store/AppContext.tsx` 兼容层仍在（30 处 useApp 调用者），随 view 迁移逐步移除
- ChatPanel（Drawer）+ ⌘K 唤起 + HITL 确认卡片是 agent 对用户的统一交互面

### 3.3 webview 侧 TS 模块（src/ai/，投影 + HITL + 工具接缝）

TS agent 运行时已在 Phase 25 删除（toolLoop / compaction / contextAssembler 源码不存在）；现存模块全部是活路径：

| 模块 | 职责 |
|---|---|
| `events/`（eventStore / invariants / artifacts / types） | 事件存储 TS 侧读写；tool_call/tool_result 配对不变量检查；>4KB tool 结果外置为 artifact |
| `chatSession.ts` | ChatSession = 事件日志投影（`fromEvents` / `getMessagesForLLM()`），渲染与 parity 回放的 TS 侧锚点 |
| `sessionRestore.ts` / `sessionRepo.ts` / `fork.ts` | 崩溃恢复尾切、session 元数据仓库、fork 事件流构造（孤儿 tool_result 第三态与 Rust 双侧 parity） |
| `confirmationStore.ts` + `paramsHash.ts` | HITL 确认候选 TS 侧持久化与原子消费 |
| `memoryStore.ts` | 长期记忆：候选队列（hash 去重、cap、TTL）、确认晋升、supersedes 版本链 |
| `knowledgeRepo.ts` + `ftsTokens.ts` | 知识文档版本化读写；FTS5 索引与文档写入同事务；索引/查询同源切分（quoted-token MATCH 免注入） |
| `tools/` + `registry.ts`（executeTool） | TS 工具注册表：服务 webview 发起的用户动作（知识读写、⌘K、工作区摘要）与 HITL 确认后重放；PM CRUD 原生化留 v0.3.3 |
| `tools/generateDeliverable.ts` | 两段式：先出候选（草稿），HITL 确认编辑后版本化落研发中心交付物卡槽（`source_event_id` 溯源） |
| `__tests__/fixtures/` + `parity.rust.test.ts` | replay parity 双侧单源 fixture（Rust cargo 侧逐位回放同一批 JSON） |

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
8. **零 sidecar** — agent 运行时是 Rust 常驻 run engine（ADR-0003 Accepted），webview 仅投影 + HITL UI；无任何常驻子进程。
9. **双写者规则**（ADR-0003）— Rust 引擎唯一写 `agent_*` 表；业务表（产品/任务/日程）TS 写、Rust 只读；同表双写绝对禁止。PM CRUD Rust 原生化留 v0.3.3。

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
| [ADR-0003 Rust run engine](./adr/ADR-0003-rust-run-engine.md) | agent 核心迁 Rust 常驻引擎，webview 退化为投影 + HITL UI（Accepted 2026-08-24） |

## 7. 已否决方向

| 方向 | 一句话理由（详见 REQUIREMENTS.md Out of Scope） |
|---|---|
| GraphFlow 工作流引擎 | pre-1.0 crate 风险 + AGENT_MEMORY_REFERENCE §9 不采用其插件树；事件日志 + tool loop 取代（ADR-0001） |
| LanceDB / 向量库作为事实源 | 向量索引只是检索加速层；P2 仅评估其派生索引能力 |
| 静默自动写记忆 | 反功能：静默记忆是最受抱怨的行为；保存前确认是 Nova 差异化 |
| 无持久检查点的动态脚本工作流 | AGENT_MEMORY_REFERENCE §9 明确不采用 |
