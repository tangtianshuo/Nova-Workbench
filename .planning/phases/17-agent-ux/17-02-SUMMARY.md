---
phase: 17-agent-ux
plan: 02
subsystem: agent-ux
tags: [ux, cmdk, context-carry, zustand]
requires: [uiStore, buildCoreContext, AgentConsole, useCmdK]
provides: [refreshAgentCarry, agentContextCarry, taskKanbanView/taskKanbanCategory lift, carry chip row]
affects: [useCmdK, TaskKanban, AgentConsole, context core segment]
tech-stack:
  added: []
  patterns: [transient carry snapshot derived at open time, single-assembler extension (buildCoreContext Carried Context), store-setter linkage (view switch clears category)]
key-files:
  created:
    - src/ai/__tests__/phase17ContextCarry.test.ts
  modified:
    - src/stores/uiStore.ts
    - src/ai/context.ts
    - src/hooks/useCmdK.ts
    - src/components/TaskKanban.tsx
    - src/components/AgentConsole.tsx
decisions:
  - CarriedContextItem defined in uiStore.ts (single source), context.ts imports it — avoids a circular type home
  - Carry injection rides the existing buildCoreContext core segment (same 600-token clamp via toolLoop) — zero second assembler path
  - Task fallback chip shows the actual filter name (任务 · {分类名}/按日期/全部分类), not a view-granularity generic label
  - setTaskKanbanView('date') clears taskKanbanCategory in the store setter (single linkage point)
metrics:
  duration: ~5 min
  completed: 2026-08-17
---

# Phase 17 Plan 02: ⌘K 携带视图上下文 + chip 行 Summary

**One-liner:** 裸 ⌘K/Ctrl+K 唤起 agent 时以 `refreshAgentCarry()` 快照当前视图上下文（选中产品/任务或列表过滤器/今日日程）入 transient `agentContextCarry`，chip 行可视化可移除，注入走 `buildCoreContext` 同一 core segment — UX-02。

## What Was Done

### Task 1: uiStore carry 状态 + refreshAgentCarry + buildCoreContext 扩展（TDD）(4314a05 RED → 85d0ae2 GREEN)
- RED: `src/ai/__tests__/phase17ContextCarry.test.ts` — 8 用例（选中任务派生、`- Selected Task:` 注入、schedule `- Today:` 行、空 carry 零污染、今日无事件不产生项、产品 carry 不重复输出、任务 fallback 三分支、`setTaskKanbanView('date')` 联动清空分类）
- `uiStore.ts`: `CarriedContextItem` 接口 + transient `agentContextCarry`/`taskKanbanView`/`taskKanbanCategory`（均不进 partialize）+ `setAgentContextCarry`/`removeCarriedItem`（首个 kind 匹配移除）/`setTaskKanbanView`（date 时清分类）/`setTaskKanbanCategory`
- `context.ts`: `refreshAgentCarry()` 按 17-UI-SPEC Surface 2 表派生（product-management 选中产品；tasks 选中任务 `[priority] title`、未选中 fallback 实际过滤器名；schedule 今日 n>0 才产生；其它 tab → []）；`buildCoreContext` 在 User Preferences 前追加 `## Carried Context`（task → `- Selected Task:`，schedule → 今日事件 `- Today:` 行；product 不输出，已有 Selected Product 段覆盖）

### Task 2: 裸 ⌘K 绑定 + TaskKanban 提升 + chip 行 (cfda839)
- `useCmdK.ts`: 裸 ⌘K 分支（shift 分支之前）+ Shift+K 回退分支均先 `refreshAgentCarry()` 再 toggle 面板；顶部注释更新（Tauri webview 无 URL 栏冲突、Shift+K 留作 web dev fallback）
- `TaskKanban.tsx`: 删除 `useState('category')`，viewMode/setViewMode 改读 uiStore；分类视图列头（`group.name` 所在 h3）挂 `setTaskKanbanCategory(同列再点清除)`，date 视图不挂；零视觉改动
- `AgentConsole.tsx`: footer 表单上方插入 chip 行（17-UI-SPEC Surface 2 JSX 逐字，`X` 移除按钮、`border-accent/20 bg-accent-subtle`）；AgentConsole 为双宿主共享组件，一处插入两宿主均可见；移除即 session-scoped，下一次发送读 store 现值

## Verification

- `npm test` 160/160 全绿（含 8 个新 carry 用例）；`npm run lint` 零错误
- 链路 grep 打通: useCmdK → refreshAgentCarry (×2 调用) → uiStore.agentContextCarry → buildCoreContext `## Carried Context`；AgentConsole `已携带:` → removeCarriedItem；TaskKanban `setTaskKanbanCategory` → refreshAgentCarry fallback label
- partialize 不含 agentContextCarry/taskKanbanView/taskKanbanCategory（transient 验证）
- `useState('category')` 在 TaskKanban 零命中（提升完成）

## Deviations from Plan

**1. [Rule 1 - Bug] 测试文件 Product 类型导入位置修正**
- **Found during:** Task 1 GREEN 后 lint
- **Issue:** RED 测试从 `@/src/data/mockTasks` 导入 `Product`（TS2305 — Product 实际定义在 `mockProducts.ts`）
- **Fix:** 改为 `import type { Product } from '@/src/data/mockProducts'`
- **Commit:** 85d0ae2（随 GREEN 提交前修正）

## Known Stubs

None — chip 行渲染真实 carry 数据，无占位实现。

## Self-Check: PASSED

All 5 modified/created files exist; all 3 task commits (4314a05, 85d0ae2, cfda839) verified in git log.
