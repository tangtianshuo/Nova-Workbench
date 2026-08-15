# DeepSeek Harness 带来的启示 — Nova Agent 底层设计思路

> 版本: 1.0
> 日期: 2026-08-14
> 状态: 设计随笔（架构决策记录的叙事版）

---

## 1. 缘起

在规划 v0.3.0（功能闭环 — Agent 为血肉,产品为骨架）时,我读完了 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下称 dsh）的架构文档。dsh 是 DeepSeek 开源的 agent harness,采用**一切皆插件**的架构,由 Cordis 驱动 — 模型适配器、工具注册表、会话日志、甚至 agent 循环本身,全部是可替换的插件。

读完的第一反应是兴奋:这是一个工程完成度很高的通用 agent 框架。第二反应是冷静:我的产品 Nova-PM-Workspace 是一个垂直的桌面 PM 工作台,不是通用 harness。**我需要的不是它的运行时,而是它对"agent 是什么"的回答。**

这篇文章记录两件事:dsh 给了我什么新思路,以及我如何把这些思路翻译成 Nova 自己的 agent 设计。

---

## 2. dsh 带来的四个关键思路

### 2.1 会话日志是唯一真相,不是聊天记录

dsh 最核心的设计是 **append-only 的 `SessionEvent` 日志**。模型看到的每一条消息、每一次工具调用、每一个流式 chunk,都是不可变事件流里的一条记录。UI 展示的对话、发送给 LLM 的 messages、会话回放、fork、telemetry — 全部从这一条事件流**派生**（`deriveMessages()`）。

这颠覆了一个直觉:多数 agent 产品把"消息列表"当真相,把日志当附属品。dsh 反过来 — **日志是真相,消息列表只是日志的一个投影**。一旦这样想,一整类 bug 从根上消失:UI 显示的和 LLM 看到的永远不会分叉,因为它们本来就是同一次派生的两个消费者。

### 2.2 "Model-visible means logged" — 不变量先于功能

dsh 有一条运行时断言:**任何到达模型请求的内容,必须可以从日志重建**。想给模型看一种新输入?先扩展事件类型,再从日志渲染 — 不允许在循环里偷偷塞内容。

这是"不变量先于功能"的思维方式。它意味着系统里永远存在一个可审计、可回放、可校验的基准,任何新功能都必须在这个基准之上表达自己。

### 2.3 Turn/Step 生命周期 — 给执行过程一个词表

dsh 把 agent 执行形式化为两层:**turn**（一次用户输入触发的完整往返）和 **step**（一次模型请求 + 它调用的工具）。每个生命周期节点都有明确的事件（`turn/start`、`step/start`、`tool/call`、`step/end`、`turn/end`）,并区分 **durable 事件**（写入日志,必须可重放）和 **live 事件**（只用于运行时拦截,不落盘）。

有了词表,复杂问题有了精确语言:崩溃恢复是"切到最后一个完整 turn";上下文压缩是"只发生在工具调用配对平衡处";审批拦截是"在 waterfall 事件上插入一个决策点"。

### 2.4 HITL 是策略层,不是 if 语句

dsh 里审批（approval policy）是一个可替换的能力层,挂在工具执行管道（`tools/pre-execute → tools/execute → tools/post-execute`）上,而不是散落在 agent 循环里的条件判断。要不要人审、怎么审,和执行本身解耦。

---

## 3. 我没有照搬的部分 — 以及为什么

### 3.1 不引入插件运行时

dsh 的"一切皆插件"建立在 Cordis 的 Node.js 运行时之上。Nova 的硬约束是 **Tauri v2 + 零 sidecar + 最终全 Rust**:本地优先的桌面应用,不在 Tauri 里塞常驻 Node 进程。dsh 也没有 Rust 宿主嵌入方案。

更本质的原因:**插件架构解决的问题和 Nova 的问题不同**。dsh 面向通用 harness 的生态扩展 — 第三方装插件、换 provider、换 sandbox,所以需要 profile/bundle 分层和可卸载的注册效果。Nova 是单一垂直产品,扩展点是已知的:task、schedule、knowledge、workspace 四类领域工具和若干 LLM provider。为一个已知的、大约十几个工具的规模引入插件树,是用生态复杂度换不需要的灵活性。

**判断标准:当"谁都能扩展"成为需求时,才为"谁都能扩展"付出架构成本。**

### 3.2 不押注 dev preview

dsh 处于开发者预览阶段,官方明示将有破坏兼容性变更。核心底座押上去,等于把自己的发布节奏绑在别人的预览期迭代上。

### 3.3 结论:抄设计,不抄框架

dsh 于 Nova 的价值,是一份**经过工程验证的参考设计**。吸收它的概念和不变量,用自己的技术栈（SQLite + Rust + TS 前端）重新表达。

---

## 4. Nova 的 Agent 设计 — 把思路翻译成自己的栈

### 4.1 总体判断:殊途同归

读 dsh 之前,Nova 的 v0.3.0 roadmap 已经独立收敛到相近的架构。这不是巧合 — 当你认真思考"一个可恢复、可追责、有记忆的桌面 agent 应该长什么样",事件日志是这个问题的自然解。dsh 的存在验证了方向,并提供了细节层面的词表和不变量参考。

### 4.2 架构映射

| dsh 概念 | Nova 的实现（v0.3.0 Phase 13/14） |
|---|---|
| append-only `SessionEvent` log | SQLite `agent_events` 表,唯一真相源 |
| `deriveMessages()` 投影 | ChatSession 重构为投影层,消灭 UI/LLM 双历史 |
| "model-visible means logged" 不变量 | invariant checker:事件流缺失 tool_result 时报错而非静默 |
| turn/step 生命周期 | 事件词表:会话内连续 seq + correlation_id 配对 |
| 配对平衡处压缩 | CMP-01/02:超长历史只在工具调用配对边界摘要 |
| 审批策略层 | `ConfirmationRequiredError` → 确认队列 → 原子消费 |
| 超大工具结果 | artifacts 表存全文,模型历史只留摘要 + 引用 ID |

### 4.3 与 dsh 的三个刻意差异

**1. 桌面单用户,不做会话 fork 生态。** dsh 的 fork/resume/transcript 服务多会话管理;Nova 的场景是单用户单机,SQLite WAL 就够。保留 resume（Phase 14:重启后待确认项仍在队列、孤儿 tool_call 绝不重复执行）,不做 fork。

**2. 记忆和检索是一等公民,不是插件。** dsh 的记忆靠插件生态补齐;Nova 的第二大脑（Phase 15:FTS5 混合检索 + 版本化知识文档 + 按优先级投影组装上下文）是产品核心价值,直接建在架构里。中文可命中（CJK 分词决策）是我们的问题,不是插件市场的问题。

**3. 领域工具直接注册,不走 seam 三件套。** dsh 加一个能力要设计 Service Definition / Provider / Consumer 三个角色;Nova 的 `ai/tools/` 注册表（zod schema + 执行器 + 系统 prompt 组装）一步到位。规模小的时候,直接注册比 seam 更可调试。

### 4.4 设计原则沉淀

从这次对照中,我给 Nova 的 agent 设计定了四条原则:

1. **日志先于一切** — 任何模型可见的东西必须先成为事件。新功能的第一个问题是"它在事件流里长什么样"。
2. **投影不存状态** — UI、LLM 历史、token 统计都是 `agent_events` 的派生视图,派生结果可以随时丢弃重建。
3. **不变量可执行** — "配对必须平衡""孤儿 tool_call 不重复执行"写成 checker,不是写进文档。
4. **架构服务于场景** — Nova 的收口场景是"工作区先行的产品入驻"（见 backlog 999.1）:用户带着一堆 PRD 文档进来,AI 摄取、分类、抽取任务日程、批量确认。每一层架构投资（事件日志、FTS5、记忆）都必须能在这个场景里指出它的位置。指不出来的,先不做。

---

## 5. 结语

dsh 这样的开源框架对独立产品开发者的最大价值,不是"拿来用",而是**免费获得一次深度架构评审**:别人已经在你打算走的路上踩过坑、定过词表、立过不变量。正确的姿势是站在它的文档上校准自己的设计,然后用自己的栈把它重新表达一遍 — 这比引入它的运行时便宜一个数量级,也比闭门造车稳一个数量级。

> 参考:[DeepSeek Harness 架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md) · [Nova v0.3.0 ROADMAP](../.planning/ROADMAP.md) · [Agent Memory Reference](./AGENT_MEMORY_REFERENCE.md)
