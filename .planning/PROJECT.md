# Nova-PM-Workspace

## What This Is

Nova 是一个 **AI native 的产品经理桌面工作台**,基于 Tauri v2 + React 19。当前 v0.1.0 已交付完整的 PM 视图框架(产品/任务/研发/日程/文件/知识库)、Apple 风格设计系统、以及 Gemini Express 后端。下一步目标是按 `docs/ARCHITECTURE.md` 蓝图,把"AI native Agent 工作台"从 UI 框架落地到真正的 Rust 原生后端(GraphFlow + Rig + LanceDB + SQLite,零 Sidecar)。

## Core Value

让产品经理拥有一个**懂你、能替你干活**的桌面 AI Agent —— 不是 chatbot,而是能跑 Pipeline(需求→PRD→原型→代码→测试)、有第二大脑、关键节点 HITL 的真 Agent。

## Current Milestone: v0.2.0 — 日常管理 CRUD + 弱关联

**Goal:** 让产品经理在 Nova 里完成任务/产品/日程三个核心模块的独立 CRUD,同时通过弱关联让跨模块协作自然发生。

**Target features:**
- 任务管理 CRUD 补全(taskStore update/delete/reopen + TaskKanban 卡片编辑菜单 + 任务对话框)
- 日程管理 CRUD + 真实日历(scheduleStore update/delete + ScheduleView 月份切换 + 日程对话框)
- 跨模块联动 wire-up(任务"安排到日历"、删除产品关联清理 UX、关联徽章展示)
- 弱关联字段(Task.projectId?/scheduledEventId?, ScheduleEvent.projectId?/taskId?)

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

### Active

<!-- v0.2.0 范围:日常管理 CRUD + 弱关联 -->

- [ ] 任务管理 CRUD 补全:taskStore update/delete/reopen + TaskKanban 卡片编辑菜单 + 任务对话框(可选关联产品)
- [ ] 日程管理 CRUD + 真实日历:scheduleStore update/delete + ScheduleView 月份切换 + 日程对话框(可选关联产品/任务)
- [ ] 跨模块联动 wire-up:任务"安排到日历"、删除产品时关联清理 UX、关联徽章展示
- [ ] 弱关联字段:Task 加 projectId?/scheduledEventId?,ScheduleEvent 加 projectId?/taskId? + type:'task'

**v0.1.0 遗留(非 v0.2.0 范围):**
- Phase 4 GraphFlow + Rig PoC — **deferred 到 v0.3+**(技术债,不阻塞 CRUD;见 Key Decisions)
- SEC-02/SEC-04/SEC-07 — UAT 完成后处理,可能并入 v0.2.0 或单独立 phase
- v0.1.0 各 Phase 运行时 UAT 待用户在 HUMAN-UAT.md 中确认

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

**当前架构**(2026-08-08 codebase map):
- 前端:React 19 + Vite 6 + Tailwind v4(`@theme` 桥接 tokens)+ Zustand 5 + motion 12
- 后端:Express 4 单进程,既做 Vite dev middleware 又做 prod 静态托管 + 5 个 AI 端点
- 桌面:Tauri v2 frameless + shell 插件,**未定义任何 Tauri command**,前端通过 `@tauri-apps/api/window` 直接调原生窗口控制
- 数据:5 个 Zustand store 全部 in-memory,**无任何持久化**(刷新即丢失)

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
| 弱关联模型(外键全部可选,不级联删除) | 独立 CRUD 先跑通,关联是增益不是束缚;避免数据丢失风险 | — Pending (v0.2.0) |
| Task/Schedule 双向引用(projectId?/taskId?) | "任务 → 日程"和"日程 → 任务"都能 O(1) 跳转 | — Pending (v0.2.0) |
| 3 phase 拆分(Task CRUD / Schedule CRUD / 联动) | 粗粒度原则;5/6 可并行,7 是 wire-up | — Pending (v0.2.0) |
| 保留 task.project:string 做 legacy 兼容 | AppContext.tsx 多处依赖,不删,推到下下里程碑 | — Pending (v0.2.0) |

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
*Last updated: 2026-08-10 after v0.2.0 milestone start (日常管理 CRUD + 弱关联)*
