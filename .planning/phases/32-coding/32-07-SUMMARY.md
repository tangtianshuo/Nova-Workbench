---
phase: 32-coding
plan: 07
subsystem: agent-engine
tags: [hitl, resume, engine_run, loop_runner, fs_ops, tauri, zustand]

requires:
  - phase: 32-coding plans 01-06
    provides: exec/fs_write/code_edit 三卡 HITL + repo 绑定 + settle 落账（engine_exec_confirmed / engine_fs_apply / engine_code_apply）
provides:
  - HITL 确认/拒绝后 run 自动续跑（三卡共用 resumeAfterSettle 单一路径）
  - engine_run resume 参数（Rust LoopContext.resume 跳过 user_message 落账）
  - fs_ops workspace root invalid 如实上报（不再误报 path escapes workspace）
affects: [32-UAT, v0.4 coding agent, knowledge_write/pm_write 等其余卡种（后续可各加一行接线）]

tech-stack:
  added: []
  patterns:
    - "resume 模式：续跑 = 同 session 再跑一轮 engine_run(resume:true)，投影重建天然带上 settle 的 [confirmed rerun] tool_result"
    - "TS 共享 runEngineTurn：submit 与 resumeAfterSettle 一条路径，禁止拷贝三份"

key-files:
  created: []
  modified:
    - src-tauri/src/engine/loop_runner.rs
    - src-tauri/src/engine/commands.rs
    - src-tauri/src/engine/fs_ops.rs
    - src-tauri/src/engine/scheduler.rs
    - src/ai/api.ts
    - src/stores/chatConsoleStore.ts

key-decisions:
  - "方案 A（TS 续跑 + engineRun resume 参数）：loop_runner 每轮从事件日志投影重建 messages，settle tool_result 天然在投影里，唯一障碍是无条件 append 的 user_message —— 一个 bool 字段 + 一个 if 解决"
  - "reject 路径先 engineAppendToolResult(ok:false, 用户拒绝执行[:原因]) 再 resume —— append_tool_result_inner 自动 mint [confirmed rerun] 配对"
  - "fs_ops workspace root invalid 作为非 arg_error 透传（目录无效是环境问题，不该触发模型参数重试）"

patterns-established:
  - "resumeAfterSettle 并发守护单点：loading || activeRunId 即静默跳过，不排队"
  - "confirm handler 的 settled-flag 模式：finally 里清完 loading 再 resume，绕开守护与 settle busy 的互斥"

requirements-completed: [32-UAT-06, 32-UAT-04, 32-UAT-05]

duration: 50min
completed: 2026-09-07
---

# Phase 32 Plan 07: HITL 续跑 + fs_ops 错误如实上报 Summary

**engine_run resume 模式（Rust 跳过 user_message 落账）+ TS resumeAfterSettle 共享路径，exec/fs_write/code_edit 三卡确认/拒绝（带原因）后 run 自动续跑到最终回答；fs_ops 的 workspace root invalid 不再被吞成 path escapes workspace**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-07T03:15:23Z
- **Completed:** 2026-09-07T04:05:00Z
- **Tasks:** 2/3（Task 3 为 checkpoint:human-verify，待用户真机验证）
- **Files modified:** 6

## Accomplishments
- Rust resume 模式：LoopContext.resume + run_tool_loop 条件跳过 user_message；engine_run 加 `resume: Option<bool>` 透传（无新 event_type、无 migration、无 parity fixture 变更）
- TS 共享续跑：submit 内联的 engineRun + onEvent 投影整段抽成 `runEngineTurn`，新增 `resumeAfterSettle()`（loading/activeRunId 守护）；六个 handler 接线，三卡共用一条路径
- reject 路径落账：拒绝（+原因）先 engineAppendToolResult ok:false（`用户拒绝执行[:原因]`，code_edit 用 `code_${operation}`）再续跑，agent 能看到拒绝原因并调整
- fs_ops 错误诚实：resolve_deep 的 `workspace root invalid` 以非 arg_error 原样透传（UAT test#6 中 fs_list 误报场景）

## Task Commits

1. **Task 1 RED: 失败测试** - `b5f7fe0` (test)
2. **Task 1 GREEN: rust resume mode + fs_ops error honesty** - `34233c4` (feat)
3. **Task 2: TS shared resume path** - `9fefaec` (feat)
4. **Task 3: 真机验证** — **未执行**（checkpoint:human-verify, gate: blocking，待用户按 how-to-verify 四步重测 UAT test#4/#5/#6）

## Files Created/Modified
- `src-tauri/src/engine/loop_runner.rs` - LoopContext.resume 字段；user_message append 包 `if !ctx.resume`；2 个 resume 测试 + RecordingLlm
- `src-tauri/src/engine/commands.rs` - engine_run `resume: Option<bool>` 参数透传
- `src-tauri/src/engine/fs_ops.rs` - resolve_deep workspace-root-invalid 透传（arg_error: false）+ 测试
- `src-tauri/src/engine/scheduler.rs` - 测试 LoopContext 构造补 resume: false
- `src/ai/api.ts` - EngineRunParams.resume + invoke 透传
- `src/stores/chatConsoleStore.ts` - runEngineTurn 抽取、resumeAfterSettle action、六 handler 接线

## Verification

- `cargo test engine::` — 226 passed, 1 failed（`workflow_crud_via_tools_three_tiers` 为 pre-existing 豁免项，见 deferred-items.md，非本 plan 回归）
- `npm run lint`（tsc --noEmit）— 零错误
- 六 handler 引用 grep 证据（resumeAfterSettle 出现于 9 处 = 接口声明 + action 定义 + 注释 + 6 个 handler）：

```
342:  resumeAfterSettle: () => Promise<void>;
937:    resumeAfterSettle: async () => {
1071:        if (settled) void get().resumeAfterSettle();   ← confirmExec
1097:      void get().resumeAfterSettle();                  ← rejectExec
1130:        if (settled) void get().resumeAfterSettle();   ← confirmFsWrite
1155:      void get().resumeAfterSettle();                  ← rejectFsWrite
1242:        if (settled) void get().resumeAfterSettle();   ← confirmCodeEdit
1279:      void get().resumeAfterSettle();                  ← rejectCodeEdit
```

## Decisions Made
- 双确认并发窄场景（用户在 A 续跑的最终 LLM 调用后才 settle B）会留下未消费 tool_result —— 设计接受（plan-checker 附注 1），UAT 记录即可
- confirm handler 用 settled-flag：finally 清完 loading 后再触发 resumeAfterSettle，避免 resume 守护读到 settle 自身的 loading 而静默跳过

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] worktree 分支落后，fast-forward 到 master**
- **Found during:** 启动（plan 文件在工作树中不存在）
- **Issue:** 本 worktree 分支停在 v0.3.3（b43dded），phase-32 全部代码与 32-07-PLAN.md 不在工作树
- **Fix:** `git merge --ff-only master`（b43dded 是 master 祖先，纯 fast-forward，无冲突）
- **Verification:** git log 确认 HEAD = d56aa68（master tip）
- **Committed in:** 无需 commit（仅移动分支指针）

**2. [Rule 3 - Blocking] plan 中 `lib/api.ts` 路径实为 `src/ai/api.ts`**
- **Found during:** Task 2
- **Issue:** plan files_modified 写 `src/lib/api.ts`，但 engineRun/engineAppendToolResult 实际住在 `src/ai/api.ts`（chatConsoleStore 从 `@/src/ai/api` import）
- **Fix:** 修改 `src/ai/api.ts`（同一条 engineRun invoke 封装）
- **Verification:** tsc 零错误
- **Committed in:** 9fefaec

**3. [Rule 1 - Bug] TDD RED 测试初版 seed 缺 productId 导致假失败**
- **Found during:** Task 1 RED
- **Issue:** seed run 的 knowledge_write 候选缺 productId → 工具不 WAIT 而是直接失败 → 循环进入第二轮 LLM 调用 → FakeLlm "scripted turn" panic（非目标失败模式）
- **Fix:** seed args 补 `productId: "p1"`，RED 回到目标断言失败（user_message 2 vs 1）
- **Committed in:** b5f7fe0

---

**Total deviations:** 3 auto-fixed（2 blocking, 1 bug）
**Impact on plan:** 无范围蔓延；worktree 同步与路径修正均为执行前置条件。

## Issues Encountered
None（除 deviations 所列）

## Known Stubs
None — 三卡续跑全链路（Rust resume + TS 接线）已实现；knowledge_write/pm_write/destructive 等其余卡种未接续跑为**计划内明确排除**（locked requirement 只锁三卡，plan action 第 5 条），后续各加一行 `void get().resumeAfterSettle()` 即可。

## Next Phase Readiness
- 代码/测试层面 test#6 blocker 已修复；UAT test#4/#5 解除阻塞
- **待办：Task 3 真机验证（checkpoint:human-verify, blocking）** —— `npm run tauri:dev` 后按四步重测（exec 确认续跑 / code_edit 应用续跑 / code_edit 拒绝带原因 / mock workspace 报 workspace root invalid）

## Self-Check: PASSED

- 文件存在：loop_runner.rs / commands.rs / fs_ops.rs / scheduler.rs / src/ai/api.ts / chatConsoleStore.ts 均已修改且 commit
- commits：b5f7fe0、34233c4、9fefaec 均在 git log

---
*Phase: 32-coding*
*Completed: 2026-09-07*
