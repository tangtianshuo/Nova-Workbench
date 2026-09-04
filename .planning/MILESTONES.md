# Milestones

## v0.3.3 产研半落地 + 工作区入驻 (Shipped: 2026-09-04, 带债收口)

**Phases completed:** 6 phases (26-31) — 4 complete(26/29/30/31)+ 27 suspended 3/4 + 28 postponed;25 plans(24 complete),42+ tasks
**Timeline:** 2026-08-31 → 2026-09-04 (5 days, 169 commits, 185 files, +21,658/−5,286 LOC)
**Audit:** 未跑独立 milestone audit — 用户裁定带债收口(v0.3.1 先例);各 phase VERIFICATION + 真机 UAT 覆盖(29 UAT 8/8、30 UAT 8/8 + 13/13、31 UAT 9/9 三轮复测);234 TS tests + replay parity 保持

**Key accomplishments:**

1. **Mock 全清 + tab 接引擎**(Phase 26)— rndStore 六个 `generate*AI`/`runProductSkill` mock 全删,产研各 tab AI 按钮触发带 tab 上下文的真实 `engine_run`(独立 sessionId、流式/取消/审计统一),产物统一候选→HITL→版本化落槽(knowledge_docs 唯一真相源裁定);调度器双队列(interactive 严格优先 batch);一键十八份 = 单 run 多步
2. **PM CRUD 工具原生化 — agent 写路径**(Phase 29,999.6 promote)— 9 个 task/schedule CRUD 引擎工具 + 三档风险(读/轻写免确认,delete+cap-5 走 pm_write HITL);migration 0012 关系表 + kv 一次性幂等搬移;Tauri 下 persist 退役、SQL 单真相源;Rust 一事务收口确认路径 + 双侧 parity fixture
3. **参考模板数据化 + 工作流用户自组织**(Phase 30)— deliverables-catalog.json 单源(TS import + Rust include_str! 同读,999.4 投资前置)、workflow_templates 表 + 4 个 workflow_ 工具、「工作流」顶层视图 + 5 内置参考模板 + 单 run 多步剧本、确定性沉淀链(事件日志提取→Dialog→落库,零 LLM);产品哲学红线(严禁刚性 pipeline)贯穿
4. **文档工作区**(Phase 31)— Milkdown core headless 全量替换 MDXEditor(自建 toolbar/live preview/codeBlock NodeView + prismjs Decoration 高亮/表格行列操作),右侧常驻 overlay 面板(多 tab/800ms 自动保存/禅模式/60vw),⌘K Drawer 左滑并存,doc_kind=note 全局笔记 + FTS5,确认卡第三宿主;UAT 三轮迭代 9/9(两轮根因修复:codeBlock contentDOM、GFM 表格行 `<br>` guard)
5. **工作区文档摄取(3/4,挂起)**(Phase 27)— 纯 Rust 提取地基(pdf_oxide 中文 PoC/zip deflate/quick-xml)+ 三态/hash 幂等/截断 + 批量 HITL 后端(consume 事务幂等)+ 前端摄取流;UAT-2 修复已提交,UAT-2..7 回归随挂起待恢复
6. **优先级重定与产品哲学定案**(2026-09-02)— 用户真实使用四大缺口驱动:27 挂起/28 顺延,999.6 promote 第一优先,Phase 30/31 由此而来;「工作流用户自组织,Nova 只给参考+模板」成为后续 scope 裁定红线

### Known Gaps (tech debt)

- **Phase 27 挂起**:UAT-2..7 回归未执行(修复已提交 61f9089/a070c41/07e44fd;恢复 = `/gsd:execute-phase 27 --gaps-only`);27-04-SUMMARY 未生成,ING-03..06 真机验证 deferred
- **REV-01/02 反向创建产品**(Phase 28)顺延未实施,随后续里程碑
- 里程碑统一 UAT(parity 收口 gate + ≥20 文档批量摄取 + 托盘后台 run)未跑 — 部分由 29/30 fixture 前缀约定承接
- REQUIREMENTS 未登记 PM/WF/DOC 需求(promote 时定义,流程债;见 v0.3.3-REQUIREMENTS.md 归档说明)
- cap-5 计数 resume 重置(pm_writes_used run 局部;升级路径 = agent_events 数 session 轻写)
- Phase 31 局部:docx/pdf/excel/ppt 预览不进 v1、行内代码无语言标注(CommonMark 边界)
- 结转 tech debt:22-UAT Test 7 人工复测、update-path params_hash 双源、FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall、产品 chip × 语义、云 provider 凭据 UAT、CSP null

---

## v0.3.2 Rust Run Engine (Shipped: 2026-08-31)

**Phases completed:** 4 phases (22-25), 21 plans (含 22-08/09/10 三轮 UAT gap closure), 42 tasks
**Timeline:** 2026-08-24 → 2026-08-31 (8 days, 114 commits, 127 files, +25,827/−1,586 LOC)
**Audit:** v0.3.2-MILESTONE-AUDIT **passed**(16/16 需求、4/4 phases、6/6 integration、6/6 E2E flows;SCHED-04 取消链路经 24-05 gap closure 关闭)

**Key accomplishments:**

1. **Rust 常驻 run engine** — toolLoop/compaction/contextAssembler 语义移植(loop_runner 主循环 + ≥0.8× 配对边界压缩 + 五段上下文注入 Rust 化),agent_* 表 Rust 唯一写者,`engine_run` 经 Channel 成为唯一 agent 运行时;webview 退化为投影 + HITL UI(ADR-0003)
2. **Replay parity 逐位锁定** — 双侧共享 fixture(算法金样本/投影用例/真实 v0.3.x 存量日志 264+42 events 端到端回放),parity harness canonical 化 + 时间戳白名单,永久测试;TS 217 测试 = 可执行规格的使命完成
3. **TS 运行时删除** — toolLoop/compaction/contextAssembler 共 -1371 行 grep 零命中;ADR-0003 转 Accepted、ARCHITECTURE v3.0 引擎分层、CLAUDE.md/README 同步
4. **原生工具层(无桥)** — exec(命令白名单二元组 + HITL 确认后 Rust 重执行)/fs 读写(resolve_deep 逐级路径安全)/knowledge 检索/deliverable 四类工具全 Rust 原生;TS 工具桥整体取消(用户决策:业务数据 kv JSON 快照,建桥即拆)
5. **多 run 并行 + 托盘常驻** — 调度器 VecDeque FIFO cap 3、hide-on-close 后台 run 不中断、系统通知三点(Done/Error/Confirmation)+ 托盘一键跳回 session、engine_cancel 取消全链路(SCHED-04 三条集成测试锁定)
6. **三轮 UAT gap closure** — 22-08(productId ctx 兜底 + 检索预算 prompt 规则 + MAX_ITERATIONS=8 结构边界与中文无工具收尾轮)、22-09(category 9 值枚举预卡校验 + tags 默认)、22-10(knowledge_write params_hash 跨边界平价:Rust 规整为 TS knowledgeParams 同构 10 字段形状,TS 预计算 SHA-256 常量双侧互锁);收口时 cargo 176 + npm 222 + tsc 全绿

### Known Gaps (tech debt)

- 22-UAT Test 7 人工复测未执行(代码级已锁:22-10 常量互锁测试 + VERIFICATION passed;真实 LLM 下 knowledge_write 卡片确认落库为最终人工门)
- update-path params_hash 已知边界:operation 由 Rust SQLite 与 webview rndStore 两源计算,不一致则 hash 漂移(create-path 已常量锁定;升级路径 = 知识表单一真相源)
- 结转 tech debt:FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall 决策点、产品 chip × 语义、云 provider 凭据 UAT、taskStore/scheduleStore v1→v2 实测、MarkdownEditor chunk、CSP null(完整清单见 PROJECT.md)
- PM CRUD 工具缺席(TOOL-03 重定义):模型有降级感知,v0.3.3 业务数据关系化后以 Rust 原生工具回归
---

## v0.3.1 多 Session 会话体系 (Shipped: 2026-08-19, closed 2026-08-24)

**Phases completed:** 4 phases (18-21), 10 plans + 穿插 quick 任务群(260818/260819 系列)
**Timeline:** 2026-08-17 → 2026-08-19 (107 commits, 112 files, +10,018/−1,199 LOC;收口于 2026-08-24)
**Audit:** 未跑独立 milestone audit — 15/15 需求满足(Phase 18-21 VERIFICATION 全 PASS 回填),17/17 → 217/217 测试;3 项人工 UAT 由 Playwright 结构验证 + 用户接受(2026-08-24)

**Key accomplishments:**

1. **Session 数据模型底座** — migration 0007(sessions 表 + 幂等回填 + workspace_id 回填)、toolLoop workspaceId stamping、confirmations sessionId 根因修复、sessionRepo 双实现(memory/sqlite)+ turn-start upsert;174/174 测试
2. **多 Session 运行时** — restoreSession(sessionId?) 参数化(sessions[0] 假设移除)、chatConsoleStore activeSessionId/startNewSession/switchSession、streaming 双层守卫(session + 工作区切换)、pending 卡片四类读路径全部按 session 过滤;190/190 测试
3. **引用式分支(fork)** — fork.ts 纯函数层(buildForkEventStream 零复制 + seq 归一化 + compaction remap,测试先行 11 case)、resolveSessionEvents 投影融合(支持 fork-of-fork)、forkFromMessage 全链路、AgentConsole hover 分支/复制工具栏 + 来源徽章;204/204 测试
4. **Session 列表与自动命名** — sessionRepo 消息数聚合 + title IS NULL 守卫、generateSessionTitle(LLM ≤20 字 + 首条消息回退,fire-and-forget 于 submit finally)、Agent 页真实最近列表(标题/相对时间/消息数/分支徽章)、ChatPanel scoped 双 Select 联动、Ctrl+K/Ctrl+Shift+K 分流;217/217 测试
5. **工作区协同 quick 任务群** — 工作区真实扫描(scan_workspace_folder Rust command)、FileTree 递归组件(拖拽移动 + Rust fs_move 路径安全)、知识库↔归档互转、会话纪要自动投影进知识库、磁贴点击切换、workspace switcher + 跨工作区 toast;把 session 体系与工作区视图焊成一体
6. **收口验证** — Phase 18-21 VERIFICATION 全 PASS;3 项人工 UAT(最近列表视觉/Ctrl+Shift+K 自动标题/Ctrl+K 纯面板)Playwright 结构验证通过,LLM 分支以 fallback 路径代验(无 GEMINI_API_KEY),用户接受收口

### Known Gaps (tech debt)

- UAT-2 自动命名 LLM 成功分支未真验(无 key 环境 fallback 分支已验;titleGenerator.ts:19 console error 为预期日志)
- 纯视觉项(流式输出中途 dim 态等)未自动验证
- UAT-3 期望文档已过时:ChatPanel 纯面板模式含 WorkspaceSwitcherRow 为 Phase 21 验证后新增 quick 功能(260819-dxj),非回归 — 21-VERIFICATION.md 期望文本待下次触碰时顺带更新
- quick 任务群(filetree/agent workspace 等)走 quick 流程验证,无独立 phase VERIFICATION
- 收口拖期:Phase 21 完成于 08-19,complete-milestone 拖至 08-24 且期间已立项 v0.3.2,导致 CLI 归档不可用、本次手工收口(流程教训已录 RETROSPECTIVE)

---

## v0.3.0 功能闭环 (Shipped: 2026-08-17)

**Phases completed:** 5 phases (13-17), 19 plans, 57 tasks
**Timeline:** 2026-08-14 → 2026-08-17 (4 days, 149 commits, 322 files, +23,479/−20,016 LOC)
**Audit:** tech_debt — 28/28 需求满足, 5/5 phase 验证(15 VERIFICATION 回填), 11/11 集成 seam, 4/4 E2E flows, 161/161 tests (`milestones/v0.3.0-MILESTONE-AUDIT.md`)

**Key accomplishments:**

1. **事件日志单一真相源** — SQLite agent_events/agent_artifacts(WAL + SQL 侧 seq)+ EventStore 双实现 + tool 配对不变量(五种违规码,turn 末审计)+ >4KB 结果 artifact 化 + CJK token 估算修复;ChatSession 重构为事件投影、toolLoop 单历史化,双历史分叉消除;永久 replay parity 测试
2. **可恢复执行底座** — 确认候选 SQLite 持久化(paramsHash 规范化去重 + 原子条件 UPDATE 消费,重启存活不重复消费)+ 崩溃恢复(尾切完整 turn、孤儿 tool_call interrupted 绝不重执行)+ ≥0.8× 窗口上下文压缩(仅配对平衡处切分,事件日志无损)
3. **第二大脑** — 记忆候选确认流(防轰炸三项:去重/cap-20/TTL + supersedes 链 + user_directed 直入)+ 版本化知识文档(旧版本可审计)+ 中文 2 字可命中 FTS5 混合检索(索引/查询同源切分)+ 五段优先级上下文注入 + context_injected 审计事件
4. **PRD 生产线** — generateDeliverable 两段式候选 → HITL 确认卡片 → PrdDraftDialog(MDXEditor)编辑 → 版本化落研发中心卡槽;FTS5 立即命中(单一写 API)+ AI 溯源徽章 + deliverable_committed 审计
5. **Agent 一等入口** — chatConsoleStore 唯一归属 + AgentConsole 双宿主(Drawer/工作区同一场对话)、⌘K 携带视图上下文(chip + carry 注入)、数据驱动晨报(零 LLM 纯查询)、右键快捷 AI 动作(选区快照 ≤200 字截断 + 不劫持编辑器)
6. **架构对齐真相源** — ARCHITECTURE.md v2.0 全文重写 + ADR-0001(架构切换)/ADR-0002(deepseek-harness MIT 归属),GraphFlow/Rig/LanceDB 正式出局

**统一人工 UAT:** 13-UAT 7/7 + 16-HUMAN-UAT 8/8(3 gap 当场修复)+ 17-HUMAN-UAT 6/6(含 v0.2.0 遗留 35 步回归闭合)

### Known Gaps (tech debt)

- FTS5 runtime probe on packaged build 未执行(dev 模式已验证;发布前检查项)
- Phase 13/14 真进程 kill 恢复路径未实测(自动化覆盖模拟路径,16 UAT 重启恢复已旁证)
- 中文 PM 长尾词汇 recall 质量决策点;产品删除时 events/memories/FTS 保留策略未决策
- DELIV-04「同一事务」为补偿控制近似(tauri-plugin-sql 无跨 execute 事务;单一写 API + 立即索引 + 查询期过滤,操作上满足)
- UX 观察项:产品 chip 的 × 与 Selected Product 恒注入语义不一致;晨报折叠横条可发现性弱
- migrations 0002-0004 注释引用已不存在的 APP_SCHEMA_VERSION 常量(注释漂移)
- v0.2.0 结转:云 provider 凭据 UAT、taskStore/scheduleStore v1→v2 迁移实测、MarkdownEditor chunk ~297 KB、CSP null

---

## v0.2.0 日常管理 CRUD + 弱关联 + AI 驱动 (Shipped: 2026-08-14)

**Phases completed:** 8 phases (5-12), 34 plans
**Timeline:** 2026-08-10 → 2026-08-13 (82 commits, 197 files, +28614/-2243 LOC)
**Audit:** passed — 24/24 REQ-IDs 满足,8/8 phase 验证,12/12 集成边界,5/5 E2E flows,0 critical/high 安全项 (`.planning/milestones/v0.2.0-MILESTONE-AUDIT.md`)

**Key accomplishments:**

1. **任务 CRUD 补全** — TaskDialog 创建/编辑双模式 + TaskKanban 重写(inline 编辑 / DotsMenu / @dnd-kit 拖拽)+ taskStore 弱关联字段 (projectId?/scheduledEventId?) + persist v2 migration
2. **日程 CRUD + 真实月历** — ScheduleView 完全重写(currentMonth state 驱动,42 格动态网格,月份切换)+ ScheduleDialog + ScheduleEvent.date number→string 迁移
3. **跨模块弱关联联动** — "安排到日历"一键完成、双向关联徽章/跳转、产品删除级联清理、任务完成同步日程、产品-研发联动(里程碑交付物徽章 + 阶段就绪率)
4. **MDXEditor 集成** — Markdown WYSIWYG 编辑替换全部 Textarea,知识库/产品文档编辑流程落地
5. **AI 助手全链路** — Rust provider-agnostic llm.rs + Tool registry (Zod) + ⌘K palette + ChatPanel + 任务/日程/文件/知识库 tools,含候选生成/取消/显式确认 HITL 流;Ollama 生产 tool-call UAT 通过
6. **Gap Closure (Phase 12)** — 修 INT-01 (KnowledgeBaseView 接 rndStore)、backfill 5 个 phase VERIFICATION.md、Express 3 个 MEDIUM 安全加固

### Known Gaps (tech debt)

- taskStore/scheduleStore v1→v2 迁移未实测(v1 生命周期短无真实数据,函数已有单测覆盖)
- Phase 7 的 35 步人工回归未做(建议发布签核前补)
- MarkdownEditor chunk ~297 KB gzip(超 250 KB 目标,non-blocking)
- 云 provider (Anthropic/OpenAI) 无凭据未测;Ollama + mock UAT 已通过
- Tauri CSP 仍为 null(v0.1.0 遗留 debt)

---
