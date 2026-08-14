# Phase 5: Task CRUD 补全 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 05-task-crud
**Areas discussed:** Inline 编辑交互 / DnD 拖拽 / TaskDialog 双模式 / 关联徽章跳转

---

## Inline 编辑交互

初始批量表格提出 4 题(编辑模式/折叠/必填/分类),用户选择"深入讨论"。

### Q1: 展开后如何进入编辑状态?

| Option | Description | Selected |
|--------|-------------|----------|
| 全字段始终可编辑 | 展开后字段直接是 input/select | ✓ |
| 编辑模式切换 | 右上角"编辑"按钮 toggle | |
| 字段级 click-to-edit | Notion 风格单击切换 | |
| 你来决定 | Claude 选 | |

**User's choice:** 全字段始终可编辑
**Notes:** 用户偏好最 inline 的体验

### Q2: 如何提交修改?

| Option | Description | Selected |
|--------|-------------|----------|
| 自动保存 (debounced) | 400ms 无新输入即提交 | ✓ |
| onBlur + 显式保存 | 失焦提交 + "完成编辑"按钮 | |
| 仅显式保存 | toggle 模式但默认展开即编辑 | |
| 你来决定 | Claude 选 | |

**User's choice:** 自动保存 (debounced)
**Notes:** 与 "始终可编辑" 一致,无保存按钮

### Q3: 非字段操作(删除/重新打开)放哪里?

| Option | Description | Selected |
|--------|-------------|----------|
| 卡片右上角 DotsThree 菜单 | DropdownMenu 承载 | ✓ |
| 底部操作栏 | 与"标记完成"并列 | |
| 两者都有 | DotsMenu + 底部主操作 | |
| 你来决定 | Claude 选 | |

**User's choice:** DotsThree 菜单
**Notes:** 字段区与操作区分离

### Q4: 底部主按钮是否保留?

| Option | Description | Selected |
|--------|-------------|----------|
| 是 — 保留主按钮 | 标记完成/重新打开 + DotsMenu 次要 | ✓ |
| 否 — 只入 DotsMenu | 极简但"标记完成"多一步 | |
| status = 字段编辑 | 与其他字段一致 | |
| 你来决定 | Claude 选 | |

**User's choice:** 是 — 保留主按钮
**Notes:** 主操作一键可达

---

## DnD 拖拽

### Q1: 拖拽如何避免与 click/input 误触?

| Option | Description | Selected |
|--------|-------------|----------|
| 独立拖拽手柄 (GripVertical) | 顶部手柄才能拖 | |
| 全卡片可拖 (阈值区分) | 8px activation threshold | ✓ |
| 仅卡片头部可拖 | 折中,无额外图标 | |
| 你来决定 | Claude 选 | |

**User's choice:** 全卡片可拖 (阈值区分)
**Notes:** 不增加额外 UI 元素

### Q2: 拖拽中计数 Badge 是否实时刷新?

| Option | Description | Selected |
|--------|-------------|----------|
| 是 — 实时刷新 | 原列 -1 目标列 +1 | ✓ |
| 仅 drop 后刷新 | 一次更新更简单 | |
| 你来决定 | Claude 选 | |

**User's choice:** 是 — 实时刷新
**Notes:** 拖拽有重量感反馈

### Q3: drop 后如何更新分类?

| Option | Description | Selected |
|--------|-------------|----------|
| 单一 updateTask action | 字段更新通用 action | |
| 专用 moveTask action | DnD 专用语义 | ✓ |
| 你来决定 | Claude 选 | |

**User's choice:** 专用 moveTask action
**Notes:** 调用方不需要构造完整 task 对象

---

## TaskDialog 双模式

### Q1: TaskDialog 何时调起?

| Option | Description | Selected |
|--------|-------------|----------|
| 仅创建新任务 | 编辑走 inline | |
| 创建 + 编辑双模式 | DotsMenu 提供对话框编辑选项 | ✓ |
| 你来决定 | Claude 选 | |

**User's choice:** 创建 + 编辑双模式
**Notes:** 用户可选偏好 inline 还是 Dialog

### Q2: 产品选择器 UI 形式?

| Option | Description | Selected |
|--------|-------------|----------|
| Select 下拉 | 复用 Radix Select | |
| Combobox (可搜索) | Popover + Input + 列表 | ✓ |
| 必选产品 | 默认当前选中 | |
| 你来决定 | Claude 选 | |

**User's choice:** Combobox (可搜索)
**Notes:** 产品多时友好

### Q3: task.project (legacy) 如何镜像?

| Option | Description | Selected |
|--------|-------------|----------|
| 选择 productId 时同步 project 名 | 双写,legacy 调用方零改动 | |
| 仅写 projectId,反查 product 名 | task.project 退休 | |
| 你来决定 | Claude 选 | ✓ |

**User's choice:** 你来决定 → Claude 选择"同步镜像"
**Notes:** 与 ROADMAP Phase 5 描述"镜像 project 名字段"一致

---

## 关联徽章跳转

### Q1: 徽章点击后行为?

| Option | Description | Selected |
|--------|-------------|----------|
| 切 tab + 选中产品 | setActiveTab('product') + setSelectedProductId | |
| 打开产品详情 Dialog | 模态展示 | |
| 侧边栏 slide-in | 右侧 360px 抽屉 | ✓ |
| 你来决定 | Claude 选 | |

**User's choice:** 侧边栏 slide-in
**Notes:** 新模式,Phase 9 chat panel 复用

### Q2: slide-in 内容?

| Option | Description | Selected |
|--------|-------------|----------|
| 产品摘要 + 跳转按钮 | 名/阶段/tagline/里程碑 + "打开详情" | ✓ |
| 完整产品详情 | 重复 ProductManagementView | |
| 你来决定 | Claude 选 | |

**User's choice:** 产品摘要 + 跳转按钮
**Notes:** 不重复实现完整 view

---

## Claude's Discretion

- DnD 视觉反馈样式(缩放/透明度/drop 指示器)
- DropdownMenu / Combobox 具体排列与图标
- 自动保存反馈机制(无 / Toast / 边框闪)
- Drawer 内"产品摘要"具体字段选择与排版

## Deferred Ideas

- 任务更多操作(归档/订阅/标签)→ v0.3+
- Drawer 内多产品切换(上/下一个)→ v0.3+
- Inline 编辑冲突解决 → 暂不考虑
- date 视图拖拽 → v0.3+
- DnD 跨设备同步动画 → Out of Scope
