# Requirements: Nova-PM-Workspace v0.2.0

**Defined:** 2026-08-10
**Core Value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)

## v1 Requirements

本里程碑聚焦三条主线:任务 CRUD 补全、日程 CRUD + 真实日历、跨模块弱关联联动。

### Task CRUD (Phase 5)

- [ ] **TASK-01**: 用户可以在展开的卡片面板中内联编辑任务的所有字段(标题/描述/优先级/截止日期/分类)
- [ ] **TASK-02**: 用户可以在独立对话框(TaskDialog)中编辑任务,支持创建和编辑双模式
- [ ] **TASK-03**: 用户可以删除任务,带二次确认对话框防止误删
- [ ] **TASK-04**: 用户可以把"已完成"任务重新打开为"未开始"
- [ ] **TASK-05**: 用户可以在看板列之间拖拽任务卡片(@dnd-kit 实现)
- [x] **TASK-06**: 用户可以在 TaskKanban 卡片上看到关联产品的徽章(如有 projectId)
- [ ] **TASK-07**: Task 类型新增 projectId?(弱关联到 Product)和 scheduledEventId?(弱关联到 ScheduleEvent)
- [ ] **TASK-08**: taskStore persist 版本升级到 2,migrate 函数为已有数据补充新增可选字段
- [ ] **TASK-09**: 任务 ID 生成使用 crypto.randomUUID() 替代 Date.now(),避免快速操作时的 ID 碰撞

### Schedule CRUD (Phase 6)

- [ ] **SCHED-01**: 用户可以创建新日程("新建日程"按钮 → 对话框 + DatePickerInput,选择日期/时间/类型/地点)
- [ ] **SCHED-02**: 用户可以点击日程事件进行编辑(对话框预填当前值)
- [ ] **SCHED-03**: 用户可以删除日程,带二次确认
- [ ] **SCHED-04**: 用户可以在月历上切换月份(上/下月 + "今天"回到当前月),不再写死 2025-5
- [ ] **SCHED-05**: ScheduleEvent.date 从 number(1-31,仅日)迁移到 string(YYYY-MM-DD,完整日期)
- [ ] **SCHED-06**: scheduleStore persist 版本升级到 2,migrate 函数将旧 number 日期转为 YYYY-MM-DD 字符串(基于 May 2025 锚点)
- [ ] **SCHED-07**: ScheduleEvent 新增 projectId?(弱关联到 Product)和 taskId?(弱关联到 Task)
- [ ] **SCHED-08**: ScheduleEvent.type 新增 'task' 枚举值(用于"安排到日历"生成的日程)

### Cross-Module Wiring (Phase 7)

- [ ] **CROSS-01**: 用户可以在任务卡片上点击"安排到日历",自动创建关联的 ScheduleEvent(type='task',日期取自任务截止日期)
- [ ] **CROSS-02**: "安排到日历"生成的日程 taskId 反向引用任务,标题同步任务标题(可编辑)
- [ ] **CROSS-03**: 用户删除产品时看到提示"X 个任务、Y 个日程将失去关联",确认后保留记录但清空 projectId 字段(弱关联,不级联)
- [ ] **CROSS-04**: 日程视图上,关联任务的日程显示任务徽章;点击徽章跳转/高亮任务
- [ ] **CROSS-05**: 任务卡片上显示关联日程的徽章(如有 scheduledEventId);点击徽章跳转到日程视图
- [ ] **CROSS-06**: 用户点击关联徽章可跳转到对应模块并定位(产品→ProductManagementView,任务→TaskManagementView,日程→ScheduleView)
- [ ] **CROSS-07**: 完成任务后,若有关联日程,日程同步标记完成(视觉降饱和,不删除)

### ~~Atomic Editor 调研~~ (前置调研,即时执行)

> EDITOR-01..05 已作为前置调研即时执行,不在 phase 序列中。调研结果输出到 `.planning/research/ATOMIC-EDITOR.md`。

### ~~产品-研发联动调研~~ (前置调研,即时执行)

> LINKAGE-01..05 已作为前置调研即时执行,不在 phase 序列中。调研结果输出到 `.planning/research/PRODUCT-RND-LINKAGE.md`。

## v2 Requirements

延后到下一里程碑,本里程碑不实现。

### Drag-and-Drop Enhancements

- **DND-01**: 看板列本身的拖拽排序
- **DND-02**: 跨看板列的批量拖拽

### Calendar Enhancements

- **CAL-01**: 周视图(ScheduleView 已有"周视图"按钮占位)
- **CAL-02**: 日程的重复规则(每天/每周/每月)

### Task Enhancements

- **TASK-10**: 任务子任务/嵌套
- **TASK-11**: 任务模板
- **TASK-12**: 批量操作(多选 + 批量删除/状态变更)
- **TASK-13**: 全局任务搜索

### Cross-Module Enhancements

- **CROSS-10**: 日程 → 任务的创建(反向"安排到日历")
- **CROSS-11**: 周报/日报自动汇总(基于任务完成 + 会议参与)
- **CROSS-12**: 产品删除时的 undo 机制(toast + 5 秒撤销窗口)

## Out of Scope

显式排除,防止 scope creep。

| Feature | Reason |
|---------|--------|
| 级联删除(删产品自动删任务/日程) | 弱关联设计原则;任务有独立价值,数据丢失不可逆 |
| AppContext 全量移除 | 跟随各 view 迁移到 direct store hook 时逐步消除,不在本里程碑单独 phase |
| URL 路由 / 深链 | 当前 activeTab state 够用,深链是未来需求 |
| 多人协作 / 云同步 | "本地优先"设计原则;SQLite 单机足够 |
| 完整 PM Pipeline | 依赖 GraphFlow PoC(v0.3+) |
| 第二大脑(LanceDB 向量检索) | 依赖 PoC 验证结果 |
| GraphFlow + Rig PoC | deferred 到 v0.3+(pre-1.0 crate 风险) |
| task.project 字段移除 | legacy 兼容保留,projectId 为权威源;统一清理推到 v0.3+ |
| 国际化 (i18n) | UI 文案混合中英文,统一化是后续 polish 任务 |
| CI/CD pipeline | 当前 tsc --noEmit 仅本地,加 GitHub Action 是后续基础设施 |

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | task.project 保留做 legacy 兼容,新增 projectId? | 已有 3 个调用方依赖 task.project 做名字匹配;统一清理推到 v0.3+ |
| 2 | 新 CRUD 走 direct store hooks(useTaskStore/useScheduleStore) | CLAUDE.md 推荐模式;类型安全,不受 AppContext any cast 影响 |
| 3 | 跨 store 编排走 AppContext wrapper(deleteProductWrapped 模式) | 复用已有模式;避免 store 间直接 import 形成循环 |
| 4 | 任务编辑同时支持内联(展开卡片)和独立对话框(TaskDialog) | 内联匹配现有 click-to-expand 模式;对话框提供更完整的编辑体验 |
| 5 | 看板拖拽使用 @dnd-kit/core@6.3.1(legacy line) | v0.5.0 pre-1.0 文档不完善;legacy 6.x 与 React 19 兼容 |
| 6 | ScheduleEvent.date 全量替换为 string(YYYY-MM-DD) | 比增量 month?/year? 更干净;persist migrate 函数处理转换 |
| 7 | 删除用确认对话框(无 undo) | 本地优先 app 无服务端 undo;确认对话框是最简单的防误删方案 |
| 8 | "安排到日历"不自动同步截止日期变更 | 弱关联不是同步;修改任务截止日期不影响已创建的日程 |

## Traceability

由 roadmapper 在创建 ROADMAP.md 时填充。每个 v1 requirement 必须映射到唯一一个 phase。

| Requirement | Phase | Status |
|-------------|-------|--------|
| TASK-01 | Phase 5 | Pending |
| TASK-02 | Phase 5 | Pending |
| TASK-03 | Phase 5 | Pending |
| TASK-04 | Phase 5 | Pending |
| TASK-05 | Phase 5 | Pending |
| TASK-06 | Phase 5 | Complete |
| TASK-07 | Phase 5 | Pending |
| TASK-08 | Phase 5 | Pending |
| TASK-09 | Phase 5 | Pending |
| SCHED-01 | Phase 6 | Pending |
| SCHED-02 | Phase 6 | Pending |
| SCHED-03 | Phase 6 | Pending |
| SCHED-04 | Phase 6 | Pending |
| SCHED-05 | Phase 6 | Pending |
| SCHED-06 | Phase 6 | Pending |
| SCHED-07 | Phase 6 | Pending |
| SCHED-08 | Phase 6 | Pending |
| CROSS-01 | Phase 7 | Pending |
| CROSS-02 | Phase 7 | Pending |
| CROSS-03 | Phase 7 | Pending |
| CROSS-04 | Phase 7 | Pending |
| CROSS-05 | Phase 7 | Pending |
| CROSS-06 | Phase 7 | Pending |
| CROSS-07 | Phase 7 | Pending |
| EDITOR-01 | 前置调研 | In progress |
| EDITOR-02 | 前置调研 | In progress |
| EDITOR-03 | 前置调研 | In progress |
| EDITOR-04 | 前置调研 | In progress |
| EDITOR-05 | 前置调研 | In progress |
| LINKAGE-01 | 前置调研 | In progress |
| LINKAGE-02 | 前置调研 | In progress |
| LINKAGE-03 | 前置调研 | In progress |
| LINKAGE-04 | 前置调研 | In progress |
| LINKAGE-05 | 前置调研 | In progress |

**Coverage:**
- v1 requirements: 34 total (TASK: 9, SCHED: 8, CROSS: 7, EDITOR: 5 前置调研, LINKAGE: 5 前置调研)
- Mapped to phases (5-7): 24
- 前置调研 (即时执行): 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-10*
*Last updated: 2026-08-10 after roadmap creation (traceability validated)*
