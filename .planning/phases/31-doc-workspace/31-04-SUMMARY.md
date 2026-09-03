---
phase: 31-doc-workspace
plan: 04
subsystem: ui
tags: [milkdown, zustand, knowledge-docs, autosave, hitl, react]

requires:
  - phase: 31-01
    provides: MarkdownEditor (Milkdown lazy shell, controlled value/onChange)
  - phase: 31-02
    provides: docWorkspaceStore (docs/currentDocId/saveDoc/createNote) + doc_kind knowledgeRepo
  - phase: 31-03
    provides: DocWorkspaceShell (flex aside) + uiStore panel fields
provides:
  - 工作区三场景端到端:打开 AI 产出编辑保存 / 新建全局笔记 / 工作区确认卡
  - DocList 三过滤列表 + 新建笔记
  - WorkspaceConfirmCard 第三宿主(真相源 chatConsoleStore 零改动)
affects: [doc-workspace, knowledge-base, agent-console]

tech-stack:
  added: []
  patterns:
    - "多宿主确认卡:渲染宿主直调既有 store actions,不复制队列逻辑"
    - "防抖自动保存三态指示器(editing→saving→saved 2s 淡出),无 toast"

key-files:
  created:
    - src/components/workspace/DocList.tsx
    - src/components/workspace/DocWorkspaceContent.tsx
    - src/components/workspace/WorkspaceConfirmCard.tsx
  modified:
    - src/App.tsx (mount DocWorkspaceContent as Shell children)

key-decisions:
  - "非 markdown 判定用标题扩展名(.docx/.pdf/.pptx/.xlsx)——doc_kind 只有 document/note,入库文档无独立文件类型字段,标题扩展名是唯一信号"
  - "其余 pending 折叠行计数 = selectPendingCount 总数 − pendingConfirmation 占 1,复用 Sidebar 同一字段清单"
  - "Task 2(card)先于 Task 1 提交,保证 DocWorkspaceContent import 在每个 commit 均可编译"

patterns-established:
  - "确认卡多宿主模式:新宿主只订阅 + 直调 actions,禁止新建队列 reducer"
  - "自动保存:800ms debounce + window blur 即存,切文档 cancel 定时器并 adopt store content"

requirements-completed: [DOC-01, DOC-02, DOC-03, DOC-05]

duration: 35min
completed: 2026-09-03
---

# Phase 31 Plan 04: Doc Workspace Business Content Summary

**三过滤文档列表 + Milkdown 编辑器 800ms 防抖自动保存 + 确认卡第三宿主,工作区三场景(SC-1/2/3)端到端可用**

## Performance

- **Duration:** 35 min
- **Completed:** 2026-09-03
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- DocList:SegmentedControl 三过滤(AI 产出/笔记/最近)、产品分组(笔记归「全局」)、笔记徽章、新建笔记、三条 UI-SPEC 空态逐字、非 md 置灰提示
- DocWorkspaceContent:MarkdownEditor 受控接线、800ms 防抖 + 失焦即存、编辑中…/保存中…/已保存(text-success 2s 淡出)三态、保存失败 inline 重试、编辑器空态
- WorkspaceConfirmCard:pendingConfirmation 渲染 + 确认写入/拒绝直调 chatConsoleStore 既有 actions(零 store 改动),其余 pending 折叠「另有 N 项待确认 — 打开 AI 台」跳 agent tab

## Task Commits

1. **Task 2: WorkspaceConfirmCard 第三宿主** - `71237e5` (feat)
2. **Task 1: 文档列表 + 编辑器接线 + 自动保存** - `c4b4517` (feat)

## Files Created/Modified
- `src/components/workspace/DocList.tsx` — 三过滤列表 + 新建笔记
- `src/components/workspace/DocWorkspaceContent.tsx` — Shell 主体:确认卡 + 可折叠列表 + 编辑器 + 自动保存链
- `src/components/workspace/WorkspaceConfirmCard.tsx` — 确认卡第三宿主
- `src/App.tsx` — DocWorkspaceContent 挂入 DocWorkspaceShell children

## Decisions Made
- 非 markdown 判定:doc_kind 无文件类型维度,用标题扩展名(.docx/.pdf/.pptx/.xlsx)置灰 + Tooltip 提示
- 其余 pending 计数复用 selectPendingCount(Sidebar 同源),减去当前知识卡自身
- 提交顺序 card → content,保证原子 commit 均可编译

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] App.tsx 挂载点接线**
- **Found during:** Task 1
- **Issue:** 31-03 只挂了空 Shell,plan 文件清单未列 App.tsx,但 DocWorkspaceContent 必须有挂载点
- **Fix:** App.tsx 将 DocWorkspaceContent 作为 Shell children 挂入
- **Committed in:** c4b4517

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** 必要接线,无 scope creep。

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
- 三场景代码闭环;真机 UAT(新建笔记→编辑→saveStatus saved→重启仍在;确认卡确认/拒绝同步 AgentConsole 队列)留给 phase 收口(31-05 UAT)
- npm run lint 绿;chatConsoleStore.ts 零改动已确认

---
*Phase: 31-doc-workspace*
*Completed: 2026-09-03*
