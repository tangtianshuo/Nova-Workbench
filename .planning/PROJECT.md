# Nova PM Workspace

## What This Is

Nova 是一个 **AI native 的产品经理桌面工作台**,基于 Tauri v2 + React 19。当前 v0.1.0 已交付完整的 PM 视图框架(产品/任务/研发/日程/文件/知识库)、Apple 风格设计系统、以及 Gemini Express 后端。下一步目标是按 `docs/ARCHITECTURE.md` 蓝图,把"AI native Agent 工作台"从 UI 框架落地到真正的 Rust 原生后端(GraphFlow + Rig + LanceDB + SQLite,零 Sidecar)。

## Core Value

让产品经理拥有一个**懂你、能替你干活**的桌面 AI Agent —— 不是 chatbot,而是能跑 Pipeline(需求→PRD→原型→代码→测试)、有第二大脑、关键节点 HITL 的真 Agent。

## Requirements

### Validated

<!-- 从现有 codebase 推断 — v0.1.0 已交付 -->

- ✓ 桌面外壳:Tauri v2 frameless 窗口 + 自定义 TitleBar + 跨平台窗口控制 — Phase 1-2
- ✓ 设计系统:20 个 Radix-based UI 原语 + tokens.css 设计令牌 + Phosphor 图标 — Phase 3-5
- ✓ 11 个顶层视图 + 16 个 Product/R&D 子组件,全部接入设计系统 — Phase 6
- ✓ 6 个 Zustand stores(task/product/rnd/schedule/workspace/ui)+ AppContext 兼容层 — Phase 4
- ✓ 7 个主标签页导航(Sidebar + activeTab switch,无 router 库)
- ✓ Gemini AI 集成(5 个 Express 端点,无 key 时回退到模板)
- ✓ 路由懒加载 + Framer Motion 页面切换动画
- ✓ 暗色模式 token 已定义(`tokens.css` 116-156 行)但未连到 UI
- ✓ 暗色模式上线 — 三态切换(SettingsView SegmentedControl + Header Sun/Moon cycle)、Linux GTK 检测垫片、200ms 颜色过渡、47 组件暗色调色板审计 — **Validated in Phase 1: Dark Mode Wiring (2026-08-08)**

### Active

<!-- 当前 v1 范围 — 用户 2026-08-08 指示的两条主线 -->

**A. 暗色模式上线(技术债清偿)** — ✓ 完成(Phase 1, 2026-08-08)。5 项运行时视觉 UAT 待用户在 `01-HUMAN-UAT.md` 中确认。

**B. Tauri 原生能力集成(向设计文档的零-Sidecar 架构迁移)**
- [✓ Phase 2, 2026-08-08] 引入 SQLite 持久化层(`tauri-plugin-sql` + Zustand `persist` 适配器),解决"刷新即重置"问题。5 项运行时 UAT 待用户在 `02-HUMAN-UAT.md` 中确认。
- [ ] 把 5 个 Gemini AI 端点从 Express 迁移到 Tauri IPC commands(API key 不再触碰 Node 层)
- [ ] 绑定 `127.0.0.1` 替代 `0.0.0.0`(若保留 Express 作为 dev fallback)
- [ ] 探索 GraphFlow + Rig 在 Tauri Rust 后端的集成可行性(PoC)

### Out of Scope

<!-- 显式边界 — 防止重新加回 -->

- **第二大脑(LanceDB 向量检索)** — v1 先把基础架构和持久化跑通,向量检索作为 Phase 4 单独立项(对应 `docs/` 设计里的 Phase 4)
- **完整 PM Pipeline(需求→PRD→原型→代码→测试 全自动)** — v1 只做架构铺垫(GraphFlow PoC),Pipeline 实现是后续 milestone
- **多人协作 / 云同步** — 设计原则是"本地优先",SQLite 单机足够;云同步触发条件未到
- **URL 路由** — 当前 `activeTab` state 够用,深链/分享/浏览器后退是未来需求
- **AppContext 全量移除** — 跟随各 view 迁移到 direct store hook 时逐步消除,不在本里程碑单独 phase

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
| 暗色模式优先于功能扩展 | CLAUDE.md 标记为 Phase 7 技术债,tokens 已就绪,80 行代码即可解锁价值 | ✓ Validated in Phase 1 (2026-08-08) — DARK-01..07 全部满足,5 项运行时 UAT 待人工确认 |
| Tauri IPC 替代 Express AI 端点 | API key 当前必须bundled 进 Tauri app,有泄漏风险;Express 监听 0.0.0.0 无 CORS/auth | — Pending |
| SQLite via Tauri SQL 插件(而非 Node sqlite) | 设计文档零-Sidecar 原则;GraphFlow SqliteSaver 已内置 | ✓ Validated in Phase 2 (2026-08-08) — `tauri-plugin-sql` 2.4 + Zustand `persist` `createJSONStorage` 适配器,9 个 PERSIST-* 需求全部满足,5 项运行时 UAT 待人工确认 |
| GraphFlow + Rig PoC 作为 v1 最后一步 | 这两个 crate 相对新,文档不完善,先验证可行性再绑定 | — Pending |
| 暂不实现 Pipeline / 第二大脑 | 设计文档 Phase 2-4 范围,v1 只做架构铺垫 | — Pending |
| docs/ 设计文档作为目标架构真相源 | 2026-08-07 已确认,8 个 ADR 锁定核心选型 | ✓ Good |

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
*Last updated: 2026-08-08 after Phase 2 completion (Persistence — Zustand persist + SQLite)*
