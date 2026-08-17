# ADR-0001: 架构切换 — 事件日志 + tool loop + FTS5 取代 GraphFlow/Rig/LanceDB 蓝图

> Status: Accepted
> Date: 2026-08-17
> Phase: v0.3.0（Phase 13-17）

## Context

v0.2.0 时期的架构蓝图（docs/ARCHITECTURE.md v1.0，2026-08-07）规划了三个核心组件：

- **GraphFlow**（Rust 工作流引擎）— 承载「需求→PRD→原型→代码→测试」多节点 Pipeline，节点间 `interrupt!` 实现 HITL
- **Rig**（Rust LLM 框架）— 多 Provider LLM 调用层
- **LanceDB**（嵌入式向量库）— 「第二大脑」语义检索

v0.3.0 的实际演进走了另一条路。2026-08-14 的调研（docs/AGENT_MEMORY_REFERENCE.md）与 Phase 13-16 的落地结果：

1. **pre-1.0 crate 风险**：GraphFlow/Rig 均为 pre-1.0、单作者维护、无生产级 Tauri 嵌入参考；v0.1.0 Phase 4 PoC 时已因此推迟引入，v0.3.0 复评结论不变。
2. **AGENT_MEMORY_REFERENCE §9 明确不采用**其插件树形态 — Harness 的价值在「可恢复、可审计、可回放的运行时设计」，不在框架本身。
3. **事件日志已在 Phase 13-16 全部落地并被验证**：append-only `agent_events` 表（迁移 0002）、tool_call/tool_result 配对不变量、ChatSession 投影重建、崩溃恢复（尾切 + 孤儿 tool_call 标记）、上下文压缩、HITL 确认持久化（迁移 0003）、长期记忆 + 知识文档 + FTS5 检索（迁移 0004）、PRD 生产线溯源（迁移 0005）。80+ 测试全绿，含永久 replay parity 测试。
4. PM 数据天然带产品/项目/类型/时间结构，**结构过滤收益先于向量检索**；FTS5 已满足 P1 检索场景。
5. LLM 调用层在 v0.2.0 已由自研 Rust `llm.rs`（provider-agnostic）承担并经 Ollama 生产 tool-call UAT 验证，Rig 无增量价值。

## Decision

**GraphFlow、Rig、LanceDB 正式出局。** v0.3.0 起现行架构为：

- **事件日志**（`agent_events`，append-only）— agent 运行的唯一真相源
- **tool loop**（`src/ai/toolLoop.ts`，单历史、事件驱动）— 执行层
- **SQLite FTS5**（`knowledge_fts`）— 检索层
- **HITL 确认队列**（`agent_confirmation_candidates` + `memory_candidates`，原子条件 UPDATE 消费）— 关键节点人审
- **Tauri 壳**（Rust `llm.rs` + keychain）+ React 19 + zustand 前端 — 承载层
- **SQLite 为唯一持久层**；零 sidecar 约束保持不变

完整叙事见 docs/ARCHITECTURE.md v2.0。

## Consequences

- **文档与里程碑**：docs/ARCHITECTURE.md 已全文重写为 v2.0；后续里程碑、plan、VERIFICATION 不得再引用 GraphFlow/Rig/LanceDB 蓝图作为现行或目标架构。
- **向量检索**（SEM-01/02）仅作**派生索引**评估，永不做事实源；SQLite 原文 + 版本 + 来源始终是知识资产的真相。
- **Rust 原生后端**目标降级为远期可选方向；当前 Rust 侧职责收缩为壳层（llm.rs / keychain / SQL 迁移），agent 运行时驻留 TS 侧（`src/ai/`）。
- 多步全自动 Pipeline（DELIV-06）在无工作流引擎的前提下，依赖事件日志检查点语义评估，而非预设引擎选型。
- 旧蓝图文档（TECH_STACK.md / PIPELINE_DESIGN.md / DECISIONS.md 中相关章节）如被引用，以本 ADR 与 ARCHITECTURE.md v2.0 为准。
