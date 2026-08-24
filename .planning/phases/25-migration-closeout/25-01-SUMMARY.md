---
phase: 25-migration-closeout
plan: "01"
subsystem: rust-run-engine
tags: [deletion, closeout, adr, docs, port-02, port-03]
requires: ["Phase 22-24 引擎全量落地 + 测试锁定"]
provides: ["单引擎代码现实(TS toolLoop/compaction/contextAssembler 删除,grep runToolLoop src/ 零命中)", "ADR-0003 Accepted + 实施结果注记(Phase 22-25)", "ARCHITECTURE.md v3.0 Rust 引擎分层", "CLAUDE.md/README.md 与引擎现实同步", "v0.3.2 milestone 收口就绪(complete-milestone 输入)"]
affects: [src/ai/, src/stores/chatConsoleStore.ts, docs/adr/ADR-0003-rust-run-engine.md, docs/ARCHITECTURE.md, CLAUDE.md, README.md]
tech-stack:
  added: []
  patterns: ["删除类收口 = planner 预核实 DELETE/KEEP 清单 + executor grep gate 验收(zero-match 硬门)"]
key-files:
  created: []
  modified:
    - src/ai/index.ts
    - src/stores/chatConsoleStore.ts
    - src/ai/__tests__/fork.test.ts
    - src/ai/__tests__/phase14Integration.test.ts
    - docs/adr/ADR-0003-rust-run-engine.md
    - docs/ARCHITECTURE.md
    - CLAUDE.md
    - README.md
  deleted:
    - src/ai/toolLoop.ts
    - src/ai/compaction.ts
    - src/ai/contextAssembler.ts
    - src/ai/__tests__/phase15ToolLoopInjection.test.ts
    - src/ai/__tests__/phase14Compaction.test.ts
    - src/ai/__tests__/phase15ContextAssembler.test.ts
    - src/ai/__tests__/phase16ContextAssembler.test.ts
decisions:
  - "TS 算法副本(compaction/contextAssembler)删除:parity 测试仅消费 fixtures/*.json 单源,不 import TS 实现 — planner 裁定兑现,删除不伤 Rust parity"
  - "fork.test.ts 删 test 9(maybeCompactSession round-trip)+ 未用 import;compaction 事件 remap 用例(test 3,只用事件字面量)保留 — fork 语义覆盖不缩水"
  - "phase14Integration 删 compaction restore-parity 测试 — 同一语义已由 Rust 侧 parity fixture 锁定"
metrics:
  duration: 35m
  completed: 2026-08-24
requirements-completed: [PORT-02, PORT-03]
---

# Phase 25 Plan 01: 迁移收口 — 删除 + 文档对齐 Summary

**One-liner:** 删除 TS toolLoop + 零调用方算法副本(7 文件,-1371 行,grep 零命中)、修剪 2 个测试文件保留活语义,ADR-0003 转 Accepted(含 Phase 22-25 实施结果注记),ARCHITECTURE.md v3.0 重写为 Rust 引擎分层(engine 模块图),CLAUDE.md/README.md 同步 — 双引擎并存窗口正式关闭,v0.3.2 就绪 complete-milestone。

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | 删除 TS toolLoop + 零调用方算法副本 + 关联测试清理 | c14cedb | 删 7 文件;改 index.ts, chatConsoleStore.ts, fork.test.ts, phase14Integration.test.ts |
| 2 | ADR-0003 Accepted + ARCHITECTURE.md 引擎分层 + CLAUDE.md 同步 | 1c43fca | ADR-0003, ARCHITECTURE.md, CLAUDE.md, README.md |

## Verification(gate 输出 vs 基线)

- `grep -rn "runToolLoop\|from '.*compaction'\|from '.*contextAssembler'" src/`:**零命中**(grep exit 1)
- `npm test`:**217/217 pass**(基线 243 → -26:删 4 个死测试文件 + fork test 9 + phase14Integration test 1;零失败,计划允许的下降)
- `npm run lint`(tsc --noEmit):通过
- `cargo test`:**165 pass / 0 fail / 2 ignored**(与基线持平 — Rust 侧零改动,parity fixture 单源回放未受 TS 删除影响)
- docs gate:`grep -n "Accepted" docs/adr/ADR-0003` 命中;`grep runToolLoop docs/ ARCHITECTURE.md CLAUDE.md` 零命中;CLAUDE.md 无 "Tauri commands currently minimal" 过时句

## Deletion Stats

- 删除 7 文件(toolLoop.ts + compaction.ts + contextAssembler.ts + 4 个死测试文件),净 **-1371 行**
- 修剪 2 文件:fork.test.ts(-1 test + 未用 import)、phase14Integration.test.ts(-1 test,保留 crash-tail/continue-stream 两个)
- KEEP 清单原样:tools/* + registry、agentScope、tokenEstimate、ftsTokens、paramsHash、chatSession/sessionRepo/sessionRestore/fork/events/*、parity.rust.test.ts + fixtures

## Docs Changed

- **ADR-0003**:Status Accepted(2026-08-24);文末「实施结果」注记覆盖 Phase 22(loop 语义移植 + parity fixture 单源)/ 23(原生工具,无桥修订兑现)/ 24(scheduler 多 run + 托盘)/ 25(TS 删除,窗口关闭)+ executeTool 保留定位 + deferred UAT 指向
- **ARCHITECTURE.md v3.0**:总览图重写为 Rust 引擎进程 + webview 投影/HITL;3.1 节展开 engine/ 模块表(19 模块,源自 engine/mod.rs;tray/notify/state 为壳层模块单列);3.3 节改为「webview 侧 TS 模块(活路径)」;决策 #8 改为 Rust 常驻引擎 + 新增 #9 双写者规则;ADR 索引补 ADR-0003
- **CLAUDE.md**:Architecture Overview(Rust 引擎 = agent 运行时)、Directory Structure(src/ai 定位 + src-tauri/src/engine/ 树)、Tauri Integration(engine_* commands + 托盘)、Project 段 v0.1 表述(GraphFlow/LanceDB 蓝图句)更新为 v0.3.2 现实
- **README.md**(顺带修正,grep 命中过时表述):架构图「Rust 转发 JS 执行 / toolLoop」→ 引擎分层;核心原则 #1 改引擎执行 webview 投影;目录树 src/ai 与 src-tauri 对齐

## Deviations from Plan

1. **[Rule 3 - Blocking] README.md 顺带修正范围略扩**:plan 预期「grep 命中才修」,实际命中三处过时表述(架构图含 toolLoop + 原则 #1「Rust 转发,JS 执行」+ 目录树 toolLoop.ts 行),且三处在同一节,局部改会自相矛盾 — 按计划预留的顺带修正通道整节对齐,未引入新叙述框架。Commit 1c43fca。
2. 其余无 — DELETE/KEEP 清单与 planner grep 完全一致,未触发重侦察。

## Known Stubs

None.

## Milestone-Ready

v0.3.2 全部 4 个 phase(22-25)代码与文档收口完毕;SC-3(里程碑人工 UAT)按用户裁定 defer 至 complete-milestone,输入 = 24-VERIFICATION deferred 清单 4 项 + ADR-0003 实施结果注记引用。

## Self-Check: PASSED

- 删除文件 `test -f` 全部不存在;SUMMARY/STATE/ROADMAP 提交见 final docs commit
- c14cedb / 1c43fca `git log` FOUND
- gates:grep 零命中、npm 217/217、tsc clean、cargo 165/0/2
