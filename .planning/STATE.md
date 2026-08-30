---
gsd_state_version: 1.0
milestone: v0.3.2
milestone_name: milestone
current_plan: 1
status: executing
last_updated: "2026-08-30T08:03:30.082Z"
last_activity: 2026-08-30
progress:
  total_phases: 8
  completed_phases: 4
  total_plans: 19
  completed_plans: 19
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-23)

**Core value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Current focus:** Phase 22 — loop-replay-parity

## Current Position

Phase: 22 (loop-replay-parity) — EXECUTING
Plan: 2 of 8
Phase: 23 (tools-native) — COMPLETE(VERIFICATION PASS_WITH_NOTES 2026-08-24;5/5 plans,153 cargo + 241 TS 全绿,SC-3 缺口关闭)
Phase: 24 (multi-run-tray) — COMPLETE(24-01..04 done: scheduler cap3+FIFO、托盘+hide-on-close+跳转、后台通知+HITL 卡 restore、取消全链路集成锁;165 cargo + 243 TS + tsc 全绿;VERIFICATION PASS_WITH_NOTES 2026-08-24)
Phase: 25 (migration-closeout) — COMPLETE(25-01 done: TS toolLoop/compaction/contextAssembler 删除(-1371 行,grep 零命中)、ADR-0003 Accepted、ARCHITECTURE v3.0 引擎分层、CLAUDE.md/README 同步;npm 217/217(死测试 -26)、cargo 165/0/2、tsc clean;c14cedb + 1c43fca)
Current Plan: 1
Status: Ready to execute
Last activity: 2026-08-30

```
v0.3.2 progress: [██████████] 100% (4/4 phases, 17/17 plans)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| v0.3.1 phases completed | 4 / 4(Phase 18-21 全部 VERIFICATION PASS;3 项人工 UAT 2026-08-24 收口,milestone closed + tag v0.3.1) |
| v0.3.2 phases | 4 (22-25: 引擎核心 / 工具层+桥 / 多run并行+后台 / 收口) |
| Historical (v0.3.0) | 5/5 phases, 19/19 plans, 28/28 REQ, 161/161 tests |
| Phase 18 P01 | 10m | 2 tasks | 4 files |
| Phase 18 P02 | 12m | 2 tasks | 4 files |
| Phase 19 P01 | 8m | 2 tasks | 2 files |
| Phase 19 P02 | 10m | 3 tasks | 3 files |
| Phase 19 P03 | 12m | 3 tasks | 5 files |
| Phase 20 P01 | 14m | 2 tasks | 6 files |
| Phase 20 P02 | 16m | 2 tasks | 3 files |
| Phase 21 P01 | 10m | 2 tasks | 4 files |
| Phase 21 P02 | 12m | 2 tasks | 3 files |
| Phase 21 P03 | 25min | 4 tasks | 4 files |
| Phase 22 P01 | 35m | 2 tasks | 10 files |
| Phase 22 P02 | 25m | 2 tasks | 4 files |
| Phase 22 P03 | 50m | 2 tasks | 4 files |
| Phase 22 P04 | 45m | 2 tasks | 6 files |
| Phase 22 P05 | 55m | 3 tasks | 6 files |
| Phase 22 P06 | 95m | 2 tasks | 8 files |
| Phase 22 P06 | 95m | 2 tasks | 8 files |
| Phase 22 P07 | 12m | 2 tasks | 6 files |
| Phase 23 P01 | 25m | 2 tasks | 6 files |
| Phase 23 P02 | 55m | 2 tasks | 10 files |
| Phase 23 P03 | 45m | 2 tasks | 12 files |
| Phase 23 P04 | 9m | 2 tasks | 6 files |
| Phase 23 P05 | 11m | 2 tasks | 8 files |
| Phase 24 P01 | 45m | 2 tasks | 10 files |
| Phase 24 P02 | 40m | 2 tasks | 7 files |
| Phase 24 P03 | 35m | 2 tasks | 10 files |
| Phase 24 P04 | 25m | 1 tasks | 2 files |
| Phase 25 P01 | 35m | 2 tasks | 12 files |
| Phase 22 P08 | 25m | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

v0.3.2 roadmap decisions:

- [Roadmap]: 4 phase 拆分(coarse,Phase 22-25),按 ADR-0003 依赖链:引擎核心 → 工具层 → 多run/后台 → 收口
- [Roadmap]: PORT-01(孤儿 exec 第三态协议)锁 Phase 22 最先 plan——引擎搬家时改协议最贵
- [Roadmap]: Phase 22/23 建议 /gsd:research-phase(语义移植跨 Rust/TS 边界 + omp exec 模式/TS 桥 IPC);Phase 24/25 标准模式
- [Roadmap]: v0.3.1 收口(3 项人工 UAT + complete-milestone)是 Phase 22 前置,不占 phase

v0.3.1 roadmap decisions:

- [Roadmap]: 4 phase 拆分(coarse)— 遵循 research 依赖链 data model → runtime → fork/UX → surfaces/titling(ARCHITECTURE.md build order A-B-C-D)
- [Roadmap]: Phase 18/19 硬依赖;Phase 20 需要 18+19;Phase 21 只需 19(分支徽章部分需 20),可在 19 后部分并行
- [Roadmap]: LIST-03(分支徽章)归 Phase 20(与 fork 元数据同落,徽章是 fork 的可见收口);列表本体归 Phase 21
- [Roadmap]: 最高风险隔离 — migration 0007 回填(P-A)锁在 Phase 18,fork seq 归一化 + compaction remap(P-C)锁在 Phase 20 纯函数测试先行,sessions[0] 假设移除(P-B)锁在 Phase 19
- [Roadmap]: SESS-05(sessionId stamp)随 Phase 18 落数据层、Phase 19 落过滤;REQ 归属 Phase 19(用户可观察行为是"不串卡")
- [Roadmap]: Phase 18/20 需 /gsd:research-phase;Phase 19/21 标准模式

(历史 v0.3.0 decisions 见 git history / PROJECT.md Key Decisions)

- [Phase 18]: Migration 0007: 全部 DDL+回填纯 SQL(INSERT OR IGNORE + NULL-guarded UPDATE),kv_store 缺失时 workspace_id NULL=全局可见
- [Phase 18]: sessionRepo SQL 导出为常量,parity 测试 $N→? 适配 node:sqlite;computeParamsHash 不含 sessionId(保留升级前 pending 候选 dedup)
- [Phase 19]: restoreSession(sessionId?): explicit-id path treats empty event list as not-found -> null; restoreLatestSession kept as compat alias for 19-02 migration
- [Phase 19]: SESS-02: app entry = fresh session; restore() no auto-restore, restoreSession() no-arg kept as crash-recovery API
- [Phase 19]: Workspace switch = end session + startNewSession (CONTEXT locked); store-level streaming guard is SESS-04 bottom line
- [Phase 19]: SESS-05: pending-card reads session-filtered in JS after listActive (no SQL change); restore path filtered in chatConsoleStore, sessionRestore.ts untouched
- [Phase 20]: 20-01: child compaction persists coveredSeq*/splitSeq in child space; fork remap (+prefix.length) restores normalized space at resolve time
- [Phase 20]: 20-02: eager forkable resolution (message-event zip); fork success = jump+badge no toast; switchSession awaits fork/parent meta refresh
- [Phase 21]: 21-01: updateTitle write-once (title IS NULL guard), countMessagesBySession single aggregate SQL; formatRelativeTime buckets per spec
- [Phase 21]: 21-02: maybeGenerateTitle fire-and-forget in submit finally (captured sessionId), llm-injectable for tests; sessionListVersion bump after write-once updateTitle
- [Phase 21]: 21-03: chatPanelMode pure/scoped gates conditional selector DOM; session Select '__new__' sentinel for +新对话
- [Phase 22]: PORT-01 定稿: idempotency 随 tool_call 落盘(旧事件=verify_first);孤儿 marker 第三态 unknown(键序 ok,status,interrupted,reason);工具描述追加 verify-before-rerun
- [Phase 22]: meta 是 kv 表, schema_version 经 key 读取; DB probe 实证 app_config_dir/nova.db 与 plugin 同库(schema 7)
- [Phase 22]: 22-02: estimate_tokens 按 UTF-16 unit 迭代复刻 TS 实际区间 8C48..=FAFF(surrogate halves 算 CJK,金样本锁定);fts_tokens 词先 CJK 后;params_hash 依赖 serde_json 默认 BTreeMap 键序
- [Phase 22]: 22-03: rusqlite $N markers are named params (appearance-order binding) — named_params! keeps verbatim TS SQL; modelText JSON key order hand-formatted; upsert_session title write-once
- [Phase 22]: 22-04: parity 锁定对象=投影而非事件序列;projection-cases.json 由真实 TS 投影生成,双侧单源;serde_json BTreeMap 键序差异仅影响 args token 估算
- [Phase 22]: 22-05: 系统提示只含 Phase 9 role 块(Phase 10 指南块随 Phase 23 工具桥恢复);turn-end 审计失败即 Err(硬于 TS);Llm trait 注入便于 fake 测试与 22-06 接线
- [Phase 22]: 22-06: engine_run 以 webview runId 为 cancel key(correlation_id 对 cancel 不可知);append_tool_result 对 fresh id 先补配对 tool_call 避免 DUPLICATE_TOOL_RESULT;memory/deliverable confirm 留 TS(Phase 23 桥迁移)
- [Phase 22]: parity.rs 单源双侧 glob 拥有全部 fixture 回放测试;真实 v0.3.x DB 抽样 2 份(264+42 events)端到端回放逐位通过
- [Phase 23]: 23-01: execute_async 签名定型(cancel+on_event 过渡 allow,23-02 消费);workspace_root 落 ToolCtx+LoopContext 双处(plan 写 tools.rs 的 LoopContext 实际定义在 loop_runner.rs,语义等价);webview 未知 kind 防护零改动(if-chain 天然落穿)
- [Phase 23]: 23-02: exec 白名单=command+只读子命令二元组(basename 小写去 .exe 归一;堵 git push/裸 git);学习条目仅 command 级落 kv agent.exec.whitelist;确认后 Rust 重执行 settle [confirmed rerun]
- [Phase 23]: 23-02: migration 0008 重开 candidates CHECK 加 exec_approval(SQLite 无法 ALTER CHECK,复用 0006 copy→drop→rename);tauri command future 须 Send,&Connection 不能跨 await → prepare/await/settle 三段;确认卡不进 sessionRestore(24h TTL 自然清)
- [Phase 23]: 23-03: migration 0009 CHECK +fs_write(0008 同构);fs_write 候选走 params_hash dedup;fs 路径安全用 resolve_deep(逐级 canonicalize,支持缺失父目录)而非单叶 resolve_in_root
- [Phase 23]: 23-04: deliverable_committed AlreadySettled 容忍 + docId+version 事件幂等(TS/Rust 同一用户动作先后 consume 共享 DB)
- [Phase 23]: 23-04: 模型带 confirmationToken 自提交 = arg_error;commit 恒为 webview 用户动作
- [Phase 23]: 23-05 接缝②无双闸需求:memory 卡片确认是唯一消费入口,原子条件 UPDATE 单闸保恰好一次;consumeIntoMemories 重命名 consumeConfirmed 保留 web/test 路径
- [Phase 24]: 24-01: 调度器显式 VecDeque FIFO(非 semaphore)— 队列内容供托盘 snapshot(24-02);Permit Drop promote 队首,cancel-vs-promotion 竞态 release 兜底
- [Phase 24]: 24-01: EngineDb 扩 path 字段,per-run db::open;managed 单连接留 with_conn 系命令;take+restore 双删,engine busy 路径清除;event_log seq 注释改写(per-session 单写者=TS guard)
- [Phase 24]: 24-02: scheduler on_change 回调(非 AppHandle 耦合)驱动托盘重建;Windows 左键=显示窗口(show_menu_on_left_click false);tray-open-session(session_id) 跳转;engine_run 加 session_title 参数
- [Phase 24]: 24-03: 通知点击 focus-gated fallback(Windows toast 回调受限);exec/fs 确认卡 restore 走既有 listPending*/refresh 管线;notify 三点=Done/Error/Confirmation,cancel 不通知
- [Phase 24]: engine_cancel 提取 engine_cancel_inner 可测核心,SCHED-04 三条全链路集成测试锁定取消语义(running 树杀+无孤儿+兄弟隔离、queued 立即出队、幂等)
- [Phase 22]: 22-08: knowledge_write productId=model arg > ctx fallback > arg_error; budget exhaustion = no-tools wrap-up turn (chat_no_tools, empty tools vec), outcome=tool_limit truncated=false, English marker deleted

### TODOs (pending)

- **v0.3.2 协议决策(Phase 22 动手前定稿)**:孤儿 exec 第三态(unknown/interrupted)+ 命令幂等分类随 tool_call 落盘 — 见 ADR-0003「协议决策」节
- 21-VERIFICATION.md UAT-3 期望文本过时(WorkspaceSwitcherRow 为 quick 新增,非回归)— 下次触碰该文件时顺带更新
- 结转 tech debt(非阻断):FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall、产品 chip × 语义、云 provider 凭据 UAT、taskStore/scheduleStore v1→v2 实测、MarkdownEditor chunk、CSP null、UAT-2 LLM 成功分支真验(有 key 环境)

### Blockers

None.

### Quick Tasks Completed

See git history / prior STATE (12 quick tasks logged through 260818-swm). Latest: 260819-df6 工作区切换下拉 + 跨工作区通知（4084db2）; 260819-dxl 右下角 Agent 面板工作区切换（19d0df5, scoped 去重 aaad9aa）; 260819-eid 工作区磁贴点击切换（2aa35c4）; 260819-evz Agent 页/文件归档页工作区文件树 + Rust 扫描上限放宽（fc8ad83, 45caf51, 58ff696）; debug 修复 文件树盘符前缀根（103d491）; 260819-fqx 文件树右键菜单：资源管理器定位/新建/重命名 + Rust file_ops 路径安全（9917866, e880876, c73a027）; 260819-gbn 文件树拖拽移动 + 文件/文件夹右键新建（a8e228e, aad327d, 30bcb61）; debug×5（用户全部确认）: 空文件夹不显示（dir 条目扫描，6ad4522）、拖拽失效（dragDropEnabled=false，cfc7a0e）、归档页实时数据+工作区归档树形+公共组件 WorkspaceFileTree 两处复用（173b179）。

## Session Continuity

If resuming after context loss:

1. Read `.planning/ROADMAP.md` — v0.3.2 phases(current phase marked)
2. Read `.planning/PROJECT.md` Current Milestone — key decisions + out of scope
3. Read `docs/adr/ADR-0003-rust-run-engine.md` — 本里程碑架构决策(引擎分层/物料决策/协议决策)
4. Next action: `/gsd:plan-phase 22`

Key files: `src/ai/toolLoop.ts` + `src/ai/compaction.ts` + `src/ai/fork.ts`(移植规格源), `src-tauri/src/llm.rs`(保留的 LLM 层), `src-tauri/migrations/0002..0007`(事件日志 schema), `docs/ARCHITECTURE.md` v2.0 + ADR-0001/0002/0003
