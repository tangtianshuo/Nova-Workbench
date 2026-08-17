# ROADMAP: Nova-PM-Workspace

**Current milestone:** none — next via `/gsd:new-milestone`
**Phase numbering:** continues from 18 (never restart at 01)

## Milestones

- ✅ **v0.3.0 功能闭环** — Phases 13-17 (shipped 2026-08-17) — [archive](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动** — Phases 5-12 (shipped 2026-08-14) — [archive](milestones/v0.2.0-ROADMAP.md)

## Phases

<details>
<summary>✅ v0.3.0 功能闭环 (Phases 13-17) — SHIPPED 2026-08-17</summary>

- [x] Phase 13: Event Log 底座 + ToolLoop 重构 (3/3 plans) — completed 2026-08-15
- [x] Phase 14: 持久化确认 + 会话恢复 + 上下文压缩 (4/4 plans) — completed 2026-08-15
- [x] Phase 15: 长期记忆 + 知识文档 + FTS5 检索 (4/4 plans) — completed 2026-08-15
- [x] Phase 16: PRD 生产线 (3/3 plans) — completed 2026-08-17
- [x] Phase 17: Agent UX + 架构文档 (5/5 plans) — completed 2026-08-17

Full details: [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md) · audit: [v0.3.0-MILESTONE-AUDIT.md](milestones/v0.3.0-MILESTONE-AUDIT.md)

</details>

<details>
<summary>✅ v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动 (Phases 5-12) — SHIPPED 2026-08-14</summary>

Full details: [milestones/v0.2.0-ROADMAP.md](milestones/v0.2.0-ROADMAP.md)

</details>

## Backlog (candidate phases — promote with `/gsd:review-backlog`)

### Phase 999.1: 工作区先行的产品入驻（文档 → 产品 → AI 摄取） (BACKLOG)

**Goal:** [Captured for future planning] 用户已有 PRD 等产品文档,以工作区(本地文件夹)为起点入驻:从工作区派生产品(反向创建 + 自动关联 projectId),AI 摄取文档 → 分类进知识库 → 抽取任务/日程草稿 → 批量 HITL 确认。这是 v0.3.0 三个技术投资(事件日志/FTS5/记忆)的用户可见收口叙事。
**依赖:** Phase 13-15(事件日志 + toolLoop 底座、FTS5 + 记忆)— 已全部落地,可排期
**已知缺口:**
1. 文档摄取 — docx/pdf → 文本解析(Rust 侧,零 sidecar),当前仅有文件列表 + 手工 contentSnippet
2. 摄取编排 — 扫描工作区 → 逐文档分类 → 抽取任务/日程草稿 → 批量 HITL 确认的 pipeline(执行器 `ai/tools/` 的 task/schedule/knowledgeWrite 已就绪)
3. 反向创建入口 — "从工作区创建产品"向导(读文件夹 → AI 猜产品名/定位 → 建产品 + 自动挂 projectId)
**Requirements:** TBD
**Plans:** 0 plans

### Phase 999.2: Skill 系统（PM 领域工作流的沉淀与复用） (BACKLOG)

**Goal:** [Captured for future planning] 把 PM 领域工作流(竞品分析、PRD 生成、需求评审等)打包为可复用 skill:manifest(名称/描述/触发条件) + prompt 模板 + 允许调用的工具集 + 产出物卡槽。系统 prompt 只放 skill 描述,agent 按需经 FTS5 检索加载全文(同构 Claude Code skill 加载机制)。产出走 Phase 16 交付物管线(生成→HITL 确认→编辑→版本化落卡槽)。附带"从对话沉淀为 skill"入口 — 用户用得好的工作流沉淀为 skill,即第二大脑的活知识。
**核心判断:** 不需要新架构 — 是 Phase 15(知识文档 + FTS5)与 Phase 16(交付物管线)的自然组装,增量仅为 skill manifest 类型 + 加载器。v0.2.0 的 `runProductSkill` mock 概念由此转正。
**依赖:** Phase 15, 16 — 已全部落地
**建议排期:** v0.4.0 候选(成本低、PM 价值直接)
**Requirements:** TBD
**Plans:** 0 plans

### Phase 999.3: MCP 集成（第三方能力扩展） (BACKLOG)

**Goal:** [Captured for future planning] 接入 MCP 让 agent 操作外部 PM 工具链(Figma、飞书、Jira 等),无需 Nova 逐个自建集成。
**技术路线:** Rust 侧用官方 `rmcp` crate 做 MCP client,工具 schema 桥接进 `ai/tools/` 注册表成为动态工具;前端与 toolLoop 不大改。
**三个前置条件:**
1. 审计底座(Phase 13/14)— 每次外部调用落入 `agent_events`,可追责可恢复;无事件日志不接 MCP — **已满足**
2. 审批分级(Phase 14 确认队列之上)— MCP 工具为外部代码,默认"外部写入一律 HITL 确认",内置工具才可按风险白名单
3. 零 sidecar 边界澄清 — MCP stdio server 需 spawn 子进程;约束本意是"Nova 自身后端不依赖 Node",用户主动配置的外部工具进程不在此列。此区分需写入 ADR
**依赖:** Phase 13, 14 — 已满足(待 2/3 补齐)
**建议排期:** v0.5.0 或需求驱动(真实用户提出"连飞书/Figma"再做)
**Requirements:** TBD
**Plans:** 0 plans

### Phase 999.4: 垂类扩展隔离 — 交付物目录与 pipeline 模板数据化 (BACKLOG)

**Goal:** [Captured for future planning] 把 PM 领域层(productStore/rndStore、`FULL_LIFECYCLE_DELIVERABLES_CATALOG` 18 种 PM 交付物硬编码在 `mockRndData.ts`、需求→PRD→原型→代码→测试 pipeline、各 view 信息架构)从代码/类型抽成**数据驱动**:交付物目录与 pipeline 模板改为配置/模板文件,view 按目录渲染。
**核心判断:** 不泛化产品 — v1 垂类聚焦(PM)是护城河。只做"留门不盖房"的隔离:换垂类时只需换一份配置 + view 文案,Agent 骨架不动。
**与 skill 系统(999.2)的关系:** pipeline 模板数据化后,skill manifest 可直接引用同一套模板格式,二者应协同设计避免两套模板 DSL。
**预估成本:** 隔离动作本身约一两天。
**建议排期:** v0.4.0 前后的技术投资,或与 999.2 同期
**Requirements:** TBD
**Plans:** 0 plans

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 13. Event Log 底座 + ToolLoop 重构 | v0.3.0 | 3/3 | Complete | 2026-08-15 |
| 14. 持久化确认 + 会话恢复 + 上下文压缩 | v0.3.0 | 4/4 | Complete | 2026-08-15 |
| 15. 长期记忆 + 知识文档 + FTS5 检索 | v0.3.0 | 4/4 | Complete | 2026-08-15 |
| 16. PRD 生产线 | v0.3.0 | 3/3 | Complete | 2026-08-17 |
| 17. Agent UX + 架构文档 | v0.3.0 | 5/5 | Complete | 2026-08-17 |
