---
status: complete
phase: 07-cross-module
source: 07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md, 07-04-SUMMARY.md, 07-05-SUMMARY.md
started: 2026-08-12T00:00:00Z
updated: 2026-08-12T00:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. 任务安排到日历
expected: 打开任务管理看板，找到一条带 deadline（YYYY-MM-DD HH:mm）的任务。点击任务卡片菜单（...）→ 出现"安排到日历"选项 → 点击。期望：弹出绿色 success toast；自动跳转到 ScheduleView；对应日期格子里出现新事件（标题为任务名）；事件 chip 上能看到任务/产品关联图标；回到看板，该任务卡片应显示日程徽章（小日历图标）。
result: pass

### 2. 重复安排：替换旧事件
expected: 对已经安排过日历的任务再次点击"安排到日历"。期望：弹出确认对话框/toast 提示"已存在日程，是否替换"；确认后旧事件被替换为新事件（不是新建第二条）。
result: pass

### 3. 任务卡片日程徽章点击导航
expected: 已安排到日历的任务在卡片上显示日程徽章（小日历图标）。点击该徽章 → 直接跳转到 ScheduleView，并且定位到事件所在的月份。
result: pass
note: 通过核心测试，但用户报告了一个 cosmetic 改进项（见 Gaps）

### 4. 日历事件显示任务/产品关联图标
expected: 在 ScheduleView 月历视图中，被关联的日程事件 chip 上能看到任务图标和产品图标（如果是 type='task' 的事件）。点击图标应该有响应（如打开 ProductSummaryDrawer 或跳转到任务详情）。
result: pass

### 5. 任务完成联动日程状态
expected: 完成一条已关联日程的任务（点击任务卡片完成按钮）。期望：对应日程事件的状态变为"已完成"；在月历视图上该事件显示为已完成样式（如划线/灰色）。
result: pass

### 6. 删除任务反向清理日程链接
expected: 删除一条已关联日程的任务。期望：弹出确认；删除后回到日历，对应事件依然存在但任务关联图标消失（type 不再是 'task'，或 taskId 被清空）。
result: pass

### 7. 产品删除：影响预览对话框
expected: 在产品管理页点击删除某个产品（有任务/日程/R&D 数据关联）。期望：弹出确认对话框；对话框显示影响的任务数、日程数、R&D 数据是否存在等清理预览信息；不是直接删除。
result: issue
reported: "此操作将解除 0 个任务、2 个日程的关联。研发中心中的交付物、里程碑、原型、需求、知识、代码、测试、竞品和文档将被清理。是否继续？ / 将删除产品「test」本身，已关联的任务和日程会保留，仅清空产品关联。 toast 提示中，是否存在矛盾？"
severity: minor

### 8. 产品删除：级联清理
expected: 确认删除产品后。期望：弹出成功 toast；关联任务的 projectId 字段被清空（任务依然存在，但不再关联该产品）；关联日程事件的 projectId 被清空；R&D 模块中该产品的所有数据（需求/原型/知识/代码/测试/竞品/交付物）被清理；产品从产品列表移除。
result: pass

### 9. 产品里程碑：交付物状态徽章
expected: 打开某产品的产品管理 → 里程碑标签页。期望：每个里程碑项显示交付物状态徽章（已就绪/草稿/未关联等）；徽章基于 deliverableCodes 关联 R&D 模块的交付物状态；点击徽章或里程碑能看到关联的交付物。
result: issue
reported: "目前显示的都是未关联。"
severity: major

### 10. 产品治理：阶段进度展示
expected: 打开某产品的产品管理 → 治理标签页。期望：显示当前产品阶段的 ready/total 比率、进度条、阶段分解、generating 计数；R&D 中心顶部产品上下文区域也显示同样的进度摘要。
result: issue
reported: "未找到治理标签页，后续无法进行测试"
severity: major

### 4. 日历事件显示任务/产品关联图标
expected: 在 ScheduleView 月历视图中，被关联的日程事件 chip 上能看到任务图标和产品图标（如果是 type='task' 的事件）。点击图标应该有响应（如打开 ProductSummaryDrawer 或跳转到任务详情）。
result: [pending]

### 5. 任务完成联动日程状态
expected: 完成一条已关联日程的任务（点击任务卡片完成按钮）。期望：对应日程事件的状态变为"已完成"；在月历视图上该事件显示为已完成样式（如划线/灰色）。
result: [pending]

### 6. 删除任务反向清理日程链接
expected: 删除一条已关联日程的任务。期望：弹出确认；删除后回到日历，对应事件依然存在但任务关联图标消失（type 不再是 'task'，或 taskId 被清空）。
result: [pending]

### 7. 产品删除：影响预览对话框
expected: 在产品管理页点击删除某个产品（有任务/日程/R&D 数据关联）。期望：弹出确认对话框；对话框显示影响的任务数、日程数、R&D 数据是否存在等清理预览信息；不是直接删除。
result: [pending]

### 8. 产品删除：级联清理
expected: 确认删除产品后。期望：弹出成功 toast；关联任务的 productId 字段被清空（任务依然存在，但不再关联该产品）；关联日程事件的 projectId 被清空；R&D 模块中该产品的所有数据（需求/原型/知识/代码/测试/竞品/交付物）被清理；产品从产品列表移除。
result: [pending]

### 9. 产品里程碑：交付物状态徽章
expected: 打开某产品的产品管理 → 里程碑标签页。期望：每个里程碑项显示交付物状态徽章（已就绪/草稿/未关联等）；徽章基于 deliverableCodes 关联 R&D 模块的交付物状态；点击徽章或里程碑能看到关联的交付物。
result: [pending]

### 10. 产品治理：阶段进度展示
expected: 打开某产品的产品管理 → 治理标签页。期望：显示当前产品阶段的 ready/total 比率、进度条、阶段分解、generating 计数；R&D 中心顶部产品上下文区域也显示同样的进度摘要。
result: [pending]

## Summary

total: 10
passed: 7
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "徽章鼠标 hover 时应该改变鼠标形态为点击样式（cursor: pointer），传达可点击的交互意图"
  status: failed
  reason: "User reported: 徽章鼠标hover 的时候 需要改变鼠标形态为点击"
  severity: cosmetic
  test: 3
  artifacts: []
  missing: []

- truth: "删除产品对话框/Toast 文案应该使用一致的措辞，避免让用户产生歧义"
  status: failed
  reason: "User reported: 对话框说'将解除 X 个任务、Y 个日程的关联'，Toast 说'已关联的任务和日程会保留，仅清空产品关联'。两处文案在表达同一件事但措辞不一致，用户会产生疑惑：解除关联 vs 保留仅清空关联，听起来像相反的操作。建议统一为同一表述（如：将清空 X 个任务、Y 个日程的产品关联字段，这些任务/日程本身不会被删除）。"
  severity: minor
  test: 7
  artifacts: []
  missing: []

- truth: "里程碑交付物状态徽章应该能正确匹配 deliverableCodes 并显示真实的交付物状态（已就绪/草稿），而不是全部 fallback 到'未关联'"
  status: failed
  reason: "User reported: 目前显示的都是未关联。可能原因：mock 产品的里程碑只配置了 legacy deliverables 字段（free-text 字符串），deliverableCodes 没有配置；或 title-based 近似匹配逻辑失败；或交付物状态本身没有 ready/draft 数据。需要调查 ProductMilestonesTab.tsx 的匹配逻辑 + mockProducts.ts 中里程碑的 deliverableCodes 配置 + rndStore.getDeliverablesForProduct 返回的交付物状态分布。"
  severity: major
  test: 9
  artifacts: []
  missing: []

- truth: "产品管理应该有'治理'标签页，用于展示产品阶段进度（ready/total 比率、进度条、阶段分解、generating 计数）"
  status: failed
  reason: "User reported: 未找到治理标签页，后续无法进行测试。可能原因：ProductGovernanceTab 组件未挂载到 ProductManagementView 的 tab 列表；或 tab 标签名不是'治理'而是其他名字（如'阶段/Stage'等）；或被条件渲染隐藏。需要核查 ProductManagementView.tsx 的 tab 配置和 ProductGovernanceTab.tsx 的渲染入口。"
  severity: major
  test: 10
  artifacts: []
  missing: []
