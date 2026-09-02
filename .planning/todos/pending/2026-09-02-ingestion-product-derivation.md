---
created: 2026-09-02
title: 摄取入口利用 workspace.projectId 推导/默认产品,消除与全局 selectedProductId 的割裂
area: engine
files:
  - src/components/workspace/IngestionPanel.tsx
  - src/stores/workspaceStore.ts
---

## Problem

Phase 27 D-05 裁定:摄取入口依赖全局 `uiStore.selectedProductId`,无选中产品时禁用并提示「请先选择产品」。但数据模型里 `Workspace.projectId` 是已有的可选关联(单向,Product 侧无反向字段),当前实现完全没有用它——UAT-1 讨论中发现两个状态可以割裂:

- ws-1 关联着 p1(`workspace.projectId = 'p1'`),但用户全局选中 p2 时,摄取静默落 p2,UI 不提示不一致
- 工作区已有关联产品时,用户仍被迫先去全局选中该产品才能摄取,入口多一步且违反直觉(「确定了工作区不就确定了产品吗」)

## Solution

裁定归属:Phase 28(反向创建产品自动关联源工作区)或 999.6 立项时一并讨论,方向候选:

- 摄取入口处若 `workspace.projectId` 存在 → 直接用它(或作为默认值 + 高亮提示与全局选中的不一致)
- 无关联 → 回落到现有 D-05 行为(全局选中产品,禁用 + 提示)
- 顺带裁定:`Workspace.projectId` 可空弱关联是否升级为正式关系(Product ↔ Workspace 双向),Phase 28 的「自动关联源工作区」已预示需要这个关系

背景:D-05 语义是「知识归入当前工作产品」,与全局上下文一致——改动时保留这个语义还是改为「归入工作区所属产品」是核心设计问题,不是纯 UI 修。
