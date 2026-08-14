# Milestones

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
