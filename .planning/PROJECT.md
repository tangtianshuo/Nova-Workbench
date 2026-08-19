# Nova-PM-Workspace

## What This Is

Nova 是一个 **AI native 的产品经理桌面工作台**,基于 Tauri v2 + React 19。v0.1.0 交付 PM 视图框架 + 设计系统 + Rust 原生底座;v0.2.0 交付任务/日程 CRUD、跨模块弱关联、Markdown WYSIWYG、AI 助手全链路;**v0.3.0 功能闭环已 shipped(2026-08-17)**:以「事件日志 + 增强 tool loop + SQLite FTS5」为架构真相源(GraphFlow/Rig/LanceDB 正式出局),agent 成为有记忆(候选确认 + FTS5 检索)、可恢复(崩溃恢复 + 持久化确认)、可追责(全量事件审计)的一等执行者 — 能跑 PRD 生产线(生成→HITL 编辑→版本化落研发中心卡槽),并以工作区/⌘K 携带上下文/晨报/右键动作成为全局入口。

## Core Value

让产品经理拥有一个**懂你、能替你干活**的桌面 AI Agent —— 不是 chatbot,而是能跑 Pipeline(需求→PRD→原型→代码→测试)、有第二大脑、关键节点 HITL 的真 Agent。

## Current Milestone: v0.3.1 多 Session 会话体系

**Goal:** 把全局单条 agent 对话升级为工作区隔离、可恢复、可分支的多 session 体系,session 成为 Agent 工作区的一等实体。

**Target features:**
- Session 数据模型:sessions 元数据表(migration 0007,workspace_id/title/parent_session_id/fork_cut_seq),事件 scope 扩展 workspaceId
- 多 session 运行时:`sessionRef` 单例 → activeSessionId 状态;启动默认新 session + 上次工作区;streaming 中锁定切换;pending 确认卡片按 session 过滤
- Agent 页「最近任务」:接真实 session 列表(当前工作区过滤,标题+时间+消息数+分支标识),点击恢复
- 分支:hover assistant 卡片浮出 分支/复制 icon;引用式 fork(parent 事件前缀投影,零复制);分支后 UI 跳转新 session 并带分支标识
- 复制:assistant 消息一键复制到剪贴板
- Ctrl+Shift+K:ChatPanel 头部加 工作区 + session 两个 Select(工作区切换联动过滤);Ctrl+K 保持纯净
- Session 标题:首个 turn 后 LLM 自动命名,失败回退首条消息截断

**Key decisions(2026-08-18 用户锁定):** 引用式 fork / ChatPanel 加下拉框 / LLM 自动命名 / 列表过滤级隔离(记忆/知识库保持全局)

**Out of scope:** session 手动重命名、session 删除、定时任务 tab(保持 mock)、跨工作区 strict 隔离

## Current State (after v0.3.0)

**Shipped 2026-08-17** — 5 phases (13-17), 19 plans, 149 commits, 161/161 tests。审计 tech_debt(无阻断):28/28 需求满足、11/11 集成 seam、4/4 E2E flows;统一人工 UAT 21/21(13-UAT 7 + 16-UAT 8 + 17-UAT 6,含 v0.2.0 遗留 35 步回归闭合)。

- **事件日志底座**(Phase 13):agent 每一步落入 SQLite `agent_events`(seq + correlation_id),tool 配对不变量五种违规码可检测,ChatSession 为投影(toolLoop 双历史消除),>4KB 结果 artifact 化,CJK token 估算修复,永久 replay parity 测试
- **可恢复执行**(Phase 14):确认候选 SQLite 持久化(paramsHash 去重 + 原子条件 UPDATE 消费),崩溃恢复(尾切完整 turn、孤儿 tool_call interrupted 绝不重执行),≥0.8× 窗口配对边界压缩(事件无损)
- **第二大脑**(Phase 15):记忆候选确认流(防轰炸三项 + supersedes 链 + user_directed 直入)、版本化知识文档、中文 2 字可命中 FTS5 混合检索、五段优先级上下文注入 + context_injected 审计
- **PRD 生产线**(Phase 16):generateDeliverable 两段式候选 → HITL 卡片 → MDXEditor 编辑 → 版本化落研发中心卡槽;FTS5 立即命中 + AI 溯源徽章 + deliverable_committed 审计
- **Agent 一等入口**(Phase 17):chatConsoleStore 双宿主(Drawer/工作区同一场对话)、裸 ⌘K 携带视图上下文、数据驱动晨报(零 LLM)、右键快捷 AI 动作(选区快照 + 不劫持编辑器)
- **架构文档**(Phase 17):ARCHITECTURE.md v2.0 + ADR-0001(架构切换)/ADR-0002(harness MIT 归属)— 新人从这读起

**Tech debt(非阻断,完整清单见 `milestones/v0.3.0-MILESTONE-AUDIT.md`):** FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall 决策点、产品 chip × 语义、MarkdownEditor chunk ~297 KB、CSP null、云 provider 凭据 UAT。

**Next Milestone:** v0.3.1 多 Session 会话体系 — 已启动(2026-08-18,`/gsd:new-milestone`)

**v0.3.1 进度:**
- **Session 数据模型与底座**(Phase 18,2026-08-18):migration 0007(sessions 表 + 幂等回填 + workspace_id 回填)、toolLoop workspaceId stamping、confirmations sessionId 根因修复、sessionRepo 双实现(memory/sqlite)+ turn-start upsert;fixture-DB 升级测试锁定幂等,174/174 测试通过
- **多 Session 运行时**(Phase 19,2026-08-18):restoreSession(sessionId?) 参数化(sessions[0] 假设移除)、chatConsoleStore activeSessionId/startNewSession/switchSession、streaming 双层守卫(session + 工作区切换)、pending 卡片四类读路径全部按 session 过滤;190/190 测试通过
- **分支与卡片操作**(Phase 20,2026-08-18):fork.ts 纯函数层(buildForkEventStream 零复制 + seq 归一化 + compaction remap,测试先行 11 case)、resolveSessionEvents 投影融合(restore/compaction 双接线,支持 fork-of-fork)、forkFromMessage 全链路、AgentConsole hover 分支/复制工具栏 + 来源徽章 + 复制 toast;204/204 测试通过
- **Session 列表与快捷入口 + 自动命名**(Phase 21,2026-08-19):sessionRepo 消息数聚合 + title IS NULL 守卫三参 updateTitle、formatRelativeTime、generateSessionTitle(LLM ≤20 字 + 首条消息回退)+ submit finally fire-and-forget 触发 + sessionListVersion 静默刷新、Agent 页真实最近列表(标题/相对时间/消息数/分支徽章,点击恢复)、ChatPanel scoped 双 Select 联动、Ctrl+K/Ctrl+Shift+K 分流;217/217 测试通过,VERIFICATION PASS(13/13),3 项人工项留里程碑 UAT

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
- ✓ 多 Session 会话体系(SESS-01..06, LIST-01/02, FORK-01..03, QUICK-01..03, TITLE-01/02) — **v0.3.1(Phase 18-21), 15/15 需求满足,217/217 测试;3 项人工项留里程碑 UAT**

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

---
*Last updated: 2026-08-19 — v0.3.1 Phase 21 complete*
