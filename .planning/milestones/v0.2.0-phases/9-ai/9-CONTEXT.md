# Phase 9: AI 助手基础 - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

搭建 AI 驱动的 Tool Use 架构基础,让用户通过 ⌘K command palette 和 chat panel 使用自然语言执行基础操作。**本 phase 聚焦单轮或短链 tool use (1-2 步)**,不涉及复杂 multi-step pipeline。Pipeline / HITL / checkpointing 留到 v0.3+ 评估 GraphFlow 成熟度后再上。

**In scope (Phase 9):**
- Tool registry + tool loop (hand-rolled in JS)
- ⌘K command palette
- Slide-out chat panel + 现有 AgentWorkspaceView 升级
- 10-15 个基础 tools (createTask, listTasks, listProducts, createScheduleEvent 等)
- Multi-provider LLM support (DeepSeek/Claude/GPT/Gemini/Ollama via rig-core)
- 核心上下文注入 (selected product + active tasks + upcoming events)
- 通用 LLM proxy endpoint (替换 Express 旧的 5 个 AI 端点)

**Out of scope (deferred to v0.3+):**
- Complex multi-step workflows (需求→PRD→原型→代码 pipeline)
- HITL in pipelines (GraphFlow interrupt!)
- Vector search / LanceDB integration (第二大脑)
- Checkpointing / resume
- Multi-agent orchestration
</domain>

<decisions>
## Implementation Decisions

### A. Tool Use 实现位置
- **D-01:** Tool loop 在 JS (webview React app 内) 跑,不使用重型框架
- **D-02:** Hand-rolled tool registry + tool loop (~200 LOC),不依赖 LangGraph.js / Vercel AI SDK / Claude Agent SDK
- **D-03:** Tool schema 用 Zod 定义 (TS),JSON Schema 传给 Rust 的 LLM call
- **D-04:** Tool 实现 = Zustand store action 调用 (taskStore.addTask 等),直接在 webview 内执行
- **D-05:** Rust 不做 tool execution,只做 LLM passthrough + system interaction

**Rationale:** Nova 定位为商用 PM 桌面产品,需要可控性 + 最小依赖 + 快速迭代。Hand-rolled 方案符合"local-first + 轻量"产品定位,避免重型框架带来的 breaking-change 风险和依赖维护负担。

### B. GraphFlow 处理
- **D-06:** GraphFlow 继续 defer 到 v0.3+,维持 v0.1.0 Phase 4 决定
- **D-07:** Phase 9 的 tool loop 设计时预留"可被 GraphFlow 节点包装"的接口 (tool registry 是 Map,不是 framework)
- **D-08:** v0.3+ 时评估 GraphFlow 成熟度,如果仍然是 pre-1.0 则继续 hand-rolled

**Rationale:** 商用产品需要稳定依赖,pre-1.0 crate 不合适。LangGraph.js 也是同样问题 (LangChain 生态 breaking changes 多)。

### C. 上下文注入策略
- **D-09:** 采用"核心 + 按需" (Hybrid Core + On-Demand) 策略
- **D-10:** 核心上下文 (~500-1000 tokens, 每次 LLM 调用都注入):
  - Selected product (name, tagline, stage)
  - Active tasks of selected product (top 10: title, status, priority, due date)
  - Upcoming events (next 7 days, top 5: title, date, type)
  - User preferences (theme, working hours if any)
- **D-11:** 按需通过 tool 扩展:
  - `listAllTasks(filter?)` — 跨产品查任务
  - `listProducts()` — 所有产品概览
  - `getProductDetails(productId)` — 深入某个产品
  - `searchKnowledgeBase(query)` — 知识库检索 (v0.3+ 接 LanceDB)
  - `getRndDeliverables(productId)` — R&D 交付物
  - `listWorkspaceFiles()` — 文件工作区

**Rationale:** 成本控制是商业化关键。基础 500-1000 tokens vs 全量 10000+ tokens → LLM 成本降 10x。响应速度也更快。

### D. Provider 策略
- **D-12:** Multi-provider from day 1,复用 rig-core 已支持的能力
- **D-13:** 初期默认 DeepSeek V4 Flash (v0.1.0 UAT Issue #6 决策),但用户可在 Settings 切换 provider
- **D-14:** Settings UI 加 provider selector (DeepSeek / Claude / GPT / Gemini / Ollama) + API key per provider
- **D-15:** Rust 端 `llm.rs` 扩展为 provider-agnostic,rig-core 已抽象多 provider

**Rationale:** 商用产品必须支持多 provider (用户 BYOK + 成本优化)。rig-core 0.41 已原生支持,工程量小。

### E. Chat UI 形态
- **D-16:** 三种形态长期目标,Phase 9 交付前两种:
  1. **Slide-out panel (primary)** — 从任何页面右侧滑出,⌘K 或点击图标唤出
  2. **⌘K command palette** — 快速命令 (创建任务、跳转产品、新建日程等)
  3. **AgentWorkspaceView (existing)** — 升级为真 AI,作为"长对话专用"入口
- **D-17:** Slide-out panel 是主交互形式,符合业界标准 (Cursor/Claude Desktop/Notion AI/Linear 都用这个模式)
- **D-18:** ⌘K 同时触发 command palette 和 AI 对话 (类似 Raycast 模式)

**Rationale:** PM 工作流是边看任务看板边问 AI,slide-out 不中断上下文。三种形态满足不同使用场景。

### F. Express 端点未来
- **D-19:** Express 简化为 dev/web 模式 only:
  - Vite middleware (dev HMR)
  - 单一 `/api/chat` LLM proxy (web 模式 fallback,因为浏览器不能直接暴露 API key)
- **D-20:** 删除 5 个旧 AI 端点 (`/api/generate-project`, `/api/summarize-workspace`, `/api/workspace-files`, `/api/rnd/generate-deliverable`, `/api/rnd/polish-knowledge-article`)
- **D-21:** `npm run tauri:dev` 和 `npm run tauri:build` 完全不用 Express
- **D-22:** v0.3+ 决策点: 看用户反馈,如果没有 web 版需求就完全删除 Express

**Rationale:** 减少维护负担,专注桌面体验。Desktop-first 是产品策略。

### Claude's Discretion
- Tool registry 的具体文件组织 (单文件 vs 按 domain 拆分)
- Slide-out panel 的具体动画 / 样式 (遵循 tokens.css 设计系统)
- ⌘K 命令列表 (基于 ROADMAP Phase 9 success criteria 推导)
- Core context 的具体序列化格式 (compact JSON vs Markdown)
- 错误处理分层 (参数错误 AI 重试 1 次 vs 直接报错)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (needs updating to reflect Phase 9 decisions)
- `docs/ARCHITECTURE.md` — 整体架构。需要更新:
  - GraphFlow 状态 (deferred, not active)
  - LangGraph.js 评估结论 (rejected for commercial stability)
  - 增加 Tool Use 架构章节 (hand-rolled in JS)
- `docs/TECH_STACK.md` — 技术选型。需要更新:
  - 工作流引擎选择 (hand-rolled tool loop for v0.2.0, GraphFlow TBD v0.3+)
  - LLM 集成 (rig-core multi-provider)
- `docs/PIPELINE_DESIGN.md` — Pipeline 设计 (v0.3+ 参考,Phase 9 不实现)

### Planning
- `.planning/ROADMAP.md` — Phase 9 success criteria 是规划依据
- `.planning/REQUIREMENTS.md` — Phase 9 的 AI phase requirements 待细化 (当前 TBD)

### Existing Code (integration points)
- `src/lib/api.ts` — IPC adapter,需扩展 chat 调用 (现有 streamGenerateProject 是参考)
- `src-tauri/src/llm.rs` — Rust LLM 模块,需扩展为 provider-agnostic + tool schema 转发
- `src-tauri/src/commands.rs` — Tauri commands,需加 `chat` command (支持 tools parameter)
- `src/stores/` — 6 个 Zustand stores,tool 实现调用它们的 actions
- `src/views/AgentWorkspaceView.tsx` — 现有 AI view (UI 壳,需升级)

### Phase 9 Specific
- `src/components/ui/` — UI primitives,slide-out panel 基于这些构建
- `src/styles/tokens.css` — design tokens,slide-out panel 样式遵循

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **IPC adapter (`src/lib/api.ts`):** 已有 `streamGenerateProject` 模式,chat 调用复用同样的 Tauri IPC + Channel streaming
- **StreamChunk wire type:** 已定义 `token/done/error` 三种 kind,可复用 (或扩展 `tool_call` kind)
- **useApp() / Zustand stores:** 所有 tool 实现直接调用 store actions (taskStore.addTask 等)
- **UI primitives:** Button, Card, Dialog, Input 等都已就绪,slide-out panel 基于这些构建
- **Framer Motion:** slide-out 动画直接复用
- **keychain:** API key 管理已实现,provider 切换只需扩展 keychain key 命名

### Established Patterns
- **Tauri IPC 双分支:** `isTauri() ? invoke() : fetch()` 模式已建立 (api.ts)
- **Streaming UI:** Channel<StreamChunk> + onmessage 已建立 (ProjectCreateModal 是参考)
- **Error handling:** `humanizeAIError()` 已建立错误映射模式 (api.ts)
- **Store action signatures:** `addTask({ ... })`, `addProduct({ ... })` 等已定义,tool 实现直接调用

### Integration Points
- **Rust LLM 模块 (`llm.rs`):** 当前只有 `stream_generate()` for DeepSeek。需扩展:
  - Provider 抽象 (trait-based or enum dispatch)
  - Tools parameter 转发 (JSON schema 从 JS 传入)
  - Tool call 解析 (LLM 返回 tool_call 时,通过 StreamChunk 新 kind 通知前端)
- **Tauri commands:** 当前只有 `generate_project`。需加:
  - `chat` command (通用,支持 messages + tools)
  - `list_providers` / `set_provider` commands (Settings UI)
- **StreamChunk 扩展:** 可能需要新 kind `tool_call { name, args }` 让 Rust 通知前端执行 tool

</code_context>

<specifics>
## Specific Ideas

- Tool registry 设计参考 Zod schema 模式:
  ```ts
  const createTask = tool({
    name: 'createTask',
    description: 'Create a new task',
    schema: z.object({ title: z.string(), priority: z.enum(['low', 'medium', 'high']), dueDate: z.string().optional() }),
    execute: (args) => taskStore.getState().addTask(args),
  });
  ```
- ⌘K 命令与 tool 共用 registry — 命令菜单列出所有 tool,选中即触发
- Slide-out panel 宽度建议 400-480px (桌面 app 不抢占主工作区)
- Core context 序列化建议 Markdown 格式 (LLM 友好,人类 debug 时易读)

</specifics>

<deferred>
## Deferred Ideas

### 评估过但拒绝的方案
- **LangGraph.js:** 简历 buzzword 价值高,但商用产品不合适 (LangChain 生态 breaking changes 多,webview 兼容性不确定,重型依赖)。Resume 故事改为 "我做了个商用 PM 产品,手写了 tool loop,服务真实用户" 比 "用了 LangGraph" 更有价值。
- **Claude Agent SDK:** 锁定 Anthropic,与 multi-provider 策略冲突。可用来学习设计模式,但不作为依赖。
- **Vercel AI SDK:** 相对稳定,但 Next.js 假设重,要适配 Tauri IPC。对商用桌面产品来说多一层依赖,不如 hand-rolled 可控。
- **GraphFlow (v0.2.0 引入):** pre-1.0 + 单作者,商用产品风险太高。维持 v0.1.0 Phase 4 决定:defer 到 v0.3+ 评估。

### v0.3+  revisit 议题
- GraphFlow 成熟度评估 — 如果达到 1.0,考虑引入做 pipeline / HITL
- LanceDB 向量检索 — 第二大脑,searchKnowledgeBase tool 真正实现
- Complex multi-step workflows — 需求→PRD→原型→代码 pipeline
- Web 版 Nova — 如果用户有需求,重新启用 Express 作为 web 后端

### 可能的未来增强
- Tool use 可视化 (step-by-step display) — Phase 9 基础版,后续可增强
- 多 agent 协作 — v0.3+ 评估需求
- 离线模式 — 本地 LLM (Ollama) 支持,rig-core 已支持

</deferred>

---

*Phase: 9-ai*
*Context gathered: 2026-08-10*
