# Roadmap: Nova-PM-Workspace — v0.2.0

## Overview

v0.2.0  milestone: **日常管理 CRUD + 弱关联 + AI 驱动**。七个 phase 完成任务管理 CRUD 补全、日程管理 CRUD + 真实日历、跨模块弱关联联动(含产品-研发联动)、Markdown 编辑器集成、以及 AI 驱动的完整工作闭环。Phase 5-8 为前端 + store 层工作,Phase 9-11 为 AI 驱动功能。

**Phase numbering continues from v0.1.0 (Phases 1-4).**

### v0.1.0 Recap (completed)

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 1 | Dark Mode Wiring | ✅ Complete | 2026-08-08 |
| 2 | Persistence (Zustand persist + SQLite) | ✅ Complete | 2026-08-08 |
| 3 | Tauri IPC Migration + Security Baseline | ✅ Complete | 2026-08-08 |
| 4 | GraphFlow + Rig PoC | ⏸️ Deferred to v0.3+ | — |

### 前置调研 (completed, 不在 phase 序列中)

| 调研 | 状态 | 完成日期 | 报告 |
|------|------|----------|------|
| Atomic Editor 调研 (原 Phase 8) | ✅ 完成 | 2026-08-10 | `.planning/research/ATOMIC-EDITOR.md` |
| 产品-研发联动调研 (原 Phase 9) | ✅ 完成 | 2026-08-10 | `.planning/research/PRODUCT-RND-LINKAGE.md` |

## Phases

- [ ] **Phase 5: Task CRUD 补全** — taskStore actions (update/delete/reopen/move) + TaskDialog (create/edit) + TaskKanban 卡片菜单 + DnD 拖拽 + 弱关联字段 (projectId?/scheduledEventId?) + persist v2 migration
- [ ] **Phase 6: Schedule CRUD + 真实日历** — scheduleStore actions (update/delete) + ScheduleEvent.date 从 number 迁移到 string (YYYY-MM-DD) + 月历真实渲染 + 月份切换 + ScheduleDialog (create/edit) + 弱关联字段 (projectId?/taskId?) + type:'task'
- [ ] **Phase 7: 跨模块联动 + 产品-研发联动** — "安排到日历" (task→event 双向引用) + 关联徽章 (AssociationBadge) + 点击跳转 + 产品删除时关联清理 + 任务完成→日程同步标记 + 产品-研发联动 (L5 里程碑↔交付物状态 / L6 阶段↔phase 进度 / L7 删除产品级联清理 rndStore)
- [ ] **Phase 8: MDXEditor 集成** — 新增 MarkdownEditor 组件封装 MDXEditor + React.lazy() 延迟加载 + ProductKnowledgeTab 替换 Textarea + KnowledgeBaseView 实现编辑按钮 + Tailwind v4 样式共存验证
- [ ] **Phase 9: AI 助手基础** — Hand-rolled tool registry + tool loop (JS webview 内,~200 LOC) + ⌘K command palette (Raycast-style) + slide-out chat panel (400-480px) + 10-15 基础 tools + multi-provider LLM (DeepSeek/Claude/GPT/Gemini/Ollama via rig-core) + core context injection (~500-1000 tokens) + 通用 LLM proxy endpoint
- [ ] **Phase 10: AI 任务+日程闭环** — 扩展 tool set (updateTask/deleteTask/moveTask/rescheduleTask) + 自然语言任务 CRUD + AI "安排到日历" + multi-turn conversations + 截止日期智能建议 + 批量操作
- [ ] **Phase 11: AI 文件+知识库** — 扩展 tool set (listWorkspaceFiles/readKnowledgeArticle/writeKnowledgeArticle) + workspace 文件摘要 + 知识库文章生成/润色 + 产品文档辅助 + R&D 交付物增强 (升级 generateDeliverableAI 到 Tool Use) + 知识组织

## Phase Details

### Phase 5: Task CRUD 补全
**Goal**: 用户可以在看板中完成任务的全生命周期操作 —— 创建、内联编辑、对话框编辑、删除(带确认)、重新打开、拖拽移动,并且任务开始支持可选的产品/日程弱关联
**Depends on**: Nothing (v0.1.0 Phase 1-3 已完成)
**Requirements**: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07, TASK-08, TASK-09
**Success Criteria** (what must be TRUE):
  1. 用户可以在 TaskKanban 卡片展开面板中内联编辑任务的所有字段(标题/描述/优先级/截止日期/分类)
  2. 用户可以通过独立对话框(TaskDialog)创建新任务或编辑现有任务,对话框支持产品选择器(设置 projectId 并镜像 project 名字段)
  3. 用户可以删除任务,触发二次确认对话框,确认后任务从看板消失
  4. 用户可以将"已完成"状态的任务重新打开为"未开始"状态(在卡片菜单或展开面板中)
  5. 用户可以在看板列之间拖拽任务卡片(@dnd-kit 实现),拖拽后任务的分类自动更新
  6. 任务卡片上显示关联产品的徽章(如有 projectId),点击可跳转到产品详情
  7. taskStore persist 版本升级到 2,旧数据通过 migrate 函数自动补充 projectId?/scheduledEventId? 可选字段,刷新/重启后数据完整
  8. 新建任务的 ID 使用 crypto.randomUUID() 生成,快速连续操作不会产生 ID 碰撞
**Plans**: 5 plans
- [x] 05-01-PLAN.md — taskStore 5 actions + Task 类型扩展 + persist v2 + AppContext 兼容
- [x] 05-02-PLAN.md — Drawer 可复用组件 + ProductSummaryDrawer 业务内容
- [x] 05-03-PLAN.md — TaskDialog 创建/编辑双模式 + Combobox + 嵌套删除确认
- [x] 05-04-PLAN.md — TaskKanban 重写: inline 编辑 + DotsMenu + @dnd-kit DnD + 产品徽章
- [ ] 05-05-PLAN.md — Phase 5 全量 UAT checkpoint
**UI hint**: yes

### Phase 6: Schedule CRUD + 真实日历
**Goal**: 用户拥有真实可用的月历视图,可以创建/编辑/删除日程事件,自由切换月份,日程事件支持可选的产品/任务弱关联
**Depends on**: Phase 5 (复用 Dialog 模式;确立 persist v2 migration 模式)
**Requirements**: SCHED-01, SCHED-02, SCHED-03, SCHED-04, SCHED-05, SCHED-06, SCHED-07, SCHED-08
**Success Criteria** (what must be TRUE):
  1. 用户可以点击"新建日程"按钮打开 ScheduleDialog,选择日期(通过 DatePickerInput)、时间、类型、地点,创建日程事件
  2. 用户可以点击日历上的日程事件进行编辑,对话框预填当前值(标题/日期/时间/类型/地点)
  3. 用户可以删除日程,触发二次确认对话框,确认后事件从日历消失
  4. 用户可以在月历上切换月份(上/下月按钮 + "今天"回到当前月),日历网格实时重新渲染,不再写死 2025年5月
  5. ScheduleEvent.date 已全量从 number(1-31)迁移到 string(YYYY-MM-DD),scheduleStore persist v2 migration 将旧 number 日期转为 YYYY-MM-DD 字符串(基于 May 2025 锚点)
  6. ScheduleEvent 支持 projectId?/taskId? 弱关联字段和 type:'task' 枚举值,为 Phase 7 跨模块联动做好准备
  7. 日历网格正确显示事件:事件出现在其 date 对应的日期格中,月份切换后事件位置正确
**Plans**: TBD
**UI hint**: yes

### Phase 7: 跨模块联动 + 产品-研发联动
**Goal**: 任务/产品/日程/研发 四个模块通过弱关联字段自然协作 —— "安排到日历"一键完成、关联徽章可视化、删除产品时关联清理、任务完成联动日程标记、里程碑展示交付物状态、产品阶段展示交付物进度、删除产品级联清理 rndStore 孤儿数据
**Depends on**: Phase 5 (Task CRUD) + Phase 6 (Schedule CRUD)
**Requirements**: CROSS-01..07 + L5/L6/L7 (产品-研发联动)
**Success Criteria** (what must be TRUE):
  1. 用户可以在任务卡片/对话框上点击"安排到日历",自动创建关联的 ScheduleEvent(type='task',日期取自任务截止日期),taskId 反向引用任务,标题同步任务标题
  2. 用户删除产品时看到提示"X 个任务、Y 个日程将失去关联",确认后保留所有记录但清空 projectId 字段(弱关联,不级联删除);同时 rndStore 中该产品的所有数据被清理(无孤儿)
  3. 日程视图上,关联任务的日程显示任务徽章;任务卡片上显示关联产品/日程的徽章;所有徽章均可点击跳转到对应模块并定位
  4. 用户完成任务后,若有关联日程,日程自动同步标记完成(视觉降饱和,不删除)
  5. 删除已关联的日程时,任务的 scheduledEventId 自动清空;删除已关联的任务时,日程的 taskId 自动清空 —— 双向清理,不留孤儿引用
  6. 里程碑面板展示关联交付物的 ready/draft/generating 状态(L5 milestone.deliverableCodes → FullLifecycleDeliverable.status)
  7. 产品治理视图和研发中心视图都展示当前阶段的交付物就绪率(L6 product.stage → deliverable.phase 进度)
**Plans**: TBD
**UI hint**: yes

### Phase 8: MDXEditor 集成
**Goal**: 知识库和产品文档拥有真正的 Markdown WYSIWYG 编辑能力,替换原生 Textarea,提供格式化反馈
**Depends on**: Phase 7 (不影响 CRUD 主线,但排在后面避免并行开发分散注意力)
**Requirements**: EDITOR-01..05 (前置调研结论已输出)
**Success Criteria** (what must be TRUE):
  1. 新增 `src/components/ui/MarkdownEditor.tsx`,封装 MDXEditor,API 与 Nova 设计系统对齐(value/onChange/readOnly/className)
  2. ProductKnowledgeTab 的 `<Textarea>` 替换为 `<MarkdownEditor>`,编辑时实时渲染 Markdown 格式化效果
  3. KnowledgeBaseView 的 "编辑" 按钮接入 MarkdownEditor,实现完整的知识库文章编辑流程
  4. MDXEditor 使用 React.lazy() 延迟加载,不影响首屏性能;按需引入 plugins(toolbar/tables/code blocks),bundle 增量控制在 ~250KB gzip
  5. 纯渲染场景(6 处 react-markdown)保持不变;Tailwind v4 样式共存验证通过(无 CSS 冲突)
**Plans**: TBD
**UI hint**: yes

### Phase 9: AI 助手基础
**Goal**: 搭建 AI 驱动的 Tool Use 架构基础,用户可以通过 ⌘K command palette 或 slide-out chat panel 使用自然语言执行基础操作
**Depends on**: Phase 7 (复用弱关联字段作为 AI 操作目标)
**Context**: `.planning/phases/9-ai/9-CONTEXT.md` (22 decisions locked, 2026-08-10)
**Requirements**: TBD (AI phase 需求待细化)
**Success Criteria** (what must be TRUE):
  1. Tool Use 架构搭建完成:hand-rolled tool registry (Map<name, tool>) + tool loop (~200 LOC,JS webview 内),tool schema 用 Zod 定义,JSON Schema 传给 Rust LLM call
  2. ⌘K command palette UI 上线 (Raycast-style),同时触发命令菜单 + AI 对话,支持快速操作(创建任务、跳转产品、新建日程等)
  3. Slide-out chat panel 从右侧滑出 (400-480px 宽,遵循 tokens.css 设计系统),支持多轮对话
  4. 10-15 个基础 tools 可用:createTask、listTasks、listProducts、createScheduleEvent、listScheduleEvents、getProductDetails 等 (tool 实现 = Zustand store action 调用)
  5. Multi-provider LLM 支持:DeepSeek/Claude/GPT/Gemini/Ollama via rig-core,Settings UI 有 provider selector + API key per provider,默认 DeepSeek V4 Flash
  6. Core context injection 每次 LLM 调用注入 ~500-1000 tokens:selected product + active tasks (top 10) + upcoming events (next 7 days, top 5) + user preferences
  7. Rust 端 `llm.rs` 扩展为 provider-agnostic + tool schema 转发 + tool call 解析;新增 `chat` Tauri command (支持 messages + tools parameter)
  8. Express 简化:删除 5 个旧 AI 端点,保留 Vite middleware (dev HMR) + 单一 `/api/chat` LLM proxy (web 模式 fallback)
  9. 错误处理分层:参数错误 AI 自动修正(最多 1 次重试),其他错误向用户解释
**Plans**: TBD
**UI hint**: yes

### Phase 10: AI 任务+日程闭环
**Goal**: AI 深度参与任务管理和日程安排的全流程,用户可以用自然语言完成任务的创建/编辑/删除/安排
**Depends on**: Phase 9 (AI 基础架构) + Phase 7 (弱关联字段)
**Requirements**: TBD (AI phase 需求待细化)
**Success Criteria** (what must be TRUE):
  1. 扩展 tool set 包含任务/日程高级操作:updateTask、deleteTask、moveTask、rescheduleTask、associateTaskWithEvent
  2. 自然语言任务 CRUD:"帮我创建一个任务,下周完成产品需求文档,优先级高" → 自动解析 title/dueDate/priority 并调用 createTask
  3. 自然语言任务编辑/删除:"把这个任务优先级改为低" / "删除那个重复的任务" → AI 解析并调用 updateTask/deleteTask
  4. AI "安排到日历":用户说 "把这两个任务安排到下周" → AI 调用 associateTaskWithEvent 创建 task→event 弱关联
  5. Multi-turn conversations:"帮我规划下周工作" → AI 多步 tool use (listTasks → analyze → createScheduleEvents)
  6. 截止日期智能建议:AI 基于任务依赖 + 历史数据建议合理的 dueDate (通过 getTaskDependencies tool)
  7. 批量操作:"把所有高优先级任务标记为进行中" → AI 调用 listTasks(filter:{priority:'high'}) → 循环调用 updateTask
  8. 产品规划 AI 辅助:"帮我拆解这个产品的功能矩阵" → AI 调用 getProductDetails → 生成功能建议
**Plans**: TBD
**UI hint**: yes

### Phase 11: AI 文件+知识库
**Goal**: AI 深度参与文件工作区和知识库的内容生产,用户可以通过自然语言生成/润色/组织知识内容
**Depends on**: Phase 9 (AI 基础架构) + Phase 8 (MDXEditor 提供编辑能力)
**Requirements**: TBD (AI phase 需求待细化)
**Success Criteria** (what must be TRUE):
  1. 扩展 tool set 包含文件/知识库操作:listWorkspaceFiles、readWorkspaceFile、readKnowledgeArticle、writeKnowledgeArticle、updateKnowledgeArticle
  2. Workspace 文件摘要:"扫描这个工作区的文档,生成一份总结" → AI 调用 listWorkspaceFiles → 循环 readWorkspaceFile → 生成摘要
  3. 知识库文章生成:"基于这次会议记录,写一篇知识库文章" → AI 生成 Markdown 内容 → 调用 writeKnowledgeArticle 注入 MarkdownEditor
  4. 知识库文章润色:"帮我润色这篇文章" → AI 调用 readKnowledgeArticle → 优化内容 → 调用 updateKnowledgeArticle
  5. 产品文档辅助:"帮我写这个产品的 PRD" → AI 调用 getProductDetails → 生成 PRD 草稿 (Markdown 格式)
  6. R&D 交付物增强:现有 generateDeliverableAI (setTimeout mock) 升级为 Tool Use 架构,调用 getRndDeliverables tool 获取上下文,生成更精细的交付物
  7. 知识组织:"把这些文章按主题分类" → AI 调用 listKnowledgeArticles → 分析内容 → 调用 updateKnowledgeArticle 打标签/归类
  8. 知识库搜索 (预留):searchKnowledgeBase tool 接口定义完成,v0.3+ 接 LanceDB 向量检索
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Task CRUD 补全 | 3/5 | In Progress|  |
| 6. Schedule CRUD + 真实日历 | 0/TBD | Not started | - |
| 7. 跨模块联动 + 产品-研发联动 | 0/TBD | Not started | - |
| 8. MDXEditor 集成 | 0/TBD | Not started | - |
| 9. AI 助手基础 | 0/TBD | Context gathered | - |
| 10. AI 任务+日程闭环 | 0/TBD | Not started | - |
| 11. AI 文件+知识库 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-10*
*Last updated: 2026-08-10 after Phase 9 (原 Phase 10) context discussion*
*Granularity: 7 phases (5-8 CRUD+联动+编辑器, 9-11 AI 驱动)*
*Coverage: 24/24 v1 CRUD requirements mapped + AI phase requirements TBD*
*Previous milestone: v0.1.0 (Phases 1-4, see header)*
