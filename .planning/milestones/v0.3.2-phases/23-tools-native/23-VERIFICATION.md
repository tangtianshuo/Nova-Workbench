---
phase: 23-tools-native
verified: 2026-08-24T00:00:00Z
status: passed
verdict: PASS_WITH_NOTES
score: 5/5 must-haves verified
notes:
  - "All gates re-run by verifier: cargo 153/0/2, npm 241/241, tsc clean, all three grep gates zero-hit. Only note-grade items: (a) exec/fs confirmation cards not re-projected after restart via sessionRestore (candidates persist in DB, 24h TTL cleanup) — warning, not blocker, knowledge/destructive precedent not extended; (b) degradation text lives in loop_runner.rs ROLE_AND_TOOL_RULES, not context_assembler.rs as prompt expected — same system prompt output, location deviation only; (c) consumeIntoMemories renamed consumeConfirmed, not deleted — remaining callers are memoryStore internal auto-chain (propose user_directed) + tests only; chatConsoleStore confirm/consume/reject all route to engine commands."
human_verification: []
---

# Phase 23: 工具层(原生工具集,无桥) Verification Report

**Phase Goal:** Rust 引擎可调用首批原生工具(exec/fs/knowledge/deliverable),全部 Rust 原生执行不依赖 webview;PM CRUD 缺席但模型明确感知降级;两个 carry-in TS 写接缝迁移到 Rust 唯一写者
**Verified:** 2026-08-24
**Status:** PASS_WITH_NOTES (5/5)
**Re-verification:** No — initial verification

## Test Baseline (re-run this verification)

- `cargo test --manifest-path src-tauri/Cargo.toml`: **153 passed / 0 failed / 2 ignored** — matches expected
- `npm test`: **241 passed / 0 failed** — matches expected
- `npm run lint` (tsc --noEmit): clean

## Per-Criterion Verdicts

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | SC-1/TOOL-01: 四类工具注册表可被引擎调用 | **PASS** | tools.rs:75 `registry()` 静态注册 11 ToolSpec(exec / fs_list/read/write/mkdir/delete/move / knowledge_search/write / memory_write / generate_deliverable);tools.rs:249 `schemas()`;tools.rs:547 测试 `schemas name 集合 == registry name 集合`(单一注册表不变量);loop_runner 分发点 await execute_async(23-01 锁定)。cargo 153 全绿含 tools/exec/fs_ops/commands 各套件 |
| 2 | SC-2/TOOL-02: exec 进程组清理/超时/取消/流式;白名单外 HITL | **PASS** | exec.rs:4-13 spawn_core(tokio::process kill_on_drop + timeout + CancellationToken + 逐行流式 on_event);exec.rs:129-137 Windows taskkill /T 树杀(带 ponytail 竞态注释);exec.rs:206-210 tokio::select! 四路;测试锁定: `spawn_cancel_kills_and_reports_cancelled` / `spawn_timeout_fires`(本验证 cargo 输出亲见 pass);白名单 git[status,diff,log,show,branch] + 只读命令,`git push`/裸 git 拦截测试;非白名单 → exec_approval 候选进 WAIT(loop_runner `exec_whitelisted_runs_headless_and_settles` 集成测试);migration 0008 CHECK 扩展 |
| 3 | SC-3/TOOL-03: PM CRUD 缺席 schema + 系统提示降级 | **PASS** | tools.rs:242 注释 + tools.rs:700 测试 `execute("createTask") → "Unknown tool: createTask"`;loop_runner.rs:528 测试断言 createTask/updateTask/deleteTask/createSchedule/updateSchedule/createProject 六工具缺席;loop_runner.rs:94 `ROLE_AND_TOOL_RULES` 含 "Task and schedule CRUD tools are not available in this version; guide the user to create them manually" — loop_runner.rs:514-515 测试断言 "manually" + "not available in this version" + 全部 11 工具名 |
| 4 | SC-4/TOOL-04: 全原生,无头=有头;exec/fs 不依赖 webview | **PASS** | `grep -rn "invoke" src-tauri/src/engine/exec.rs fs_ops.rs tools.rs` → **零命中**(本验证实跑);loop_runner 集成测试:白名单 exec 全 loop 无头执行(tool_result ok + exitCode 0 + tool_output 事件),非白名单 WAIT;fs apply 全同步 Rust std::fs;engine command 注册 lib.rs:145-149 四 command 确认 |
| 5 | SC-5: 两 carry-in TS 直写消灭 | **PASS** | 接缝①: `grep -rn "appendAuxEvent('deliverable_committed'" src` → **零命中**;chatConsoleStore.ts:980 改调 `engineCommitDeliverable`;commands.rs:536-552 docId+version 事件幂等(exactly-once),commands.rs:889-925 测试锁定(重复 invoke Ok 恰一事件 / rejected 报错);AlreadySettled 容忍仅当行状态确为 consumed(commands.rs:515-531)。接缝②: `grep -rn "consumeIntoMemories" src` → **零命中**;chatConsoleStore.ts:907/928 改调 `engineConsumeMemory`/`engineRejectMemory`;memoryStore.ts:670 更名 `consumeConfirmed`,残留调用者仅 memoryStore 内部 propose 自动链(:260/:595)+ 测试文件 — 桌面 UI 确认/拒绝路径全走 Rust command,memory_candidates 无运行时 webview 写 |

## Requirements Coverage

| REQ | Status | Evidence |
|-----|--------|----------|
| TOOL-01 | SATISFIED | SC-1 |
| TOOL-02 | SATISFIED | SC-2 |
| TOOL-03 | SATISFIED | SC-3 |
| TOOL-04 | SATISFIED | SC-4 |

REQUIREMENTS.md checkboxes TOOL-01/03/04 已勾选,Traceability 已更新为 Complete(本验证执行)。

## Known Deviations Scrutinized

1. **migration 0008/0009(CHECK rebuild)** — 正确且必要:SQLite 无法 ALTER CHECK,copy→drop→rename 复用 0006 先例;lib.rs + db.rs 注册。
2. **prepare/await/settle 三段拆分(23-02)** — 正确:`&Connection !Send` 不能跨 await,tauri command future 须 Send。fs_apply 全同步不需要拆分,判断正确。
3. **api.ts 落点(计划写 src/lib/api.ts,实际 src/ai/api.ts)** — 正确:22-06 起引擎 IPC 全在 src/ai/api.ts,一致性优先。
4. **resolve_deep 替代 resolve_in_root(23-03)** — 正确:后者只容忍一层缺失叶,mkdir/write 到缺失父目录被误判越界;逐级 canonicalize 语义超集,symlink 逃逸仍捕获。
5. **AlreadySettled 容忍 + docId+version 事件幂等(23-04)** — **exactly-once 已测试锁定**:commands.rs:900-910 重复 invoke 同 docId+version → Ok 且恰一事件;容忍条件双重收紧(AlreadySettled && is_consumed)。判定正确:TS executeTool 与 Rust command 在同一用户动作内共享 nova.db,事件恰一由事件幂等保证。这是有界妥协而非漏洞 — 事件表 INSERT 幂等闸独立于消费闸。
6. **consumeIntoMemories 更名而非删除(23-05)** — 判定正确:更名后调用者 = propose 内 user_directed 自动链(运行时不可达:引擎侧 memory_write 为 Rust 唯一入队者,proposeMemory TS 工具待 Phase 25 删)+ Node/web-dev 测试。webview 运行时对 memory_candidates 的写路径已消灭(chatConsoleStore 三分支全走 engine command)。gate 字面零命中达成,语义符合 SC-5。
7. **exec/fs 确认卡 sessionRestore 不恢复(stub,24h TTL)** — **严重度: 低/警告级**。SC-2/SC-4 均不要求恢复;候选仍在 DB、TTL 自然清理、无孤儿事件风险(候选非事件)。用户重启后待批 exec/fs 卡片消失 = 该次批准流中断需重发指令,与 knowledge/destructive 卡有恢复的现状不一致 — 体验缺口而非正确性缺口。建议 Phase 24(sessionRestore 与后台 run 重开窗口投影天然同题)或 Phase 25 收口,不阻塞本 phase。

## Grep Gates (verifier re-run)

| Gate | Result |
|------|--------|
| `grep -rn "appendAuxEvent('deliverable_committed'" src` | 零命中 PASS |
| `grep -rn "consumeIntoMemories" src --include="*.ts" --include="*.tsx"` | 零命中 PASS |
| `grep -rn "invoke" exec.rs fs_ops.rs tools.rs` | 零命中 PASS |

残留 `appendAuxEvent` 调用仅 toolLoop.ts:143 `context_injected`(TS 遗留 loop,Phase 25 删除范围,非运行时路径)。

## Anti-Patterns Found

无 blocker。tools.rs:532 测试名 `schemas_three_tools_with_port01_suffix` 为历史命名(实际断言 registry 全集),纯命名债不影响判定。

## Human Verification

无阻塞项(milestone UAT 延后至 Phase 25 收口统一做,与 Phase 22 同策略)。exec 确认卡三选项 UI / fs 越界拒绝提示的真实交互建议随 milestone UAT 覆盖。

## Gaps Summary

无阻塞 gap。22-VERIFICATION SC-3 缺口(两 TS 写接缝)确认关闭。唯一 note 级遗留:exec/fs 候选卡 sessionRestore 恢复缺席(建议 Phase 24/25 处理)。

---

_Verified: 2026-08-24_
_Verifier: Claude (gsd-verifier)_
