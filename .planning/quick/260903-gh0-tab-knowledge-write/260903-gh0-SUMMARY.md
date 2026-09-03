---
phase: quick-260903-gh0
plan: 01
subsystem: rnd-projection
tags: [knowledge_write, deliverable-card, projection]
key-files:
  created:
    - src/stores/__tests__/knowledgeProjection.test.ts
  modified:
    - src/stores/rndStore.ts
    - src/components/rnd/DeliverableDocCard.tsx
    - src/components/product/CompetitorAnalysisTab.tsx
    - src/components/product/CodeManagementTab.tsx
decisions:
  - "纯 reduce 选择器(稳定 tie:数组首位胜,缺失 updatedAt 视为 '' 排最后),不引入 sort 拷贝"
metrics:
  duration: 15m
  completed: 2026-09-03
---

# Quick Task 260903-gh0: tab knowledge_write fallback Summary

产物卡双源投影:竞品/代码 tab 的 DeliverableDocCard 在槽位流(DEL-REL-02 / DEL-DEV-01)为空时兜底渲染 knowledgeBase 中对应 category(竞品分析 / 架构设计)的最新归档,修复 agent 走 knowledge_write 后产物不可见的展示层缺口。

## Changes

1. **getLatestKnowledgeByCategory** (`src/stores/rndStore.ts`) — 纯函数选择器:filter by category → reduce 取 updatedAt 最新;tie/缺失时数组首位稳定兜底。TDD:RED commit 3a0c6a3 → GREEN 797ea14。
2. **DeliverableDocCard 双源** (`src/components/rnd/DeliverableDocCard.tsx`) — 新可选 prop `knowledgeCategory`;slot 有 content 优先渲染(现状不变,badge=slot code);slot 空且有兜底项时同一张卡渲染 knowledge item(badge=category,标题=item.title,内容 MarkdownRenderer);双空 return null。
3. **接线** — CompetitorAnalysisTab `knowledgeCategory="竞品分析"`;CodeManagementTab `knowledgeCategory="架构设计"`。TestManagementTab 无 diff(约束遵守)。

## Verification

- `npm run lint` 绿;`npm test` 234 pass / 0 fail(含新增 3 个选择器用例)。
- 复现数据验证路径:kb-p1-1788401901910(category 竞品分析,product p1)在 DEL-REL-02 槽空时经 `getLatestKnowledgeByCategory(knowledgeBase['p1'], '竞品分析')` 被选中 — Test 1/2 覆盖该 selector 行为(多条取最新、无匹配 undefined)。

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- 3a0c6a3 test(quick-gh0): add failing tests for getLatestKnowledgeByCategory
- 797ea14 feat(quick-gh0): add getLatestKnowledgeByCategory selector
- 4b818ef feat(quick-gh0): dual-source DeliverableDocCard + tab wiring

## Self-Check: PASSED
