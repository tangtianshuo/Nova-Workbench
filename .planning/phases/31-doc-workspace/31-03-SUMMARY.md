---
phase: 31-doc-workspace
plan: 03
subsystem: ui
tags: [drawer, radix-dialog, non-modal, resize-handle, zustand-persist, layout]

requires:
  - phase: 31-02
    provides: docWorkspaceStore data layer (panel state lives in uiStore per D-04/31-02 decision)
provides:
  - Drawer side='left' + modal passthrough (non-modal ⌘K left slide-in)
  - DocWorkspaceShell flex aside (drag-resize 360..60vw, collapse/expand rail, children slot)
  - uiStore docWorkspaceOpen/docWorkspaceWidth persisted
affects: [31-04 (fills shell children), 31-05 UAT]

tech-stack:
  added: []
  patterns:
    - "non-modal Radix Dialog: modal={false} + showOverlay={false} + onInteractOutside preventDefault (外点不关, Esc 仍关)"
    - "flex aside panel with mousedown/mousemove/mouseup resize handler, no library"

key-files:
  created: [src/components/workspace/DocWorkspaceShell.tsx]
  modified: [src/components/ui/Drawer.tsx, src/components/ChatPanel.tsx, src/stores/uiStore.ts, src/App.tsx]

key-decisions:
  - "Drawer 外点不关需显式 onInteractOutside preventDefault(Radix 非 modal 默认仍会 dismiss)——加在 ChatPanel 消费点,非 Drawer 全局"
  - "Overlay 渲染由 showOverlay prop 控制(与 modal 解耦),非 modal 消费点传 false"

patterns-established:
  - "非模态 Drawer 三件套: modal={false} + showOverlay={false} + onInteractOutside={(e) => e.preventDefault()}"
  - "常驻面板 = 普通 flex aside + uiStore persist 态(非 Drawer/非 overlay)"

requirements-completed: [DOC-04]

duration: 16min
completed: 2026-09-03
---

# Phase 31 Plan 03: Layout Layer Summary

**⌘K 左滑非模态 Drawer(外点不关、Esc 可关)+ 右侧常驻文档工作区面板壳(可拖宽 clamp 360-60vw、可收起、宽度 persist)**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-03T08:01:33Z
- **Completed:** 2026-09-03T08:17:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Drawer 支持 side='left'/'right' + Root modal 透传,左滑动画方向反转
- ⌘K ChatPanel 改非模态:无 overlay、主内容/右栏可交互、外点不关、Esc 仍关
- 右侧 DocWorkspaceShell(flex aside)挂入 MainLayout,拖宽手柄 + 收起/展开竖条,open/width 持久化到 uiStore partialize

## Task Commits

1. **Task 1: Drawer 左滑非模态化** - `c3fd18b` (feat)
2. **Task 2: 右侧常驻面板壳 + uiStore 状态** - `02dc562` (feat)

## Files Created/Modified
- `src/components/ui/Drawer.tsx` - side/showOverlay props, modal 透传
- `src/components/ChatPanel.tsx` - side="left" modal={false}, 外点不关
- `src/stores/uiStore.ts` - docWorkspaceOpen/Width + actions, persist partialize
- `src/components/workspace/DocWorkspaceShell.tsx` - aside 壳:resize 手柄/toolbar/children 插槽/收起 rail
- `src/App.tsx` - MainLayout 挂载 DocWorkspaceShell(内容列 flex 兄弟)

## Decisions Made
- Radix 非 modal Dialog 默认外点仍 dismiss → ChatPanel 加 onInteractOutside preventDefault(plan Pitfall 1 的补全)
- Overlay 由 DrawerContent 的 showOverlay prop 控制,而非从 Root 读(保持受控简单)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 非 modal Drawer 外点默认仍关闭**
- **Found during:** Task 1
- **Issue:** Radix Dialog modal={false} 时 onInteractOutside 默认仍触发 dismiss,违背「外点不关」must-have
- **Fix:** ChatPanel DrawerContent 加 onInteractOutside={(e) => e.preventDefault()}
- **Files modified:** src/components/ChatPanel.tsx
- **Verification:** npm run lint 绿;行为按 Radix DismissableLayer 语义
- **Committed in:** c3fd18b

**2. [Rule 3 - Blocking] Tooltip API 不匹配**
- **Found during:** Task 2
- **Issue:** 本项目 Tooltip 是 content-prop 单组件,无 TooltipTrigger/TooltipContent 子组件
- **Fix:** 改用 `<Tooltip content="...">` 包 Button
- **Files modified:** src/components/workspace/DocWorkspaceShell.tsx
- **Verification:** npm run lint 绿
- **Committed in:** 02dc562

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** 均为实现层修正,无 scope creep

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
- Shell 主体 children 插槽就绪,31-04 填充文档列表/编辑器/确认卡
- uiStore persist key 已扩(无 version bump,persist migrate passthrough 兼容旧数据)

## Known Stubs
- DocWorkspaceShell 主体为空 children 插槽——本 plan 只做壳,业务内容按计划由 31-04 填充(计划内,非意外 stub)

---
*Phase: 31-doc-workspace*
*Completed: 2026-09-03*

## Self-Check: PASSED
- Files: DocWorkspaceShell.tsx FOUND; commits c3fd18b/02dc562 FOUND
