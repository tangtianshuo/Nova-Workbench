---
phase: 32-coding
plan: "04"
subsystem: coding-tools-frontend
tags: [hitl, diff-card, code-edit, exec-approval, knowledge-deposit]
requires:
  - "32-02 exec_pid/engine run stream (exec 首遇卡数据)"
  - "32-03 code_edit 候选 + engine_code_apply + migration 0016"
provides:
  - "DiffBody 懒加载 diff 渲染(react-diff-view 独立 chunk)"
  - "code_edit 候选解析(parseCodeEditCandidate/listPendingCodeEdits)"
  - "chatConsoleStore confirmCodeEdit/rejectCodeEdit(reason)/depositCodeEditSummary + pendingCodeEdits 队列"
  - "AgentConsole 第四宿主 + exec 三选卡(允许一次/总是允许/拒绝 + 学习粒度 chip)"
affects:
  - src/ai/confirmations.ts
  - src/ai/confirmationStore.ts
  - src/ai/api.ts
  - src/stores/chatConsoleStore.ts
  - src/components/AgentConsole.tsx
tech-stack:
  added:
    - "react-diff-view@3.3.3 (lazy-only, no diff pkg — parseDiff 内置)"
  patterns:
    - "CP-2 显示字段(diff)不落库 → 恢复路径 old/new 摘录 fallback"
    - "队首完整卡 + 「另有 N 张待审」 徽章(MP-1,WorkspaceConfirmCard 先例)"
key-files:
  created:
    - src/components/agent/DiffBody.tsx
    - src/components/agent/diff-body.css
    - src/components/agent/CodeEditConfirmCard.tsx
  modified:
    - package.json
    - src/ai/confirmations.ts
    - src/ai/confirmationStore.ts
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
    - src/components/AgentConsole.tsx
decisions:
  - "恢复路径无 diff 文本(CP-2 显示字段不落库)→ 卡片 fallback 渲染 old/new 摘录而非客户端重算 diff"
  - "沉淀走 TS createKnowledgeWriteCandidate(共享 nova.db)+ 既有 pendingConfirmation 卡复用确认链,零新管线"
  - "exec 卡复用既有 confirmExec(false/true) 通道,仅按 UI-SPEC 重排按钮/文案/学习粒度 chip"
metrics:
  duration: "~65m"
  completed: 2026-09-04
  tasks: 3 auto + 1 checkpoint
  files: 9
---

# Phase 32 Plan 04: 前端 diff 审批卡(第四宿主)+ exec 三选卡 + 沉淀入口 Summary

One-liner: code_edit 候选在 AI 台以懒加载 react-diff-view 审批卡排队渲染(队首完整卡 + 徽章计数),拒绝可附原因回传 agent,「沉淀改动摘要」复用 knowledge_write 候选流;exec 首遇卡改为 UI-SPEC 三按钮 + 命令/首参数学习粒度 chip。

## What Was Built

- **DiffBody**(lazy-only,default export):`parseDiff` 包 try/catch,malformed 渲染「diff 解析失败」占位;配色全部 token 派生(diff-body.css,success/danger alpha,零 hex)。构建产物独立 chunk 54KB(gzip 18.5KB),不在主 bundle。
- **候选解析**:`parseCodeEditCandidate` 同时接受持久化行(params)与引擎候选(args + 顶层 diff);`listPendingCodeEdits` 供重启/切会话重浮。`ConfirmationKind` union 补 `pm_write | code_edit`(此前 pm_write 也是漏网)。
- **store 三 actions + 队列**:`pendingCodeEdits[]`(token 去重,CP-2 重跑同 token 不叠卡);`confirmCodeEdit` → `engine_code_apply`(Rust 一 invoke 完成 confirm+consume+CP-3 校验+落盘+tool_result);`rejectCodeEdit(reason?)` → `engine_reject_candidate` reason 参数(migration 0016);`depositCodeEditSummary` → `createKnowledgeWriteCandidate`(title「改动摘要:{basename}」、diff/old-new 摘录入 content、category 经验沉淀)+ toast「已存入第二大脑候选,待确认」。cancelRun 级联:清队列 + transient 消息「run 已取消,改动未应用(路径)」。
- **CodeEditConfirmCard**:elevated Card `border-l-warning`,mono truncate 路径 + 「代码修改」徽章;footer「应用改动」primary /「拒绝」展开 inline 原因 textarea(placeholder「告诉 agent 怎么改(可选)」+ caption「该文件不会落盘,agent 会根据原因调整重试。」)/「沉淀改动摘要」ghost + Bookmarks duotone 16;「另有 {N} 张待审」warning 徽章。
- **AgentConsole**:code_edit 队首挂卡(第四宿主);exec 卡重排为「允许一次」primary(confirmExec(false))/「总是允许」secondary + tooltip「记住此命令,仅当前工作区生效」(confirmExec(true))/「拒绝」danger;command+first_arg chip(accent 下划线)高亮学习粒度。git 黑名单不渲染卡(引擎侧直接 Failed,既有 run 流错误展示)。空态复用 AI 台既有会话空态(队列为空 ⟹ 无卡,不重复造)。

## Verification

- `npm run lint`:本 plan 文件全绿(残留 2 个 tsc 错误位于 workspaceStore.ts / SettingsView.tsx — 并行 agent 32-05 在途文件,out of scope)
- `npm run build`:通过;`DiffBody-*.js` 独立 lazy chunk 54.08KB(gzip 18.49KB),主 bundle 不含 react-diff-view
- 文案逐字对齐 UI-SPEC Copywriting Contract(应用改动/另有 N 张待审/告诉 agent 怎么改(可选)/已存入第二大脑候选,待确认)
- className 全语义 token,无 bg-white/text-gray-*/hex

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ConfirmationKind union 缺 code_edit/pm_write**
- **Found during:** Task 1
- **Issue:** `listPendingCodeEdits` 传 'code_edit' 无法通过 tsc(union 只有 5 个 kind)
- **Fix:** src/ai/confirmationStore.ts union 补 `pm_write | 'code_edit'`(纯类型,Rust 侧两 kind 早已落库)
- **Commit:** 263b3d8

**2. [Rule 3 - Blocking] api.ts 不在 plan files 但需扩展**
- **Found during:** Task 2
- **Issue:** `engineCodeApply` 不存在;`engineRejectCandidate` 无 reason 参数(引擎命令已支持 `reason: Option<String>`)
- **Fix:** api.ts 加 `engineCodeApply(sessionId, token)`,`engineRejectCandidate(token, reason?)`(向后兼容,既有调用不受影响)
- **Commit:** 8c603de

**3. [Plan-adjustment] 恢复路径 diff fallback**
- CP-2 锁形决定 diff 是候选 live 显示字段、不落库;重启/切会话恢复的卡片无 diff 文本 → fallback 渲染 old_string/new_string 摘录(danger/success tint),live 候选仍走 react-diff-view。不引入 diff 依赖客户端重算(RESEARCH 裁定维持)。

### Skipped (documented)

- 「暂无待审改动」专用空态:复用 AI 台既有会话空态(plan 允许);code_edit 队列空 ⟹ 无卡渲染。
- run 取消 transient 态以会话内消息呈现(队列即清),不做卡片内延迟消失状态 —— 引擎 auto-reject 已带审计事件,UI 侧无第二真相源。

## Known Stubs

None — 全部按钮/通道接真实 invoke 或既有确认流。

## Checkpoint (Task 4: human-verify)

⚡ Auto-approved (workflow.auto_advance=true):diff 审批卡第四宿主 + exec 三选卡 + 沉淀入口已交付,lint/build 双绿,懒加载 chunk 验证通过。UAT 七步(plan 内 how-to-verify)留待用户在 `npm run tauri:dev` 真机执行,与 32 phase 收口 UAT 合并。

## Self-Check: PASSED

- 文件:DiffBody.tsx / diff-body.css / CodeEditConfirmCard.tsx 存在;confirmations/chatConsoleStore/AgentConsole/api 均含本次改动
- Commits:263b3d8 / 8c603de / 6fc9515 均在 git log
- 构建产物:dist/assets/DiffBody-*.js 独立 chunk 确认
