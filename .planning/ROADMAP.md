# ROADMAP: Nova-PM-Workspace

**Phase numbering:** continues from 32 (v0.3.3 ended at 31; never restart at 01)

## Milestones

- 🚧 **v0.4 紧凑产研版 — coding Agent + 子 Agent + Pipeline + Skill** — Phases 32-35 (active, started 2026-09-04)
- ✅ **v0.3.3 产研半落地 + 工作区入驻** — Phases 26-31 (shipped 2026-09-04, 带债收口: 27 suspended / 28 postponed) — [archive](milestones/v0.3.3-ROADMAP.md)
- ✅ **v0.3.2 Rust Run Engine** — Phases 22-25 (shipped 2026-08-31) — [archive](milestones/v0.3.2-ROADMAP.md)
- ✅ **v0.3.1 多 Session 会话体系** — Phases 18-21 (shipped 2026-08-19, closed 2026-08-24) — [archive](milestones/v0.3.1-ROADMAP.md)
- ✅ **v0.3.0 功能闭环** — Phases 13-17 (shipped 2026-08-17) — [archive](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动** — Phases 5-12 (shipped 2026-08-14) — [archive](milestones/v0.2.0-ROADMAP.md)

## Milestone v0.4 (active)

**Goal:** 让 agent 获得真实代码工作能力(coding 工具 + diff 审批),并以此为地基长出多 Agent 编排(spawn_subagent + pipeline)与领域知识复用(Skill)。
**Requirements:** 24 条(`.planning/REQUIREMENTS.md`,commit 67b5b2c)
**Research base:** `.planning/research/SUMMARY-V0.4.md`
**Granularity:** coarse — 4 phases(用户约束 ≤5;不压缩到 3:spawn 引擎机制与产品形态层 persona/pipeline 耦合后 phase 过大,且 B 与 A 存在并行窗口,拆开利于穿插)
**分工决策规则(2026-09-04 用户讨论裁定):** 三层组合,非三选一 — persona 入口 = 选形态/模型(不是两套 agent);spawn = 管隔离(长/重/专家活,摘要回传);skill = 管标准(SOP 数据化)。不拆两个独立 agent(上下文/记忆割裂,一句话跨域做不了);不全走子 agent(蒸馏有损/延迟,轻活不需要隔离)。

### Phases

- [ ] **Phase 32: coding 工具地基** — code_ops 5 工具 + diff 审批卡 + exec 白名单 + repo 作用域锁;agent 首次能在真实仓库干活
- [ ] **Phase 33: spawn_subagent 引擎机制** — 子 run 生命周期 + 结构化摘要回传 + manifest 存储 + prd-writer 端到端
- [ ] **Phase 34: persona 双入口 + prototype-builder + Pipeline** — coding persona(modelHint)+ 编排 run + 可配置确认门
- [ ] **Phase 35: Skill 系统** — 模板超集一张数据 + FTS5 按需加载 + 沉淀链 + 产研编排统一载体

### Phase Details

#### Phase 32: coding 工具地基
**Goal**: agent 在用户真实仓库中先研究后行动——read/grep 自由侦察,write/edit/exec 每步过门(diff 卡 / exec 白名单),改动可审批、可取消、可沉淀
**Depends on**: Nothing(v0.3.2/v0.3.3 engine 已 shipped)
**Requirements**: ENGINE-01, CODE-01, CODE-02, CODE-03, CODE-04, CODE-05, CODE-06
**Success Criteria**:
  1. coding 5 工具 Rust 原生落地;edit str-replace 走 old_string 唯一性校验,**apply 前重读文件重校验**(CP-3:篡改文件后 apply 必须 Failed 并回带行号)
  2. write/edit 每文件一张 diff 审批卡(kind `code_edit`,hash 域 = {path, old_string, new_string};CP-2:同文件两次 edit → 两 token);前端 diff 视图增删行高亮(react-diff-view 懒加载);confirmed 重放走 Rust `tools::execute`
  3. exec 白名单收口四绕过面(CP-6):env 无 `*KEY*` 泄漏测试、学习粒度 = 命令+首参数二元组、PATH 解析、git 危险 flag 黑名单;未知命令首遇弹「允许一次/总是/拒绝」
  4. repo 作用域锁(CP-7):repo_root ≠ workspace_root 显式边界,junction/Windows 大小写 canonicalize/Nova 自身数据路径三测试通过;崩溃后孤儿 exec 进程恢复清杀 + 审计事件(CP-8)
  5. 长任务可取消、TabRunPanel 显示当前工具与改动文件;diff 卡改动摘要可一键沉淀进第二大脑(复用 knowledge_write 候选流)
**Research needs**(`/gsd:research-phase`): Windows 无 shell 调 npm(.cmd/.bat;exec.rs normalize 只剥 .exe)— MEDIUM
**必避 pitfalls**: CP-2/3/6/7/8 + MP-1(同 turn 变更集聚合卡)/MP-10(grep/read 服务端限流+分页)/MP-11
**Plans**: 5 plans

Plans:
- [ ] 32-01-PLAN.md — CP-4 流程门(事件清单+CI 互锁)+ repo 绑定底座 + dunce 边界三件套
- [ ] 32-02-PLAN.md — exec.rs 四绕过面收口(CP-6)+ pid 落事件 + CP-8 孤儿清杀
- [ ] 32-03-PLAN.md — code_ops 四工具 + code_edit 确认管线 + apply 重校验(CP-3)+ parity fixture
- [ ] 32-04-PLAN.md — 前端 diff 审批卡(第四宿主)+ exec 三选卡 + 沉淀入口
- [ ] 32-05-PLAN.md — TabRunPanel 进度/取消 + repo 绑定 UI + ENGINE-01 prompt 契约

**UI hint**: yes(diff 审批卡第四宿主、TabRunPanel 进度)

#### Phase 33: spawn_subagent 引擎机制
**Goal**: 专家子 run 全链路可用——独立 session 隔离、cancel 级联、引擎确定性摘要回传、manifest-as-data 存储,并以 prd-writer(零新工具依赖)端到端验证
**Depends on**: 无硬依赖(引擎机制与 Phase 32 无耦合,存在并行窗口);prd-writer 可先行验证
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04
**Success Criteria**:
  1. spawn_subagent 工具:子 run = 独立 session(`{parent}/sub/{run_id}`,parent_session_id 列复用);深度 1 不递归;cancel 经 child_token 级联
  2. **cap-3 死锁回归测试**(CP-1):3 并发父各 spawn 子,零死锁(permit 让位 or 子免调度,二选一在 research-phase 裁定)
  3. 摘要回传 = 引擎确定性收集 manifest `{summary, files_changed[], artifacts[]}`,不信子 LLM 自述;子事件永不进父流,父侧只落一对 spawn tool_call/tool_result(CP-5,双流 parity fixture)
  4. 投影层渲染「专家卡」(谁、干什么、结果摘要);子 run HITL 卡挂现有确认队列并带 parent 徽章(MP-3);prd-writer 端到端可用(SUB-03 前半)
**Research needs**(`/gsd:research-phase`): cap-3 死锁方案二选一(permit 让位 vs 子免调度,首个 plan 前必须裁定)— MEDIUM;子 run tray 展示形态 — MEDIUM
**必避 pitfalls**: CP-1/4/5 + MP-2/3/4/5
**Plans**: TBD

#### Phase 34: persona 双入口 + prototype-builder + Pipeline
**Goal**: 产品形态层——聊天助手/coding 双入口 persona(modelHint 分模型),prototype-builder(白名单 = 5 coding 工具),pipeline 编排 run 默认带门、可会话级跳过、断点续跑
**Depends on**: Phase 32(coding 工具)+ Phase 33(spawn 机制)
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05(SUB-02/SUB-03 的产品形态收口在本 phase 落地)
**Success Criteria**:
  1. 双入口 persona:助手/coding(tab-run)两 manifest 同引擎,manifest modelHint 选模型(D-01/02/14);persona 徽章 + 共享会话列表(D-03);prototype-builder 白名单 = 5 coding 工具
  2. 编排 run:顺序 spawn 阶段子 run,阶段产物落 agent_artifacts,断点续走事件日志检查点;TabRunPanel 阶段维度进度
  3. 默认带门:每阶段产物候选 → HITL → 落槽(Phase 16/26/30 语义复用);会话级「跳过后续确认」run 结束失效,且**不可旁路 exec/diff 硬门**(MP-7 写进 ADR);门粒度三档(逐产物/阶段摘要/跳过)落在模板与确认 kind 标注,不上升为架构
  4. 工作流模板一键转 pipeline:同一模板两种跑法(模板 = 单 run 多步 / pipeline = 跨专家多 run 编排),渐进升级
  5. 哲学红线 VERIFICATION 检查项:无门自动编排零残留;模板跳步不报错(刚性 pipeline 禁令)
**Research needs**(`/gsd:research-phase`): 门过期 UX(TTL/重启续跑,MP-6)— MEDIUM;会话级跳过开关的存储粒度 — MEDIUM
**必避 pitfalls**: MP-6/7 + Mi-4(哲学红线)
**Plans**: TBD
**UI hint**: yes(persona 徽章、阶段进度视图、门 UX)

#### Phase 35: Skill 系统
**Goal**: 一张数据三形态——skill = workflow_templates 超集字段;agent 经 FTS5 按需检索加载用户流程;从对话/run 沉淀 skill(确定性链);skill 阶段剧本支撑 pipeline 编排
**Depends on**: 无硬依赖(只碰 prompt 注入与一张表,可与 32/33 并行穿插);SKILL-08(编排统一载体)依赖 Phase 34 pipeline 形态,故排最后收口
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05, SKILL-06, SKILL-07, SKILL-08
**Success Criteria**:
  1. skill = 模板超集字段(manifest + prompt 模板 + 工具白名单 + 触发描述 + 产出卡槽),一张数据两个入口,绝不两套 DSL;内置系统级 skill 只读层 JSON(include_str! 双语言单源);系统级 ∪ 工作区级两级作用域联合过滤
  2. FTS5 按需加载:系统 prompt 只注入 name+description 清单(≤30),skill_search 全文检索命中 CJK 混合管线(替换 append_workflow_list 截断名单)
  3. 沉淀链闭环(零 LLM):事件日志提取 → 草稿 → 确认卡 → 落库;工具白名单从实际 tool_call 种类提取;必过 HITL 全文人工确认(MP-8)
  4. agent 自主检索加载:「按我的竞品分析流程来」→ skill_search 命中 → 按剧本执行(可微调非刚性);skill_injected 审计事件;使用审计可追责(哪次 run 用了哪个版本)+ 产出卡槽声明让产物自动落卡槽不蒸发
  5. 产研编排统一载体:一张数据三形态(用户点跑 = 模板 / agent 检索 = skill / pipeline 阶段 = 剧本)
  6. 端到端 UAT 场景(2026-09-04 用户裁定):「文档拆解 → 任务编排 → 回填任务看板」— skill 作为 SOP 载体跑通全链;若任务看板写工具未在 Phase 29 PM CRUD 覆盖,在此场景带出补齐(工具覆盖缺口,非架构问题)
**Research needs**(`/gsd:research-phase`): workflow_templates 字段上限(何时分表)— HIGH,先合后分无返工风险
**必避 pitfalls**: MP-8/9
**Plans**: TBD
**UI hint**: yes(沉淀入口、skill 检索结果呈现)

### 覆盖校验(24/24)

| Category | Requirements | Phase |
|----------|--------------|-------|
| Engine | ENGINE-01 | 32 |
| Coding | CODE-01..06 | 32 |
| Subagent | SUB-01..04 | 33(SUB-02/03 产品形态在 34 收口,需求归属 33) |
| Pipeline | PIPE-01..05 | 34 |
| Skill | SKILL-01..08 | 35 |

无孤儿、无重复。Out of Scope 项(hashline/xterm/LSP/DAG/全局全自动等)见 REQUIREMENTS.md,不映射。

### 跨 phase 流程门(CP-4,全 phase 首个 plan 必含)

1. 事件 schema 增量文档(code_edit / spawn / pipeline_gate / skill_injected 等新事件种类清单先行)
2. 双侧 parity fixture 同 commit
3. CI 互锁断言(一次建成,后续 phase 继承)

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 32. coding 工具地基 | 0/5 | Not started | - |
| 33. spawn_subagent 引擎机制 | 0/TBD | Not started | - |
| 34. persona + prototype-builder + Pipeline | 0/TBD | Not started | - |
| 35. Skill 系统 | 0/TBD | Not started | - |

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

### Phase 999.2: Skill 系统(PM 领域工作流的沉淀与复用) (BACKLOG)

**Goal:** [Captured for future planning] 把 PM 领域工作流(竞品分析、PRD 生成、需求评审等)打包为可复用 skill:manifest(名称/描述/触发条件) + prompt 模板 + 允许调用的工具集 + 产出物卡槽。系统 prompt 只放 skill 描述,agent 按需经 FTS5 检索加载全文(同构 Claude Code skill 加载机制)。产出走 Phase 16 交付物管线(生成→HITL 确认→编辑→版本化落卡槽)。附带"从对话沉淀为 skill"入口 — 用户用得好的工作流沉淀为 skill,即第二大脑的活知识。
**核心判断:** 不需要新架构 — 是 Phase 15(知识文档 + FTS5)与 Phase 16(交付物管线)的自然组装,增量仅为 skill manifest 类型 + 加载器。v0.2.0 的 `runProductSkill` mock 概念由此转正。Phase 30 已交付模板数据化 + skill 字段预留(999.4 前置)。
**依赖:** Phase 30(skill 字段预留);Phase 15, 16
**建议排期:** v0.4.0 候选(成本低、PM 价值直接)— **归位确认 v0.4.0**(2026-08-24)— **已立项为 v0.4 Phase 35(2026-09-04)**
**Requirements:** SKILL-01..08(v0.4 REQUIREMENTS.md)

### Phase 999.3: MCP 集成(第三方能力扩展) (BACKLOG)

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
**建议排期:** v0.4.0 协同 999.2(2026-08-24)— **主体经 SKILL-01(模板超集,一张数据)进入 v0.4 Phase 35(2026-09-04)**
**Requirements:** TBD

### Phase 999.5: 双 Agent 架构 — 日常助手 + 产研 coding Agent (BACKLOG)

**Goal:** [Captured for future planning] Agent Loop 与 harness 演进:评估借鉴 Oh my pi 的相关设计,设计两块 Agent — ① 日常 AI 助手(日程分发、任务管理、轻量级日常工作处理);② 产研中心 coding Agent(偏向真实代码工作)。与 ADR-0004(subagent-as-tool)及现有 Rust run engine(src-tauri/src/engine/)的关系待讨论裁定。
**讨论已完成 2026-08-31**:裁定 D-01..D-14 见 `.planning/phases/999.5-dual-agent-architecture/999.5-CONTEXT.md` — 双入口 persona + spawn 互通;sidecar 否决(语义移植 + crates 评估);助手②档自主性(触发→本地零-LLM 检查→条件升级);三档 HITL 风险档案(三档已于 Phase 29 落地);omp 借鉴清单全盘确认。归位 v0.4 系,promote 时随 v0.4 立项带入(另带入:omp crates vendoring 评估 research 任务)。
**Requirements:** TBD — **已立项分解为 v0.4 Phases 32/33/34(2026-09-04;omp vendoring 研究终裁 = 零 crate,见 SUMMARY-V0.4)**
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd:review-backlog when ready)

---

*999.1 工作区先行的产品入驻已于 2026-08-31 移入 v0.3.3 正式 scope(Phase 27 文档摄取 + Phase 28 反向创建产品);Phase 28(REV-01/02)顺延未实施,见 v0.3.3 归档 Known Gaps。*

*999.6 PM CRUD 工具原生化已于 2026-09-02 promote 为 **Phase 29** 并于 v0.3.3 交付,backlog 条目移除。*

*Phase 30(参考模板数据化 + 工作流用户自组织)取材 999.4 + 999.2,已于 v0.3.3 交付(catalog 单源 JSON + workflow_ 工具族 + 「工作流」视图 + 确定性沉淀链)。产品哲学约束:工作流用户自组织,Nova 只提供参考+模板,严禁刚性 pipeline 设计。*

---
*Last updated: 2026-09-04 — v0.4 roadmap created(4 phases, 32-35, 24/24 需求覆盖)*
