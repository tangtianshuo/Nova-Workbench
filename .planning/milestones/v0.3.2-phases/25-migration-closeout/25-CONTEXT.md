# Phase 25: 迁移收口 - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

双引擎并存窗口关闭:TS toolLoop 与死代码删除、全量测试通过、agent 语义无退化;ADR-0003 转 Accepted;ARCHITECTURE.md 更新为引擎分层;CLAUDE.md 同步;里程碑级人工 UAT 留 complete-milestone 统一做(用户指令)。

边界:**不含** PM CRUD Rust 原生工具(v0.3.3)、业务数据关系化(v0.3.3)、新功能。

</domain>

<decisions>
## Implementation Decisions

### 删除范围(侦察结论,2026-08-24)
- **双引擎分支已不存在**:chatConsoleStore 无条件走 engineRun(:603),:578 注释已宣告 TS runToolLoop retired;`runToolLoop` 生产调用方为零(仅 toolLoop.ts 自身 + 测试引用)
- **删**:src/ai/toolLoop.ts + 其测试;agentScope.ts(若仅服务 toolLoop correlation 上下文 — planner 确认);src/ai/index.ts 对应 export
- **留**(不是双引擎代码,是活路径):
  - src/ai/tools/*(TS 工具注册表 executeTool)— 仍服务 webview 发起的用户动作(ProductKnowledgeTab 知识读写、CmdKPalette、WorkspaceSummaryModal listWorkspaceFiles)与 HITL 确认后重放(chatConsoleStore :763 writeKnowledgeArticle / :1040 generateDeliverable);PM CRUD 工具按无桥决策留到 v0.3.3 原生回归
  - compaction.ts / contextAssembler.ts / tokenEstimate.ts / ftsTokens.ts / paramsHash.ts — **planner 裁定**:若 parity 永久测试(22-07)仅消费预生成 fixture(JSON 金样本),TS 算法副本可删;若测试运行时调 TS 实现生成期望值,则保留至测试改为纯 fixture 消费。倾向删(fixture 单源已建立),以 22-07 测试实际结构为准
- chatSession.ts / sessionRestore.ts / sessionRepo.ts 等投影 TS 侧:engine_* 已接管,planner 按"生产调用方为零才删"原则逐个裁定

### 文档收口
- ADR-0003:Status Proposed → Accepted;补实施结果注记(Phase 22-24 落地、无桥修订、托盘裁定兑现)
- ARCHITECTURE.md:更新为 Rust 引擎分层(engine 模块图:scheduler/loop_runner/tools/event_log/...;webview = 投影 + HITL UI;双引擎叙述删除)
- CLAUDE.md:Architecture Overview 段同步(当前仍写"Tauri commands currently minimal"等 v0.1 期描述,已严重过时)

### UAT(用户指令,不重开)
- 里程碑级人工 UAT(多 run 并行 + 后台托盘 + HITL 跨边界 + 崩溃恢复全链路)在 complete-milestone 统一做,不在本 phase 阻塞
- 24-VERIFICATION deferred UAT 清单 4 项(双 run 后台通知跳转/后台取消+重开确认卡/托盘实时性/hide-on-close 实感)同样留 milestone 收口

### Claude's Discretion
- 删除的精确文件清单(按调用方证据)、测试迁移方式、ADR 注记措辞、ARCHITECTURE.md 图示形式

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 决策与验收
- `docs/adr/ADR-0003-rust-run-engine.md` — 转 Accepted 的对象;含 2026-08-24 无桥修订注记
- `.planning/ROADMAP.md` Phase 25 section — SC-1/2/3
- `.planning/phases/24-multi-run-tray/24-VERIFICATION.md` — deferred UAT 清单(SC-3 素材)

### 删除目标侦察
- `src/ai/toolLoop.ts`(:110 runToolLoop,生产调用方零)
- `src/stores/chatConsoleStore.ts`(:578 retired 注释、:603 engineRun 无条件、:763/:913/:1040 executeTool 活接缝 — 留)
- `src/ai/index.ts`(:21 `export * from './toolLoop'`)
- `src/ai/__tests__/phase15ToolLoopInjection.test.ts`(随 toolLoop 删)
- 22-07 parity 测试结构(`src-tauri` 侧 + fixture 位置)— 决定 TS 算法副本去留

### 文档目标
- `docs/ARCHITECTURE.md`、`CLAUDE.md`(Architecture Overview 段)、`README.md`(若提及双引擎)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 引擎全量在 src-tauri/src/engine/(22-24 落地:scheduler/loop_runner/tools/exec/fs_ops/notify/tray/event_log/confirmations/…)
- 测试基线:cargo 165 pass/2 ignored;npm 243/243;tsc clean

### Established Patterns
- 删除类改动以 grep gate 验收(Phase 23 先例:grep 零命中 + 全量测试绿)

### Integration Points
- src/ai/index.ts barrel export;src/ai/__tests__/ 测试群;npm test 全量

</code_context>

<specifics>
## Specific Ideas

- 本 phase 是纯收口:删代码 + 改文档,零新功能;每个删除决定要有调用方证据(grep)支撑

</specifics>

<deferred>
## Deferred Ideas

- PM CRUD Rust 原生工具 + 业务数据关系化 — v0.3.3(RND-ROLLOUT)
- TS 工具注册表最终归宿(随 v0.3.3 CRUD 原生化再评估)

</deferred>

---
*Phase: 25-migration-closeout*
*Context gathered: 2026-08-24*
