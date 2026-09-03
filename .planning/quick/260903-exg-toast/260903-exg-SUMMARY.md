---
phase: quick-260903-exg
plan: 01
subsystem: hitl-remind
tags: [toast, hitl, sidebar, watcher]
requires: [chatConsoleStore-pending-fields, tabRunStore-pendingDeliverables]
provides: [toast-action, selectPendingCount, shouldToastOnTransition, ConfirmationToastWatcher, sidebar-pending-badge]
key-files:
  created:
    - src/ai/pendingCount.ts
    - src/ai/__tests__/pendingCount.test.ts
    - src/components/ConfirmationToastWatcher.tsx
  modified:
    - src/components/ui/Toast.tsx
    - src/components/layout/Sidebar.tsx
    - src/App.tsx
decisions:
  - 测试放 src/ai/__tests__ 而非计划写的 src/ai/ 根 — npm test glob 只扫 __tests__ 目录
  - Sidebar badge 用 useState+subscribe(useSyncExternalStore 非必需,两 store 合并计数它反而更绕)
metrics:
  duration: 18m
  completed: 2026-09-03
---

# Quick Task 260903-exg: 前台确认提醒 Toast + Sidebar 红点 Summary

候选 0→N 到达时前台弹一次 warning Toast(「去确认」跳 Agent 工作区)+ Sidebar「Agent 工作区」数字红点;确认卡渲染路径零改动(D-05 不破)。

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Toast action 扩展 + pendingCount selector + 转变纯函数(TDD) | e2f2bbc (RED) / b967adb (GREEN) |
| 2 | ConfirmationToastWatcher 挂 App + Sidebar agent badge | 3517df7 |
| 3 | human-verify checkpoint | **pending 人工验证** |

## What Was Built

- `src/ai/pendingCount.ts` — `selectPendingCount`(7 nullable 字段各 1 + pendingDeliverables.length)+ `shouldToastOnTransition`(仅 0→N)
- `src/ai/__tests__/pendingCount.test.ts` — 7 个 node:test 用例,RED→GREEN
- `src/components/ui/Toast.tsx` — Toast interface 加 `action?: { label, onClick }`,description 下渲染 accent 小按钮,点击先 dismiss 再 onClick
- `src/components/ConfirmationToastWatcher.tsx` — 渲染 null;订阅 chatConsoleStore + tabRunStore,挂载快照只记基线不弹,之后 0→N 弹 6s warning toast,「去确认」→ `setActiveTab('agent')`;effect 内订阅配对清理,StrictMode 双挂载安全
- `src/components/layout/Sidebar.tsx` — SidebarItem 加可选 `badge?: number`,agent 项传入 `usePendingCount()`(同两 store 订阅);数字 badge 复用 isNew 样式先例(`bg-accent text-white`);MENU_ITEMS 未动
- `src/App.tsx` — `<ConfirmationToastWatcher />` 挂 ToastProvider 内、AppProvider 下(useToast 可达)

## Deviations from Plan

**1. [Rule 3] 测试文件路径改为 src/ai/__tests__/pendingCount.test.ts**
- 计划写 `src/ai/pendingCount.test.ts`,但 `npm test` glob 只匹配 `src/ai/__tests__/*.test.ts`,放根目录不会被跑。

**2. [Rule 3] Sidebar 用 useState+subscribe 而非 useSyncExternalStore**
- 计划二选一;两 store 合并计数下 useState+subscribe 更直接,行为等价。

## Verification

- `npm run lint` 绿;`npm test` 231 pass / 0 fail(含新增 7 用例)
- 无新依赖;设计令牌语义类(bg-accent/text-white/text-accent);AppContext 未触碰;确认卡渲染路径零改动

## Pending Human Verification (Task 3)

按 PLAN.md checkpoint:`npm run dev` → 触发确认卡 run → 切走 tab → 验证 Toast 弹出/跳转/N→N 静默/清空后重弹/Sidebar 红点同步。

## Self-Check: PASSED
