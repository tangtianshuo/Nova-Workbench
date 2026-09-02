# ROADMAP: Nova-PM-Workspace

**Phase numbering:** continues from 26 (v0.3.2 ended at 25; never restart at 01)

## Milestones

- 🚧 **v0.3.3 产研半落地 + 工作区入驻** — Phases 26-29 (active)
- ✅ **v0.3.2 Rust Run Engine** — Phases 22-25 (shipped 2026-08-31) — [archive](milestones/v0.3.2-ROADMAP.md)
- ✅ **v0.3.1 多 Session 会话体系** — Phases 18-21 (shipped 2026-08-19, closed 2026-08-24) — [archive](milestones/v0.3.1-ROADMAP.md)
- ✅ **v0.3.0 功能闭环** — Phases 13-17 (shipped 2026-08-17) — [archive](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动** — Phases 5-12 (shipped 2026-08-14) — [archive](milestones/v0.2.0-ROADMAP.md)

## Phases

### v0.3.3 产研半落地 + 工作区入驻(RND-ROLLOUT ①层)

- [x] **Phase 26: Mock 全清 — tab 接引擎** - 产研各 tab AI 按钮触发真实 engine_run(带 tab 上下文、独立 session、流式进度、候选→HITL→落槽),mock 全删 ✅(2026-08-31)
- [ ] **Phase 27: 工作区文档摄取** - 纯 Rust docx/pdf 文本提取 + 摄取编排(扫描→分类→草稿抽取)+ 批量 HITL + 内容 hash 幂等 ⏸️(挂起 2026-09-02,修复已提交待 UAT 回归)
- [ ] **Phase 28: 反向创建产品 + 收口** - 从工作区反向创建产品(自动关联源工作区/productId)+ 里程碑 parity 收口与 UAT(顺延 2026-09-02)
- [x] **Phase 29: PM CRUD 工具原生化 — agent 写路径** - task/schedule(及 product 视讨论)的 CRUD 操作原生化为引擎工具 + 三档风险 HITL,助手能真实替用户干活(2026-09-02 自 999.6 promote,第一优先)✅(2026-09-02,UAT 8/8 + verifier GO 4/4)
- [ ] **Phase 30: 参考模板数据化 + 工作流用户自组织** - 交付物 catalog/模板数据化(内置 JSON 只读层 + SQLite 用户层)+ 侧边栏顶层「工作流」视图(模板库 + 运行)+ 单 run 多步逐步 HITL 执行 + agent 对话创建/沉淀模板;严禁刚性 pipeline(2026-09-02 立项 + discuss 完成,30-CONTEXT 16 项裁定)

## Phase Details

### Phase 26: Mock 全清 — tab 接引擎
**Goal**: 用户在产研中心任一 tab 点 AI 按钮都跑真实引擎 run:流式可见、可取消、可审计,产物走统一候选→HITL→版本化落槽,代码中 mock 零残留
**Depends on**: Nothing(v0.3.2 engine 已 shipped)
**Requirements**: TAB-01, TAB-02, TAB-03, TAB-04, TAB-05, TAB-06
**Success Criteria** (what must be TRUE):
  1. 用户在产研中心任一 tab(需求/原型/代码脚手架/测试用例/竞品分析/一键交付物)点 AI 生成按钮,触发真实 `engine_run` 且携带 tab 上下文,返回内容非 mock(grep 零 mock/fabricate 残留,UI 无死路径)
  2. 用户在 tab 内看到流式进度与事件投影(事件日志可审计),且可中途取消
  3. 每类生成的产物统一走候选→HITL 确认卡→版本化落槽(knowledge_docs 卡槽 + AI 溯源徽章),与 PRD 生产线同构
  4. tab 触发的 run 使用独立 sessionId,聊天会话列表与会话投影不受污染
  5. 批量生成运行期间用户发起聊天,交互 run 优先于批量 run(不被 cap-3 队列饿死);一键十八份交付物为单 run 多步而非 18 个 run
**Plans**: 4 plans
Plans:
- [x] 26-01-PLAN.md — tabRunStore 基础设施 + deliverables 投影化(knowledge_docs 唯一真相源裁定)
- [x] 26-02-PLAN.md — Rust 调度器双队列优先级 + engine_run priority 字段
- [x] 26-03-PLAN.md — TabRunPanel 共享组件 + 需求 tab 试点端到端
- [x] 26-04-PLAN.md — 其余 tab + 一键单 run 多步 + mock 全清 + 人工验证

### Phase 27: 工作区文档摄取
**Goal**: 用户可对工作区文档发起纯 Rust 摄取:提取→分类→草稿抽取全程可见,产物经批量 HITL 确认后落业务数据,重扫幂等、立即可检索
**Depends on**: Phase 26(摄取编排 run 复用 tab-run 接线模式与调度优先级)
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-05, ING-06
**Success Criteria** (what must be TRUE):
  1. 用户对工作区 docx/pdf 发起摄取,系统以纯 Rust 提取文本(零 sidecar、无外部进程)
  2. 无文本层/扫描件 PDF 的摄取结果以显式三态(extracted/partial/failed)呈现,不静默建档空文档
  3. 用户发起摄取编排后,扫描工作区→AI 分类进知识库→抽取任务/日程草稿全程进度可见
  4. 用户以批量 HITL 聚合卡确认摄取产物(全选/全不选、逐项编辑、一次提交),确认后才落业务数据
  5. 重扫同一工作区时已摄取文档以内容 hash 识别,不重复建档/不重复索引;摄取完成的文档立即可在知识库 FTS5 中文检索命中
**Plans**: 3 plans
Plans:
- [x] 27-01-PLAN.md — 纯 Rust 提取地基:pdf_oxide/zip/quick-xml + ingest.rs 三态/hash/截断 + 中文 PDF PoC + ingest_scan + 0010 migration
- [x] 27-02-PLAN.md — 批量 HITL 后端:PM 四类目双侧 parity + ingest_submit + engine_consume_ingestion_batch 事务 + consume 幂等
- [x] 27-03-PLAN.md — 前端摄取流:ingestion TabRunKind + ingestionStore + FileArchiveView 摄取区/聚合卡/队列入口卡 + 端到端人工验证

### Phase 28: 反向创建产品 + 收口
**Goal**: 用户以既有工作区文档为起点入驻产品,反向创建的产品自动关联源工作区;里程碑以 parity 收口 gate + 统一 UAT 关闭
**Depends on**: Phase 27(反向创建以摄取能力为起点)
**Requirements**: REV-01, REV-02
**Success Criteria** (what must be TRUE):
  1. 用户可"从工作区创建产品"——复用创建产品向导模式,以既有工作区文档为起点反向创建产品
  2. 反向创建的产品自动关联源工作区与 productId,后续摄取产物(知识/任务/日程草稿)默认归属该产品
  3. 里程碑收口 gate 通过:新增事件种类均有双侧 replay parity fixture(cargo + npm + tsc 全绿);统一人工 UAT(含 ≥20 文档批量摄取 + 托盘后台 run)通过
**Plans**: TBD
**UI hint**: yes

### Phase 29: PM CRUD 工具原生化 — agent 写路径
**Goal**: 把 task/schedule(及 product 视讨论)的 CRUD 操作原生化为引擎工具(task_create/update/complete、schedule_create/update 等),每工具带三档风险标注(读免确认/可逆轻写免确认/删除+批量+外发确认,999.5 D-12),使助手具备真实写任务/日程/产品能力——「Agent 替你干活」的地基,也是后续工作流用户自组织(Phase 30)的执行基础
**Depends on**: Phase 23 引擎工具注册表(v0.3.2 已就绪);999.5 D-11/D-12 裁定
**Requirements**: PM-01, PM-02, PM-03, PM-04
**Success Criteria** (what must be TRUE):
  1. 用户在对话中让助手创建/修改/完成任务、日程,agent 调用原生 CRUD 工具真实落库(非 mock、非手动 UI 操作)
  2. 三档风险分级生效:读操作免确认,可逆轻写免确认,删除/批量/外发走 HITL 确认
  3. 写入立即可见于对应视图(任务页/日历/产品),重启不丢
  4. 业务数据关系化(task/schedule 自 Zustand-persist 迁 SQLite 关系表)是否同期——discuss 裁定
**Plans:** 4 plans
Plans:
- [x] 29-01-PLAN.md — migration 0012 关系表 + pm_write kind + pm_store SQL 层 + kv 一次性幂等搬移
- [x] 29-02-PLAN.md — 9 个 PM 工具注册执行(读/轻写免确认、delete 走 pm_write)+ cap-5 升级护栏
- [x] 29-03-PLAN.md — engine_consume_pm_write 事务闭环 + 聊天确认卡 + pm_write_applied 双侧 parity fixture
- [x] 29-04-PLAN.md — taskStore/scheduleStore SQL 换轨 + 事件驱动 refresh + 端到端 UAT(UAT 8/8 用户全过;gap 修复 f894b27/3ae51a6/c0fbb01)
**排期**: 2026-09-02 promote 自 999.6(v0.3.3 优先级重定,第一优先;原裁定 v0.4 首批)

### Phase 30: 参考模板数据化 + 工作流用户自组织
**Goal**: 交付物目录与模板数据化(999.4)+ 工作流用户自组织(999.2 取材):用户从顶层「工作流」视图或对话发起模板 run(单 run 多步、逐步 HITL)、agent 对话创建/沉淀模板(29 写路径复用),Nova 只给参考+模板,严禁刚性 pipeline
**Depends on**: Phase 29(写路径/三档风险/cap-5);Phase 26(单 run 多步先例、TabRunPanel、18 codes catalog)
**Requirements**: TBD(WF-xx 于 REQUIREMENTS 定义)
**Success Criteria** (what must be TRUE):
  1. 用户从侧边栏顶层「工作流」视图浏览模板库(内置参考 + 自建),点模板或对话一句话发起 run:单 run 多步执行、每步产物走候选→HITL→版本化落槽、进度可见可取消(TabRunPanel 复用)
  2. 用户在对话中让助手创建/修改/复制/删除工作流模板,agent 经写路径真实落库;删除走确认卡
  3. 用户可把刚跑完的对话/run 沉淀为模板(提取步骤→草稿→确认→落库)
  4. 交付物 catalog 与模板数据化:内置 JSON 只读层(换垂类只换文件)+ 用户层 SQLite 扩展;产研各 tab 从数据层读 catalog,`mockRndData.ts` catalog 硬编码退役
  5. 模板 run 内写操作遵循 29 三档风险分级(模板不豁免);run 可审计(事件日志)
  6. 模板格式预留 skill 字段兼容(单 DSL),agent 自主检索加载推 v0.4
**Plans:** TBD
**排期**: 2026-09-02 立项(29 落地后,ROADMAP 脚注裁定);product 关系化/CRUD 继续推迟 v0.4

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 26. Mock 全清 — tab 接引擎 | 4/4 | Complete   | 2026-08-31 |
| 27. 工作区文档摄取 | 3/4 | Suspended — 27-04 fix committed (2026-09-02), UAT-2..7 regression deferred by user (priority shift) | - |
| 28. 反向创建产品 + 收口 | 0/? | Postponed (2026-09-02 priority shift) | - |
| 29. PM CRUD 工具原生化 — agent 写路径 | 4/4 | Complete | 2026-09-02 |

## Historical Milestones

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
**核心判断:** 不需要新架构 — 是 Phase 15(知识文档 + FTS5)与 Phase 16(交付物管线)的自然组装,增量仅为 skill manifest 类型 + 加载器。v0.2.0 的 `runProductSkill` mock 概念由此转正。
**依赖:** Phase 15, 16 — 已全部落地;v0.3.2 后 Skill 可作为 Rust 引擎新入口直接接入
**建议排期:** v0.4.0 候选(成本低、PM 价值直接)— **归位确认 v0.4.0**(2026-08-24,与 999.4 协同)
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

**Goal:** [Captured for future planning] 把 PM 领域层(productStore/rndStore、`FULL_LIFECYCLE_DELIVERABLES_CATALOG` 18 种 PM 交付物硬编码在 `mockRndData.ts`、需求→PRD→原型→代码→测试 pipeline、各 view 信息架构)从代码/类型抽成**数据驱动**:交付物目录与 pipeline 模板改为配置/模板文件,view 按目录渲染。
**核心判断:** 不泛化产品 — v1 垂类聚焦(PM)是护城河。只做"留门不盖房"的隔离:换垂类时只需换一份配置 + view 文案,Agent 骨架不动。
**与 skill 系统(999.2)的关系:** pipeline 模板数据化后,skill manifest 可直接引用同一套模板格式,二者应协同设计避免两套模板 DSL。
**预估成本:** 隔离动作本身约一两天。
**建议排期:** v0.4.0 前后的技术投资,或与 999.2 同期 — **归位确认与 999.2 同期 v0.4.0**(2026-08-24)
**Requirements:** TBD

### Phase 999.5: 双 Agent 架构 — 日常助手 + 产研 coding Agent (BACKLOG)

**Goal:** [Captured for future planning] Agent Loop 与 harness 演进:评估借鉴 Oh my pi 的相关设计,设计两块 Agent — ① 日常 AI 助手(日程分发、任务管理、轻量级日常工作处理);② 产研中心 coding Agent(偏向真实代码工作)。与 ADR-0004(subagent-as-tool)及现有 Rust run engine(src-tauri/src/engine/)的关系待讨论裁定。
**讨论已完成 2026-08-31**:裁定 D-01..D-14 见 `.planning/phases/999.5-dual-agent-architecture/999.5-CONTEXT.md` — 双入口 persona + spawn 互通;sidecar 否决(语义移植 + crates 评估);助手②档自主性(触发→本地零-LLM 检查→条件升级);三档 HITL 风险档案;omp 借鉴清单全盘确认。归位 v0.4 系,promote 时随 v0.4 立项带入(另带入:omp crates vendoring 评估 research 任务)。
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---

*999.1 工作区先行的产品入驻已于 2026-08-31 移入 v0.3.3 正式 scope(Phase 27 文档摄取 + Phase 28 反向创建产品,需求 ING-01..06 / REV-01..02),backlog 条目移除。*

*999.6 PM CRUD 工具原生化已于 2026-09-02 promote 为 **Phase 29**(v0.3.3 优先级重定:27 挂起、28 顺延,agent 写路径第一优先),backlog 条目移除。*

*Phase 30(参考模板数据化 + 工作流用户自组织)取材 999.4 + 999.2,2026-09-02 裁定:29 落地后再立项——自组织工作流的执行基础是 29 的写路径,且避免一次拉两个大 scope。产品哲学约束:工作流用户自组织,Nova 只提供参考+模板,严禁刚性 pipeline 设计。*
