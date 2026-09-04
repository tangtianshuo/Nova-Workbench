---
phase: 30
plan: 03
subsystem: workflow-templates
tags: [workflow-view, tab-run, sidebar, templates]
requires: [30-02]
provides: [WorkflowView, workflow TabRunKind, 5 builtin templates]
affects: [Sidebar, App routing, tabRunStore]
tech-stack:
  added: []
  patterns: [TabRunPanel 零改动复用, source Badge 映射, Tabs 模板库分组]
key-files:
  created:
    - src/views/WorkflowView.tsx
  modified:
    - src/data/workflow-templates-builtin.json
    - src/stores/tabRunStore.ts
    - src/components/layout/Sidebar.tsx
    - src/App.tsx
decisions:
  - 竞品对比报告用 DEL-REL-02(catalog 实际 code;plan 里的 DEL-REL-03 是用户手册)
  - Phosphor 本版无 Flow 导出,用 FlowArrow(Sidebar + 视图统一)
  - coreContext 用 buildCoreContext()(无 payload,同 CmdKPalette 先例)
metrics:
  duration: 18m
  completed: 2026-09-02
---

# Phase 30 Plan 03: 工作流视图 + 模板 run Summary

「工作流」顶层视图:5 个内置参考模板 + 模板库 Tabs + 一键发起单 run 多步(参考剧本措辞双出现)+ 复制/改名/删除卡片操作,TabRunPanel 零改动复用。

## What Was Done

### Task 1: 内置模板正式内容 + TabRunKind 'workflow' + run 发起 (665fa73)

- `src/data/workflow-templates-builtin.json` 扩为 5 个正式模板,每模板 2-3 步、步骤引用真实工具(`knowledge_search` / `generate_deliverable` 的 DEL-REQ-01、DEL-REL-02、DEL-TST-03、DEL-REL-01 / `knowledge_write` / `task_create` / `ingest_scan`),field 结构 `{name, prompt, expectedSlotCode?, toolHint?}`
- `src/stores/tabRunStore.ts` TabRunKind 加 `| 'workflow'`
- `src/views/WorkflowView.tsx`:`startWorkflowRun(t)` 按计划 snippet —— steps 渲染进 userMessage,措辞「以下为参考剧本,可按当前上下文合理微调…每步产物都走候选确认」;重复运行 UI 侧 toast「已有工作流在运行,先等它完成或取消」(ACTIVE guard);sessionTitle `工作流 · <名>`
- 卡片操作全量实现:UI-SPEC §4-5 复制(不弹窗 toast)/ 改名(单 Input Dialog)/ 删除(danger Dialog 确认);Tabs(内置参考/我的模板)source 过滤;空态文案逐字照抄 Copywriting Contract

### Task 2: Sidebar/App 接线 (c7ebbe3)

- `Sidebar.tsx` MENU_ITEMS knowledge 后插 `{ id: 'workflows', icon: FlowArrow, label: '工作流', subtitle: '模板库 / 参考剧本 / 一次发起', isNew: true }`
- `App.tsx` lazy import + activeTab switch `workflows` 分支

## Verification

- `npm run lint`(tsc)退出码 0
- `npm test` 224/224 pass
- builtin JSON shape 校验:5 元素、全部 steps 非空(Rust include_str! 同源消费,schema 未动)
- 措辞红线:模板卡元信息「N 步 · 参考剧本(agent 可按上下文微调顺序与取舍)」+ userMessage「参考剧本」双出现;无参数表单/逐步确认/刚性进度 UI
- 视觉:仅语义 token;accent 限于 UI-SPEC 穷尽清单(运行 CTA / builtin Badge);无 hex/bg-white/text-gray

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 竞品模板 code 修正为 DEL-REL-02**
- **Found during:** Task 1
- **Issue:** plan 与 30-02 占位都写 DEL-REL-03,但 catalog 中 DEL-REL-03 是用户手册,竞品对比报告是 DEL-REL-02
- **Fix:** builtin-competitor-analysis 使用 DEL-REL-02(expectedSlotCode + prompt)
- **Files:** src/data/workflow-templates-builtin.json

**2. [Rule 3 - Blocking] Phosphor 无 `Flow` 图标导出**
- **Found during:** Task 1
- **Issue:** 本版 @phosphor-icons/react 只有 `FlowArrow`(tsc TS2305)
- **Fix:** Sidebar 与 WorkflowView 统一用 `FlowArrow`
- **Files:** src/views/WorkflowView.tsx, src/components/layout/Sidebar.tsx

**3. [Rule 1 - Bug] 内置 prd-draft 占位 prompt 的 code=prd 修正**
- **Found during:** Task 1
- **Issue:** 30-02 占位模板写 `generate_deliverable(code=prd)`,非真实 catalog code
- **Fix:** 重写为 DEL-REQ-01(占位整体被正式内容替换)

## Known Stubs

None.

## Self-Check: PASSED

(6/6 files exist; commits 665fa73 / c7ebbe3 verified in git log)
