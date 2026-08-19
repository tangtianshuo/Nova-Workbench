# ROADMAP: Nova-PM-Workspace

**Current milestone:** v0.3.1 多 Session 会话体系
**Phase numbering:** continues from 18 (never restart at 01)

## Milestones

- 🚀 **v0.3.1 多 Session 会话体系** — Phases 18-21 (started 2026-08-18)
- ✅ **v0.3.0 功能闭环** — Phases 13-17 (shipped 2026-08-17) — [archive](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动** — Phases 5-12 (shipped 2026-08-14) — [archive](milestones/v0.2.0-ROADMAP.md)

## Phases

- [x] **Phase 18: Session 数据模型与底座** — sessions 元数据表(migration 0007 + 回填)+ 事件 workspaceId scope + sessionRepo
 (completed 2026-08-18)
- [x] **Phase 19: 多 Session 运行时** — activeSessionId / switchSession 生命周期 / 默认新 session / streaming 锁 / pending 卡片按 session 过滤
 (completed 2026-08-18)
- [x] **Phase 20: 分支与卡片操作** — buildForkEventStream 纯函数(先测试)+ hover 分支/复制 + 分支徽章
 (completed 2026-08-18)
- [ ] **Phase 21: Session 列表与快捷入口 + 自动命名** — 最近任务真实列表 + Ctrl+Shift+K 双下拉 + LLM 自动标题

## Phase Details

### Phase 18: Session 数据模型与底座
**Goal**: session 成为有持久元数据的一等实体,旧数据无损升级 — 一切多 session 能力的数据基础
**Depends on**: v0.3.0 已 shipped(Phase 13-17)
**Requirements**: SESS-01, SESS-06
**Success Criteria** (what must be TRUE):
  1. 用户从 v0.3.0 数据库升级后,全部历史会话仍可见且事件完整(fixture DB 升级测试,幂等回填不重复不丢失)
  2. sessions 表记录每个会话的 workspace_id/title/parent_session_id/fork_cut_seq,历史会话均被回填
  3. agent_events 每条新事件记录 workspaceId,历史事件已回填(列表过滤的数据基础)
  4. 所有确认候选落库时带 sessionId(confirmations.ts sessionId:null 缺失修复)
**Plans**: 2 plans
Plans:
- [x] 18-01-PLAN.md — migration 0007(sessions 表 + 幂等回填 + workspace_id 回填)+ fixture-DB 升级测试先行
- [x] 18-02-PLAN.md — 写入时 stamping(toolLoop workspaceId / confirmations sessionId)+ sessionRepo + turn-start upsert

### Phase 19: 多 Session 运行时
**Goal**: 用户可以在多个 session 之间安全切换,会话历史逐字恢复,流式中不串话
**Depends on**: Phase 18
**Requirements**: SESS-02, SESS-03, SESS-04, SESS-05
**Success Criteria** (what must be TRUE):
  1. 用户进入应用即处于新 session,工作区为上次退出时选择的工作区(activeWorkspaceId 持久化)
  2. 用户切换 session 后,该会话完整历史投影恢复,与原会话逐字一致(restoreSession(sessionId?),不依赖 sessions[0])
  3. streaming 进行中,session 切换与工作区切换入口被禁用且守卫兜底(不产生跨会话事件串流)
  4. 知识写入/删除确认/PRD 草稿等 pending 卡片只出现在其所属 session,不跨会话串卡
**Plans**: 3 plans
Plans:
- [x] 19-01-PLAN.md — restoreSession(sessionId?) 参数化(P-B 移除)+ 逐字恢复/隔离测试
- [x] 19-02-PLAN.md — activeSessionId / startNewSession / switchSession + streaming 双守卫(store 兜底)
- [x] 19-03-PLAN.md — pending 卡片四类读取路径按 session 过滤 + 切换刷新

### Phase 20: 分支与卡片操作
**Goal**: 用户可以从任意 assistant 消息创建引用式分支并一键复制消息 — 最高风险纯逻辑(buildForkEventStream)先于 UI 隔离交付
**Depends on**: Phase 18, Phase 19
**Requirements**: FORK-01, FORK-02, FORK-03, LIST-03
**Success Criteria** (what must be TRUE):
  1. 用户 hover assistant 消息卡片时,卡片下方浮出分支 icon 与复制 icon
  2. 用户点击分支 icon 后,以该 turn 的 turn_ended 为切点创建新 session(parent 事件前缀投影 + 零事件复制,seq 归一化 + compaction remap),UI 跳转新 session,原会话保持不动
  3. 用户点击复制 icon 后,该 assistant 消息全文进入系统剪贴板(失败 toast,不静默)
  4. 分支 session 在列表中显示分支徽章,可识别来源会话
  5. fork 纯函数测试先行:配对不变量保持、压缩事件 remap、replay parity、mid-turn 切点拒绝
**Plans**: TBD
**UI hint**: yes

### Phase 21: Session 列表与快捷入口 + 自动命名
**Goal**: 用户通过 Agent 页列表与 Ctrl+Shift+K 双下拉即可到达任意会话,标题自动生成无需手动管理
**Depends on**: Phase 19(选择器/列表运行时);分支徽章依赖 Phase 20
**Requirements**: LIST-01, LIST-02, QUICK-01, QUICK-02, QUICK-03, TITLE-01, TITLE-02
**Success Criteria** (what must be TRUE):
  1. Agent 页「最近任务」显示真实 session 列表(标题 + 相对时间 + 消息数),按当前工作区过滤、最近活动倒序
  2. 用户点击列表项即恢复该 session 到对话区
  3. Ctrl+Shift+K 的 ChatPanel 头部有工作区 + session 两个下拉,工作区切换后 session 下拉联动过滤;Ctrl+K 保持无选择器的纯净快速对话
  4. session 首个 turn 完成后 LLM 自动生成标题(fire-and-forget),失败回退首条用户消息截断
  5. 标题异步生成后静默更新列表,按 sessionId 守卫不写错会话,不打断用户
**Plans**: 3 plans
Plans:
- [x] 21-01-PLAN.md — 数据层:消息数聚合 SQL + title IS NULL 守卫 updateTitle + formatRelativeTime
- [x] 21-02-PLAN.md — LLM 自动命名:titleGenerator(LLM+回退)+ submit finally 触发 + sessionListVersion
- [ ] 21-03-PLAN.md — UI:最近任务真实列表 + ChatPanel 双下拉(scoped/pure)+ 快捷键分流 + UAT
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 18. Session 数据模型与底座 | 2/2 | Complete    | 2026-08-18 |
| 19. 多 Session 运行时 | 3/3 | Complete    | 2026-08-18 |
| 20. 分支与卡片操作 | 2/2 | Complete    | 2026-08-18 |
| 21. Session 列表与快捷入口 + 自动命名 | 2/3 | In Progress|  |

## Coverage

16/16 v1 requirements mapped (SESS-01..06, LIST-01..03, FORK-01..03, QUICK-01..03, TITLE-01..02) — no orphans, no duplicates.

## Research Flags

- Phase 18: `/gsd:research-phase` — migration 0007 原子性(tauri-plugin-sql)+ fixture-DB 升级测试方案(PITFALLS P-A)
- Phase 20: `/gsd:research-phase` — buildForkEventStream seq 归一化 + compaction remap 规则精确编码(PITFALLS P-C)
- Phase 19: 标准模式(全部可追溯到既有代码),跳过 research
- Phase 21: 标准模式(既有 Select 原语 / llm.rs 路径),跳过 research

## Backlog (candidate phases — promote with `/gsd:review-backlog`)

### Phase 999.1: 工作区先行的产品入驻（文档 → 产品 → AI 摄取） (BACKLOG)

**Goal:** [Captured for future planning] 用户已有 PRD 等产品文档,以工作区(本地文件夹)为起点入驻:从工作区派生产品(反向创建 + 自动关联 projectId),AI 摄取文档 → 分类进知识库 → 抽取任务/日程草稿 → 批量 HITL 确认。这是 v0.3.0 三个技术投资(事件日志/FTS5/记忆)的用户可见收口叙事。
**依赖:** Phase 13-15(事件日志 + toolLoop 底座、FTS5 + 记忆)— 已全部落地,可排期
**已知缺口:**
1. 文档摄取 — docx/pdf → 文本解析(Rust 侧,零 sidecar),当前仅有文件列表 + 手工 contentSnippet
2. 摄取编排 — 扫描工作区 → 逐文档分类 → 抽取任务/日程草稿 → 批量 HITL 确认的 pipeline(执行器 `ai/tools/` 的 task/schedule/knowledgeWrite 已就绪)
3. 反向创建入口 — "从工作区创建产品"向导(读文件夹 → AI 猜产品名/定位 → 建产品 + 自动挂 projectId)
**Requirements:** TBD
**Plans:** 2/3 plans executed

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
