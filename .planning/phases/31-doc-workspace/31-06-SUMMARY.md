---
phase: 31-doc-workspace
plan: 06
subsystem: doc-workspace
tags: [ux, overlay, zen-mode, knowledge, doc-workspace]
requires: [31-03 (shell), 31-04 (content)]
provides: [overlay doc panel, zen mode, unified doc entries, D-09..D-13]
affects: [KnowledgeBaseView, ProductKnowledgeTab, App layout]
tech-stack:
  added: []
  patterns: [absolute overlay panel, motion slide-in, store-side panel expansion]
key-files:
  created: []
  modified:
    - src/components/workspace/DocWorkspaceShell.tsx
    - src/App.tsx
    - src/stores/uiStore.ts
    - src/stores/docWorkspaceStore.ts
    - src/components/workspace/DocWorkspaceContent.tsx
    - src/views/KnowledgeBaseView.tsx
    - src/components/product/ProductKnowledgeTab.tsx
    - .planning/phases/31-doc-workspace/31-CONTEXT.md
  deleted:
    - src/components/workspace/DocList.tsx
decisions:
  - PrdDraftDialog 保留(独立落槽工作流,非文档编辑)
  - openDoc/createNote 在 store 单点展开面板
  - 收起面板自动退出禅模式
metrics:
  duration: 45m
  completed: 2026-09-03
---

# Phase 31 Plan 06: UAT UX 调整(overlay 联动 + 禅模式 + 全入口移交)Summary

One-liner: 文档工作区改为右滑 overlay(主工作区零挤压)+ 禅模式 + 全应用文档编辑入口收敛到面板,面板内列表清零(D-09..D-13)。

## What Was Built

**Task 1 — Shell overlay 化 + 禅模式(7c484db)**
- `DocWorkspaceShell` 从 flex aside 改为 `absolute inset-y-0 right-0 z-30` overlay,motion `x: '100%' → 0` 滑入,左缘 border + shadow-2xl 分层;无 backdrop,主工作区点击穿透不收起(D-11);拖宽 clamp 360–60vw 与收起 rail(overlay 定位)保留
- `uiStore` 新增 `docZenMode`(persist)+ `toggleDocZenMode`;`toggleDocWorkspace` 收起时自动退出禅模式(否则内容区空白)
- 禅模式(D-12):App.tsx 内容区 wrapper 挂 `relative`,zen 时 Header + main 不渲染,面板 `left-0` 占满内容区;Sidebar 导航保留;工具栏 ArrowsOut/InLineHorizontal 切换按钮
- `docWorkspaceStore.openDoc/createNote` 单点调用 `expandPanel()`——所有入口自动展开面板

**Task 2 — 面板瘦身 + 全入口移交(235a9c2)**
- `DocWorkspaceContent` 移除文档列表区块(D-10);`DocList.tsx` 删除,全仓 grep 无引用残留;空态文案改「在主工作区点击文档打开,或在知识库新建笔记」
- `KnowledgeBaseView`:「编辑」改 `openDoc(docId)`(item.id === docId,rndStore docToItem 投影),内联 MarkdownEditor 编辑区移除(视图内保留只读预览);header 加「新建笔记」primary 按钮 → `createNote('无标题笔记')`(D-13)
- `ProductKnowledgeTab`:「编辑知识条目」改 openDoc + 面板;两处内联 MarkdownEditor(编辑区 + 新建 modal)移除;AI 润色候选稿(HITL)改为只读预览 + 「确认写入 / 取消候选」按钮,确认链路(confirmKnowledgeWrite → writeKnowledgeArticle)不变
- CONTEXT.md 追加 D-09..D-13(标注 2026-09-03 UAT 裁定)

## PrdDraftDialog 裁定(D-09 第三入口)

**保留,不删除。** 依据:读调用方(AgentConsole / TabRunPanel / IngestionPanel)确认其主体不是文档查看/编辑,而是**落槽工作流**——编辑对象是内存中的候选稿(initialDraft,非 knowledge_docs 行),「取消 = 不落库」是刻意语义;若走「先落库再 openDoc」会持久化被取消的草稿,改变数据行为。对话框内编辑动作(落槽至研发中心 commit)属独立工作流动作,符合 plan Task 2 第 4 条的保留分支。调用方行为零改动、不 broken。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] 收起面板自动退出禅模式**
- **Found during:** Task 1
- **Issue:** zen 模式下主内容不渲染;若此时收起面板,应用会呈现空白内容区
- **Fix:** `toggleDocWorkspace` 收起分支强制 `docZenMode: false`
- **Files:** src/stores/uiStore.ts
- **Commit:** 7c484db

**2. [Rule 2 - Missing correctness] openDoc/createNote 在 store 内展开面板**
- **Found during:** Task 1
- **Issue:** plan 让每个入口自行设置 `docWorkspaceOpen=true`,三处调用方重复且易漏
- **Fix:** `expandPanel()` 收敛进 docWorkspaceStore 单点,所有入口(含未来)免费获得
- **Files:** src/stores/docWorkspaceStore.ts
- **Commit:** 7c484db

## Verification

- `npm run lint`(tsc --noEmit)exit 0
- `npm run build` exit 0(24.7s)
- Task 1 grep:`docZenMode` in uiStore(persist 含)、`absolute` in DocWorkspaceShell — pass
- Task 2 grep:DocList.tsx 不存在且无引用、KnowledgeBaseView openDoc×3 + 新建笔记×1、ProductKnowledgeTab openDoc×2、两文件 MarkdownEditor import 均移除 — pass
- 真机项(overlay 不挤压/点击不收起/禅模式进出/新建笔记开面板)归 31-05 UAT 清单回归(31-06 是 UAT 中段反馈的实现,UAT checkpoint 仍挂起)

## Known Stubs

None. 分享按钮为 31-06 之前已有的无 onClick 占位(不属本 plan 范围)。

## Self-Check: PASSED

- 31-06-SUMMARY.md 存在(本文件)
- Commits 7c484db, 235a9c2 在 git log 中确认
