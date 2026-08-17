---
phase: 17-agent-ux
plan: 01
subsystem: agent-console
tags: [refactor, ux, zustand, chat]
requires: [chatSession, sessionRestore, memoryStore, confirmations, toolLoop]
provides: [chatConsoleStore, AgentConsole, AgentWorkspaceView page host]
affects: [ChatPanel, AgentWorkspaceView]
tech-stack:
  added: []
  patterns: [transient zustand store as shared conversation owner, toast bridge (bindToast/emitToast) keeping stores React-free]
key-files:
  created:
    - src/stores/chatConsoleStore.ts
    - src/components/AgentConsole.tsx
  modified:
    - src/components/ChatPanel.tsx
    - src/views/AgentWorkspaceView.tsx
decisions:
  - Conversation state single ownership in transient chatConsoleStore (17-UI-SPEC locked) — Drawer and page host are literally the same conversation
  - sessionRef module-level in store file; nextId/streaming refs module-level mirrors; restore deduped by module-level restorePromise
  - Toast bridge instead of importing useToast into the store — store stays importable from Node tests
metrics:
  duration: ~7 min
  completed: 2026-08-17
---

# Phase 17 Plan 01: AgentConsole 双宿主 Summary

**One-liner:** ChatPanel 会话主体抽为共享 AgentConsole（状态落 transient chatConsoleStore），ChatPanel 退化为 29 行 Drawer 壳，AgentWorkspaceView 309 行 mock 全删重写为 max-w-3xl 页宿主 — UX-01 由共享状态同构达成。

## What Was Done

### Task 1: chatConsoleStore — 会话状态唯一归属 (18edf0c)
- `src/stores/chatConsoleStore.ts` (536 行): ChatPanel :99-122 全部状态 + :124-492 全部 handler 原样搬入，仅改 set/get 形态，逻辑零改动
- Transient store，无 persist 中间件（与 uiStore modal flags 同类）
- 模块级: `sessionRef`（export）、`nextId`、streaming refs 镜像、`restorePromise`（幂等 restore，StrictMode 双 mount 安全）
- Toast 桥: `bindToast(fn)` / `emitToast` — store 不 import React，Node 测试可加载；全部 toast 文案逐字保留
- `submit()` provider 从 `useUIStore.getState().activeAIProvider` 读取; `commitToSlot` 保留 `deliverable_committed` audit event 与 ponytail 注释
- `ChatMessage`/`ToolTraceItem`/`ToolTraceStatus`/`PROVIDER_LABELS`/`formatMemoryTime` 一并搬入并 export

### Task 2: AgentConsole + ChatPanel 壳 (304a99e)
- `src/components/AgentConsole.tsx`: JSX 逐字迁移自 ChatPanel :509-659，零视觉改动；列 chrome 替换 DrawerBody/DrawerFooter（body `flex-1 overflow-y-auto px-5 pb-4 space-y-4`，footer `border-t border-border-subtle px-5 py-4`）
- 挂载: `bindToast(toast)` + 幂等 `restore()` + textarea focus；`isChatPanelOpen` effect 处理 Drawer 打开聚焦；`layout` prop 以 `data-console-layout` 挂在根节点（两种 layout DOM 相同，17-UI-SPEC 锁定）
- `ChatPanel.tsx` 重写为 29 行薄壳: Drawer + provider 标题 + `<AgentConsole />`（17-UI-SPEC Surface 1 JSX 逐字）

### Task 3: AgentWorkspaceView 页宿主 (092e5de)
- 309 行 mock 全删（含 useApp 假动作、recentTasks/agents 假数据、setTimeout 假 AI）
- 重写为 13 行: 居中 `max-w-3xl` 列 + `variant="glass"` Card + `AgentConsole layout="page"`；高度公式 `h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)]` 沿用；MorningReport 注释占位（17-03 填）

## Verification

- `npm run lint` 零错误
- `npm test` 146/146 全绿（无回归）
- ChatPanel.tsx 29 行（< 60）; AgentWorkspaceView.tsx 13 行（< 30）
- 双宿主同构: 两宿主均渲染 `AgentConsole`，`handleSubmit|runToolLoop|useState` 在 ChatPanel 零命中，会话状态仅存在于 chatConsoleStore
- `persist` 在 chatConsoleStore 零命中（transient 验证）

## Deviations from Plan

**1. [Rule 1 - Bug] ToolTraceStatus 改为 export**
- **Found during:** Task 2 lint
- **Issue:** AgentConsole import `type ToolTraceStatus` 报 TS2459（store 内 type 未导出，plan 清单只列了 ChatMessage/ToolTraceItem）
- **Fix:** `export type ToolTraceStatus`
- **Commit:** 18edf0c（随 Task 1 提交前修正）

**2. [Rule 2 - Completeness] restore 触发时机由 app start 变为首宿主挂载**
- **Found during:** Task 2
- **Issue:** 原 ChatPanel 常驻 Sidebar，restore effect 在 app 启动即跑；现 AgentConsole 位于 Drawer Portal 内（关闭即卸载），restore 首次触发推迟到 Drawer 打开或 agent 标页挂载
- **Fix/Acceptance:** restorePromise 幂等 + submit 的 restoreComplete 门不变，功能等价；且流式/消息在宿主卸载期间继续在 store 中累积（满足 must_have「进行中切换宿主不丢失」）。无代码变更，记录为语义微调

## Known Stubs

None — 无占位实现。MorningReport 注释位是 17-03 的显式预留（plan 指定），非 stub。

## Self-Check: PASSED

All 4 key files exist; all 3 task commits verified in git log.
