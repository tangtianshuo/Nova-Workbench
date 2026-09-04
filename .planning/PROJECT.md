# Nova-PM-Workspace

## What This Is

Nova 是一个 **AI native 的产品经理桌面工作台**,基于 Tauri v2 + React 19。v0.1.0 交付 PM 视图框架 + 设计系统 + Rust 原生底座;v0.2.0 交付任务/日程 CRUD、跨模块弱关联、Markdown WYSIWYG、AI 助手全链路;v0.3.0 功能闭环(2026-08-17):以「事件日志 + 增强 tool loop + SQLite FTS5」为架构真相源,agent 成为有记忆、可恢复、可追责的一等执行者;v0.3.1 多 Session 会话体系(2026-08-19);v0.3.2 Rust Run Engine(2026-08-31):agent 运行时整体迁入 Rust 常驻引擎,webview 退化为投影 + HITL UI;**v0.3.3 产研半落地 + 工作区入驻已 shipped(2026-09-04,带债收口)**:mock 全清接引擎、agent 真实写路径(PM CRUD 三档风险)、工作流用户自组织(模板数据化 + 「工作流」视图)、文档工作区(Milkdown + 右侧常驻面板)、纯 Rust 文档摄取(3/4 挂起)。

## Core Value

让产品经理拥有一个**懂你、能替你干活**的桌面 AI Agent —— 不是 chatbot,而是能跑 Pipeline(需求→PRD→原型→代码→测试)、有第二大脑、关键节点 HITL 的真 Agent。

## Current Milestone: 无(v0.3.3 已 shipped 2026-09-04,下一个里程碑经 `/gsd:new-milestone` 定义)

**v0.4 候选方向**(用户 2026-09-02 定):coding 5 工具 + diff 审批、spawn_subagent(ADR-0004)、pipeline 编排 run + 确认门、Skill(999.2 + 999.4 剩余);v0.5+ 池:MCP(999.3)、IM 入口、hashline、向量 P2。**携带债务**:Phase 27 UAT 回归(`--gaps-only` 可恢复)、REV-01/02 反向创建、cap-5 resume 计数 — 详见 `milestones/v0.3.3-ROADMAP.md` Known Gaps。

## Current State (after v0.3.3)

**v0.3.3 产研半落地 + 工作区入驻 shipped 2026-09-04(带债收口)** — 6 phases (26-31), 25 plans(24 complete), 169 commits, 5 天。验证:各 phase VERIFICATION + 真机 UAT(29 8/8、30 8/8 + 13/13、31 9/9 三轮复测)+ 234 TS tests + replay parity 保持;无独立 audit(用户裁定)。

- **Mock 全清 + tab 接引擎**(Phase 26):产研各 tab AI 按钮接真实 `engine_run`(独立 session、流式/取消/审计),knowledge_docs 唯一真相源,调度双队列,一键十八份 = 单 run 多步
- **PM CRUD 工具原生化**(Phase 29):9 个 task/schedule 引擎工具 + 三档风险(读/轻写免确认,delete+cap-5 走 pm_write HITL);关系表 migration 0012 + kv 幂等搬移;SQL 单真相源
- **工作流用户自组织**(Phase 30):catalog 单源 JSON(TS+Rust 同读)、workflow_templates + 4 工具、「工作流」视图 + 5 内置模板、确定性沉淀链(零 LLM);产品哲学红线(严禁刚性 pipeline)贯穿
- **文档工作区**(Phase 31):Milkdown core headless 全量替换 MDXEditor(自建 toolbar + codeBlock NodeView/prismjs 高亮 + 表格行列操作),右侧常驻面板(多 tab/自动保存/禅模式/60vw),⌘K 左滑并存,doc_kind=note 笔记 + FTS5,确认卡第三宿主
- **文档摄取 3/4 挂起**(Phase 27):纯 Rust 提取 + 批量 HITL 后端 + 前端流已交付;UAT-2 修复已提交,UAT-2..7 回归待恢复(`--gaps-only`)
- **已知债务**:REV-01/02(Phase 28 顺延)、REQUIREMENTS 未登记 PM/WF/DOC 需求(流程债)、cap-5 resume 重置、22-UAT Test 7 补验、CSP null 等结转(完整清单见 `milestones/v0.3.3-ROADMAP.md`)

## Current State (after v0.3.2)

**v0.3.2 Rust Run Engine shipped 2026-08-31** — 4 phases (22-25), 21 plans(含 22-08/09/10 三轮 UAT gap closure), 114 commits, 16/16 需求, milestone audit passed(16/16 需求、6/6 集成、6/6 E2E)。TS toolLoop/compaction/contextAssembler 已删除(-1371 行),`engine_run` 经 Channel 是唯一 agent 运行时;调度器多 run 并行(cap 3 + FIFO)+ 托盘常驻(hide-on-close,后台 run 不中断)+ 系统通知;双侧 replay parity 永久测试(真实 v0.3.x 存量日志 fixture 端到端);exec/fs/knowledge/deliverable 四类工具全 Rust 原生(TS 工具桥取消,PM CRUD 归 v0.3.3);三轮 gap closure 闭合 knowledge_write HITL 跨边界链(productId 兜底 → category 枚举 → params_hash 域对齐)。收口 gates:cargo 176 + npm 222 + tsc 全绿。

**v0.3.0 功能闭环 shipped 2026-08-17** — 5 phases (13-17), 19 plans, 149 commits, 161/161 tests。审计 tech_debt(无阻断):28/28 需求满足、11/11 集成 seam、4/4 E2E flows;统一人工 UAT 21/21(13-UAT 7 + 16-UAT 8 + 17-UAT 6,含 v0.2.0 遗留 35 步回归闭合)。

- **事件日志底座**(Phase 13):agent 每一步落入 SQLite `agent_events`(seq + correlation_id),tool 配对不变量五种违规码可检测,ChatSession 为投影(toolLoop 双历史消除),>4KB 结果 artifact 化,CJK token 估算修复,永久 replay parity 测试
- **可恢复执行**(Phase 14):确认候选 SQLite 持久化(paramsHash 去重 + 原子条件 UPDATE 消费),崩溃恢复(尾切完整 turn、孤儿 tool_call interrupted 绝不重执行),≥0.8× 窗口配对边界压缩(事件无损)
- **第二大脑**(Phase 15):记忆候选确认流(防轰炸三项 + supersedes 链 + user_directed 直入)、版本化知识文档、中文 2 字可命中 FTS5 混合检索、五段优先级上下文注入 + context_injected 审计
- **PRD 生产线**(Phase 16):generateDeliverable 两段式候选 → HITL 卡片 → MDXEditor 编辑 → 版本化落研发中心卡槽;FTS5 立即命中 + AI 溯源徽章 + deliverable_committed 审计
- **Agent 一等入口**(Phase 17):chatConsoleStore 双宿主(Drawer/工作区同一场对话)、裸 ⌘K 携带视图上下文、数据驱动晨报(零 LLM)、右键快捷 AI 动作(选区快照 + 不劫持编辑器)
- **架构文档**(Phase 17):ARCHITECTURE.md v2.0 + ADR-0001(架构切换)/ADR-0002(harness MIT 归属)— 新人从这读起

**Tech debt(非阻断,完整清单见 `milestones/v0.3.0-MILESTONE-AUDIT.md`):** FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall 决策点、产品 chip × 语义、MarkdownEditor chunk ~297 KB、CSP null、云 provider 凭据 UAT。

**v0.3.1 多 Session 会话体系 shipped 2026-08-19(收口 2026-08-24)** — 4 phases (18-21), 10 plans, 107 commits, 217/217 tests;15/15 需求满足,Phase 18-21 VERIFICATION 全 PASS;3 项人工 UAT Playwright 结构验证 + 用户接受。含穿插 quick 任务群(工作区真实扫描/FileTree 拖拽/知识库↔归档互转/会话纪要投影)。明细:
- **Session 数据模型与底座**(Phase 18):migration 0007(sessions 表 + 幂等回填 + workspace_id 回填)、toolLoop workspaceId stamping、confirmations sessionId 根因修复、sessionRepo 双实现 + turn-start upsert;174/174 测试
- **多 Session 运行时**(Phase 19):restoreSession(sessionId?) 参数化(sessions[0] 假设移除)、activeSessionId/startNewSession/switchSession、streaming 双层守卫、pending 卡片四类读路径按 session 过滤;190/190 测试
- **分支与卡片操作**(Phase 20):fork.ts 纯函数层(引用式 fork 零复制 + seq 归一化 + compaction remap)、resolveSessionEvents 投影融合(支持 fork-of-fork)、hover 分支/复制工具栏 + 来源徽章;204/204 测试
- **Session 列表与快捷入口 + 自动命名**(Phase 21):真实最近列表(标题/相对时间/消息数/分支徽章)、ChatPanel scoped 双 Select、Ctrl+K/Ctrl+Shift+K 分流、generateSessionTitle(LLM + fallback)fire-and-forget;217/217 测试

**v0.3.1 Known gaps:** UAT-2 LLM 成功分支未真验(fallback 已验)、21-VERIFICATION UAT-3 期望文本过时(WorkspaceSwitcherRow 为后续 quick 新增,非回归)、quick 任务群无独立 phase VERIFICATION。

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
- ✓ 任务管理 CRUD 补全 — TASK-01..09 全部满足 — **v0.2.0**
- ✓ 日程管理 CRUD + 真实日历 — SCHED-01..08 全部满足 — **v0.2.0**
- ✓ 跨模块联动 + 弱关联 — CROSS-01..07 全部满足 — **v0.2.0**
- ✓ MDXEditor Markdown WYSIWYG 编辑 — **v0.2.0**
- ✓ AI 助手全链路(⌘K + ChatPanel + 多 provider + tools + HITL) — **v0.2.0**
- ✓ 可恢复执行底座(EVT-01..08 + CMP-01/02:事件日志/配对不变量/持久化确认/崩溃恢复/配对边界压缩) — **v0.3.0(Phase 13-14), 13/14-UAT + 集成审计验证**
- ✓ 长期记忆 + 知识文档 + FTS5 中文检索(MEM-01..08) — **v0.3.0(Phase 15), 16/17-UAT 交叉验证 + 审计回填验证**
- ✓ PRD 生产线(DELIV-01..04:agent 生成 → HITL 确认编辑 → 版本化落研发中心卡槽 + AI 溯源徽章 + FTS5 立即命中) — **v0.3.0(Phase 16), 16-HUMAN-UAT 8/8**
- ✓ Agent 一等入口(UX-01..04:双宿主/⌘K carry/晨报/右键动作)+ ARCHITECTURE.md v2.0 + ADR(ARCH-01/02) — **v0.3.0(Phase 17), 17-HUMAN-UAT 6/6**
- ✓ v0.2.0 遗留 35 步人工回归(发布签核项) — **v0.3.0(17-HUMAN-UAT Test 6, 35/35 pass)**
- ✓ 多 Session 会话体系(SESS-01..06, LIST-01/02, FORK-01..03, QUICK-01..03, TITLE-01/02) — **v0.3.1(Phase 18-21), 15/15 需求满足,217/217 测试;3 项人工 UAT 2026-08-24 收口**
- ✓ Rust Run Engine(ENG-01..05, TOOL-01..04, SCHED-01..04, PORT-01..03) — **v0.3.2(Phase 22-25), 16/16 需求满足,milestone audit passed;收口 gates cargo 176 + npm 222 + tsc;22-UAT Test 7 人工复测留待真实 LLM 环境补验**

### Active

<!-- v0.3.1 需求待 REQUIREMENTS.md 定义后回填 -->

**结转 tech debt(v0.2.0/v0.3.0,非阻断):**
- FTS5 runtime probe on packaged build(v0.3.0)
- 真进程 kill 恢复路径实测(v0.3.0;自动化覆盖模拟路径)
- 中文 PM 长尾词汇 recall 决策点(v0.3.0)
- 产品 chip × 与 Selected Product 恒注入语义不一致(UX 观察项,v0.3.0)
- 云 provider (Anthropic/OpenAI) 真实凭据 UAT(v0.2.0)
- taskStore/scheduleStore v1→v2 迁移实测(v0.2.0)
- MarkdownEditor chunk ~297 KB gzip(v0.2.0)

### Out of Scope

<!-- 显式边界 — 防止重新加回 -->

- **第二大脑向量检索(embedding/LanceDB/SQLite-vec)** — v0.3.0 按 AGENT_MEMORY_REFERENCE.md 只做 P0+P1(FTS5 关键词+结构过滤);P2 语义增强留 v0.4,且 LanceDB 只作派生索引候选评估,永不做事实源
- **完整 PM Pipeline(需求→PRD→原型→代码→测试 全自动编排)** — v0.3.0 只做 agent 驱动的单交付物生成→确认→落槽;多步全自动编排依赖工作流引擎,明确不采用无持久检查点的动态脚本工作流
- **GraphFlow 工作流引擎** — **正式否决**(v0.3.0 架构重写):pre-1.0 crate 风险 + AGENT_MEMORY_REFERENCE.md 第 9 节明确不采用其插件树;tool loop + 事件日志取代
- **inline 视图内 agent 嵌入** — 移交 v0.4+(用户决策);v0.3.0 交互升级限于全局入口/晨报/右键菜单
- **多人协作 / 云同步** — 设计原则"本地优先",SQLite 单机足够
- **URL 路由** — 当前 activeTab state 够用
- **AppContext 全量移除** — 跟随各 view 迁移逐步消除
- **强关联 / 级联删除** — 弱关联优先,外键全部可选,删除不级联
- **周报/日报自动汇总** — v0.3+,等 CRUD 跑通再考虑
- **多产品并行 Pipeline** — 受 v0.1.0 Phase 4 PoC 结果影响

## Context

**当前架构**(2026-08-17,v0.3.0 shipped;真相源 = `docs/ARCHITECTURE.md` v2.0 + `docs/AGENT_MEMORY_REFERENCE.md`):
- Agent 运行时:增强 tool loop + SQLite Agent Event Log(append-only,seq + correlation_id,配对不变量)— ChatSession 是投影,可恢复/可审计/可回放
- 确认/恢复:确认候选 SQLite 持久化(原子消费)+ 崩溃恢复(孤儿 tool_call interrupted,绝不重执行)+ ≥0.8× 窗口配对边界压缩
- 记忆/检索:记忆候选确认流 + supersedes 链;知识文档版本化;FTS5 混合检索(CJK 同源切分);五段优先级上下文注入(context_injected 审计)
- 前端:React 19 + Vite 6 + Tailwind v4(`@theme` 桥接 tokens)+ Zustand 5 + motion 12;chatConsoleStore 双宿主(AgentConsole)
- 后端:Rust llm.rs(provider-agnostic + keychain)+ Tool registry(Zod);migrations 0002-0006;Express 仅 dev fallback
- 桌面:Tauri v2 frameless,chat Tauri command + Channel 流式输出
- 数据:Zustand store 持久化(SQLite)+ `agent_events`/`memories`/`knowledge_docs`/`agent_confirmation_candidates` 表
- 测试:161(store + ai 双域,node:test)
- 架构原则:零 Sidecar / 本地优先 / 混合架构(本地存储 + 云端 LLM)/ HITL 关键节点 / 日志追加后不可静默覆盖

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
| 弱关联模型(外键全部可选,不级联删除) | 独立 CRUD 先跑通,关联是增益不是束缚;避免数据丢失风险 | ✓ Validated in v0.2.0 |
| Task/Schedule 双向引用(projectId?/taskId?) | "任务 → 日程"和"日程 → 任务"都能 O(1) 跳转 | ✓ Validated in v0.2.0 |
| 3 phase 拆分(Task CRUD / Schedule CRUD / 联动) | 粗粒度原则;5/6 可并行,7 是 wire-up | ✓ Good — 实际扩到 8 phase(含编辑器 + 3 个 AI phase + gap closure) |
| 保留 task.project:string 做 legacy 兼容 | AppContext.tsx 多处依赖,不删,推到下下里程碑 | ⚠️ 仍在兼容层,随 view 迁移消除 |
| Rust llm.rs provider-agnostic + hand-rolled Tool registry(~200 LOC) | 零 Sidecar 原则;不引入重型 agent 框架 | ✓ Validated in v0.2.0 — Ollama 生产 tool-call UAT 通过 |
| Express 端点 5→1 收缩 | AI 走 Tauri IPC,Express 只留 dev fallback | ✓ Validated in Phase 9-02 |
| [v0.3.0] 事件日志 + tool loop + FTS5 取代 GraphFlow/Rig/LanceDB 蓝图 | docs/AGENT_MEMORY_REFERENCE.md 调研结论:可恢复/可审计/可回放的运行时优先于工作流引擎;结构过滤收益先于向量检索 | ✓ Validated in v0.3.0(ADR-0001,28/28 需求满足) |
| [v0.3.0] 记忆分层:业务事实/事件/语义知识/偏好/上下文投影 | 单一向量库不是记忆;向量索引只是检索加速层,不是真相源 | ✓ Validated in v0.3.0(MEM-01..08) |
| [v0.3.0] toolLoop 单历史化:每迭代从 session.getMessagesForLLM() 重新派生 | 公开签名零变化下消除双历史分叉 | ✓ Good — replay parity 永久测试锁定 |
| [v0.3.0] 确认 WAIT 也落 tool_result + 原子条件 UPDATE 消费候选 | 配对不变量在确认流成立;双并发恰一成功由 SQL 保证 | ✓ Good |
| [v0.3.0] 崩溃尾切 + 孤儿 tool_call settled-by-append(绝不重执行) | 业务数据零重复写入是可追责前提 | ✓ Good — 16-UAT 重启恢复双向验证 |
| [v0.3.0] 记忆防轰炸三项 + user_directed 直接入库 | 队列永不轰炸;用户明示「记住」绕过候选流但留审计 | ✓ Good |
| [v0.3.0] consume-at-落槽(卡片确认 ≠ 消费,Dialog 落槽是唯一消费点) | 取消无损;stable docId 使重复落槽 supersede 为新版本 | ✓ Good — 16-UAT 取消无损/版本链验证 |
| [v0.3.0] chatConsoleStore 唯一归属 + AgentConsole 双宿主 | Drawer 与工作区同一场对话,同构由结构保证而非测试 | ✓ Good — 17-UAT 流式中途切换验证 |
| [v0.3.0] harness 复用 = 设计思想 + 纯函数算法,不引入框架 | dsh 是 Node 运行时违反零 sidecar;MIT 归属入 ADR-0002 | ✓ Good |
| [v0.3.2] Agent 核心迁 Rust run engine,webview 退化为投影 + HITL UI | 三驱动:后台长跑 / 多 session 并行 / IM-MCP-Skill 多入口;TS 运行时已完成语义验证;事件日志 schema 即迁移契约 | ✓ Validated in v0.3.2 — ADR-0003 Accepted,replay parity 逐位锁定 |
| [v0.3.2] 不采用 Rig / GraphFlow,自写调度器,omp 借模式不引依赖 | Rig 只供 loop 骨架+provider(最廉价部分)且 AgentRun 与事件日志双记账;GraphFlow 静态图 vs subAgent 动态拓扑相克;调度器 ≈ 数百行 tokio | ✓ Validated in v0.3.2 — 调度器 VecDeque FIFO + per-run Connection 按期落地 |
| [v0.3.2] TS 工具桥整体取消,PM CRUD 缺席降级 | 业务数据为 kv_store JSON 快照,桥为建即拆的过渡架构;v0.3.3 关系化后原生回归 | ✓ Validated in v0.3.3 — Phase 29 关系表 + 9 工具原生落地 |
| [v0.3.3] 2026-09-02 优先级重定:27 挂起/28 顺延,999.6 promote 第一优先 | 用户真实使用四大缺口(agent 不能干活/数据是壳/AI 产出不可用/流程刚性)优先于路线图完整性 | ✓ Validated — 29/30/31 连续三 phase UAT 全过 |
| [v0.3.3] 产品哲学:工作流用户自组织,Nova 只给参考+模板 | 刚性 pipeline 与「一键十八份」否决为里程碑目标;模板/参考是增益不是束缚 | ✓ Validated in Phase 30(VERIFICATION 13/13 + 哲学红线检查) |
| [v0.3.3] knowledge_docs 唯一真相源(tab 产物/摄取/笔记/模板同管线) | 单管线版本化 + FTS5 + 确认卡复用;弃 kv JSON 快照 | ✓ Validated in 26/27/30/31 |
| [v0.3.3] Milkdown core headless + 全自建 UI(D-01) | 零外部编辑器主题;tokens/Phosphor 一致性;NodeView + Decoration 扩展模式 | ✓ Validated — UAT 9/9(IME/round-trip 含) |
| [v0.3.3] 带债收口(REV-01/02 + 27 UAT 回归记 Known Gaps) | 27/28 价值让位于 v0.4 coding agent;债务显式记录优于无限期收口 | ✓ 2026-09-04 用户裁定 |

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

## Phase Log (recent)

- **Phase 13 (2026-08-15)**: Event Log 底座 + ToolLoop 重构 — migrations 0002 + EventStore 双实现 + 配对不变量 + ChatSession 投影 + toolLoop 单历史 + replay parity 永久测试。VERIFICATION PASS。
- **Phase 14 (2026-08-15)**: 持久化确认 + 会话恢复 + 上下文压缩 — migration 0003 + 原子消费 + 崩溃尾切/interrupted 标记 + 0.8× 配对边界压缩。VERIFICATION PASS。
- **Phase 15 (2026-08-15)**: 长期记忆 + 知识文档 + FTS5 — migration 0004 + memoryStore(防轰炸三项 + supersedes)+ knowledgeRepo(版本链 + FTS5)+ 五段上下文注入。VERIFICATION 审计回填 PASS。
- **Phase 16 (2026-08-17)**: PRD 生产线 — 两段式候选 + PrdDraftDialog + 落槽版本链 + AI 溯源徽章。16-HUMAN-UAT 8/8(3 gap 当场修复)。
- **Phase 17 (2026-08-17)**: Agent UX + 架构文档 — 双宿主 + ⌘K carry + 晨报 + 右键动作 + ARCHITECTURE.md v2.0/ADR。17-HUMAN-UAT 6/6(含 35 步回归)。
- **Phase 18 (2026-08-18)**: Session 数据模型与底座 — migration 0007 + sessionRepo 双实现 + workspaceId stamping。VERIFICATION PASS。
- **Phase 19 (2026-08-18)**: 多 Session 运行时 — activeSessionId/switchSession + streaming 双层守卫 + pending 卡片按 session 过滤。VERIFICATION PASS。
- **Phase 20 (2026-08-18)**: 分支与卡片操作 — buildForkEventStream 引用式 fork + hover 工具栏 + 复制。VERIFICATION PASS。
- **Phase 21 (2026-08-19)**: Session 列表与快捷入口 + 自动命名 — 真实列表 + 双下拉 ChatPanel + 快捷键分流 + LLM 自动命名。VERIFICATION PASS(13/13,人工项留 UAT)。
- **Phase 22 (2026-08-31)**: Loop Replay Parity + 三轮 UAT gap closure(22-08/09/10)— knowledge_write params_hash 跨边界平价闭合,Rust/TS 双侧 SHA-256 常量测试锁定。VERIFICATION PASS(2/2,Test 7 人工复测待办)。
- **Phase 26 (2026-08-xx)**: mock 全清 — 产研中心各 tab AI 按钮接真实引擎 run,流式/取消/审计统一,产物走候选→HITL→版本化落槽。VERIFICATION PASS(4/4 plans)。
- **Phase 29 (2026-09-02)**: PM CRUD 工具原生化 — task/schedule CRUD 引擎工具 + 三档风险标注(999.5 D-12),agent 获得真实写路径。VERIFICATION PASS(4/4 plans)。
- **Phase 30 (2026-09-03)**: 参考模板数据化 + 工作流用户自组织 — catalog 单源 JSON、workflow_ 工具族、「工作流」视图 + 模板 run、确定性沉淀链。VERIFICATION PASS(13/13)+ 真机 UAT 8/8(哲学红线无违反)。
- **Phase 31 (2026-09-04)**: 文档工作区 — Milkdown core headless 编辑器 + 右侧常驻面板;MDXEditor 退役;doc_kind=note 笔记 + FTS5;确认卡第三宿主;⌘K 左滑。UAT 9/9(5 gaps→resolved,gap 收口 31-08/31-09 + round-2 根因修复:codeBlock contentDOM、表格行 <br> guard)。

---
*Last updated: 2026-09-04 after v0.3.3 milestone(带债收口,archive: milestones/v0.3.3-*)*
