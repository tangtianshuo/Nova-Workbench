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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v0.2.0 | 8 | 引入 milestone audit → gap closure phase 闭环;AI 功能采用 focused/mock + Ollama 双层 UAT |
| v0.3.0 | 5 | 依赖链拆 phase + 冻结签名重构 + 永久不变量测试;统一延后 UAT + DB 代查双签核;gap 当场修(零 gap-closure phase) |

### Top Lessons (Verified Across Milestones)

1. ~~(待 v0.3 验证)gap closure phase 应成为 milestone 固定环节~~ — v0.3.0 验证反例:gap 若能在 UAT 会话当场修复,无需独立 phase;audit 兜底即可
2. **VERIFICATION.md 缺失已两次发生**(v0.2.0 五个、v0.3.0 一个)— 根因是流程而非记忆,phase 关闭(含并行合并)必须检查单化
