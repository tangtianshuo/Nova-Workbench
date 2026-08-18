# 产研中心原型/代码生成 — 方案提案(pi agent 评估结论)

> 日期: 2026-08-18
> 状态: 方向已定,实施规划推迟(后期由用户规划)
> 结论: **不引入 pi agent**;分阶段走「沙箱预览 → 工具桥工程级生成」

## 背景

产研中心的原型/代码生成目前是 mock(`rndStore.generatePrototypeAI` 为 `setTimeout` + 写死内容,见 rndStore.ts:297)。目标:生成的 React/Vue 级前端应用能**直接预览、部署、使用**。

## pi agent 评估

[badlogic/pi-mono](https://github.com/badlogic/pi-mono)(MIT,~43K stars):TypeScript monorepo,含 `pi-ai`(多 Provider 统一 LLM API)、`pi-agent-core`(agent 运行时 + 工具调用)、`pi-coding-agent`(终端 coding agent,支持 RPC 模式:stdin/stdout JSON 无头嵌入)。

### 为什么不用

1. **RPC 模式 = Node 子进程**,直接违反零 sidecar(ARCHITECTURE.md 决策 #8)
2. **作为库导入 = 与 `src/ai/toolLoop` 重复**:Nova 已有事件日志 + HITL 确认队列 + compaction 的 agent 运行时,且更贴合产品
3. **双 agent 体系**:pi 的会话不进 `agent_events`,HITL/记忆/知识库全部旁路
4. 桌面包需捆绑 Node 运行时

pi 的真实价值:作为**源码参考**学习其工具/prompt 设计,而非作为依赖引入。

## 分阶段方案

### 阶段 1: 沙箱预览(原型级,零 sidecar)

- LLM 生成**自包含单文件 React 原型**:CDN ESM 引入 react/react-dom,JSX 用 Babel standalone 浏览器内实时编译(Vue 用 runtime compiler)
- 生成物存 `agent_artifacts`;新建预览视图用 iframe srcdoc 渲染
- 复用 `generateDeliverable.ts` 两段式 HITL 模式(草稿候选 → 确认 → 版本化落卡槽)
- 导出 = 单 HTML 文件,双击可开、可分享、可丢任意静态托管
- 天花板:原型级交互,非多文件 vite 工程

### 阶段 2: 工具桥工程级(现有 toolLoop + Tauri,不引 pi)

- 给 toolLoop 新增 3 个工具:
  - `write_project` — Rust fs 命令写多文件工程(原生能力,非 sidecar)
  - `run_command` — tauri-plugin-shell(已在依赖)调用**用户机器已装的** Node 跑 install/dev
  - 输出读取工具 — 回读命令输出供 agent 迭代修错
- 事件全落 `agent_events`;`run_command` 必须走现有 HITL 确认队列卡安全
- 前提:用户装了 Node;迭代修错质量靠自家 prompt 打磨
- 效果接近 pi RPC 方案,harness 是自己的

### 已否决: pi-coding-agent RPC 子进程

需新 ADR 推翻决策 #8,仅在阶段 2 质量严重不达标时重新评估。

## 参考

- [badlogic/pi-mono](https://github.com/badlogic/pi-mono) — AI agent toolkit(MIT)
- [pi coding-agent RPC 文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [earendil-works/pi](https://github.com/earendil-works/pi) — 镜像仓库
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — 零 sidecar 决策(#8)与 TS Agent 运行时现状
