# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.2.0 — 日常管理 CRUD + 弱关联 + AI 驱动

**Shipped:** 2026-08-14
**Phases:** 8 (5-12) | **Plans:** 34 | **Commits:** 82 | **Timeline:** 2026-08-10 → 2026-08-13

### What Was Built
- 任务/日程全生命周期 CRUD(双模式 Dialog + inline 编辑 + @dnd-kit 拖拽 + 真实月历)
- 跨模块弱关联联动(安排到日历、双向徽章/跳转、级联清理、产品-研发联动 L5/L6/L7)
- MDXEditor Markdown WYSIWYG 全量替换 Textarea
- AI 助手全链路:Rust llm.rs 多 provider + Zod Tool registry + ⌘K + ChatPanel + 任务/日程/文件/知识库 tools + 取消/确认 HITL
- Phase 12 Gap Closure:audit gaps 全关(INT-01、VERIFICATION backfill、Express 安全加固)

### What Worked
- 粗粒度 phase + 并行 plan wave:Phase 5/6 复用同一 Dialog 模式,第二个近乎零成本
- Milestone audit → gap closure phase 的闭环:audit 找出 8 个 gap,Phase 12 一次性关闭,status 从 gaps_found 变 passed
- 弱关联(可选外键、不级联)设计让 CRUD 与联动解耦,Phase 7 wire-up 无 schema 返工
- Focused/mock UAT + Ollama 真实 tool-call UAT 组合:无云凭据也能验证生产路径

### What Was Inefficient
- 5 个 phase 完成后才发现缺 VERIFICATION.md,需要 Phase 12 backfill(纯文档债)
- Phase 9 的 plan 文件在 `9-ai` 目录而 roadmap 分析工具没计入 plan 数,导致统计口径反复(34 vs 25/31)
- 云 provider 无凭据,transport 层反复只能靠 mock,真实 UAT 拖到 milestone 后

### Patterns Established
- Dialog 创建/编辑双模式 + Combobox 选择器 + 嵌套删除确认(Phase 5/6 两次复用)
- persist v2 migration 模式(number→string 等破坏性变更走 version bump)
- 候选生成 → 取消 → 显式确认的 AI HITL 流(toolLoop + ConfirmationRequiredError)

### Key Lessons
1. 计划阶段就给每个 phase 定 VERIFICATION.md 产出,避免收尾 backfill
2. phase 目录命名必须零填充且一致(`09-` vs `9-` 会破坏工具链统计)
3. AI 功能 UAT 分层:mock 验逻辑、本地 provider 验生产路径、云 provider 凭据到位后补终验

### Cost Observations
- Model mix: planner=opus, executor=sonnet (balanced profile)
- Timeline: 4 天 8 phase,节奏稳定
- Notable: gap closure phase(12)成本远低于分散返工,值得保留为 milestone 固定环节

---

## Milestone: v0.3.0 — 功能闭环

**Shipped:** 2026-08-17
**Phases:** 5 (13-17) | **Plans:** 19 | **Commits:** 149 | **Timeline:** 2026-08-14 → 2026-08-17(4 天)

### What Was Built
- 事件日志底座:agent_events/agent_artifacts + 配对不变量 + ChatSession 投影 + toolLoop 单历史 + replay parity 永久测试
- 可恢复执行:确认候选 SQLite 持久化(原子消费)+ 崩溃尾切/interrupted + 0.8× 配对边界压缩
- 第二大脑:记忆候选确认流(防轰炸三项 + supersedes)+ 版本化知识文档 + CJK FTS5 混合检索 + 五段上下文注入
- PRD 生产线:两段式候选 → PrdDraftDialog(MDXEditor)→ 版本化落研发中心卡槽 + AI 溯源徽章 + FTS5 立即命中
- Agent 一等入口:chatConsoleStore 双宿主 + ⌘K carry + 数据驱动晨报 + 右键快捷动作
- ARCHITECTURE.md v2.0 + ADR-0001/0002(GraphFlow/Rig/LanceDB 正式出局)

### What Worked
- 依赖链拆 phase(event log → 确认/恢复 → 记忆/FTS5 → 生产线 → UX):每个 phase 在前一个的真相传真源上叠加,无返工
- 冻结公开签名的重构方式(13-03 toolLoop 单历史,公开 API byte-compatible):ChatPanel/CmdKPalette 零 diff
- 永久测试锚定不变量(replay parity、invariants):后续 phase 大改(压缩/恢复/双宿主)时免费回归
- 统一延后 UAT:16/17 全部人工验收集中到里程碑末一次会话(21/21 pass),配合 DB 代查(context_injected/审计事件)把「用户感知」和「数据真相」双签核
- UAT 发现 gap 当场诊断当场修(16 的 3 个 gap 在同一会话内修复+回归),不进 gap-closure phase

### What Was Inefficient
- Phase 15 并行 wave 合并关闭时又漏了 VERIFICATION.md(v0.2.0 lesson #1 应验第二次)— 本次靠 audit 集成检查器现场验证 + backfill 关闭;verifier 步骤需要并入 wave 合并流程而非依赖单 phase 收尾
- 弱模型(Ollama 小参数)偶发「空谈不调工具」,UAT 花了额外轮次引导重试 — 非代码问题但拖慢人工验收
- 我方 UAT 测试预期写错一次(17 Test 2b:以为产品知识来自 carry,实际来自 Selected Product 恒注入段)— 写预期前应先读实现,判 pass/fail 才有据

### Patterns Established
- append-only 事件日志 + 投影派生(单一真相源)模式 — 后续一切恢复/审计/回放能力的地基
- 原子条件 UPDATE 消费 + paramsHash 规范化去重(重启存活、恰一成功)
- consume-at-确认点(候选是落槽前唯一真相,cancel 无损)
- 双宿主组件 + transient store 唯一归属(同构由结构保证)
- Claude 代查 DB 佐证 UAT(user 验感知,agent 查事件/表,双签核)

### Key Lessons
1. **并行 wave 的 phase 关闭必须带 verifier 检查单**(VERIFICATION.md/REQUIREMENTS 勾选)— 两次里程碑两次漏,流程性缺失不能靠记性
2. 人工 UAT 的预期描述要先对照实现再写给用户,否则会把设计行为误判为 bug
3. 测试先行的纯函数模块(reportSelectors/context.ts)让「数据驱动零 LLM」类需求天然可验,UI 只是薄投影
4. 集成检查器 backfill VERIFICATION 是可行兜底,但成本高于收尾时顺手生成

### Cost Observations
- Model mix: balanced profile(planner=opus, executor/checker=sonnet)
- Timeline: 4 天 5 phase(19 plans),与 v0.2.0 节奏相当但单 phase 更重(存储/不变量密集)
- Notable: 4 个 UAT gap(GAP-13-01 + 16×3)全部当场修复,零 gap-closure phase — v0.2.0 教训的直接改进

---

## Milestone: v0.3.1 — 多 Session 会话体系

**Shipped:** 2026-08-19(closed 2026-08-24)
**Phases:** 4 (18-21) | **Plans:** 10 | **Commits:** 107 | **Timeline:** 2026-08-17 → 2026-08-19(2 天,含穿插 quick 任务群)

### What Was Built
- Session 数据模型底座:migration 0007(sessions 表 + 幂等回填 + workspace_id 回填)+ sessionRepo 双实现 + toolLoop workspaceId stamping + confirmations sessionId 根因修复
- 多 Session 运行时:restoreSession 参数化(sessions[0] 假设移除)+ activeSessionId/switchSession + streaming 双层守卫 + pending 卡片四类读路径按 session 过滤
- 引用式 fork:fork.ts 纯函数层(零复制 + seq 归一化 + compaction remap)+ resolveSessionEvents 投影融合(支持 fork-of-fork)+ hover 工具栏与来源徽章
- Session 列表与自动命名:真实最近列表 + ChatPanel scoped 双 Select + Ctrl+K/Ctrl+Shift+K 分流 + generateSessionTitle(LLM+fallback)fire-and-forget
- 工作区协同 quick 任务群:真实扫描 / FileTree 拖拽移动 / 知识库↔归档互转 / 会话纪要投影 / 磁贴切换 / workspace switcher

### What Worked
- 依赖链顺序正确:数据模型(18)→ 运行时(19)→ 分支(20)→ 列表/入口(21),每 phase 站在前一 phase 的真相源上,无返工
- 纯函数层 TDD(fork.ts 测试先行 11 case):fork 语义(零复制/seq 归一化/compaction remap)全部锁定在纯函数,UI 只是投影薄层
- 假设移除一次到位:sessions[0] 假设直接参数化删除,不留兼容 shim,靠 190 个测试兜底
- 系统性读路径清点:pending 卡片「四类读路径」一次清点全部过滤,而非等 bug 报告逐个修
- Playwright MCP 辅助 UAT:结构快照代替人工点击,无 GEMINI_API_KEY 环境验 fallback 分支 + console error 断言,3 项人工 UAT 半自动化出证据

### What Was Inefficient
- **收口拖期 5 天且顺序颠倒(本里程碑最大流程失误)**:Phase 21 完成于 08-19,complete-milestone 拖至 08-24,期间已 `/gsd:new-milestone` v0.3.2(ROADMAP/REQUIREMENTS 已被覆盖为 v0.3.2 内容)→ CLI `milestone complete v0.3.1` 归档目标错位不可用,被迫手工收口(MILESTONES/PROJECT/RETROSPECTIVE/tag 全手写)
- UAT 期望文档过时:Phase 21 验证(08-19)后用户 quick 新增 WorkspaceSwitcherRow(08-19 晚),08-24 跑 UAT-3 时期望文本已不符 — 判定为期望过时而非回归,但暴露 VERIFICATION 文档不随 quick 改动刷新的缺口
- LLM 成功分支无凭据可验:自动命名的 live LLM 路径只能靠 fallback 代验,真验留待有 key 环境

### Patterns Established
- 引用式 fork:分支不改写事件历史,parent_run/seq 归一化在投影层融合 — 后续 Rust 引擎 replay parity 的同构基础
- fire-and-forget 副作用挂 submit finally:自动命名不阻塞对话主流程,sessionListVersion 静默刷新
- LLM+fallback 链的辅助功能(never throws):主流程对辅助能力零依赖
- quick 任务群与 phase 并行的节奏:phase 交付主干,quick 吸收用户即时反馈,互不阻塞

### Key Lessons
1. **complete-milestone 必须在 new-milestone 之前完成** — 否则归档目标错位,CLI 不可用,手工收口成本远高于及时收口
2. VERIFICATION 期望文本是快照,quick 任务改变行为后需顺带刷新,否则后续 UAT 误判回归
3. 无凭据环境的 UAT 策略:fallback 分支验证 + 结构快照断言 + 预期 console error 核对,三项组合可覆盖大部分人工验收点

### Cost Observations
- Timeline: 2 天 4 phase(10 plans),穿插 ~15 个 quick 任务,节奏为三个里程碑最快
- Tests: 174 → 217(+43),增量全在 session/fork 纯函数层
- Notable: 本里程碑零 gap-closure、零 UAT 当场修复(全部一次过),质量节奏稳定

---

## Milestone: v0.3.2 — Rust Run Engine

**Shipped:** 2026-08-31
**Phases:** 4 (22-25) | **Plans:** 21(含 22-08/09/10 三轮 UAT gap closure)| **Commits:** 114 | **Timeline:** 2026-08-24 → 2026-08-31(8 天)

### What Was Built
- Rust 常驻 run engine:toolLoop/compaction/contextAssembler 语义移植,agent_* 表 Rust 唯一写者,`engine_run` 经 Channel 成为唯一 agent 运行时
- Replay parity 逐位锁定:算法金样本 + 投影用例 + 真实 v0.3.x 存量日志(264+42 events)三层 fixture 单源双侧,永久测试
- TS 运行时删除(-1371 行):ADR-0003 Accepted,ARCHITECTURE v3.0 引擎分层
- 原生工具层(无桥):exec(白名单 + HITL 重执行)/fs/knowledge/deliverable 四类工具全 Rust 原生
- 多 run 并行 + 托盘常驻:VecDeque FIFO cap 3、hide-on-close 后台不中断、系统通知 + 一键跳回、取消全链路
- 三轮 UAT gap closure:productId 兜底 → category 枚举 → params_hash 域对齐,knowledge_write HITL 链闭合

### What Worked
- **replay parity 先行**:TS 217 测试定性为「可执行规格」,迁移验收 = 逐位回放存量日志,而非重新定义行为 — 全程零语义漂移争议
- **协议最先定稿(PORT-01)**:引擎搬家前锁孤儿 exec 第三态协议,避免了迁移中最贵的协议返工
- **无桥决策及时**:发现业务数据为 kv JSON 快照后立即取消 TS 工具桥,避免建即拆的过渡架构(TOOL-03/04 重定义,零沉没成本)
- **双写者规则清晰**:agent_* 表 Rust 立即接管、业务表过渡期 TS 写 Rust 只读,边界无争议

### What Was Inefficient
- **knowledge_write 跨边界 bug 三轮才闭合**(productId → category enum → params shape):同一 bug 类(「两侧独立计算同一 hash/校验域」)反复出现,前两轮修症状、第三轮才识别结构根因;若 round 1 就建立「TS 预计算常量在 Rust 断言」的互锁测试,可省两轮 gap closure
- **UAT 轮次偏多(3 轮)**:每轮各出一个 gap closure plan;跨边界工具链(knowledge_write)缺少一次性全字段对照审查
- 22-UAT Test 7 人工复测最终未在收口前完成(代码级已锁,留真实 LLM 环境补验)

### Patterns Established
- **常量互锁测试**:跨语言不变量用 TS 侧预计算常量在双侧断言(memory 先例 → knowledge_write 推广),结构上杜绝域漂移
- **hash 域 = 规整后对象**:候选 params_hash 计算对象必须是重放侧再规整的不动点(fixed point),而非原始模型 args
- fixture 单源双侧(glob 拥有全部回放测试):跨语言语义对齐的唯一可信机制

### Key Lessons
1. 跨边界不变量(哈希/校验/协议)不能各侧各自测试 — 必须双侧互锁(常量或共享 fixture),否则接缝处必漂移
2. 语义迁移的验收基准是「回放旧世界的真实数据」,不是「新世界自洽」— 真实存量日志 fixture 应尽早采样
3. 同类 bug 第二次出现时就该找结构根因,而不是继续逐字段打补丁

### Cost Observations
- Timeline: 8 天 4 phases + 3 gap closure plans(引擎移植主体 4 天完成,gap closure 占后 3 天)
- Tests: cargo ~60 → 176,npm 217 → 222(净增主要在 Rust 侧;TS 侧删除运行时同时保留规格测试)
- Notable: 22-10 一轮内 2 task/2 files 即闭合 major gap — 常量互锁测试让修复面收敛到单点

---

## Milestone: v0.3.3 — 产研半落地 + 工作区入驻

**Shipped:** 2026-09-04(带债收口)
**Phases:** 6 (26-31;4 complete + 27 suspended 3/4 + 28 postponed)| **Plans:** 25(24 complete)| **Commits:** 169 | **Timeline:** 2026-08-31 → 2026-09-04(5 天)

### What Was Built
- Mock 全清 + tab 接引擎(26):产研各 tab AI 按钮接真实 engine_run,knowledge_docs 唯一真相源,调度双队列,一键十八份 = 单 run 多步
- PM CRUD 工具原生化(29):9 工具三档风险 + 关系表 + kv 幂等搬移 + SQL 单真相源,Rust 一事务确认收口
- 工作流用户自组织(30):catalog 单源 JSON(TS+Rust 同读)、workflow_ 工具族、「工作流」视图 + 5 内置模板、确定性沉淀链(零 LLM)
- 文档工作区(31):Milkdown core headless 全量替换 MDXEditor,右侧常驻面板、doc_kind=note、确认卡第三宿主、⌘K 左滑
- 纯 Rust 文档摄取(27,3/4 挂起):pdf_oxide 中文提取 + 批量 HITL 后端 + 前端流;UAT-2 修复已提交待回归

### What Worked
- **优先级重定果断**:2026-09-02 用户基于真实使用反馈(四大缺口)砍 27/28、promote 999.6,三天连续交付 29/30/31 三个 UAT 全过 phase — 路线图服从真实价值,沉没成本不绑架
- **产品哲学先行**:Phase 30 立项前定「工作流用户自组织、严禁刚性 pipeline」红线,VERIFICATION 显式做哲学红线检查 — scope 约束前置到 discuss 阶段
- **UAT 驱动三轮迭代闭环(31)**:round-0 五 gap 诊断 → 修复 → round-1 暴露新引入缺陷 → 根因修复(repro 脚本 4 断言)→ round-2 全过;每轮 gap 全录 root_cause + debug session
- **knowledge_docs 单管线复用**:tab 产物/摄取/笔记/模板确认全走同一候选→HITL→版本化管线,四个 phase 共享零重复建设

### What Was Inefficient
- **31-09 首轮实现引入 2 个缺陷**(codeBlock 缺 contentDOM、normalizeMarkdown 改写 GFM 表格行):修复计划(plan-checker 两轮)严,但实现时未跑已有 repro 模式 — NodeView 契约(contentDOM 必需)与序列化 round-trip 应在实现前写断言,可省一轮复测
- **REQUIREMENTS 未随 promote 更新**:29/30/31 的 PM/WF/DOC 需求在 discuss 里定义,从未回填 REQUIREMENTS.md,verifier 记流程债 — promote 流程缺需求登记门
- **Phase 27 挂起半途**:UAT-2 修复已提交却未回归即挂起,「差一步完成」状态将持续产生恢复成本(需记忆 + 恢复文档)
- complete-milestone 时 gsd-tools 缺 roadmap/milestone 子命令,归档全手工(v0.3.1 已发生,工具债持续)

### Patterns Established
- **NodeView + Decoration 扩展模式**:Milkdown/ProseMirror 自定义节点 = $view 纯 DOM + contentDOM 契约 + Prism.tokenize→Decoration.inline(不碰 PM 拥有的 DOM)— 可编辑 + 高亮并存
- **jsdom repro harness**:编辑器序列化 round-trip 问题在 Node 侧最小复现(显式替换 CustomEvent/getComputedStyle),4 断言脚本进 .planning/debug/
- **确定性沉淀链**:从事件日志确定性提取(零 LLM)→ Dialog 人工编辑 → 单一写路径落库 — 「AI 提议、人拍板」的最廉价形态
- **单源 JSON 双语言消费**:TS import + Rust include_str! 读同一文件,catalog 漂移在结构上不可能

### Key Lessons
1. 里程碑中期可以(且应该)重定优先级 — 用户真实使用反馈比路线图完整性值钱;前提是债务显式记录(带债收口)
2. 编辑器类功能的验收门 = 真机 IME/round-trip UAT,自动化 lint/tsc 测不出 contentDOM 缺失与序列化污染
3. 序列化归一化(normalizeMarkdown)必须按行类型分 guard —「一处归一化全场景适用」的假设在 GFM 表格上翻车
4. promote(999.6→Phase 29)必须携带需求登记,否则 traceability 断链

### Cost Observations
- Timeline: 5 天 6 phases(29 四天三 phase 高速;31 一个 phase 含三轮 UAT 占两天)
- Tests: npm 222 → 234(+12,主要为 workflow/catalog);replay parity 保持
- Notable: 27-04 挂起为唯一未收口 plan;31 gap closure 占 9 plans 中的 4 个(31-06..09)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v0.2.0 | 8 | 引入 milestone audit → gap closure phase 闭环;AI 功能采用 focused/mock + Ollama 双层 UAT |
| v0.3.0 | 5 | 依赖链拆 phase + 冻结签名重构 + 永久不变量测试;统一延后 UAT + DB 代查双签核;gap 当场修(零 gap-closure phase) |
| v0.3.1 | 4 | 纯函数层 TDD(fork.ts)+ 系统性读路径清点;Playwright 半自动 UAT(无凭据环境 fallback 代验);收口顺序失误教训(complete-milestone 须先于 new-milestone) |
| v0.3.2 | 4+3gap | 跨语言迁移 = fixture 单源双侧 + 逐位回放验收;跨边界不变量双侧互锁测试(常量互锁模式);TS 测试定性为可执行规格 |
| v0.3.3 | 6(4+2挂起) | 里程碑中期优先级重定(用户真实使用反馈驱动)+ 带债收口;产品哲学红线前置到 discuss;编辑器类功能以真机 IME/round-trip UAT 为验收门 |

### Top Lessons (Verified Across Milestones)

1. ~~(待 v0.3 验证)gap closure phase 应成为 milestone 固定环节~~ — v0.3.0 验证反例:gap 若能在 UAT 会话当场修复,无需独立 phase;audit 兜底即可
2. **VERIFICATION.md 缺失已两次发生**(v0.2.0 五个、v0.3.0 一个)— 根因是流程而非记忆,phase 关闭(含并行合并)必须检查单化
