---
phase: 12-gap-closure
plan: 01
subsystem: knowledge-base-view
tags: [audit-fix, store-wiring, knowledge-base]
requires:
  - rndStore.knowledgeBase
  - useProductStore.products
provides:
  - KnowledgeBaseView订阅rndStore.knowledgeBase聚合视图
affects:
  - src/views/KnowledgeBaseView.tsx
tech-stack:
  added: []
  patterns:
    - zustand selector subscription
    - 聚合多productId store bucket + 按category分组
key-files:
  created: []
  modified:
    - src/views/KnowledgeBaseView.tsx
decisions:
  - "Sidebar 分组改为按 category(数据上唯一已有的分组维度),不再保留 dev/product/team 静态文件夹"
  - "保留只编辑 content 的原 UX scope;title/category/tags 编辑入口在 ProductKnowledgeTab 中已存在"
  - "allItems 直接用 Object.values(knowledgeBase).flat() —— ProductKnowledgeItem 自带 productId 字段,无需重新打标"
metrics:
  duration: 134s
  completed: 2026-08-11
  tasks: 1
  files: 1
---

# Phase 12 Plan 01: KnowledgeBaseView rndStore 接入 Summary

将独立知识库侧栏从硬编码 DOCS 常量改为 rndStore.knowledgeBase 的全局聚合消费端,关闭 v0.2.0 audit 的 1 HIGH + 2 MEDIUM flow gap。

## Changes Made

### `src/views/KnowledgeBaseView.tsx` (rewrite, ~75 → ~173 lines)

**数据流改造前:**
```
FOLDERS (静态常量) + DOCS (静态常量)
  └─ useState(DOCS)            ← 本地副本,刷新即丢
       └─ setDocs(...)         ← saveEditing 写本地
```

**改造后:**
```
useRndStore((s) => s.knowledgeBase)        ← 真实 store,persist 跨刷新
  └─ Object.values(knowledgeBase).flat()   ← 聚合所有 productId
       └─ categories = unique(category)    ← 派生分组维度
            └─ saveEditing → updateKnowledgeItem(productId, itemId, { content })
```

### 关键改动点

| 区域 | 改动 |
|------|------|
| Imports | 新增 `useRndStore`、`useProductStore`、`ProductKnowledgeItem` type;图标 `Folder`→`Tag`(不再有静态 folder 概念) |
| 常量 | 删除 `FOLDERS`(L10-14)和 `DOCS`(L16-29),全部由 store 派生 |
| 组件 state | `activeDoc`→`activeItemId: string \| null`;`docs` state 删除;新增 `currentItem: ProductKnowledgeItem \| null` 派生 |
| Sidebar | `FOLDERS.map` → `categories.map`,分组名取自 `item.category`(架构设计/领域字典/技术协议/FAQ与排障/最佳实践/经验沉淀/业务规则/架构约束/踩坑指南),每组带计数徽章 |
| 空状态 | `allItems.length === 0` 时 sidebar 渲染"暂无知识库文章,请在产品管理的知识库 tab 中创建" |
| 保存路径 | `saveEditing` 改调 `updateKnowledgeItem(currentItem.productId, currentItem.id, { content: editContent })`,通过 Zustand persist 持久化 |
| Breadcrumb | "空间 > {folder} > {title}" → "知识库 > {category} > {title}",`getFolderForDoc` helper 删除 |
| 主面板 header | 增加 author/updatedAt/来源产品 元信息行 |
| 主面板空状态 | `!currentItem` 时显示"请选择或创建一篇文章" |

### Ponytail 简化

- `allItems` 用 `Object.values(knowledgeBase).flat()` 一行实现(原计划手写 flatMap 重打 productId 标签是冗余 —— `ProductKnowledgeItem` 类型本身就有 `productId` 字段)
- `currentItem` 直接在 `allItems` 上 `.find()` 即可,无需遍历 store buckets
- 仅暴露 content 编辑入口(原 UX scope),title/category/tags 编辑路径已在 `ProductKnowledgeTab` 存在,不重复

## Audit Gap 闭环

| Gap ID | Severity | Before | After |
|--------|----------|--------|-------|
| **INT-01** | HIGH | KnowledgeBaseView 用硬编码 DOCS,与 rndStore.knowledgeBase 断链 | 订阅 store + 聚合所有 productId |
| **FLOW-D-FAIL** | MEDIUM | saveEditing 写本地 state,F5 丢 | 走 `updateKnowledgeItem`,persist 跨刷新 |
| **FLOW-E-FAIL** | MEDIUM | AI `writeKnowledgeArticle` 写 rndStore 但视图不订阅 | 视图订阅同一 store,AI 写入即推送到侧栏 |

## Verification

### 自动化

```
$ npm run lint   # tsc --noEmit
> nova-pm-workspace@0.1.0 lint
> tsc --noEmit
(exit 0,无错误)

$ npm run build
✓ built in 22.92s
(chunk 大小警告为 pre-existing,与本 plan 无关)
```

### Grep 检查(src/views/KnowledgeBaseView.tsx)

| 检查项 | 命中行 | 通过 |
|--------|--------|------|
| `useRndStore` | L9, L18, L19 | ✓ |
| `knowledgeBase` | L13, L18, L27, L28 | ✓ |
| `updateKnowledgeItem` | L19, L24, L80 | ✓ |
| `const DOCS` | (无) | ✓ 已删 |
| `setDocs` | (无) | ✓ 已删 |
| `FOLDERS` | (无) | ✓ 已删 |

### 手动(audit gap 关闭证据 — 由 orchestrator/用户 F5 验证)

1. **Flow D(MDXEditor 编辑保存持久化):** 进入"知识库" sidebar tab → 选一篇文章 → 点"编辑"修改 → 点"保存" → F5 刷新 → 内容保留(因走 `updateKnowledgeItem` → Zustand persist)
2. **Flow E(AI polish 后视图可见):** 在"产品管理 → 知识库 tab"触发 AI 排版润色(AI 内部调 rndStore)→ 切回"知识库" sidebar tab → 看到新写入的文章(同一 store)
3. **边界:** DevTools 清空 `nova-rnd` persist 条目 → F5 → sidebar 显示"暂无知识库文章"空状态而非崩溃

## Deviations from Plan

None - plan executed exactly as written. 唯一简化:`allItems` 实现从手写 flatMap + 重打 productId 改为 `Object.values().flat()` 一行(`ProductKnowledgeItem` 已自带 productId 字段,原计划冗余)。

## Known Stubs

None. 数据流闭环: rndStore.knowledgeBase → 聚合 → sidebar 渲染 → 用户编辑 → store action → persist。

## Self-Check: PASSED

- [x] `src/views/KnowledgeBaseView.tsx` 存在
- [x] `.planning/phases/12-gap-closure/12-01-SUMMARY.md` 存在
- [x] Commit `89d7edb` 在 git log 中
