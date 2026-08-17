---
phase: 17-agent-ux
plan: 05
subsystem: agent-ux
tags: [ux, context-menu, radix, right-click, chat-prefill]
requires: [uiStore, AgentConsole, chatConsoleStore, DropdownMenu styling]
provides: [ContextMenu primitive, AiContextMenu wrapper, fireAiAction, pendingChatPrefill slot, 17-HUMAN-UAT.md]
affects: [TaskKanban, KnowledgeBaseView, AgentConsole, uiStore]
tech-stack:
  added: ["@radix-ui/react-context-menu"]
  patterns: [consume-on-read transient prefill slot (set input + focus + clear, never auto-send), capture-phase stopPropagation contenteditable guard, context-menu as DropdownMenu visual clone]
key-files:
  created:
    - src/components/ui/ContextMenu.tsx
    - src/lib/aiActions.ts
    - .planning/phases/17-agent-ux/17-HUMAN-UAT.md
  modified:
    - package.json
    - src/components/ui/index.ts
    - src/stores/uiStore.ts
    - src/components/TaskKanban.tsx
    - src/views/KnowledgeBaseView.tsx
    - src/components/AgentConsole.tsx
key-decisions:
  - "Belt-and-braces contenteditable guard uses capture-phase stopPropagation instead of the plan's controlled setOpen(false) — Radix calls onOpenChange(true) after the child handler, so the plan's guard cannot block opening; preventDefault would kill the native menu too"
  - "Overwrite semantics everywhere: pendingChatPrefill replaces (each menu click is a fresh intent), AgentConsole setInput overwrites input"
  - "Search-result doc rows (FTS mode) stay unwrapped — plan scopes the wrap to category browse rows only (~:322)"
patterns-established:
  - "fireAiAction(instruction) is the single entry for any future right-click AI surface: snapshot + prefill + Drawer overlay, no tab switch"
requirements-completed: [UX-04]
metrics:
  duration: ~12 min
  completed: 2026-08-17
---

# Phase 17 Plan 05: 右键快捷 AI 动作 Summary

**One-liner:** @radix-ui/react-context-menu 原语（DropdownMenu 视觉克隆）+ AiContextMenu 封装，任务卡/知识库文档行各 3 个右键 AI 动作经 `fireAiAction`（选区快照 ≤200 字前缀）预填 ChatPanel 输入不发送 — UX-04；全 phase 人工 UAT 落 17-HUMAN-UAT.md 延后统一执行。

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-17T04:21:31Z
- **Completed:** 2026-08-17T04:33:00Z (approx)
- **Tasks:** 3
- **Files modified:** 9 (4 code + package.json + lock + UAT doc + barrel)

## Accomplishments
- ContextMenu 原语四件套 + AiContextMenu 用法封装（含 contenteditable 守卫），class 串与 DropdownMenu 逐字一致（Content `min-w-[10rem]`、Item `px-2.5 py-1.5`）
- fireAiAction 全链路：右键 → `引用选区：「…」`（>200 字截断）前缀 + 指令 → `setPendingChatPrefill` + `setChatPanelOpen(true)` → AgentConsole consume-on-read（setInput 覆盖 + focus + 清槽，不自动发送）
- 两区各恰 3 动作：任务卡（总结此任务/AI 拆解子任务/安排到日程）、知识库文档行（总结文档/存为记忆/相关问题追问），文案逐字按 17-UI-SPEC Copywriting Contract
- 17-HUMAN-UAT.md 落盘 6 用例（双宿主/携带/晨报/右键/回归旁证/v0.2.0 35 步合并项），全部 `result: [pending]`

## Task Commits

1. **Task 1: 安装 @radix-ui/react-context-menu + ContextMenu 原语** - `5109b99` (feat)
2. **Task 2: fireAiAction 触发器 + 两区包裹 + 预填消费** - `47c9490` (feat)
3. **Task 3: 17-HUMAN-UAT.md 延后统一人工验收清单** - `429d887` (docs)

## Files Created/Modified
- `src/components/ui/ContextMenu.tsx` - Radix ContextMenu 组合 + AiContextMenu 封装（capture-phase 守卫）
- `src/lib/aiActions.ts` - fireAiAction：选区快照 + 预填 + 开 Drawer（不切 tab）
- `src/stores/uiStore.ts` - transient `pendingChatPrefill`/`setPendingChatPrefill`（不进 partialize）
- `src/components/TaskKanban.tsx` - KanbanCard 根元素（`data-task-card` motion.div）AiContextMenu 包裹
- `src/views/KnowledgeBaseView.tsx` - 侧栏分类浏览文档行包裹（编辑器面板不包裹 — 结构性守卫）
- `src/components/AgentConsole.tsx` - consume-on-read effect：setInput + 清槽 + focus
- `.planning/phases/17-agent-ux/17-HUMAN-UAT.md` - 延后人工验收清单
- `package.json` / `src/components/ui/index.ts` - 唯一新依赖 + barrel re-export

## Decisions Made
- 守卫实现改为 capture-phase `stopPropagation`（见 Deviations 1）— 根因是 Radix composeEventHandlers 顺序语义
- AiContextMenu 不用受控 open — 无需 state，菜单行为全交 Radix 默认（键盘 ContextMenu 键亦可用）
- 知识库搜索结果行不包裹（plan 明确 ~:322 itemsInCategory.map 为唯一包裹点）

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] contenteditable 守卫实现方式修正（plan 的 setOpen(false) 方案无效）**
- **Found during:** Task 1（写守卫前核对 node_modules Radix 源码）
- **Issue:** plan 片段的受控 `open` + `onContextMenu` 里 `setOpen(false)` 无法拦截 — Radix `composeEventHandlers` 先跑 child handler 再跑内部 handler，内部同步 `onOpenChange(true)` 会覆盖我们的 false；而 `preventDefault()` 虽能跳过 Radix handler，但会同时杀掉原生菜单（违背 must_have「原生右键菜单不受影响」）
- **Fix:** `onContextMenuCapture` 中命中 `[contenteditable="true"]` 时 `event.stopPropagation()` — capture 在 trigger 元素先于 bubble handler 执行，React 合成事件停止传播后 Radix 的 onContextMenu 不跑、无 preventDefault，原生菜单保留
- **Files modified:** src/components/ui/ContextMenu.tsx
- **Verification:** Radix dist 源码逐行核对（composeEventHandlers defaultPrevented 语义 + Trigger handler 顺序）；lint 通过
- **Committed in:** 5109b99（Task 1 commit）

**2. [Rule 1 - Bug] ContextMenu 组织方式跟随 DropdownMenu 实际代码（plain function）而非 plan 片段的 forwardRef**
- **Found during:** Task 1
- **Issue:** plan 片段用 forwardRef，但「按 DropdownMenu.tsx 的实际文件组织方式同构」— 实际 DropdownMenu 是 plain function + typed props，无 forwardRef
- **Fix:** 采用 plain function（与同族文件一致、更短）；acceptance grep 全过
- **Committed in:** 5109b99

---

**Total deviations:** 2 auto-fixed (2 bug)
**Impact on plan:** 均为实现保真度修正，不扩 scope；守卫修正是 must_have 成立的前提。

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 17 五个 plan 全部执行完毕；UX-04 达成（两区各 3 动作、预填不发送、选区快照、contenteditable 不劫持）
- 人工验收统一延后：17-HUMAN-UAT.md 6 用例（含 v0.2.0 35 步回归合并项）
- 无阻塞；npm run lint 零错误、npm test 160/160 绿

## Known Stubs
None — 右键动作走真实 ChatPanel 预填链路，无占位实现。

## Self-Check: PASSED

All 7 key files exist; all 3 task commits (5109b99, 47c9490, 429d887) verified in git log.
