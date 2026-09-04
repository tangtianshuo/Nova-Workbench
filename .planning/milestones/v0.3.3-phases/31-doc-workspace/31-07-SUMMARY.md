---
phase: 31-doc-workspace
plan: 07
subsystem: doc-workspace
tags: [doc-panel, multi-tab, autosave, uat-fix]
requires: [31-04, 31-06]
provides: [SC-1.1 fix, multi-tab doc panel, flush-on-switch save]
affects: [KnowledgeBaseView (openDoc callers, zero-change), ProductKnowledgeTab]
tech-stack:
  added: []
  patterns: [sync ref mirrors (saveStatusRef/contentRef) for imperative flush paths]
key-files:
  created: []
  modified:
    - src/stores/docWorkspaceStore.ts
    - src/components/workspace/DocWorkspaceContent.tsx
decisions:
  - D-14 adoption effect keyed on (activeDocId, currentDoc?.version) with editing-skip guard
  - D-15 openDocIds[]/activeDocId in store; tab bar rendered in Content (not Shell); hidden when zen or single tab
  - D-16 flushPendingSave (clearTimeout + immediate saveDoc) runs before setActiveDoc/closeDoc
metrics:
  duration: 25m
  completed: 2026-09-03
  tasks: 2
  files: 2
---

# Phase 31 Plan 07: UAT 收口(D-14/D-15/D-16) Summary

SC-1.1 首开空白修复(内容采纳 effect 加 version dep + editing 跳过)+ 多 tab 文档面板(openDocIds/activeDocId/closeDoc)+ 切换/关闭即 flush 保存,仅改 store 与 Content 两文件,Shell 与 openDoc 调用方零改动。

## What Was Done

### Task 1: D-14 内容采纳修复 + store 多 tab 化 (ad2bbb4)
- DocWorkspaceContent 采纳 effect deps 改为 `[activeDocId, currentDoc?.version]`;`saveStatusRef.current === 'editing'` 时跳过采纳(save round-trip version bump 不再覆写编辑中内容)
- store:`currentDocId` → `openDocIds: string[]` + `activeDocId: string | null`;新增 `setActiveDoc` / `closeDoc`(关闭激活左邻,空则 null);`openDoc`/`createNote` 改追加语义(includes 检查,点击已开 tab 仅激活)
- `doSave(docId, value)` 显式参数化;window blur 适配 `contentRef.current`
- Plan-checker note 已落实:deps 用改名后的 `activeDocId`;`grep -c currentDocId src/stores/docWorkspaceStore.ts` = 0

### Task 2: Tab 栏 UI + 切换/关闭 flush (4b8e6a6)
- `flushPendingSave()`:store saveStatus=editing 且有 activeDocId 时 clearTimeout + 立即 saveDoc(读 contentRef 镜像)
- tab 栏渲染在 WorkspaceConfirmCard 之下:显示条件 `openDocIds.length > 1 && !zen`(zen 取 uiStore.docZenMode);原生 button + tokens(bg-bg-secondary/border-accent/text-text-*)无硬编码色;关闭为嵌套 span[role=button](避免 button 嵌套)+ Phosphor X size=12 + aria-label「关闭 标题」
- 切 tab / 关 tab 均先 flushPendingSave 再 setActiveDoc/closeDoc

## Verification

- `npm run lint` exit 0;`npm run build` exit 0
- `grep currentDocId src/` 零残留(store + content 全改名 activeDocId)
- openDoc 调用方(KnowledgeBaseView:187 / ProductKnowledgeTab:349)签名未变,零改动

## Deviations from Plan

- 关闭按钮用 `span role="button" tabIndex={0}` + onKeyDown 替代 plan 提述的「button 包 X」:HTML 不允许 button 嵌套(原生 tab 本体是 button)。行为等价,含键盘 Enter/Space 支持。
- 其余按 plan 执行。

## Human UAT 复测锚点(31-HUMAN-UAT.md 结果表)

- SC-1.1:知识库首次点击文档 → 面板弹出且编辑器立即有内容(主目标)
- SC-1.2/1.3:自动保存 + 重启持久(D-14 修复未破坏保存链)
- D-15/D-16:开 2+ 文档 tab 栏出现;切换/关闭前改字立即保存无丢失;禅模式/单文档 tab 栏隐藏
- SC-8.1/8.3 低风险抽查(Shell 未改动)

## Self-Check: PASSED

- src/stores/docWorkspaceStore.ts FOUND(modified)
- src/components/workspace/DocWorkspaceContent.tsx FOUND(modified)
- commits ad2bbb4, 4b8e6a6 FOUND in git log
