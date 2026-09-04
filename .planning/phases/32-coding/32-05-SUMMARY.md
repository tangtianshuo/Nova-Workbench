---
phase: 32-coding
plan: "05"
subsystem: coding-ui
tags: [tabrun-panel, exec-tail, repo-binding, engine-01, hitl]
requires:
  - "32-02/32-03: code_* tools registered in Rust engine + exec pid anchor"
  - "32-01: engine_workspace_bind_repo / engine_workspace_detect_repo commands"
provides:
  - "TabRunPanel progress row (tool icon + name + target chip)"
  - "exec tail ring buffer UI (50 lines, collapsed by default)"
  - "changed-file chips with pending/applied/rejected status dots"
  - "repo badge in global Header + workspace repo_root settings + DEV dogfood button"
  - "ENGINE-01 先研究后行动 prompt contract (repo_root-gated) + test"
affects:
  - "EngineEvent::ToolStart wire shape (now carries optional target)"
tech-stack:
  added: []
  patterns:
    - "channel target hint computed engine-side (tools::tool_target), display-only"
    - "webview mirrors engine repo binding in workspace row (engine table = source of truth)"
key-files:
  created:
    - src/vite-env.d.ts
  modified:
    - src/components/rnd/TabRunPanel.tsx
    - src/stores/tabRunStore.ts
    - src/stores/workspaceStore.ts
    - src/components/layout/Header.tsx
    - src/App.tsx
    - src/views/SettingsView.tsx
    - src/ai/api.ts
    - src-tauri/src/engine/channel.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/context_assembler.rs
    - src-tauri/src/lib.rs
decisions:
  - "ToolStart channel event carries optional `target` hint (engine-computed) instead of exposing raw args to the webview"
  - "repo binding UI mirrors the engine's workspace_repo_roots table into the workspace row; engine stays the single source of truth"
  - "DEV dogfood = new engine_workspace_bind_dev_repo command (git-root detect above dev cwd) rather than webview path guessing"
metrics:
  duration: "~75m"
  completed: 2026-09-04
---

# Phase 32 Plan 05: coding 进度可见 + repo 绑定 UI + ENGINE-01 契约 Summary

**One-liner:** TabRunPanel 三要素进度(工具/目标 chip/exec 尾部输出/改动文件状态点)+ workspace repo 绑定 UI(badge/设置页/狗粮一键)+ repo_root 条件注入的「先研究后行动」系统 prompt 契约。

## What Was Built

### Task 1 — TabRunPanel 进度 chip + exec tail + 改动文件列表 (c5053e5)
- `EngineEvent::ToolStart` 增加 `target: Option<String>`(channel.rs + loop_runner.rs);`tools::tool_target` 计算 hint:code_* → path,exec → command,code_grep → path|pattern。TS wire (`EngineEventMsg.data.target`) 同步。
- `tabRunStore`:`currentTool`(name + target 截断 60ch + targetFull 供 title)、`execTail`(50 行 ring buffer,tool_output.stream 按行追加)、`changedFiles`(code_edit confirmation 候选 → pending;`settleTabCodeEdit` 供确认面 settle;cancelTabRun 级联全部 pending → rejected,镜像引擎 auto_reject)。
- `TabRunPanel`:进度行(Code/Terminal/MagnifyingGlass duotone 14px + mono truncate chip)、折叠式「输出(尾部 N 行)」mono 实时刷新、改动文件 chips(warning/success/danger 状态点 + 待审/已应用/已拒绝)。全部语义 token,无 args JSON dump。

### Task 2 — repo 绑定 UI + ENGINE-01 契约 (d0b4838)
- `Header` 加 `badge?: ReactNode` 插槽;`App.tsx` 由 workspaceStore 当前 workspace 的 `repoRoot` 驱动「Repo: {basename}」accent badge(GitBranch duotone 12px,title=全路径),并在 workspace 无绑定时后台调用 detect 一次(App mount / workspace 切换)。
- `SettingsView` 新增「工作区与仓库」区(系统偏好组):repo_root Input + 浏览(Tauri dialog 选目录)+「重绑仓库」(engine_workspace_bind_repo,留空清除)+ DEV-only「绑定 Nova 仓库(狗粮)」。
- 新命令 `engine_workspace_bind_dev_repo`:dev 进程 cwd 向上 detect git root 并 bind(复用 detect_repo_root);lib.rs 注册。
- `workspaceStore`:`Workspace.repoRoot` 镜像字段 + `bindRepoRoot` / `detectRepoRoot` actions。
- `context_assembler::append_code_contract`:repo_root 绑定时系统 prompt 追加 ENGINE-01「先研究后行动」契约段(侦察→定位→修改→验证四步),loop_runner 在 run 开始时读一次 repo_root 并注入(与 ToolCtx 共享同一次读取);测试 `code_contract_gated_on_repo_root` 双向断言(绑定含「先研究后行动」/未绑定不含)。

### Task 3 — checkpoint:human-verify
⚡ Auto-approved(auto_advance=true):全链 UAT 五步(tauri:dev 绑定 → coding run 观察 → exec tail + 取消级联 → 审批状态流转 → 狗粮一键)。Verifier/用户可按 plan how-to-verify 复验。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ToolStart channel 事件原无 args/payload**
- **Found during:** Task 1
- **Issue:** plan 接口声称「tool_call 事件 payload: code 工具带 path」,但 channel `ToolStart` 只携带 name;event_log 的 tool_call payload 不经 Channel 流向 webview
- **Fix:** EngineEvent::ToolStart 增加 engine 侧计算的 `target` 显示 hint(channel.rs/loop_runner.rs/tools.rs),比 webview 拉事件日志更小且不暴露完整 args
- **Files:** src-tauri/src/engine/{channel,loop_runner,tools}.rs, src/ai/api.ts
- **Commit:** c5053e5

**2. [Rule 3 - Blocking] workspaceStore 新 action 内自引用触发 TS 循环推断**
- **Found during:** Task 2
- **Issue:** `const store = useWorkspaceStore.getState()` 出现在新增 async action 时使 create()(persist()) 推断崩为 Partial(既有 scanWorkspaceFiles 同写法但新成员触发 circular)
- **Fix:** 改用 creator 参数 `get()`
- **Files:** src/stores/workspaceStore.ts
- **Commit:** d0b4838

**3. [Rule 3 - Blocking] 项目缺 vite/client 类型声明**
- **Issue:** `import.meta.env.DEV` 无类型
- **Fix:** 新增标准 `src/vite-env.d.ts`(`/// <reference types="vite/client" />`)
- **Commit:** d0b4838

## Known Stubs / Limitations

- **changedFiles 的 applied/rejected 状态由 `settleTabCodeEdit` 驱动,但 32-04 的确认面(confirmations.ts / CodeEditConfirmCard,并行 agent 文件禁区)尚未调用它。** 当前可见流转:pending(候选出现)→ rejected(run 取消级联,TabRunPanel 自含)。apply/reject 的 chip 翻转需要在 32-04 的 settle 路径补一行 `settleTabCodeEdit(sessionId, path, status)` — 已导出,接线点唯一。
- exec tail 只在 tab-run 流(tabRunStore)渲染;chatConsole 流的 exec 输出展示是既有 23-02 行为,未改动。

## Verification

- `npm run lint`(tsc --noEmit)通过
- `npm run build`(Vite)通过
- `cargo test --lib`:252 passed / 1 failed — 失败项为已知 pre-existing `workflow_crud_via_tools_three_tiers`(deferred-items.md 记录,不修)
- assembler 新测试 `code_contract_gated_on_repo_root` 通过

## Self-Check: PASSED
