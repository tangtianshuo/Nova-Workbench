---
phase: 22-loop-replay-parity
plan: "05"
subsystem: rust-run-engine
tags: [engine, tool-loop, context-assembler, hitl, fts5]
requires: ["22-02 token/fts/params_hash", "22-03 event_log/confirmations", "22-04 chat_session/compaction"]
provides: ["assemble_context", "tools registry/execute", "run_tool_loop", "EngineEvent channel"]
affects: [src-tauri/src/engine/mod.rs]
tech-stack:
  added: []
  patterns: ["Llm trait injection (fake-scripted loop tests)", "serde tag=kind/content=data channel wire"]
key-files:
  created:
    - src-tauri/src/engine/context_assembler.rs
    - src-tauri/src/engine/tools.rs
    - src-tauri/src/engine/channel.rs
    - src-tauri/src/engine/loop_runner.rs
  modified:
    - src-tauri/src/engine/confirmations.rs
    - src-tauri/src/engine/mod.rs
decisions:
  - "系统提示只含 Phase 9 role 块 + coreContext;Phase 10 task/schedule 指南块不移植(PM 工具已按裁决下架,Phase 23 随工具恢复)"
  - "turn-end 审计失败即返回 LoopError::Audit(计划指定,TS 只 console.error)"
  - "Llm trait + BoxLlmFuture 注入:测试脚本化,22-06 用 llm::chat_with_tools 适配器接线"
metrics:
  duration: 55m
  completed: 2026-08-24
---

# Phase 22 Plan 05: 引擎运行时组装(context_assembler / tools / loop_runner / channel) Summary

**One-liner:** Rust 完成 agent loop 执行核心 —— contextAssembler 五段注入(FTS5/memory 只读 SQL 逐字移植)+ 最小工具集(knowledge_search 只读 + knowledge_write/memory_write HITL)+ runToolLoop 主循环(MAX_ITERATIONS=5、四种落库 payload、turn-end 审计)+ EngineEvent 七变体 channel。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | context_assembler.rs 五段注入 + 只读检索 | d1debc6 | context_assembler.rs, confirmations.rs(+list_rejected), mod.rs |
| 2 | tools.rs 最小 Rust 工具集 | 8880182 | tools.rs, mod.rs |
| 3 | loop_runner.rs + channel.rs 主循环 | aa0c1ea | loop_runner.rs, channel.rs, mod.rs |

## Verification

- `cargo test`: **105 passed / 0 failed**(2 ignored 为既有 UAT probe)
- Task 1: 6 tests(五段 payload 形状/文案逐字、symbol-only skip、FTS 失败降级、clamp CJK+emoji char 边界)
- Task 2: 7 tests(schemas 三键 + PORT-01 后缀、候选生成断言、arg_error/unknown 分支)
- Task 3: 8 tests(纯回复/单工具/WAIT payload 逐字段/retry→exhausted/超迭代 truncated/审计失败 Err/取消)

## Key Parity Locks

- 段配额 600/200/500/400/300、RECENT_DIALOG_RESERVED=1200、FTS_TOP_K=5、REJECTED_LIMIT=5;标题文案逐字(`## 待确认记忆候选` 等)
- 四种 tool 落库 payload 逐字段(toolLoop.ts:200/210/247/264):WAIT modelText 手工键序 `{ok,awaitingConfirmation,error}`;errorText 重试文案逐字;`[tool_result <name>] ` 前缀
- tool_call payload 带 `idempotency`(PORT-01);旧/未知工具默认 verify_first
- PORT-01 描述后缀与 registry.ts:58 字节一致

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] ToolOutcome 增加 Failed 变体**
- **Found during:** Task 2/3
- **Issue:** 计划只定义 Executed | AwaitConfirmation,但 toolLoop 的 ToolArgError 重试语义(retryAvailable)与未知工具错误需要第三个出口
- **Fix:** `Failed { message, arg_error }`;arg_error=true 映射 TS ToolArgError(previousErrors<1 → retry)
- **Files:** src-tauri/src/engine/tools.rs

**2. [Rule 3 - Blocking] FTS 种子数据需预分词**
- **Found during:** Task 1
- **Issue:** knowledge_fts 列存 `toFtsIndexedText` 预分词文本(逐 char 空格分隔),裸文本插入导致 unicode61 整词分词、MATCH 失配
- **Fix:** 测试种子用 `fts_tokens(..).join(" ")` 索引(与 TS rebuildFts 同规则);查询侧本就经 fts_match_string
- **Files:** 测试 helper

### 计划内接受的偏差(记录)

- **系统提示**:prompts.ts Phase 10 指南块与 dateContext 未移植 —— Phase 10 块描述的全是已下架的 PM 工具;Phase 23 随工具桥恢复时一并加回。buildCoreContext 由 LoopContext.core_context 注入(22-06 接线)。
- **assemble_context 签名**:`(conn, core_text, product_id, user_message)` 而非计划草案的 `(conn, session_id, user_message)` —— TS 源本就注入 buildCore/productId。
- **`grep -c "createTask|scheduleCrud" tools.rs` = 4 ≠ 0**:4 处命中全为裁决注释与 unknown-tool 测试(用 createTask 断言其未注册),registry() 仅注册 3 个工具 —— 裁决实质遵守。
- **serde_json BTreeMap 键序**:data 内键序与 TS JSON.stringify 不同(22-04 既有决定,语义无关)。

## Known Stubs

None — 全部路径接真实 SQLite(mem_conn 全量 migration)/真实 confirmations 写者。LLM 为 trait 注入,生产适配器在 22-06 接线(计划内,非 stub)。

## Self-Check: PASSED

- 文件存在:context_assembler.rs / tools.rs / channel.rs / loop_runner.rs 全部 FOUND
- 提交存在:d1debc6 / 8880182 / aa0c1ea 全部 FOUND
- cargo test 105/105 绿
