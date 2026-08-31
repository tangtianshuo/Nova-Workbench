# ROADMAP: Nova-PM-Workspace

**Phase numbering:** continues from 26 (v0.3.2 ended at 25; never restart at 01)

## Milestones

- 🚧 **v0.3.3 产研半落地 + 工作区入驻** — Phases 26-28 (active)
- ✅ **v0.3.2 Rust Run Engine** — Phases 22-25 (shipped 2026-08-31) — [archive](milestones/v0.3.2-ROADMAP.md)
- ✅ **v0.3.1 多 Session 会话体系** — Phases 18-21 (shipped 2026-08-19, closed 2026-08-24) — [archive](milestones/v0.3.1-ROADMAP.md)
- ✅ **v0.3.0 功能闭环** — Phases 13-17 (shipped 2026-08-17) — [archive](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动** — Phases 5-12 (shipped 2026-08-14) — [archive](milestones/v0.2.0-ROADMAP.md)

## Phases

### v0.3.3 产研半落地 + 工作区入驻(RND-ROLLOUT ①层)

- [ ] **Phase 26: Mock 全清 — tab 接引擎** - 产研各 tab AI 按钮触发真实 engine_run(带 tab 上下文、独立 session、流式进度、候选→HITL→落槽),mock 全删
- [ ] **Phase 27: 工作区文档摄取** - 纯 Rust docx/pdf 文本提取 + 摄取编排(扫描→分类→草稿抽取)+ 批量 HITL + 内容 hash 幂等
- [ ] **Phase 28: 反向创建产品 + 收口** - 从工作区反向创建产品(自动关联源工作区/productId)+ 里程碑 parity 收口与 UAT

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
- [ ] 26-02-PLAN.md — Rust 调度器双队列优先级 + engine_run priority 字段
- [ ] 26-03-PLAN.md — TabRunPanel 共享组件 + 需求 tab 试点端到端
- [ ] 26-04-PLAN.md — 其余 tab + 一键单 run 多步 + mock 全清 + 人工验证

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
**Plans**: TBD

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

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 26. Mock 全清 — tab 接引擎 | 1/4 | In Progress|  |
| 27. 工作区文档摄取 | 0/? | Not started | - |
| 28. 反向创建产品 + 收口 | 0/? | Not started | - |

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

---

*999.1 工作区先行的产品入驻已于 2026-08-31 移入 v0.3.3 正式 scope(Phase 27 文档摄取 + Phase 28 反向创建产品,需求 ING-01..06 / REV-01..02),backlog 条目移除。*
