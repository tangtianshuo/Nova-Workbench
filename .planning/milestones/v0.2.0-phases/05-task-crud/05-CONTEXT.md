# Phase 5: Task CRUD 补全 - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

用户可以在看板中完成任务的全生命周期操作 —— 创建、内联编辑、对话框编辑、删除(带确认)、重新打开、拖拽移动,并且任务开始支持可选的产品/日程弱关联。本 phase 不涉及日程 CRUD (Phase 6) 与跨模块联动 (Phase 7),仅交付 taskStore 完整 CRUD + 看板交互 + 弱关联字段定义(联动逻辑留到 Phase 7)。

</domain>

<decisions>
## Implementation Decisions

### Inline 编辑交互 (TASK-01)
- **D-01:** 展开卡片 = 全字段始终可编辑。展开后标题/描述/优先级/截止日期/分类直接渲染为 input/select,不需要额外点击进入编辑态
- **D-02:** 自动保存 debounced (400ms)。字段变动后 400ms 无新输入即调用 updateTask,无"保存"按钮
- **D-03:** 卡片右上角 `DotsThree` DropdownMenu 承载非字段编辑操作:重新打开 / 删除 / 复制 ID
- **D-04:** 底部主操作按钮保留(标记完成/重新打开),与 DotsMenu 并存。状态字段不再单独渲染 Select(避免与主按钮重复)

### DnD 拖拽 (TASK-05)
- **D-05:** 全卡片可拖。@dnd-kit PointerSensor activation threshold 设为 8px,超过阈值才识别为拖拽,否则为 click(保护 click-to-expand 行为)
- **D-06:** 拖拽中实时刷新列头 Badge 计数。原列 -1、目标列 +1,实时动画(等价于 over 状态驱动 UI)
- **D-07:** 专用 `moveTask(taskId, fromCatId, toCatId)` action,与通用 `updateTask` 分离。语义清晰且 DnD 调用方不需要构造完整 task 对象

### TaskDialog 双模式 (TASK-02)
- **D-08:** TaskDialog 支持创建 + 编辑双模式。新建任务入口:看板头部"新增任务"按钮;编辑入口:卡片 DotsMenu 中"在对话框中编辑"。两种入口共用同一组件,通过 `mode` prop 区分
- **D-09:** 产品选择器用 Combobox(Popover + Input + 列表筛选)。产品数量较多时可搜索,优于简单 Select
- **D-10:** task.project legacy 镜像策略(由 Claude 决定 → 选择"同步镜像"):updateTask 时若 projectId 变化,同步写入 `project = product.name`,保证 AppContext.tsx legacy 调用方仍能读取产品名。这与 ROADMAP Phase 5 描述"产品选择器(设置 projectId 并镜像 project 名字段)"一致

### 关联徽章 (TASK-06)
- **D-11:** 点击任务卡片上的产品徽章 → 右侧 360px slide-in Drawer 展示产品摘要(名/阶段/tagline/里程碑进度) + "打开详情"按钮(切到 product tab + setSelectedProductId)
- **D-12:** 新增可复用 `Drawer` 组件(右侧 slide-in,360-480px 可配),复用模式将在 Phase 9 chat panel 再次使用。组件路径:`src/components/ui/Drawer.tsx`

### Claude's Discretion
- DnD 视觉反馈具体表现(拖拽中卡片缩放/透明度/drop 指示器样式)
- DropdownMenu / Combobox 内具体 item 排列与图标
- 自动保存成功/失败的视觉反馈(无操作 / Toast / 边框微闪)
- Drawer 内"产品摘要"具体字段选择与排版

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目级约束
- `.planning/PROJECT.md` — Core Value,Constraints(Key Decisions 表中锁定的弱关联模型 / legacy task.project 保留 / direct store hooks)
- `.planning/REQUIREMENTS.md` — TASK-01..09 详细需求 + Key Decisions 1-7(影响 Phase 5 的部分)
- `.planning/STATE.md` — Decisions 区段(Phase 5 相关条目)

### 架构与代码规范
- `.planning/codebase/CONVENTIONS.md` — 命名/导入/组件 patterns
- `.planning/codebase/STRUCTURE.md` — 目录组织、组件分层
- `.planning/codebase/CONCERNS.md` — 跨切关注点(AppContext 兼容层、persist、UI store)

### ROADMAP
- `.planning/ROADMAP.md` §Phase 5 — Goal / Success Criteria / Requirements 映射

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/DropdownMenu.tsx` — DotsThree 菜单承载次要操作
- `src/components/ui/Dialog.tsx` — TaskDialog 基座(DialogContent/DialogHeader/DialogFooter)
- `src/components/ui/Popover.tsx` — Combobox 实现基座
- `src/components/ui/Input.tsx` / `Textarea.tsx` / `Select.tsx` — inline 编辑表单字段
- `src/components/ui/Badge.tsx` — 关联产品徽章(variant="accent" + 项目图标)
- `src/components/ui/DatePickerInput.tsx` — 截止日期字段(Phase 6 也会用)
- `src/lib/utils.ts` — `cn()` 合并 className

### Established Patterns
- Zustand store + persist: `src/stores/taskStore.ts` (现有 version 1,本 phase 升到 version 2)
- Direct store hooks 优先:`useTaskStore()` 而非 `useApp().addTask` 等(REQUIREMENTS Key Decision #2)
- Card 展开模式:`TaskKanban.tsx` `selectedTaskId` + `onSelectTask` 已建立,可复用
- 创建表单参考:`src/components/product/CreateProductModal.tsx`(早返回 guard / Button variants / DialogFooter 布局)
- persist 模式参考:`taskStore.ts` 现有 `version / migrate / partialize / onRehydrateStorage`

### Integration Points
- `taskStore.ts` — 新增 actions:`updateTask`、`deleteTask`、`reopenTask`、`moveTask`、`setTaskProject`;Task 类型扩展 `projectId?`、`scheduledEventId?`;persist version 升级到 2 + migrate 补字段
- `src/data/mockTasks.ts` — Task 接口扩展,初始 mock 数据加 `projectId` 等可选字段(或 migrate 兜底)
- `src/components/TaskKanban.tsx` — 重写卡片渲染逻辑(input/select 替换 text)、DotsMenu、底部按钮、产品徽章、DnD 包裹
- `src/views/TaskManagementView.tsx` — 新建任务按钮、TaskDialog 调起
- `src/store/AppContext.tsx` — 暴露新 actions(向后兼容,delegate 到 useTaskStore)
- 新增 `src/components/TaskDialog.tsx`
- 新增 `src/components/ui/Drawer.tsx`(可复用 slide-in)
- 新增 `src/components/ProductSummaryDrawer.tsx`(产品摘要内容)

</code_context>

<specifics>
## Specific Ideas

- inline 编辑体验目标类似 Notion:展开即编辑,无需额外点击
- Drawer 模式提前到 Phase 5 是为了让 Phase 9 chat panel 直接复用
- DnD 必须保留 click-to-expand 行为(threshold 是关键)
- 实时 Badge 计数更新让用户拖拽时有"重量感"反馈

</specifics>

<deferred>
## Deferred Ideas

- 任务"复制 ID"以外的更多操作(归档/订阅/标签)— 推到 v0.3+ 任务增强包
- Drawer 内多产品切换(上一个/下一个)— 推到 v0.3+
- Inline 编辑冲突解决(多窗口同时编辑)— 本地优先 app 暂不考虑
- 拖拽到"无截止日期"虚拟分组的特殊行为 — Phase 5 仅做 category 间拖,date 视图拖拽推到 v0.3+
- DnD 跨设备同步动画(其他客户端实时看到拖拽)— 多人协作场景,Out of Scope

</deferred>

---

*Phase: 05-task-crud*
*Context gathered: 2026-08-10*
