---
phase: 16-prd
plan: 02
subsystem: chatpanel-hitl-ui
tags: [chatpanel, prd-card, mdxeditor-dialog, deliverable_committed, restore]
requires:
  - 16-01 generateDeliverable tool (two-phase queue/commit) + confirmations deliverable API
  - Phase 15 ChatPanel memory-card pattern (refresh/restore/reject/confirm 同构)
  - MarkdownEditor lazy wrapper (src/components/ui/MarkdownEditor.tsx)
provides:
  - PrdDraftDialog 纯展示组件 (MDXEditor 预填 + reset-on-open + 落槽/取消)
  - ChatPanel Surface 1 PRD 草稿确认卡片 (确认并编辑 / 忽略)
  - commitToSlot 消费链 (confirm → executeTool → deliverable_committed → flushEvents → toast/消息)
  - onToolEnd generateDeliverable 刷新 + restore 恢复路径
affects:
  - src/components/ChatPanel.tsx
tech-stack:
  added: []
  patterns:
    - consume-at-落槽 (card 确认只表达意图,Dialog 落槽是唯一消费点 — cancel 无损)
    - reset-on-open effect (候选是落槽前唯一真相,取消的编辑绝不持久)
key-files:
  created:
    - src/components/PrdDraftDialog.tsx
  modified:
    - src/components/ChatPanel.tsx
decisions:
  - DialogBody wraps the editor instead of a bare MarkdownEditor in DialogContent —
    DialogHeader/Footer carry their own px-5 padding; DialogBody is the established
    body primitive (9 existing usages), the plan's bare JSX would render edge-to-edge
  - Merged the deliverable confirmations import into the existing single
    '@/src/ai/confirmations' import statement rather than a duplicate module import
metrics:
  duration: ~3 min
  completed: 2026-08-15
---

# Phase 16 Plan 02: PRD HITL UI (ChatPanel 卡片 + 编辑 Dialog) Summary

DELIV-02 的 UI 闭环:ChatPanel 出现「待确认的 PRD 草稿」卡片(产品名 + line-clamp-3 预览 + 来源时间),「确认并编辑」打开预填 MDXEditor 的 max-w-3xl Dialog(每次打开重置为原始草稿,取消无损),「落槽至研发中心」走 confirm → executeTool → deliverable_committed 审计事件(ftsHitCount payload)→ toast/助手消息消费链,「忽略」静默拒绝进 anti-repropose;重启经 restore effect 恢复卡片。

## What Was Built

**Task 1 — PrdDraftDialog 组件** (dfa5afe)
- `src/components/PrdDraftDialog.tsx`:纯展示 Dialog(max-w-3xl),`DialogHeader`(title/description)+ `DialogBody` 内 `MarkdownEditor`(minHeight 320px)+ `DialogFooter`(取消 disabled-on-busy / 落槽 loading-on-busy)。
- `editedDraft` useState(initialDraft) + open-effect 重置:每次打开恢复原始草稿 — 候选是落槽前唯一真相(UI-SPEC 取消语义)。
- 零 ai/store import(纯展示契约)。

**Task 2 — ChatPanel 全接线** (b629a71)
- **Surface 1 卡片**:`pendingDestructiveAction` 块后、`pendingMemory` 块前,逐字克隆记忆卡片类名(`border-accent/30 bg-accent-subtle px-3.5 py-3`)+ 新增 `line-clamp-3 whitespace-pre-wrap` 草稿预览;产品名经 `useProductStore` products 查找(fallback productId);「确认并编辑」/「忽略」size="sm" 按钮。
- **refreshPrdCard**:与 refreshMemoryCards 同构,queue head(`pending[0] ?? null`),错误 toast 用 Phase 15 复用文案。
- **restore effect**:refreshMemoryCards 后追加 `void refreshPrdCard()` — 重启后未处理候选卡片恢复(confirmationStore 持久化路径)。
- **onToolEnd**:`name === 'generateDeliverable'` 刷新卡片(proposeMemory 同构)。
- **rejectDraft**:静默(无 toast/消息,MEM-02 同款)。
- **commitToSlot**:confirmDeliverableDraft → `executeTool('generateDeliverable', { code, title, draft: 编辑稿, confirmationToken })` → `appendAuxEvent('deliverable_committed', { docId, version, slotCode, code, ftsImmediateHit, ftsHitCount, sessionId, eventId })` → flushEvents → success toast「PRD 已落槽」+ 助手消息 → 关 Dialog → refreshPrdCard。失败分支:error toast(草稿保留文案)+ refresh(Dialog 留开供复制)。
- **Dialog 渲染**:与卡片同条件挂载(pendingPrdDraft 为 null 时随卡片卸载);scroll effect deps 追加 pendingPrdDraft。

## Verification Results

| Check | Result |
|-------|--------|
| `npm run lint` (tsc --noEmit) | zero errors |
| `npm test` (full suite) | 146/146 green (16-01 测试不受 UI 改动影响) |
| grep pendingPrdDraft | 17 (≥10) |
| grep deliverable_committed | 1 (appendAuxEvent 调用点) |
| grep generateDeliverable | 2 (onToolEnd + executeTool) |
| grep 'PRD 已落槽' | 2 (toast + 助手消息) |
| 卡片 JSX | 'line-clamp-3 whitespace-pre-wrap' + '待确认的 PRD 草稿' 命中 |
| PrdDraftDialog initialDraft | 6 hits (≥3);无 ai/store import |

消费链顺序核对:confirm → executeTool(内部 consume → upsertDoc → commitDeliverableDraft → FTS 查询)→ appendAuxEvent → flushEvents → toast/消息/关 Dialog/refresh — 与 plan verification #3 一致。取消语义:Dialog onOpenChange(false) 只关弹窗;重开经 open-effect 恢复原始草稿。

## Success Criteria Coverage

- **DELIV-02**:确认→编辑→落槽全链路 UI 就绪(可视化验收在 16-03 UAT checkpoint)。
- **重启恢复**:restore effect 调 refreshPrdCard,与 pendingKnowledgeWrites/pendingMemory 同路径。
- **审计**:每次成功落槽产生 deliverable_committed(payload 含 docId/version/slotCode/ftsImmediateHit/ftsHitCount/sessionId/eventId)。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan JSX renders MarkdownEditor without dialog body padding**
- **Found during:** Task 1 implementation
- **Issue:** Plan's verbatim JSX puts `<MarkdownEditor>` directly inside `DialogContent` — DialogHeader/DialogFooter carry their own `px-5` padding but DialogContent does not; the editor would render edge-to-edge with no gutter.
- **Fix:** Wrapped in the existing `DialogBody` primitive (`px-5 py-4`, 9 existing usages across TaskDialog/ScheduleDialog/AddDocumentModal etc.) instead of an ad-hoc div.
- **Files:** src/components/PrdDraftDialog.tsx
- **Commit:** dfa5afe

**2. [Refactor] Single confirmations import statement**
- Plan listed the deliverable imports as a second `from '@/src/ai/confirmations'` block; merged into the existing single import (tsc/dedupe hygiene, zero behavior change).
- **Files:** src/components/ChatPanel.tsx
- **Commit:** b629a71

## Known Stubs

None — card, dialog, consumption chain, audit event, refresh, and restore paths are all fully wired. Surface 3 (AI 溯源徽章) is Plan 03 scope; UAT is the 16-03 checkpoint.

## Auth Gates

None.

## Self-Check: PASSED

PrdDraftDialog.tsx exists on disk; commits dfa5afe and b629a71 present in git log; npm test 146/146 green; lint clean.
