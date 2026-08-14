# Nova-PM-Workspace

## What This Is

Nova 是一个 **AI native 的产品经理桌面工作台**,基于 Tauri v2 + React 19。v0.1.0 交付了完整 PM 视图框架 + 设计系统 + Rust 原生基础(SQLite 持久化、IPC、keychain);v0.2.0 在此之上交付了任务/日程全生命周期 CRUD、跨模块弱关联联动、Markdown WYSIWYG 编辑、以及 AI 助手全链路(⌘K + ChatPanel + 任务/日程/文件/知识库 tools + HITL 确认流)。下一步目标是按 `docs/ARCHITECTURE.md` 蓝图继续向 Rust 原生 Agent 后端演进(GraphFlow + LanceDB)。

## Core Value

让产品经理拥有一个**懂你、能替你干活**的桌面 AI Agent —— 不是 chatbot,而是能跑 Pipeline(需求→PRD→原型→代码→测试)、有第二大脑、关键节点 HITL 的真 Agent。

## Current State (after v0.2.0)

**Shipped 2026-08-14** — 8 phases, 34 plans, 82 commits。审计 passed(24/24 REQ、12/12 集成边界、5/5 E2E flows、0 critical/high 安全项)。

- 任务管理:TaskDialog 双模式 + TaskKanban(inline 编辑/DotsMenu/@dnd-kit 拖拽)+ 弱关联字段 + persist v2
- 日程管理:ScheduleView 真实月历(42 格动态网格/月份切换)+ ScheduleDialog + date string 迁移
- 跨模块联动:"安排到日历"、双向关联徽章/跳转、产品删除级联清理、产品-研发联动(L5/L6/L7)
- MDXEditor:Markdown WYSIWYG 替换全部 Textarea(chunk ~297 KB gzip)
- AI 助手:Rust llm.rs(多 provider)+ Tool registry(Zod)+ ⌘K + ChatPanel + 任务/日程/文件/知识库 tools + 取消/确认 HITL;Ollama 生产 tool-call UAT 通过
- Gap Closure:INT-01 修复、5 个 VERIFICATION backfill、Express 3 MEDIUM 加固

**Next Milestone Goals:** 待定 — 运行 `/gsd:new-milestone` 规划(v0.3 候选:GraphFlow + Rig PoC、LanceDB 第二大脑、PM Pipeline;见 Out of Scope)

## Requirements

### Validated

<!-- v0.1.0 已交付并验证 -->

- ✓ 桌面外壳:Tauri v2 frameless 窗口 + 自定义 TitleBar + 跨平台窗口控制 — Phase 1-2
- ✓ 设计系统:20 个 Radix-based UI 原语 + tokens.css 设计令牌 + Phosphor 图标 — Phase 3-5
- ✓ 11 个顶层视图 + 16 个 Product/R&D 子组件,全部接入设计系统 — Phase 6
- ✓ 6 个 Zustand stores(task/product/rnd/schedule/workspace/ui)+ AppContext 兼容层 — Phase 4
- ✓ 7 个主标签页导航(Sidebar + activeTab switch,无 router 库)
- ✓ Gemini AI 集成(5 个 Express 端点,无 key 时回退到模板)
- ✓ 路由懒加载 + Framer Motion 页面切换动画
- ✓ 暗色模式上线 — 三态切换(SettingsView SegmentedControl + Header Sun/Moon cycle)、Linux GTK 检测垫片、200ms 颜色过渡、47 组件暗色调色板审计 — **Phase 1 (2026-08-08)**
- ✓ SQLite 持久化 — `tauri-plugin-sql` + Zustand `persist` 适配器,6 store 全量持久化,刷新/重启数据完整恢复 — **Phase 2 (2026-08-08)**
- ✓ Tauri IPC + AI 迁移 — Channel 流式输出、keychain API key、CSP、capabilities、rig-core 替代 @google/genai — **Phase 3 (2026-08-08)**
- ✓ 任务管理 CRUD 补全 — TASK-01..09 全部满足 — **v0.2.0**
- ✓ 日程管理 CRUD + 真实日历 — SCHED-01..08 全部满足 — **v0.2.0**
- ✓ 跨模块联动 + 弱关联 — CROSS-01..07 全部满足 — **v0.2.0**
- ✓ MDXEditor Markdown WYSIWYG 编辑 — **v0.2.0**
- ✓ AI 助手全链路(⌘K + ChatPanel + 多 provider + tools + HITL) — **v0.2.0**

### Active

<!-- v0.3 候选 — 待 /gsd:new-milestone 确认 -->

- [ ] GraphFlow + Rig PoC(v0.1.0 Phase 4 deferred,见 Key Decisions)
- [ ] Phase 7 的 35 步人工回归(发布签核建议,来自 v0.2.0 audit tech debt)

**v0.2.0 遗留 tech debt:**
- 云 provider (Anthropic/OpenAI) 真实凭据 UAT(Ollama + mock 已通过)
- taskStore/scheduleStore v1→v2 迁移实测(无真实 v1 数据,函数有单测)
- MarkdownEditor chunk ~297 KB gzip(超 250 KB 目标,non-blocking)

### Out of Scope

<!-- 显式边界 — 防止重新加回 -->

- **第二大脑(LanceDB 向量检索)** — v0.2.0 聚焦 CRUD + 弱关联,向量检索留到 v0.3+(依赖 v0.1.0 Phase 4 PoC 结果)
- **完整 PM Pipeline(需求→PRD→原型→代码→测试 全自动)** — 同上,依赖 PoC 验证
- **GraphFlow + Rig PoC** — 原 v0.1.0 Phase 4,decided deferred 到 v0.3+(pre-1.0 crate,单作者,无生产 Tauri 嵌入参考;先跑通 CRUD 再评估)
- **多人协作 / 云同步** — 设计原则"本地优先",SQLite 单机足够
- **URL 路由** — 当前 activeTab state 够用
- **AppContext 全量移除** — 跟随各 view 迁移逐步消除
- **强关联 / 级联删除** — 弱关联优先,外键全部可选,删除不级联
- **周报/日报自动汇总** — v0.3+,等 CRUD 跑通再考虑
- **多产品并行 Pipeline** — 受 v0.1.0 Phase 4 PoC 结果影响

## Context

**当前架构**(2026-08-14,v0.2.0 shipped):
- 前端:React 19 + Vite 6 + Tailwind v4(`@theme` 桥接 tokens)+ Zustand 5 + motion 12
- 后端:Rust llm.rs(provider-agnostic,多 provider + keychain)+ Tool registry(Zod);Express 仅存 1 个 endpoint(dev fallback / web proxy 边界)
- 桌面:Tauri v2 frameless,chat Tauri command + Channel 流式输出
- 数据:6 个 Zustand store 全量持久化(v0.1.0 起 SQLite / localStorage 双轨),弱关联字段可选、不级联删除

**目标架构**(docs/ARCHITECTURE.md,2026-08-07 已确认):
- 工作流引擎:**GraphFlow** (Rust 原生,HITL via `interrupt!`)
- LLM 集成:**Rig** (多 Provider:Claude/GPT/Gemini/Ollama)
- 向量检索:**LanceDB** (嵌入式)
- 持久化:**SQLite** (本地优先)
- 架构原则:零 Sidecar / 本地优先 / 混合架构(本地存储 + 云端 LLM)/ HITL 关键节点

**两条主线的内在联系**:暗色模式是用户体验上的小账,但 Tauri 原生能力是通往设计文档目标架构的必经之路。v1 把两者打包,既清债务又为后续 Pipeline / 第二大脑铺路。

## Constraints

- **Tech stack**: React 19 + Tauri v2 + Tailwind v4(已锁,不重构)
- **Granularity**: Coarse — v1 控制在 3-5 个 phase(用户选择)
- **No sidecar**: 不引入 Node.js 子进程做 LLM/工作流;最终目标全 Rust
- **Backward compat**: AppContext.tsx 兼容层在所有 view 迁移完之前不删
- **Distribution**: 桌面构建为 Tauri app(Windows/macOS/Linux),Web 模式作为 dev fallback
- **Security**: API key 不进客户端 bundle;Tauri CSP 必须显式声明(当前 `csp: null` 是 debt)
- **Persistence**: 本地优先,先 localStorage(zustand persist)再 SQLite(Tauri SQL 插件)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 暗色模式优先于功能扩展 | CLAUDE.md 标记为 Phase 7 技术债,tokens 已就绪,80 行代码即可解锁价值 | ✓ Validated in Phase 1 (2026-08-08) |
| Tauri IPC 替代 Express AI 端点 | API key 泄漏风险;Express 监听 0.0.0.0 无 CORS/auth | ✓ Validated in Phase 3 (2026-08-08) — IPC-01..10 全部满足 |
| SQLite via Tauri SQL 插件(而非 Node sqlite) | 设计文档零-Sidecar 原则;GraphFlow SqliteSaver 已内置 | ✓ Validated in Phase 2 (2026-08-08) — 9 个 PERSIST-* 全部满足 |
| GraphFlow + Rig PoC 推到 v0.3+ | pre-1.0 crate,单作者,无生产 Tauri 嵌入参考;先跑通 CRUD 再评估 | ⚠️ Deferred from v0.1.0 Phase 4 |
| 暂不实现 Pipeline / 第二大脑 | 设计文档 Phase 2-4 范围,依赖 PoC 验证 | — Pending |
| docs/ 设计文档作为目标架构真相源 | 2026-08-07 已确认,8 个 ADR 锁定核心选型 | ✓ Good |
| 弱关联模型(外键全部可选,不级联删除) | 独立 CRUD 先跑通,关联是增益不是束缚;避免数据丢失风险 | ✓ Validated in v0.2.0 |
| Task/Schedule 双向引用(projectId?/taskId?) | "任务 → 日程"和"日程 → 任务"都能 O(1) 跳转 | ✓ Validated in v0.2.0 |
| 3 phase 拆分(Task CRUD / Schedule CRUD / 联动) | 粗粒度原则;5/6 可并行,7 是 wire-up | ✓ Good — 实际扩到 8 phase(含编辑器 + 3 个 AI phase + gap closure) |
| 保留 task.project:string 做 legacy 兼容 | AppContext.tsx 多处依赖,不删,推到下下里程碑 | ⚠️ 仍在兼容层,随 view 迁移消除 |
| Rust llm.rs provider-agnostic + hand-rolled Tool registry(~200 LOC) | 零 Sidecar 原则;不引入重型 agent 框架 | ✓ Validated in v0.2.0 — Ollama 生产 tool-call UAT 通过 |
| Express 端点 5→1 收缩 | AI 走 Tauri IPC,Express 只留 dev fallback | ✓ Validated in Phase 9-02 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

## Phase Log (recent)

- **Phase 12 (2026-08-11)**: v0.2.0 Gap Closure — closed all 8 audit gaps (INT-01 KnowledgeBaseView→rndStore wiring, 5 phase VERIFICATION.md backfill, 3 Express MEDIUM hardening, CROSS-04/05/06 traceability). v0.2.0 milestone ready for sign-off.

---
*Last updated: 2026-08-14 after v0.2.0 milestone*
