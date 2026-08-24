# ADR-0004: 多 Agent 形态 = subagent-as-tool(否定固定角色编排)

> Status: Proposed(决策即刻生效;实施随 v0.4,骑 ADR-0003 引擎)
> Date: 2026-08-24
> Builds on: ADR-0003(调度器扩展位、事件日志检查点)、ADR-0001(拓扑由 LLM 运行时决定的判断规则)

## Context

用户设想「入口 NLP agent + PRD agent + 原型 agent」式多 Agent 架构,动机三项(2026-08-24 确认):

1. **自动流水线**——一句话进,PRD→原型自动衔接
2. **上下文管理**——单会话干太多事导致历史膨胀、注意力涣散
3. **架构预埋**——对齐业界多 agent 演进方向

流水线中间人的角色:**可配置**——默认每阶段带确认门,用户可对单次运行说「这次全自动」。

业界两条路线:固定角色编排(CrewAI / LangGraph 风格:router agent 分派 + 专家 agent 各司其职)vs subagent-as-tool(Claude Code / oh-my-pi 风格:主 agent 按需 spawn 子 agent 当工具用)。

## Decision

**采用 subagent-as-tool;不做固定角色编排。**

### 1. 主 agent 即入口,无独立 router agent

理解意图、拆解任务是主 agent 的本职,不设独立「NLP 入口 agent」。Router 形态存在两次信息蒸馏(意图序列化转发给专家、专家结果再汇总回来),有损且多一层维护面;单作者项目三份 system prompt、三条调试路径不可承受。

### 2. 「专家 agent」= 子 agent 规格(数据,非代码)

```ts
{
  name: 'prd-writer',
  description: '撰写完整 PRD 文档',   // 给主 agent 看,它据此决定何时派活
  systemPrompt: '...',
  toolWhitelist: ['generateDeliverable', 'knowledgeSearch', ...],
}
```

首批两个:`prd-writer`(现有 14 工具白名单即可)、`prototype-builder`(依赖 5 个 coding 工具 + diff 审批,踩 coding agent 路线)。加新专家 = 加 manifest,零架构改动;v0.4 Skill manifest 复用此形状,不另起炉灶。

### 3. spawn_subagent 工具语义

- 主 agent 调用 `spawn_subagent(spec, task)` → 调度器建**子 run**(`parent_run_id`,同一张 `agent_events`,真相源不分裂)→ 父 loop 像等普通工具一样 await
- 子 run 结束,**结果摘要**(非全量历史)作为 tool_result 回父——上下文隔离核心:原型编写的几百条中间事件永不进父会话
- 失败 = 带错误的 tool_result,主 agent 自行决定重试/换路/问人,与普通工具失败零区别,无新增错误机制
- 取消传播:父 run 取消 → 子 run 级联取消
- 子 run 内触发 HITL → 卡片挂现有确认队列,父工具调用挂起等人,两阶段 confirm 语义直接复用

### 4. 流水线与可配置门

编排 run = 依次 spawn 阶段子 run,阶段产物落 `agent_artifacts`,断点续跑走事件日志检查点(ADR-0001 既定路径)。「默认带门、这次全自动」**不做配置系统**:门 = 确认队列卡片,会话级「跳过后续确认」开关。策略不上升为架构。

### 5. 为什么否定固定角色编排

1. Router 有损(见 §1)
2. 与 ADR-0001 判断规则相克:LLM 运行时定拓扑 → 自写调度器;固定角色图是人预定义拓扑,而 PM Pipeline(DELIV-06)按 ADR-0001 走事件日志检查点,不需要 agent 编排
3. 「PRD→原型自动衔接」的核心诉求是编排层,角色 agent 只是把它包了一层,不多解决任何问题

## Consequences

- **v0.3.2 不写任何子 agent 代码**,仅两个预留点:
  1. Phase 22 事件 schema 定稿时,确认事件行可表达 `run_id + parent_run_id`(correlation_id 已有,确认语义够用即可)
  2. Phase 24 调度器的 run 注册表含父子关系 + cancel 传播——本就是多 run 并行的自然组成部分
- **v0.4 落地物**:`spawn_subagent` 工具 + 两个子 agent 规格 + 会话级跳过确认开关,全部骑 Rust 引擎;TS 侧不加调度层(ADR-0003 既定)
- **验收**:子 run 事件全部进 `agent_events`,v0.3.2 replay parity 框架天然覆盖父子回放,不加新验收机制
- **多 agent 数量上限**:主 agent 直接 spawn 子 agent,子 agent 不再递归 spawn(深度 1)——防调度失控,需要更深时再议
