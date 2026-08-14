---
status: passed
phase: 05-task-crud
source: [05-VERIFICATION.md, 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md]
started: 2026-08-11T15:30:00Z
updated: 2026-08-11T16:50:00Z
passed_at: 2026-08-11T16:50:00Z
---

## Current Test

(none — all tests resolved)

## Phase Status: PASSED

## Tests

### 1. 内联编辑 + 400ms 自动保存手感
expected: 展开任务卡片,修改标题,停顿 500ms(超过 debounce 阈值),刷新页面 → 标题已保存,刷新后显示新值。需观察实际 debounce 触发时机和视觉反馈(若有)。
result: passed
note: 2026-08-11 用户确认。修复 GAP-01(saved flash 边框 + ring accent→success→accent)和 GAP-02(外部点击 collapse)后通过。

### 2. DnD 与 click-to-expand 8px 阈值手感
expected: 短距离(<8px)拖动卡片应触发 click-to-expand(展开详情);长距离拖动(超过 8px)应触发 DnD 列间移动。PointerSensor 阈值不冲突,两种交互可区分。
result: passed
note: 2026-08-11 用户确认 click 与 DnD 阈值区分正确。

### 3. ProductSummaryDrawer 动画 + 跳转
expected: 点击任务卡片上的产品徽章 → ProductSummaryDrawer(360px)从右侧滑入;点"打开详情" → 切到产品 tab 并打开产品详情视图。动画流畅,跳转后定位正确。
result: passed
note: 2026-08-11 修复 GAP-03(折叠态徽章 stopPropagation)、GAP-04(tab key 'product'→'product-management')、GAP-05(显示 id 截短)后通过。

### 4. 实时计数 Badge 动画 (D-06)
expected: 拖拽任务卡片时,源列与目标列的计数 Badge 实时增减(拖拽中可见);Badge 用 motion.span key={count} 实现数字切换动画。
result: passed
note: 2026-08-11 计数 Badge 实时增减正常,数字切换动画符合预期。修复 GAP-05 后置项(DragOverlay 显示 id)后通过。

### 5. persist v1→v2 实际迁移
expected: 浏览器 devtools 检查 'nova-task' localStorage 的 version 字段 = 2;每个 task 含 projectId 字段(可能为 null)、scheduledEventId 字段。需要实际有 v1 旧数据的浏览器环境验证 migration 函数运行结果。
result: skipped
reason: 与 Phase 6 (scheduleStore v1→v2) 同性质 — v1 生命周期短(Phase 4-5 之间数周),无真实用户数据需要迁移;taskStore.ts migrate 函数已被单元测试覆盖;归入 tech_debt。

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

### GAP-01: 内联编辑无"已保存"视觉反馈 ✓ RESOLVED

- **Test:** 1 (内联编辑 + 400ms 自动保存手感)
- **Severity:** minor (UX polish,不影响数据正确性)
- **Description:** 任务卡片内联编辑标题后,400ms debounce 触发 persist,但用户无视觉反馈,无法确认是否已保存。
- **Expected:** debounce 触发瞬间,卡片应播放"已保存"动画。用户建议方案:
  - 方案 A:边缘光转一圈(border trace 动画)
  - 方案 B:边框颜色 flash:accent 蓝 → success 绿 → 回到 accent 蓝(200ms + 400ms 两阶段)
- **Actual:** 无反馈
- **Repro:** 编辑任意任务标题 → 等 500ms → 观察卡片
- **Resolved:** 2026-08-11,`src/components/TaskKanban.tsx` KanbanCard:
  - 加 `justSaved` state + `savedTimer` ref
  - `scheduleSave` 的 setTimeout 内 `updateTask` 后翻 `justSaved=true`,1200ms 后自动回 `false`
  - 边框 + ring className 根据 justSaved 切换 accent ↔ success
  - 加 `transition-all duration-300` 平滑过渡
- **Verification:** 用户在 Test 1 re-verify 中 `pass`。

### GAP-02: 展开的任务卡片不自动 collapse ✓ RESOLVED

- **Test:** 1 (内联编辑 + 400ms 自动保存手感)
- **Severity:** minor (UX polish,不影响功能)
- **Description:** 点击任务卡片展开后,点击卡片外任意位置应自动合上,实际不会。
- **Expected:** 卡片外点击(blank area / 其他卡片 / 页面背景)→ 当前展开卡片自动 collapse。
- **Actual:** 只能再次点击卡片本身才能合上。
- **Repro:** 展开任意任务卡片 → 点击页面空白处 → 卡片仍展开
- **Resolved:** 2026-08-11,`src/components/TaskKanban.tsx`:
  - `TaskKanban` 根加 `useEffect` 监听 `document.mousedown`
  - 点击目标不在任何 `[data-task-card]` 内 → 调 `onSelectTask('')` 清空展开
  - KanbanCard 根 motion.div 加 `data-task-card` 属性
  - 点击其他卡片仍正常切换(卡片自己的 onClick 先于 document mousedown 处理)
- **Verification:** 用户在 Test 1 re-verify 中 `pass`。

### GAP-03: 折叠态点产品徽章触发展开而非打开 drawer

- **Test:** 3 (ProductSummaryDrawer 动画 + 跳转)
- **Severity:** minor (UX,功能未丢只是路径错)
- **Description:** 折叠态任务卡片上点产品徽章,实际触发了卡片展开(行内编辑),而非打开 ProductSummaryDrawer。展开态徽章行为正确。
- **Root cause:** `TaskKanban.tsx` 折叠态徽章(line 616-621)是纯展示 `<Badge>`,无 onClick、未包 button;事件冒泡到卡片整体 onClick → `onToggleExpand`。展开态徽章(line 688-700)有 `<button>` 包裹 + `e.stopPropagation()`,所以正确。
- **Resolved:** 2026-08-11,折叠态徽章同样用 `<button>` 包裹 + `stopPropagation` + `onOpenProductDrawer`。

### GAP-04: Drawer "打开详情" 跳转后是空白页

- **Test:** 3 (ProductSummaryDrawer 动画 + 跳转)
- **Severity:** critical (核心跳转路径断)
- **Description:** 在 ProductSummaryDrawer 点"打开详情" → 切到产品 tab 后页面空白。
- **Root cause:** `ProductSummaryDrawer.tsx:33` `handleOpenDetail` 设置 `activeTab: 'product'`,但 App.tsx 的 switch case 与 Sidebar 的 tab id 都是 `'product-management'`。tab key 不匹配 → `renderContent` 走 default → 返回 null → 空白页。
- **Resolved:** 2026-08-11,`activeTab: 'product'` → `'product-management'`。

### GAP-05: 卡片 ID(UUID 36 字符)挤压任务名空间

- **Test:** 3 (附加发现,非核心断言)
- **Severity:** minor (UX polish)
- **Description:** `task.id` 是 `crypto.randomUUID()`(36 字符),`TaskKanban.tsx:548` 直接渲染完整 UUID,折叠态 header row 几乎被 ID 占满,任务名被严重挤压。
- **Decision:** 不改底层 `task.id`(它是跨 store 关联 key:`scheduledEventId` 反查、AI 工具调用、`projectId` 反查),仅做 display 截短。
- **方案选择:** 三档(A 时间截短 / B 哈希到 3 位 / C 持久化 displayId)中走 **A2**:Task 加 `createdAt?` 字段,helper 用 MMDD + uuid 前 4 hex 生成 `0811-a3f2`(8 字符,稳定)。
- **Resolved:** 2026-08-11:
  - `src/data/mockTasks.ts`: Task 加 `createdAt?: number`(display-only)
  - `src/components/TaskDialog.tsx`: 创建任务时塞 `createdAt: Date.now()`
  - `src/components/TaskKanban.tsx`: 加 `formatTaskDisplayId(task)` helper,显示处替换
  - mock 旧任务无 `createdAt`,fallback 到 `Date.now()`(显示当天日期,可接受)
  - 复制 ID 仍复制真实 UUID(`handleCopyId` 不变,AI/调试需要真实 id)
- **Verification:** 用户在 Test 4 中 `pass`。

### GAP-06: Select 选项触发卡片意外折叠(Radix Portal 误判 outside-click)

- **Test:** 3 / 4 (ProductSummaryDrawer 跳转 + Badge 动画)
- **Severity:** critical (核心交互路径断)
- **Description:** 展开态改任意 Select(产品/状态/优先级/分类/小时)时,卡片自动折叠。改产品最明显(因为 store 立即更新)。
- **Root cause:** GAP-02 修复的 outside-click 检测(`document.mousedown`)未考虑 Radix Select/Popover 的 Portal —— 选项列表通过 Portal 渲染到 `document.body`,不在 `[data-task-card]` DOM 子树内,被误判为"卡片外点击"→ 触发 `onSelectTask('')` → 折叠。
- **Resolved:** 2026-08-11,`src/components/TaskKanban.tsx` GAP-02 useEffect:
  - onMouseDown 多排除两个选择器:`[data-radix-popper-content-wrapper]`(Radix Popper 容器)和 `[role="option"]`(选项本身)
- **Verification:** 用户在 Select 改产品后保持展开,`pass`。

## 增量增强(2026-08-11 后续 UAT)

下列改动是用户在原 UAT 5 项之外追加的需求,逐项即时验证 pass:

| 改动 | 文件 | 验证 |
|------|------|------|
| 折叠态右下角 status badge 视觉化(三色:success/warning/neutral,已完成带 ✓) | TaskKanban.tsx | pass |
| 内联编辑加 status Select | TaskKanban.tsx | pass |
| 内联编辑加 product Select(setTaskProject 实时同步) | TaskKanban.tsx | pass |
| 内联表单布局重排 grid-cols-2,产品/分类 col-span-2,日期+小时 flex 整行 | TaskKanban.tsx | pass |
| deadline 加 0-23 小时 Select,存储 `${date} ${hour}:00` | TaskKanban.tsx | pass |
| 删除折叠态 task.time 显示 | TaskKanban.tsx | pass |
| 删除展开态 AI 建议块 | TaskKanban.tsx | pass |
| 列头 `+` 按钮接通 TaskDialog(defaultCategoryId 落到对应列) | TaskKanban.tsx + TaskManagementView.tsx | pass(测试 A) |
| 删除 Header 顶部"新增任务"按钮 + 占位 NewTaskDialog + 清理 imports | layout/Header.tsx | pass(测试 B) |
| TaskDialog 表单结构与内联展开完全对齐(优先级/状态/产品/日期+小时/分类) | TaskDialog.tsx | pass(测试 C) |
| 所有 status 都显示 badge(未开始也显示 neutral variant) | TaskKanban.tsx | pass |

## Phase 5 UAT 最终结果

- **status:** passed
- **原始 5 项:** 4 passed / 1 skipped(tech_debt: v1→v2 迁移)
- **增量 11 项:** 全部 passed
- **GAP 总数:** 6 个(全部 resolved)
- **本会话未提交改动:** TaskKanban.tsx / TaskDialog.tsx / TaskManagementView.tsx / ProductSummaryDrawer.tsx / layout/Header.tsx / data/mockTasks.ts + 本 UAT 文件
