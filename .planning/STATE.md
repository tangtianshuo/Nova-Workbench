---
gsd_state_version: 1.0
milestone: v0.3.2
milestone_name: rust-run-engine
status: in_progress
last_updated: "2026-08-23T00:00:00.000Z"
last_activity: 2026-08-23
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-23)

**Core value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Current focus:** v0.3.2 Rust Run Engine — roadmap 已建(Phase 22-25),下一步 /gsd:plan-phase 22

## Current Position

Phase: 22 引擎核心 (Not started)
Plan: —
Status: Roadmap created, awaiting plan-phase 22
Last activity: 2026-08-23 - Milestone v0.3.2 Rust Run Engine started;ADR-0003 草案落稿(docs/adr/ADR-0003-rust-run-engine.md,Proposed)

```
v0.3.2 progress: [░░░░░░░░░░░░░░░░░░░░] 0% (0/? phases — roadmap 待建)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| v0.3.1 phases completed | 4 / 4(Phase 18-21 全部 VERIFICATION PASS;剩 3 项人工 UAT + complete-milestone) |
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

### TODOs (pending)

- **v0.3.1 收口(Phase 22 执行前完成)**:3 项人工 UAT(Phase 21 VERIFICATION 留档项)+ `/gsd:complete-milestone v0.3.1`(roadmap 已归档至 milestones/v0.3.1-ROADMAP.md)
- **v0.3.2 协议决策(Phase 22 动手前定稿)**:孤儿 exec 第三态(unknown/interrupted)+ 命令幂等分类随 tool_call 落盘 — 见 ADR-0003「协议决策」节
- 结转 tech debt(非阻断):FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall、产品 chip × 语义、云 provider 凭据 UAT、taskStore/scheduleStore v1→v2 实测、MarkdownEditor chunk、CSP null

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
