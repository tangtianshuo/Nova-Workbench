# Milestones

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
