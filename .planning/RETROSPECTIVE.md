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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v0.2.0 | 8 | 引入 milestone audit → gap closure phase 闭环;AI 功能采用 focused/mock + Ollama 双层 UAT |

### Top Lessons (Verified Across Milestones)

1. (待 v0.3 验证)gap closure phase 应成为 milestone 固定环节
