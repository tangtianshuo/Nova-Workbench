# Phase 30: 参考模板数据化 + 工作流用户自组织 - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

交付物目录与模板数据化(内置 JSON 只读层 + SQLite 用户扩展层),在此之上交付「工作流用户自组织」:侧边栏顶层「工作流」视图(模板库 + 运行入口)、模板可执行(单 run 多步、逐步 HITL)、agent 对话创建/修改模板、从对话/run 沉淀为模板。

边界:不做 agent 自主检索加载模板(skill 触发,v0.4);不做模板表单编辑器;product 关系化与 CRUD 工具推迟 v0.4;不引入工作流引擎(GraphFlow 类已否决);不做刚性 pipeline——模板是参考剧本,非强制流程。

</domain>

<decisions>
## Implementation Decisions

### 数据化(999.4 取材)
- **D-01:** 两层数据形态——内置默认目录(18 交付物 catalog + 内置参考模板)打包为 JSON 只读层,换垂类只换文件(999.4 隔离投资保留);用户在 app 内增删的交付物种类/模板存 SQLite 用户层。Nova 给参考,用户自组织扩展
- **D-02:** 数据层抽离(catalog + prompt 模板 + 参考工作流 → JSON),view 不动——六产研 tab 仍按现有结构渲染,只从数据层读 catalog 而非硬编码。**view 全数据驱动明确否决**:tab 列表数据化便宜,但 tab 内容(雷达图/看板/user story 编辑器)是特化组件不可由配置生成;不做第二垂类前该层无收益
- **D-03:** 能力/入口/浏览解耦——六类 Agent 生成能力已在引擎工具层(Phase 26),tab 退化为浏览+手动入口;生成入口三等价(tab 按钮 / 对话 / 模板发起),灵活性来自解耦而非改 tab

### 工作流自组织
- **D-04:** 「工作流」= **侧边栏顶层入口**(与任务/日程/知识库平级),不是产研中心第 7 tab——工作流是跨域能力(29 写路径后可组任务/日程/知识),不限产研六类。视图含:模板库列表(内置参考 + 用户自建)+ 运行中的模板 run(TabRunPanel 复用)
- **D-05:** 执行语义 = **单 run 多步,逐步 HITL**(一键十八份先例):模板步骤拼入一次 run,agent 按步执行,每步产物走候选→HITL→版本化落槽。模板是参考剧本,agent 可按上下文微调步骤(非刚性);「帮我跑 X」一句话发起,不做逐步手动触发(确认地狱,999.5 原文反对)
- **D-06:** 创建/修改 = **agent 对话为主**(「建个周末扫描工作流」→ 29 写路径落库);模板库页辅以复制/改名/删除(删除走确认卡)。**不做表单编辑器**——用户描述意图,agent 干活
- **D-07:** 沉淀入口进 30:对刚跑完的对话/run 说「把这次沉淀成模板」→ agent 从事件日志提取步骤(tool_call 序列 + prompt)→ 模板草稿 → 确认卡 → 落库(999.2「用得好的工作流变活知识」)

### Skill 与排期
- **D-08:** 30 交付工作流模板(用户主动跑);agent 自主检索加载(系统 prompt 只放描述 + FTS5 按需取全文 + 触发条件字段)推 **v0.4**。模板格式设计时**预留 skill 字段兼容**(manifest 结构),避免两套模板 DSL(999.4 协同原则)

### 范围裁定
- **D-09:** product 关系化 + product CRUD 工具**继续推迟 v0.4**——30 体量已足,product 嵌套迁移(documents/skills/milestones)是独立大件,模板能力不依赖它

### Claude's Discretion
- 内置参考模板的具体清单(如竞品分析 N 步、PRD 起草、周报汇总——从 PM 常用工作流选 3-5 个,质量优先)
- 模板数据结构细节(步骤 schema、参数化支持程度——建议先无参数纯步骤序列)
- 模板 run 内写操作与 29 三档风险/cap-5 的衔接(模板不豁免风险分级,具体规则 plan 层定)
- 工作流视图信息架构细节(布局、运行历史展示深度)
- 沉淀提取的实现方式(事件日志 → 步骤草稿的映射规则)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 路线与架构
- `research/RND-ROLLOUT-V0.3-V0.4.md` — 产研落地路线真相源(v0.3 ①层/v0.4 ②层划分)
- `docs/adr/ADR-0003-rust-run-engine.md` — 引擎架构(模板 run 跑在引擎上,协议不动)
- `docs/ARCHITECTURE.md` — 架构真相源 v2.0

### Phase 上下文(直接前置)
- `.planning/phases/29-pm-crud/29-CONTEXT.md` — 三档风险分级(D-12 直译)、写路径、cap-5 护栏——模板执行/创建完全复用
- `.planning/phases/26-tab-engine/26-CONTEXT.md`(若在 phases 目录;否则见 git history)— 单 run 多步先例、TabRunPanel、deliverable slot 投影

### 代码对象
- `src/data/mockRndData.ts:414` — FULL_LIFECYCLE_DELIVERABLES_CATALOG(数据化对象)
- `src-tauri/src/engine/tools.rs` — generate_deliverable(18 codes 双侧)、工具注册模式
- `src/stores/tabRunStore.ts` + TabRunPanel 组件 — 通用 run 面板复用

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generate_deliverable` 引擎工具(18 catalog codes,TS+Rust 双侧,26-04)— 模板步骤直接以 code 指定产物
- `TabRunPanel` + `tabRunStore`(Phase 26)— 通用 run 进度/事件流/取消面板,kind 任意,工作流视图直接复用
- `knowledge_docs` 版本化卡槽 + FTS5(Phase 15/16)— 模板产物落槽管线完整
- 29 写路径:`task_*/schedule_*` 工具 + 三档风险 + cap-5 + `pm_write` HITL — 模板的跨域写步骤(建任务/日程)直接可用
- 候选去重(params_hash)+ 事件日志审计 — 模板 run 可审计可恢复

### Established Patterns
- 单 run 多步(一键十八份,26-04)— 模板执行语义先例
- 候选→HITL→版本化落槽(PRD 生产线,Phase 16)— 步骤产物确认模式
- replay-parity 双侧 fixture — 新事件种类/确认 kind 若引入需双侧锁
- migration 前向序列(0013 起);meta latch 幂等先例(29-01)

### Integration Points
- `mockRndData.ts` catalog → JSON 数据文件 + 加载层(rndStore/工具两侧读)
- 侧边栏 `MENU_ITEMS`(`src/components/layout/Sidebar.tsx`)加「工作流」顶层入口
- `engine_run` 经 Channel — 模板 run 与 26 tab-run 同构接线
- 事件驱动 refresh(29-04)— 模板写步骤后的视图刷新已就绪

</code_context>

<specifics>
## Specific Ideas

- **产品哲学硬约束**(用户记忆,2026-09-02):工作流用户自组织,Nova 只给参考+模板,严禁刚性 pipeline 设计——所有模板 UX 设计必须过这条线(模板=参考剧本,agent 可微调,用户可改/弃)
- 「帮我安排今天」不能变成确认地狱(999.5 specifics 原文)——模板运行的摩擦控制是产品体验要求
- 工作流定位是跨域能力(任务/日程/知识/产研皆可组),不是产研子功能——用户明确选择顶层入口而非产研第 7 tab

</specifics>

<deferred>
## Deferred Ideas

- **agent 自主检索加载模板(skill 触发条件 + FTS5 按需加载 + 系统 prompt 描述注入)** — v0.4(999.2 归位;30 已预留格式兼容)
- **product 关系化 + product CRUD 工具** — v0.4(29-CONTEXT deferred 再议,本次裁定继续推迟)
- **模板表单编辑器** — 否决(哲学:agent 对话创建;若对话创建覆盖不了细分需求再议)
- **view 全数据驱动(tab 内容配置化)** — 否决(特化组件不可配置生成;换垂类需求出现时再议)
- **逐步手动触发模板** — 否决(确认地狱;单 run 多步 + 逐步 HITL 已可控)
- **模板参数化**(变量/表单填充)— 30 建议先无参数纯步骤序列,需求出现再加

</deferred>
