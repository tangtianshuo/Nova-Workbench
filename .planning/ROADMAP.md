# ROADMAP: Nova-PM-Workspace

**Phase numbering:** continues from 32 (v0.3.3 ended at 31; never restart at 01)

## Milestones

- ✅ **v0.3.3 产研半落地 + 工作区入驻** — Phases 26-31 (shipped 2026-09-04, 带债收口: 27 suspended / 28 postponed) — [archive](milestones/v0.3.3-ROADMAP.md)
- ✅ **v0.3.2 Rust Run Engine** — Phases 22-25 (shipped 2026-08-31) — [archive](milestones/v0.3.2-ROADMAP.md)
- ✅ **v0.3.1 多 Session 会话体系** — Phases 18-21 (shipped 2026-08-19, closed 2026-08-24) — [archive](milestones/v0.3.1-ROADMAP.md)
- ✅ **v0.3.0 功能闭环** — Phases 13-17 (shipped 2026-08-17) — [archive](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动** — Phases 5-12 (shipped 2026-08-14) — [archive](milestones/v0.2.0-ROADMAP.md)

*无活跃里程碑 — 下一个里程碑(v0.4 候选:coding agent + subagent + Skill)经 `/gsd:new-milestone` 定义。*

## Historical Milestones

<details>
<summary>✅ v0.3.3 产研半落地 + 工作区入驻 (Phases 26-31) — SHIPPED 2026-09-04(带债收口)</summary>

- [x] Phase 26: Mock 全清 — tab 接引擎 — 4/4 plans, completed 2026-08-31
- ⏸️ Phase 27: 工作区文档摄取 — 3/4 plans, suspended 2026-09-02(修复已提交,UAT-2..7 回归待恢复:`/gsd:execute-phase 27 --gaps-only`)
- ⏭️ Phase 28: 反向创建产品 + 收口 — postponed 2026-09-02(REV-01/02 deferred)
- [x] Phase 29: PM CRUD 工具原生化 — agent 写路径 — 4/4 plans, completed 2026-09-02(UAT 8/8)
- [x] Phase 30: 参考模板数据化 + 工作流用户自组织 — 4/4 plans, completed 2026-09-03(VERIFICATION 13/13 + UAT 8/8)
- [x] Phase 31: 文档工作区 — Milkdown 编辑器 + 右侧常驻面板 — 9/9 plans, completed 2026-09-04(UAT 9/9 三轮复测)

</details>

<details>
<summary>✅ v0.3.2 Rust Run Engine (Phases 22-25) — SHIPPED 2026-08-31</summary>

- [x] Phase 22: 引擎核心(loop 语义移植 + 事件唯一写者 + replay parity) — 10/10 plans (含 22-08/09/10 三轮 UAT gap closure), completed 2026-08-31
- [x] Phase 23: 工具层(原生工具集,无桥) — 5/5 plans, completed 2026-08-24
- [x] Phase 24: 多 run 并行 + 后台运行(托盘) — 4/4 plans, completed 2026-08-24
- [x] Phase 25: 迁移收口 — 1/1 plan, completed 2026-08-24

</details>

<details>
<summary>✅ v0.3.1 多 Session 会话体系 (Phases 18-21) — SHIPPED 2026-08-19</summary>

- [x] Phase 18: Session 数据模型与底座 — 2/2 plans
- [x] Phase 19: 多 Session 运行时 — 3/3 plans
- [x] Phase 20: 分支与卡片操作 — 2/2 plans
- [x] Phase 21: Session 列表与快捷入口 + 自动命名 — 3/3 plans

</details>

## Backlog (candidate phases — promote with `/gsd:review-backlog`)

### Phase 999.2: Skill 系统（PM 领域工作流的沉淀与复用） (BACKLOG)

**Goal:** [Captured for future planning] 把 PM 领域工作流(竞品分析、PRD 生成、需求评审等)打包为可复用 skill:manifest(名称/描述/触发条件) + prompt 模板 + 允许调用的工具集 + 产出物卡槽。系统 prompt 只放 skill 描述,agent 按需经 FTS5 检索加载全文(同构 Claude Code skill 加载机制)。产出走 Phase 16 交付物管线(生成→HITL 确认→编辑→版本化落卡槽)。附带"从对话沉淀为 skill"入口 — 用户用得好的工作流沉淀为 skill,即第二大脑的活知识。
**核心判断:** 不需要新架构 — 是 Phase 15(知识文档 + FTS5)与 Phase 16(交付物管线)的自然组装,增量仅为 skill manifest 类型 + 加载器。v0.2.0 的 `runProductSkill` mock 概念由此转正。Phase 30 已交付模板数据化 + skill 字段预留(999.4 前置)。
**依赖:** Phase 30(skill 字段预留);Phase 15, 16
**建议排期:** v0.4.0 候选(成本低、PM 价值直接)— **归位确认 v0.4.0**(2026-08-24)
**Requirements:** TBD

### Phase 999.3: MCP 集成（第三方能力扩展） (BACKLOG)

**Goal:** [Captured for future planning] 接入 MCP 让 agent 操作外部 PM 工具链(Figma、飞书、Jira 等),无需 Nova 逐个自建集成。
**技术路线:** v0.3.2 后为 Rust 侧 `rmcp` crate 做 MCP client,工具 schema 桥接进 **Rust 工具注册表**(Phase 23 落地)成为动态工具。
**三个前置条件:**
1. 审计底座(Phase 13/14)— 每次外部调用落入 `agent_events`,可追责可恢复;无事件日志不接 MCP — **已满足**
2. 审批分级 — MCP 工具为外部代码,默认"外部写入一律 HITL 确认",内置工具才可按风险白名单
3. Rust 工具注册表落地(v0.3.2 Phase 23)— **已交付**
**依赖:** Phase 23(v0.3.2)
**建议排期:** v0.4.0+(REQUIREMENTS v2 ENTRY-02)— **归位推迟 v0.5+**(2026-08-24)
**Requirements:** TBD

### Phase 999.4: 垂类扩展隔离 — 交付物目录与 pipeline 模板数据化 (BACKLOG)

**Goal:** [Captured for future planning] 把 PM 领域层从代码/类型抽成**数据驱动**:交付物目录与 pipeline 模板改为配置/模板文件,view 按目录渲染。**v0.3.3 已交付 catalog 单源 JSON(Phase 30-01,内置只读层);剩余:用户层扩展 + 垂类换装验证。**
**核心判断:** 不泛化产品 — v1 垂类聚焦(PM)是护城河。只做"留门不盖房"的隔离:换垂类时只需换一份配置 + view 文案,Agent 骨架不动。
**与 skill 系统(999.2)的关系:** pipeline 模板数据化后,skill manifest 可直接引用同一套模板格式,二者应协同设计避免两套模板 DSL(Phase 30 已统一模板格式并预留 skill 字段)。
**预估成本:** 剩余动作约一天。
**建议排期:** v0.4.0 协同 999.2(2026-08-24)
**Requirements:** TBD

### Phase 999.5: 双 Agent 架构 — 日常助手 + 产研 coding Agent (BACKLOG)

**Goal:** [Captured for future planning] Agent Loop 与 harness 演进:评估借鉴 Oh my pi 的相关设计,设计两块 Agent — ① 日常 AI 助手(日程分发、任务管理、轻量级日常工作处理);② 产研中心 coding Agent(偏向真实代码工作)。与 ADR-0004(subagent-as-tool)及现有 Rust run engine(src-tauri/src/engine/)的关系待讨论裁定。
**讨论已完成 2026-08-31**:裁定 D-01..D-14 见 `.planning/phases/999.5-dual-agent-architecture/999.5-CONTEXT.md` — 双入口 persona + spawn 互通;sidecar 否决(语义移植 + crates 评估);助手②档自主性(触发→本地零-LLM 检查→条件升级);三档 HITL 风险档案(三档已于 Phase 29 落地);omp 借鉴清单全盘确认。归位 v0.4 系,promote 时随 v0.4 立项带入(另带入:omp crates vendoring 评估 research 任务)。
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---

*999.1 工作区先行的产品入驻已于 2026-08-31 移入 v0.3.3 正式 scope(Phase 27 文档摄取 + Phase 28 反向创建产品);Phase 28(REV-01/02)顺延未实施,见 v0.3.3 归档 Known Gaps。*

*999.6 PM CRUD 工具原生化已于 2026-09-02 promote 为 **Phase 29** 并于 v0.3.3 交付,backlog 条目移除。*

*Phase 30(参考模板数据化 + 工作流用户自组织)取材 999.4 + 999.2,已于 v0.3.3 交付(catalog 单源 JSON + workflow_ 工具族 + 「工作流」视图 + 确定性沉淀链)。产品哲学约束:工作流用户自组织,Nova 只提供参考+模板,严禁刚性 pipeline 设计。*
