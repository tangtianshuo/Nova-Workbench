# Phase 7: 跨模块联动 + 产品-研发联动 - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous mode — used REQUIREMENTS.md + ROADMAP.md + research as spec)

<domain>
## Phase Boundary

任务/产品/日程/研发 四个模块通过弱关联字段自然协作。本 phase 实现:1) "安排到日历" 任务→日程双向引用;2) 关联徽章可视化 + 跳转;3) 删除产品时关联清理;4) 任务完成联动日程标记;5) 产品-研发联动 L5/L6/L7 (里程碑展示交付物状态、阶段展示交付物进度、删除产品级联清理 rndStore)。

</domain>

<decisions>
## Implementation Decisions

### "安排到日历" (CROSS-01, CROSS-02)
- **D-01:** 任务卡片 DotsMenu 新增 "安排到日历" 项。点击后调用 `scheduleStore.createEvent` 创建 type='task' 的事件,日期取自任务截止日期(YYYY-MM-DD 部分),taskId 反向引用任务,scheduledEventId 写回任务
- **D-02:** 创建后弹出 toast "已添加到日历"。事件标题默认同步任务标题(用户可在 ScheduleDialog 编辑)
- **D-03:** 已有 scheduledEventId 的任务再次点击 "安排到日历" → 提示 "已安排,是否重新安排?" 二次确认

### 删除清理 (CROSS-03)
- **D-04:** 删除产品时弹出确认对话框,内容动态:"此操作将解除 X 个任务、Y 个日程的关联。研发中心中的 Z 个交付物/里程碑/原型/需求/知识/代码/测试/竞品/文档将被清理。是否继续?"
- **D-05:** 确认后:1) taskStore.tasks 中 projectId === deletedId 的任务的 projectId 清空;2) scheduleStore.events 中 projectId === deletedId 的 projectId 清空;3) rndStore 中该 productId 索引下的所有数据删除(级联清理,无孤儿)
- **D-06:** 删除产品逻辑放在 AppContext 的 wrapper(deleteProductWrapped)中,跨 store 编排,避免 store 间循环 import(沿用 REQUIREMENTS Key Decision #3 模式)

### 关联徽章 + 跳转 (CROSS-04, CROSS-05, CROSS-06)
- **D-07:** 任务卡片显示产品徽章(已有 Phase 5)、日程徽章(新增,如有 scheduledEventId,点击切到 schedule tab)
- **D-08:** 日程视图事件 chip 显示任务徽章(如有 taskId,点击切到 task tab 并选中该任务)和产品徽章(如有 projectId,通过 ProductSummaryDrawer 复用 Phase 5)
- **D-09:** 里程碑面板(ProductMilestonesTab)展示关联交付物 ready/draft/generating 状态徽章(L5)
- **D-10:** 产品治理视图和研发中心视图展示当前阶段的交付物就绪率(L6,基于 product.stage → deliverable.phase 映射)

### 任务完成联动 (CROSS-07)
- **D-11:** 任务完成(completeTask action)时,若 task.scheduledEventId 存在,同步在 scheduleStore 中标记该 event 为 "已完成" 状态(视觉降饱和,不删除)
- **D-12:** ScheduleEvent 接口新增 status 字段(沿用 task status 模式:'未开始'/'进行中'/'已完成')

### Claude's Discretion
- 徽章具体颜色/图标
- "安排到日历" 触发后的 UX(立即跳转日程 vs 留在当前视图)
- 里程碑↔交付物映射的字段名
- 阶段↔phase 进度的计算公式

</decisions>

<canonical_refs>
## Canonical References

### 项目级约束
- `.planning/PROJECT.md` — Core Value,Constraints,Key Decisions
- `.planning/REQUIREMENTS.md` — CROSS-01..07 + Key Decisions 3, 8
- `.planning/STATE.md` — Decisions 区段(L5/L6/L7 范围已锁)
- `.planning/research/PRODUCT-RND-LINKAGE.md` — 联动模型调研结论(MUST READ,定义 L5/L6/L7 具体字段映射)

### Phase 5/6 参考
- `.planning/phases/05-task-crud/05-CONTEXT.md` — task.projectId/scheduledEventId + ProductSummaryDrawer 模式
- `.planning/phases/06-schedule-crud/06-CONTEXT.md` — ScheduleEvent.projectId/taskId/type='task'

### 架构与代码规范
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/CONCERNS.md`

### ROADMAP
- `.planning/ROADMAP.md` §Phase 7

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ProductSummaryDrawer.tsx` — Phase 5 已建立,本 phase 在 ScheduleView 复用
- `src/components/ui/Badge.tsx` — 所有关联徽章
- `src/store/AppContext.tsx` — 跨 store 编排 wrapper(deleteProductWrapped 模式)

### Established Patterns
- 弱关联字段访问:`task.projectId`、`scheduleEvent.taskId`
- 跨 store 编排:`deleteProductWrapped` 在 AppContext 中调用多 store actions
- DotsMenu 操作扩展:Phase 5 TaskKanban 已建立 DropdownMenu 模式

### Integration Points
- `src/stores/taskStore.ts` — completeTask 触发 scheduleStore 标记
- `src/stores/scheduleStore.ts` — createEvent 接受 taskId 反向引用
- `src/store/AppContext.tsx` — 新增 deleteProductWrapped + arrangeOnCalendar wrappers
- `src/components/TaskKanban.tsx` — 任务卡片 DotsMenu 加 "安排到日历" + 日程徽章
- `src/views/ScheduleView.tsx` — 日程事件 chip 加任务徽章 + 产品徽章
- `src/components/product/ProductMilestonesTab.tsx` — L5 交付物状态展示
- `src/components/product/ProductGovernanceTab.tsx` — L6 阶段交付物进度
- `src/data/mockRndData.ts` — rndStore 数据结构参考

</code_context>

<specifics>
## Specific Ideas

- 删除产品 UX 参考 macOS Finder 删除文件夹的"X 个项目将被解除关联"提示
- 任务完成联动日程标记的视觉:日程 chip 灰度 + 删除线 + 完成 icon
- L5/L6 联动展示位置明确(里程碑面板 + 治理视图)

</specifics>

<deferred>
## Deferred Ideas

- 反向 "安排到日历"(日程→任务)— REQUIREMENTS v2 CROSS-10
- 周报/日报自动汇总(CROSS-11)
- 删除产品 undo 机制(CROSS-12)

</deferred>

---

*Phase: 07-cross-module*
*Context gathered: 2026-08-10 (autonomous mode)*
