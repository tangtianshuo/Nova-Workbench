---
phase: 23-tools-native
plan: "01"
subsystem: rust-run-engine
tags: [engine, tools, async, channel, workspace-root]
requires: ["22-05 loop_runner/tools/channel", "22-06 engine_run wiring"]
provides: ["tools::execute_async (签名定型: cancel + on_event 参数在位)", "EngineEvent::ToolOutput (kind=tool_output)", "LoopContext.workspace_root / ToolCtx.workspace_root", "engine_run workspace_root 参数链 (webview → command → loop)"]
affects: [src-tauri/src/engine/tools.rs, src-tauri/src/engine/loop_runner.rs, src-tauri/src/engine/channel.rs, src-tauri/src/engine/commands.rs, src/ai/api.ts, src/stores/chatConsoleStore.ts]
tech-stack:
  added: []
  patterns: ["async 分发入口 + 同步工具直通(execute 内路径零改动)", "workspace_root Option<PathBuf> None-safe 贯通", "EngineEvent 新变体经 serde tag=kind 向后兼容(webview if-chain 忽略未知 kind)"]
key-files:
  created: []
  modified:
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/channel.rs
    - src-tauri/src/engine/commands.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts
decisions:
  - "execute_async 签名一次定型(conn, name, args, ctx, cancel, on_event),同步工具内部直通 execute — 23-02 exec 接入时只改函数体不改签名"
  - "workspace_root 落在 ToolCtx(工具可见)与 LoopContext(贯通)两处,loop 分发点 clone 传入 — plan 文本写 LoopContext 于 tools.rs,实际 LoopContext 定义在 loop_runner.rs,语义不变"
  - "cancel/on_event 参数带 #[allow(unused_variables)] 过渡(plan 认可),23-02 exec 消费"
  - "webview 未知 kind 防护零代码:两个 onEvent 处理器均为 if/else-if 链,tool_output 自然落穿忽略(Pitfall 7 本就满足)"
metrics:
  duration: 25m
  completed: 2026-08-24
---

# Phase 23 Plan 01: 异步地基(execute_async + ToolOutput + workspace_root 贯通) Summary

**One-liner:** 工具层异步地基落位 —— tools::execute_async 分发入口签名定型(cancel + on_event 参数在位,同步工具直通既有 execute)、EngineEvent 新增 tool_output 流式变体(serde 测试锁定 wire 形状)、workspace_root 从 webview activeWorkspace.folderPath 经 engine_run 参数一路贯通到 ToolCtx(None 安全),loop 分发点统一 await。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | execute_async 入口 + LoopContext/ToolCtx.workspace_root + 分发点 await | fc79dcd | tools.rs, loop_runner.rs, commands.rs |
| 2 | ToolOutput 变体 + engine_run workspace_root 贯通 + webview 传参 | e68775c | channel.rs, commands.rs, api.ts, chatConsoleStore.ts |

## Verification

- `cargo test`: **119 passed / 0 failed / 2 ignored**(基线 118 → +1:tool_output serde wire 测试)
- `npm test`: **241/241 pass**
- `npm run lint`(tsc --noEmit): 通过
- `grep execute_async` tools.rs / loop_runner.rs 双侧命中;`grep workspace_root` tools.rs / commands.rs / api.ts / chatConsoleStore.ts 均命中
- 分发点:`tools::execute_async(ctx.conn, &call.name, &call.arguments, &tool_ctx, cancel.clone(), on_event.as_ref()).await`

## Key Behavior Locks

- execute_async 签名冻结:`pub async fn execute_async(conn: &Connection, name: &str, args: &Value, ctx: &ToolCtx<'_>, cancel: CancellationToken, on_event: &(dyn Fn(EngineEvent) + Send + Sync)) -> ToolOutcome` — 后续 plan 不再改分发结构
- ToolOutput wire:`{"kind":"tool_output","data":{"name","stream","is_stderr"}}`(serde camelCase rename;测试逐字段断言)
- workspace_root 链:chatConsoleStore(workspaces.find(activeWorkspaceId).folderPath)→ engineRun workspaceRoot → engine_run workspace_root: Option<String> → LoopContext.workspace_root: Option<PathBuf> → ToolCtx.workspace_root
- None 语义:无 workspace 绑定时字段为 None(23-02+ 工具须返回 Failed{arg_error:false},结构性约定已注释在 ToolCtx)

## Deviations from Plan

- **workspace_root 字段落点(语义等价)**:plan Task 1 写 "tools.rs: LoopContext 新增 workspace_root",但 LoopContext 定义在 loop_runner.rs(非 tools.rs)。实际:LoopContext.workspace_root(loop_runner.rs)+ ToolCtx.workspace_root(tools.rs,工具实际消费处),分发点 clone 贯通 — grep 验收两侧均命中,语义超集满足。
- **Pitfall 7 零改动**:plan 要求"若无 default fallthrough 则补上" — 检查发现 chatConsoleStore 与 CmdKPalette 的 onEvent 均为 if/else-if 链(非 exhaustive switch),未知 kind 天然落穿忽略,无需补代码。api.ts 的 EngineEventMsg kind union 顺手加入 'tool_output'(类型诚实,不改行为)。

## Known Stubs

- cancel/on_event 参数 `#[allow(unused_variables)]` 过渡态(plan 认可)— 23-02 exec 工具接入时消费,届时移除 allow。
- 前端对 tool_output 事件暂不渲染(23-02 工具卡上线时接入)。

## Self-Check: PASSED

- 文件修改:tools.rs / loop_runner.rs / channel.rs / commands.rs / src/ai/api.ts / chatConsoleStore.ts 均已提交(git status 无相关未跟踪/未暂存)
- 提交存在:fc79dcd / e68775c FOUND
- cargo 119/0/2、npm 241/241、tsc clean
