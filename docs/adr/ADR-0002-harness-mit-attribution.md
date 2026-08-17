# ADR-0002: deepseek-harness 设计复用的 MIT 归属

> Status: Accepted
> Date: 2026-08-17
> Phase: v0.3.0（Phase 13/14）

## Context

Phase 13/14 落地的 agent 事件日志体系，其设计参考了 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT License）的 session event log 设计。具体借鉴点：

- **事件词表**：`session_created / user_message / assistant_message / tool_call / tool_result / approval_* / context_injected / memory_candidate_* / compaction_* / turn_ended` 的事件类型划分
- **tool_call / tool_result 配对算法**：缺失与重复检测的不变量检查
- **ChatSession 投影**：`deriveMessages` 纯函数 — 「模型看到的内容必须能从持久日志重建」
- **崩溃恢复切分点**：尾切到最后完整 `turn_ended`、孤儿 tool_call 以追加 `tool_result` 方式了结（绝不重试）

上游参考副本：`D:\Projects\Nova\deepseek-harness\deepseek-harness-master`（Node.js/Cordis 实现，dev preview）。完整调研记录见 docs/AGENT_MEMORY_REFERENCE.md。

## Decision

1. **复用范围严格限定为设计思想与纯函数算法**：事件配对、投影派生、崩溃恢复切分点等与运行时无关的纯逻辑。
2. **不引入其框架/运行时**：Harness 基于 Node.js/Cordis，违反本项目零 sidecar 约束，且处于 dev preview。本仓库不包含其源码拷贝，无逐行衍生的代码文件。
3. MIT 归属以本 ADR 为正式记录：上述算法设计源自 deepseek-harness（MIT License, Copyright DeepSeek 即深圳深度求索人工智能基础技术研究有限公司，以仓库 LICENSE 文件为准）。

## Consequences

- 涉及复用算法的源文件 — `src/ai/events/invariants.ts`（配对不变量检查）、`src/ai/chatSession.ts`（投影派生）— 的设计衍生关系可追溯至本 ADR。
- 未来若引入更多 harness 概念（如 subagent 记忆、会话全文搜索），须先补新 ADR 记录范围与归属。
- docs/AGENT_MEMORY_REFERENCE.md 保持为记忆/事件架构的权威参考；本 ADR 补充其法律归属维度。
