# Agent Memory 设计参考

> 版本: 1.0  
> 日期: 2026-08-14  
> 状态: 架构参考，待纳入后续 milestone

本文记录对 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中会话日志、查询投影、上下文压缩和工作区边界的借鉴结论，并将其适配为 Nova-PM-Workspace 的记忆设计原则。

## 1. 结论

Nova 不应把“记忆”实现成单一向量数据库。推荐采用：

```text
业务事实 + Agent 事件记忆 + 语义知识 + 用户/项目偏好 + 工作上下文投影
```

DeepSeek Harness 值得借鉴的是可恢复、可审计、可回放的运行时设计，不是把整个插件框架作为 PM Workspace 的依赖引入。

## 2. 记忆分层

| 层 | 内容 | 写入规则 | 首选存储 |
|---|---|---|---|
| 业务事实 | 产品、任务、日程、需求、交付物 | 通过领域工具写入，自动记录事件 | SQLite / 领域 Store |
| Episodic Memory | 用户输入、模型输出、工具调用、审批和结果 | 追加，不覆盖 | SQLite Agent Event Log |
| Semantic Knowledge | PRD、会议纪要、竞品分析、规范、经验文章 | 先生成候选，确认后保存 | SQLite 原文 + FTS/向量索引 |
| User/Project Memory | 用户偏好、产品约束、项目决策 | 明确表达或确认后保存 | SQLite 独立表 |
| Working Context | 当前产品、任务、待审批动作、最近对话 | 动态计算，可从事件恢复 | 内存 + 恢复快照 |

必须区分：任务状态是业务事实；知识文章是可管理资产；聊天记录是事件记忆；向量索引只是检索加速层，不是真实数据源。

## 3. Agent Event Log

Harness 的核心原则是：**模型看到的内容，必须能从持久日志重建。** Nova 应将当前内存中的 `ChatSession` 逐步改造成事件日志的投影，而不是继续作为唯一会话来源。

建议的事件类型：

```text
session_created
user_message
assistant_message
tool_call
tool_result
approval_requested
approval_decided
context_injected
memory_candidate_created
memory_candidate_confirmed
memory_candidate_rejected
compaction_started
compaction_completed
turn_ended
```

每条事件至少包含：

```text
event_id, session_id, seq, event_type, created_at,
workspace_id, product_id, project_id, correlation_id, payload_json
```

设计要求：

- `seq` 在单个会话内连续，支持精确回放。
- `correlation_id` 关联模型请求、工具调用、审批和结果。
- 工具调用与工具结果必须成对，缺失或重复都应被检测。
- 日志追加后不可通过 UI 静默覆盖；修正通过新事件表达。
- 业务 Store 的变更与 Agent 事件应保留关联 ID，便于回答“谁在什么时候改了什么”。

这为重启恢复、失败重试、操作审计、Pipeline 检查点和后续 Session 搜索提供统一基础。

## 4. 长期记忆晋升机制

模型不应因为一次推断就永久修改用户记忆。推荐流程：

```text
对话 / 工具结果
    -> 识别潜在记忆
    -> Memory Candidate
    -> 去重、冲突检查、来源绑定
    -> 用户确认
    -> 写入长期记忆
```

候选至少包含：

```text
candidate_id
kind                 # user_preference | project_decision | knowledge_fact
scope                # user | workspace | product | project
content
source_session_id
source_event_id
confidence
status               # pending | confirmed | rejected | superseded
created_at
expires_at           # 可选
```

写入策略：

1. 用户明确说“记住这个”时，可以创建确认候选。
2. 模型从上下文推断出的偏好，只能创建候选，不能直接落库。
3. 任务、产品等业务事实由领域工具写入，不要复制一份“记忆文本”作为第二个真相源。
4. 每个长期记忆都必须保留来源和版本；新事实应通过 `supersedes` 取代旧事实，而不是覆盖历史。

## 5. 知识库与索引

知识库应采用“原文 + 派生索引”结构：

```text
knowledge_documents
- id, workspace_id, product_id
- title, content, document_type
- status, version, source_type, source_ref
- created_at, updated_at

knowledge_chunks
- id, document_id, version, chunk_index
- content, token_count, content_hash

knowledge_index
- chunk_id, lexical_index, embedding
```

推荐演进顺序：

```text
SQLite + FTS5
    -> 关键词 + 标签 + 产品/项目/时间过滤
    -> 本地 embedding 的混合检索
    -> 再评估 LanceDB 或 SQLite-vec
```

理由：PM Workspace 的数据天然有产品、项目、文档类型和时间范围，结构过滤的收益通常先于向量检索。SQLite 保存原文、版本、来源和状态；LanceDB 只能保存可重建的派生索引。

检索结果必须带来源：

```text
source_type, source_id, source_version,
scope, confidence, updated_at, content
```

模型不应只收到一段无法追溯出处的文本。

## 6. 上下文投影与压缩

完整事件日志和模型当前可见上下文应分离。一次请求的上下文建议按以下优先级组装：

1. 当前请求相关的业务事实。
2. 当前会话未完成的工具调用、审批和错误。
3. 当前产品已确认的约束和决策。
4. 高相关知识检索结果。
5. 最近若干轮对话。
6. 更早会话的带来源摘要。

压缩只改变模型可见投影，不删除原始事件。长工具结果应保存为 artifact，模型历史只保留摘要、引用 ID 和必要片段。摘要必须记录覆盖的事件范围、生成时间和使用的模型。

## 7. 与现有实现的对应关系

| 现有模块 | 现状 | 目标方向 |
|---|---|---|
| `src/ai/chatSession.ts` | 内存会话、按轮次和 token 裁剪 | 改为 Event Log 的 Working Context 投影 |
| `src/ai/toolLoop.ts` | 前端循环，主要通过 callback 展示 trace | 每一步写入持久事件，并支持恢复 |
| `src/ai/registry.ts` | 单例 `Map`，直接校验并执行工具 | 增加统一的授权、审批、执行、审计管线 |
| `src/ai/confirmations.ts` | 确认候选保存在内存 `Map` | 持久化候选、过期、参数哈希和幂等消费 |
| `src/ai/tools/knowledge*` | 已有知识读写和候选确认能力 | 补充版本、来源、索引和冲突处理 |
| SQLite 持久化 | 主要保存业务 Store | 增加 Agent Event Log 和 Memory Store |

## 8. 分阶段落地

### P0：可恢复执行底座

- 设计 SQLite Agent Event Log。
- 持久化 `user/assistant/tool/approval/result` 事件。
- 建立工具调用与结果配对不变量。
- 让 ChatSession 能从事件重建。
- 把确认候选从内存迁移到持久化存储。

### P1：可管理的长期记忆

- 增加 Memory Candidate、确认、拒绝、过期和 supersede。
- 为知识文档增加版本和来源引用。
- 使用 SQLite FTS5 完成第一版混合检索。
- 增加按 workspace/product/project 的记忆范围过滤。

### P2：语义增强

- 增加本地 embedding。
- 评估 LanceDB 或 SQLite-vec 的增量索引能力。
- 增加自动 compaction、artifact 引用和会话全文搜索。
- 在满足真实检索场景后，再考虑 subagent 和动态工作流记忆。

## 9. 明确不采用的做法

- 不把所有聊天内容自动写入长期记忆。
- 不让向量库成为事实源。
- 不把任务、产品状态复制成另一套自由文本记忆。
- 不在当前阶段直接引入 DeepSeek Harness 的完整插件树。
- 不采用没有持久检查点的动态脚本工作流作为 PM Pipeline 的恢复机制。

## 10. 验收标准

记忆设计进入实现阶段前，至少应能通过以下验证：

- 应用重启后，可以恢复最近会话、未完成审批和工具调用关系。
- 任一模型上下文片段都能定位到来源事件或来源文档版本。
- 用户拒绝的记忆候选不会进入长期检索结果。
- 同一工具请求重复恢复时不会造成重复业务写入。
- 文档更新后，旧版本仍可审计，检索不会返回失效索引。
- 删除 workspace 或产品时，相关记忆、索引和事件的保留策略是明确且可测试的。

## 参考资料

- [DeepSeek Harness README](https://github.com/deepseek-ai/deepseek-harness)
- [Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md)
- [Harness 会话模型](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.zh.md)
- [Harness 会话查询](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session-query.zh.md)
- [Harness 上下文压缩](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/compaction.zh.md)
- [Nova 架构设计](./ARCHITECTURE.md)
- [Nova Pipeline 设计](./PIPELINE_DESIGN.md)
