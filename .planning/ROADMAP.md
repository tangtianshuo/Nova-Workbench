# ROADMAP: Nova-PM-Workspace

**Current milestone:** v0.3.2 Rust Run Engine(agent 核心迁 Rust)
**Phase numbering:** continues from 22 (v0.3.1 ended at 21; never restart at 01)

## Milestones

- 🚀 **v0.3.2 Rust Run Engine** — Phases 22-25 (started 2026-08-23)
- ✅ **v0.3.1 多 Session 会话体系** — Phases 18-21 (2026-08-18/19, VERIFICATION 全 PASS) — [archive](milestones/v0.3.1-ROADMAP.md)
- ✅ **v0.3.0 功能闭环** — Phases 13-17 (shipped 2026-08-17) — [archive](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动** — Phases 5-12 (shipped 2026-08-14) — [archive](milestones/v0.2.0-ROADMAP.md)

**前置说明(非本里程碑 phase):** v0.3.1 已收口(2026-08-24:3 项人工 UAT Playwright 结构验证 + 用户接受,milestone closed + tag v0.3.1)— Phase 22 无阻塞。

## Phases

- [ ] **Phase 22: 引擎核心(loop 语义移植 + 事件唯一写者 + replay parity)** — toolLoop/compaction/contextAssembler 语义移植 Rust,Rust 接管 agent_* 表唯一写者,单 run 打通现有 ChatPanel,验收 = 事件日志逐位回放平价;PORT-01 协议最先定稿
- [ ] **Phase 23: 工具层 + TS 工具桥** — Rust 工具注册表 + 首批 exec/fs/knowledge/deliverable 工具 + PM CRUD TS 工具桥 + 无头 run 工具降级
- [ ] **Phase 24: 多 run 并行 + 后台运行(托盘)** — 调度器(spawn/await/cancel/并发上限)+ hide-on-close 托盘常驻 + 后台角标与通知
- [ ] **Phase 25: 迁移收口** — TS toolLoop 下线、双引擎代码删除、ADR-0003 转 Accepted、ARCHITECTURE.md/CLAUDE.md 同步

## Phase Details

### Phase 22: 引擎核心(loop 语义移植 + 事件唯一写者 + replay parity)
**Goal**: 用户在现有 ChatPanel 发起对话,整轮 agent loop 由 Rust 常驻引擎完成,行为与 TS 引擎逐位一致 — 后续一切能力的地基
**Depends on**: v0.3.1 收口完成(3 项人工 UAT + complete-milestone)
**Requirements**: ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, PORT-01
**Success Criteria** (what must be TRUE):
  1. PORT-01 协议在此 phase 第一个 plan 定稿:孤儿 exec tool_result 呈 unknown/interrupted(非 error)、命令幂等分类随 tool_call 落盘、模型 unknown 先验证再重跑的约定写入工具描述
  2. 用户在现有 ChatPanel 发起对话,Rust 引擎完成意图→工具调用→配对落库→流式回复,全程不经 TS toolLoop(ENG-01)
  3. Rust 是 agent_events/agent_artifacts/agent_confirmation_candidates/memory_candidates 唯一写者;TS 写路径下线后重启,无孤儿事件、无重复写入(ENG-02)
  4. replay parity 永久测试通过:Rust 引擎逐位回放 v0.3.x 存量事件日志(fixture 复用),ChatSession 投影与 TS 引擎输出一致(ENG-03)
  5. HITL 卡片确认/取消/编辑跨边界语义与现状一致,原子条件 UPDATE 消费保持(并发恰一成功);崩溃恢复(尾切 + 孤儿 tool_call interrupted 绝不重执行)行为与 v0.3.x 一致(ENG-04/05)
**Plans**: 7 plans
Plans:
- [ ] 22-01-PLAN.md — PORT-01 协议定稿 + Wave 0 基建(依赖/DB probe/fixture 金样本)
- [ ] 22-02-PLAN.md — 算法基石逐位复刻(tokenEstimate/ftsTokens/paramsHash)
- [ ] 22-03-PLAN.md — event_log(append/invariants/artifacts/事务)+ confirmations(原子 UPDATE)
- [ ] 22-04-PLAN.md — chat_session 投影 + compaction + fork + 投影 fixture
- [ ] 22-05-PLAN.md — context_assembler + 最小工具集 + loop_runner + EngineEvent
- [ ] 22-06-PLAN.md — engine_* 接线切换 + restore 崩溃恢复 + runToolLoop 归零
- [ ] 22-07-PLAN.md — parity 永久测试(双侧 fixture + 真实 DB 抽样)
**Research**: 建议先 `/gsd:research-phase` — toolLoop/compaction/contextAssembler 语义移植跨 Rust/TS 边界,TS 纯函数 + 217 测试为可执行规格,需先精确编码映射

### Phase 23: 工具层 + TS 工具桥
**Goal**: Rust 引擎可调用首批原生工具(exec/fs/knowledge/deliverable),PM CRUD 经 TS 桥过渡,无头 run 明确降级
**Depends on**: Phase 22(引擎 loop + 事件写者)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04
**Success Criteria** (what must be TRUE):
  1. Rust 工具注册表(静态注册 + schema)落地,exec / fs 读写 / knowledge 检索 / deliverable 生成四类工具可被引擎调用(TOOL-01)
  2. exec 工具具备进程组清理、超时、取消、stdout/stderr 流式回传;白名单外命令触发 HITL 确认(TOOL-02)
  3. PM CRUD 工具(任务/日程/知识写入等)经 TS 工具桥调用,webview 存活时行为与现状一致(TOOL-03)
  4. webview 不可用的无头 run 只暴露 Rust 原生工具,模型可感知工具可用性差异并明确降级(TOOL-04)
**Plans**: TBD
**Research**: 建议先 `/gsd:research-phase` — exec 进程管理模式借 omp 设计(进程组/超时/取消/流式,跨平台含 Windows)+ TS 工具桥 IPC 回调机制,值得先研究

### Phase 24: 多 run 并行 + 后台运行(托盘)
**Goal**: 用户可以多 session 并行跑 agent、关窗后 run 继续、后台完成有通知 — Rust 常驻引擎的核心收益兑现
**Depends on**: Phase 22(引擎), Phase 23(工具集,无头后台 run 依赖 Rust 原生工具)
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04
**Success Criteria** (what must be TRUE):
  1. 用户在两个 session 同时发起对话,两个 run 并行流式输出,事件与确认卡片互不串扰(SCHED-01)
  2. 用户关闭窗口(hide-on-close + 托盘常驻)后 run 继续执行;重开窗口时运行中状态与历史投影完整一致(SCHED-02)
  3. 后台 run 完成或等待确认时,用户收到托盘通知/角标,可一键回到对应 session(SCHED-03)
  4. 用户可取消运行中的 run(含后台 run),取消后子进程清理、事件日志状态一致(SCHED-04)
**Plans**: TBD
**UI hint**: yes(托盘/角标/通知为前端可见交互)

### Phase 25: 迁移收口
**Goal**: 双引擎并存窗口关闭 — TS loop 下线,架构文档与决策记录对齐新现实
**Depends on**: Phase 22, 23, 24
**Requirements**: PORT-02, PORT-03
**Success Criteria** (what must be TRUE):
  1. TS toolLoop 与双引擎并存代码删除,全量测试通过;agent 语义回归(对话/工具/HITL/恢复/压缩)无退化(PORT-02)
  2. ADR-0003 状态转 Accepted;ARCHITECTURE.md 更新为引擎分层;CLAUDE.md 同步(PORT-03)
  3. 里程碑级人工 UAT:多 run 并行 + 后台托盘 + HITL 跨边界 + 崩溃恢复全链路通过
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 22. 引擎核心 | 0/7 | Not started | - |
| 23. 工具层 + TS 工具桥 | 0/? | Not started | - |
| 24. 多 run 并行 + 后台运行 | 0/? | Not started | - |
| 25. 迁移收口 | 0/? | Not started | - |

## Coverage

16/16 v1 requirements mapped (ENG-01..05, TOOL-01..04, SCHED-01..04, PORT-01..03) — no orphans, no duplicates.

- ENG-01..05 + PORT-01 → Phase 22(PORT-01 是引擎动手前的协议决策,锁在最先 plan)
- TOOL-01..04 → Phase 23
- SCHED-01..04 → Phase 24
- PORT-02, PORT-03 → Phase 25

## Research Flags

- Phase 22: `/gsd:research-phase` 强烈建议 — loop/compaction/assembler 语义移植 + replay parity 方案(TS 测试 = 可执行规格,fixture 复用)
- Phase 23: `/gsd:research-phase` 建议 — omp exec 模式移植(进程组/超时/取消/流式,Windows 兼容)+ TS 工具桥 IPC 设计
- Phase 24: 标准模式(调度器为自写 tokio,数百行,结构清晰;托盘 Tauri 插件),除非 Phase 22/23 研究发现新风险
- Phase 25: 标准模式(删除 + 文档收口)

## Backlog (candidate phases — promote with `/gsd:review-backlog`)

### Phase 999.1: 工作区先行的产品入驻（文档 → 产品 → AI 摄取） (BACKLOG)

**Goal:** [Captured for future planning] 用户已有 PRD 等产品文档,以工作区(本地文件夹)为起点入驻:从工作区派生产品(反向创建 + 自动关联 projectId),AI 摄取文档 → 分类进知识库 → 抽取任务/日程草稿 → 批量 HITL 确认。这是 v0.3.0 三个技术投资(事件日志/FTS5/记忆)的用户可见收口叙事。
**依赖:** Phase 13-15(事件日志 + toolLoop 底座、FTS5 + 记忆)— 已全部落地,可排期
**已知缺口:**
1. 文档摄取 — docx/pdf → 文本解析(Rust 侧,零 sidecar),当前仅有文件列表 + 手工 contentSnippet
2. 摄取编排 — 扫描工作区 → 逐文档分类 → 抽取任务/日程草稿 → 批量 HITL 确认的 pipeline(执行器 `ai/tools/` 的 task/schedule/knowledgeWrite 已就绪)
3. 反向创建入口 — "从工作区创建产品"向导(读文件夹 → AI 猜产品名/定位 → 建产品 + 自动挂 projectId)
**Requirements:** TBD
**Plans:** 3/3 plans complete
**归位(2026-08-24):** v0.3.3 — plans 需按 Rust 引擎校准后执行;见 `research/RND-ROLLOUT-V0.3-V0.4.md`

### Phase 999.2: Skill 系统（PM 领域工作流的沉淀与复用） (BACKLOG)

**Goal:** [Captured for future planning] 把 PM 领域工作流(竞品分析、PRD 生成、需求评审等)打包为可复用 skill:manifest(名称/描述/触发条件) + prompt 模板 + 允许调用的工具集 + 产出物卡槽。系统 prompt 只放 skill 描述,agent 按需经 FTS5 检索加载全文(同构 Claude Code skill 加载机制)。产出走 Phase 16 交付物管线(生成→HITL 确认→编辑→版本化落卡槽)。附带"从对话沉淀为 skill"入口 — 用户用得好的工作流沉淀为 skill,即第二大脑的活知识。
**核心判断:** 不需要新架构 — 是 Phase 15(知识文档 + FTS5)与 Phase 16(交付物管线)的自然组装,增量仅为 skill manifest 类型 + 加载器。v0.2.0 的 `runProductSkill` mock 概念由此转正。
**依赖:** Phase 15, 16 — 已全部落地;v0.3.2 后 Skill 可作为 Rust 引擎新入口直接接入
**建议排期:** v0.4.0 候选(成本低、PM 价值直接)— **归位确认 v0.4.0**(2026-08-24,与 999.4 协同)
**Requirements:** TBD
**Plans:** 0 plans

### Phase 999.3: MCP 集成（第三方能力扩展） (BACKLOG)

**Goal:** [Captured for future planning] 接入 MCP 让 agent 操作外部 PM 工具链(Figma、飞书、Jira 等),无需 Nova 逐个自建集成。
**技术路线:** v0.3.2 后为 Rust 侧 `rmcp` crate 做 MCP client,工具 schema 桥接进 **Rust 工具注册表**(Phase 23 落地)成为动态工具。
**三个前置条件:**
1. 审计底座(Phase 13/14)— 每次外部调用落入 `agent_events`,可追责可恢复;无事件日志不接 MCP — **已满足**
2. 审批分级 — MCP 工具为外部代码,默认"外部写入一律 HITL 确认",内置工具才可按风险白名单
3. Rust 工具注册表落地(v0.3.2 Phase 23)— **本里程碑交付**
**依赖:** Phase 23(v0.3.2)
**建议排期:** v0.4.0+(REQUIREMENTS v2 ENTRY-02)— **归位推迟 v0.5+**(2026-08-24)
**Requirements:** TBD
**Plans:** 0 plans

### Phase 999.4: 垂类扩展隔离 — 交付物目录与 pipeline 模板数据化 (BACKLOG)

**Goal:** [Captured for future planning] 把 PM 领域层(productStore/rndStore、`FULL_LIFECYCLE_DELIVERABLES_CATALOG` 18 种 PM 交付物硬编码在 `mockRndData.ts`、需求→PRD→原型→代码→测试 pipeline、各 view 信息架构)从代码/类型抽成**数据驱动**:交付物目录与 pipeline 模板改为配置/模板文件,view 按目录渲染。
**核心判断:** 不泛化产品 — v1 垂类聚焦(PM)是护城河。只做"留门不盖房"的隔离:换垂类时只需换一份配置 + view 文案,Agent 骨架不动。
**与 skill 系统(999.2)的关系:** pipeline 模板数据化后,skill manifest 可直接引用同一套模板格式,二者应协同设计避免两套模板 DSL。
**预估成本:** 隔离动作本身约一两天。
**建议排期:** v0.4.0 前后的技术投资,或与 999.2 同期 — **归位确认与 999.2 同期 v0.4.0**(2026-08-24)
**Requirements:** TBD
**Plans:** 0 plans
