# Nova-PM-Workspace - 设计文档

> AI native 产品经理工作台的技术设计与架构文档

---

## 文档目录

| 文档 | 描述 | 状态 |
|------|------|------|
| [架构设计](./ARCHITECTURE.md) | 系统整体架构、数据流、安全设计 | ✅ 已确认 |
| [技术选型](./TECH_STACK.md) | 技术栈选择、依赖清单、扩展考虑 | ✅ 已确认 |
| [Pipeline 设计](./PIPELINE_DESIGN.md) | 工作流设计、状态定义、HITL 交互 | ✅ 已确认 |
| [决策记录](./DECISIONS.md) | ADR 格式的关键决策记录 | ✅ 已确认 |
| [Agent Memory 设计参考](./AGENT_MEMORY_REFERENCE.md) | 借鉴 DeepSeek Harness 的会话记忆、知识检索与上下文设计 | 📝 架构参考 |

---

## 核心决策摘要

### 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| **工作流引擎** | GraphFlow | Rust 原生，HITL 支持，零 sidecar |
| **LLM 集成** | Rig | 多 Provider，GraphFlow 已集成 |
| **向量检索** | LanceDB | 嵌入式，零配置 |
| **持久化** | SQLite | 本地优先，成熟稳定 |

### 架构原则

- **本地优先** — 敏感数据存储在用户本地
- **混合架构** — 本地应用 + 云端 LLM API
- **零 Sidecar** — 全 Rust 后端，资源最小化
- **人机协作** — Pipeline 关键节点人工确认 (HITL)

---

## 待确认事项

| 事项 | 状态 | 说明 |
|------|------|------|
| LanceDB 向量检索 | ⏳ 待确认 | 需要评估是否满足第二大脑需求 |
| Agent Memory Event Log | ⏳ 待设计 | 需要先完成会话事件、审批和工具结果的持久化模型 |
| Pipeline 具体 Prompt 设计 | ⏳ 待设计 | 各阶段的 LLM 提示词需要详细设计 |
| 前端 HITL 交互细节 | ⏳ 待细化 | 审批卡片的具体交互流程 |

---

## 下一步

1. **确认 LanceDB** — 评估向量检索需求，确认选型
2. **PoC 验证** — GraphFlow 集成验证，HITL 机制验证
3. **详细设计** — Pipeline 各节点的 Prompt 设计
4. **UI 设计** — HITL 交互的前端设计稿

---

## 更新日志

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-08-07 | 初始版本，完成核心架构设计 | Claude + 用户 |

---

## 相关资源

- [GraphFlow GitHub](https://github.com/a-agmon/rs-graph-llm)
- [GraphFlow Crate](https://crates.io/crates/graph-flow)
- [Rig Crate](https://crates.io/crates/rig)
- [LanceDB](https://lancedb.com/)
- [Tauri Docs](https://tauri.app/)
