---
phase: 22-loop-replay-parity
plan: "06"
subsystem: rust-run-engine
tags: [engine, tauri-commands, crash-restore, hitl, switch-over]
requires: ["22-05 loop_runner/channel/tools/context_assembler", "22-01 PORT-01 protocol"]
provides: ["engine_run/engine_cancel/engine_confirm_candidate/engine_reject_candidate/engine_append_tool_result", "restore_session/restore_latest_session", "EngineLlm adapter (llm::chat_with_tools)", "src/ai/api.ts engine IPC"]
affects: [src-tauri/src/lib.rs, src-tauri/src/state.rs, src/stores/chatConsoleStore.ts, src/components/CmdKPalette.tsx]
tech-stack:
  added: []
  patterns: ["Connection checkout onto spawn_blocking + current-thread runtime (MutexGuard cannot cross await)", "sync CompactionSummarizer bridged to async LLM via worker thread + mpsc", "Channel<StreamChunk> token tap parsed in Channel::new callback"]
key-files:
  created:
    - src-tauri/src/engine/restore.rs
    - src-tauri/src/engine/commands.rs
    - src/ai/api.ts
  modified:
    - src-tauri/src/engine/mod.rs
    - src-tauri/src/state.rs
    - src-tauri/src/lib.rs
    - src/stores/chatConsoleStore.ts
    - src/components/CmdKPalette.tsx
decisions:
  - "engine_run takes a webview-supplied runId as the cancel key (chat requestId pattern); plan's 'run_id = correlation_id' would be unknowable to engine_cancel callers"
  - "engine_append_tool_result: fresh tool_call_id (webview-minted, confirmed rerun) gets a pairing tool_call appended first — the WAIT tool_call is already paired by its awaitingConfirmation result, so a same-id append would violate DUPLICATE_TOOL_RESULT"
  - "memory confirm (consumeIntoMemories) and deliverable commit (appendAuxEvent) stay TS this phase — only knowledge_write/destructive confirm seams are engine-produced today; full migration with the Phase 23 tool bridge"
  - "startup restore restores latest session only (aligned with TS no-arg path); other sessions lazily via TS switchSession (read path unchanged)"
metrics:
  duration: 95m
  completed: 2026-08-24
---

# Phase 22 Plan 06: 接线切换与崩溃恢复(engine commands + restore + TS 归零) Summary

**One-liner:** 五个 engine_* Tauri command 接线完成 —— engine_run 走 EngineLlm 适配器(llm::chat_with_tools)跑完整 agent turn、Connection 移入 blocking 线程避开 MutexGuard-await、启动 latest-session 崩溃恢复(孤儿 unknown marker + 尾切)、ChatPanel/CmdK 直切 invoke+Channel(无配置开关)、确认后重执行落库走 engine_append_tool_result,runToolLoop 运行时调用点归零(grep 实证)。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | restore.rs + engine commands + run 注册表 + setup 接线 | ce0cd99 | restore.rs, commands.rs, mod.rs, state.rs, lib.rs |
| 2 | TS 切换 ChatPanel/CmdK + 确认接缝 + 写路径归零断言 | 73469d4 | src/ai/api.ts, chatConsoleStore.ts, CmdKPalette.tsx, commands.rs(+runId) |

## Verification

- `cargo test`: **116 passed / 0 failed**(2 ignored 既有 UAT probe;基线 105 → +11:restore 7 + commands 4)
- `npm run lint`(tsc --noEmit): 通过
- `npm test`(tsx --test 全量): **229/229 pass**
- **HARD GATE** `grep -rn "runToolLoop(" src/store src/stores src/components src/views` → **零命中**(exit 1);剩余引用仅 src/ai/toolLoop.ts 定义 + src/ai/__tests__ 规格(Phase 25 归档)
- `grep "fn engine_run\|engine_append_tool_result" commands.rs`、`grep '"status":"unknown"' restore.rs`、`grep "CancellationToken" state.rs` 全命中

## Key Behavior Locks

- 孤儿 marker modelText 手工键序逐字节:`[tool_result <name>] {"ok":false,"status":"unknown","interrupted":true,"reason":"app restarted before tool completion"}`(raw string 字面量,grep 可断言);restore 幂等(二次 restore 零孤儿);marker append 后 check_event_stream 通过
- engine_cancel 幂等(已结束 run 返回 Ok);确认等待态取消 = engine_reject_candidate(候选 reject 语义)
- engine_append_tool_result 三分支:fresh id → 追加配对 tool_call(`[confirmed rerun]` + idempotency 分类)+ tool_result;未配对既有 tool_call → 仅 settle(继承 workspace/correlation);已配对 → Err
- setup 顺序:plugin migration(0001-0007,plugin init)→ EngineDb manage(同步)→ async open + assert_schema(v≥7) + restore_latest_session(不阻塞窗口)
- TS 侧:token/tool_start/tool_end/confirmation/error 六事件映射到既有 streaming/trace/卡片 UI;knowledge_write 候选 {kind,confirmationToken,args} → TS 卡片形状;coreContext 由 TS buildCoreContext() 注入

## Deviations from Plan

### 计划内接受的偏差(记录)

- **runId 参数**:plan 写 "run_id = correlation_id(uuid) 注册进 AppState.runs",但 webview 无法得知 loop 内部 correlation_id → engine_run 增加可选 runId 参数(chat/cancel_chat requestId 模式),缺省时 Rust 自 mint。engine_cancel 语义不变。
- **engine_append_tool_result 语义细化**:plan 只说 "配对 tool_call 须存在,否则 error",但 22-05 的 WAIT tool_result 已配对原 tool_call,同 id 再 append 必然违反 DUPLICATE_TOOL_RESULT → fresh id(webview 确认流生成)时 Rust 先追加配对 tool_call(content `[confirmed rerun]`,args 由新增可选参数携带),使每条 tool_result 都有配对;已配对的 id 才报错。附带新增 `args` 可选参数(plan 签名 5 参 → 6 参)。
- **memory/deliverable 确认流留 TS**:confirmMemory(consumeIntoMemories 写 memories + memory_candidates)与 commitToSlot(appendAuxEvent 写 agent_events)仍走 TS 写路径 —— Phase 22 引擎只产生 knowledge_write/memory_write 候选与三个 Rust 工具,deliverable 流不可达;memory confirm 的 TS 写是已知残留接缝,随 Phase 23 工具桥一并迁移(记入 Known Stubs 跟踪)。
- **'event' 摘要不刷新投影**:webview 侧消息数组是本地 UI 状态(与切换前一致),SQLite 投影刷新对 UX 无增量 → EventCommitted 仅作 seq 通知未消费;refreshForkable/maybeGenerateTitle 在 done 后照旧触发。
- **Commands 层可测性**:未引 tauri mock,抽薄 append_tool_result_inner 纯函数测试;confirm/reject 是 confirmations.rs 原子 UPDATE 的 1:1 包装(该层已有并发恰一测试)。

## Known Stubs

- **memory confirm 写路径(memoryStore.consumeIntoMemories)**:chatConsoleStore.confirmMemory 仍经 TS SQLite 分支写 memories/memory_candidates —— engine 产生的 memory_write 候选卡片的确认按钮触达它。Rust 侧 confirmations::insert_memory_candidate 已是写者,消费侧迁移归 Phase 23 工具桥(不阻断 ENG-04 主链,knowledge_write/destructive 接缝已 Rust 化)。
- **LLM 生产适配器未经真实 provider 实测**(EngineLlm/summarizer_bridge 结构有类型与 fake 覆盖,真链路属延后的人工 UAT — 用户指令:milestone 收口统一做)。

## Self-Check: PASSED

- 文件存在:engine/restore.rs / engine/commands.rs / src/ai/api.ts FOUND
- 提交存在:ce0cd99 / 73469d4 FOUND
- cargo test 116/116、tsc 通过、npm test 229/229、runToolLoop grep 零命中
