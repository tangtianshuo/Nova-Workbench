---
gsd_state_version: 1.0
milestone: v0.3.3
milestone_name: 产研半落地 + 工作区入驻
status: executing
stopped_at: Completed 31-01-PLAN.md (UAT fixes done)
last_updated: "2026-09-03T07:53:30.978Z"
last_activity: 2026-09-03
progress:
  total_phases: 10
  completed_phases: 3
  total_plans: 21
  completed_plans: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-31)

**Core value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Current focus:** Phase 31 — doc-workspace

## Current Position

Phase: 31 (doc-workspace) — EXECUTING
Plan: 2 of 5
Status: Ready to execute
Next: /gsd:plan-phase 31(research 建议:Milkdown PoC — 中文 IME/round-trip/受控同步/bundle);里程碑决策点仍开放(27 UAT 回归 / 28 顺延 / complete-milestone)
Last activity: 2026-09-03

v0.3.2 已 shipped(2026-08-31,milestone audit passed,16/16 需求)— 归档: milestones/v0.3.2-*(ROADMAP/REQUIREMENTS/AUDIT/phases 22-25);phase 目录已移出 .planning/phases/

```
milestones: v0.2.0 → v0.3.0 → v0.3.1 → v0.3.2 (shipped 2026-08-31) → v0.3.3 (active)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| v0.3.3 phases | 3 (26: mock全清/tab接引擎 / 27: 文档摄取 / 28: 反向创建+收口) |
| v0.3.3 coverage | 14/14 v1 需求(TAB×6, ING×6, REV×2) |
| v0.3.2 phases | 4 (22-25), 21 plans, milestone audit passed |
| Historical (v0.3.0) | 5/5 phases, 19/19 plans, 28/28 REQ, 161/161 tests |
| Historical (v0.3.1) | 4/4 phases, 217/217 tests |
| Phase 22 P01 | 35m | 2 tasks | 10 files |
| Phase 22 P02 | 25m | 2 tasks | 4 files |
| Phase 22 P03 | 50m | 2 tasks | 4 files |
| Phase 22 P04 | 45m | 2 tasks | 6 files |
| Phase 22 P05 | 55m | 3 tasks | 6 files |
| Phase 22 P06 | 95m | 2 tasks | 8 files |
| Phase 22 P07 | 12m | 2 tasks | 6 files |
| Phase 23 P01-P05 | 25/55/45/9/11m | — | — |
| Phase 24 P01-P04 | 45/40/35/25m | — | — |
| Phase 25 P01 | 35m | 2 tasks | 12 files |
| Phase 22 P08-P10 | 25/30/25m | — | — |

(完整历史见 git history;上表保留近期校准数据)
| Phase 26 P01 | 20m | 2 tasks | 5 files |
| Phase 26 P02 | 15m | 1 tasks | 3 files |
| Phase 26 P03 | 25m | 2 tasks | 3 files |
| Phase 26 P04 | 83m | 2 tasks | 16 files |
| Phase 27 P01 | 1.5h | 3 tasks | 11 files |
| Phase 27 P02 | 50m | 3 tasks | 7 files |
| Phase 27 P03 | 35m | 3 tasks | 10 files |
| Phase 29 P01 | 35m | 2 tasks | 5 files |
| Phase 29 P02 | 35m | 2 tasks | 7 files |
| Phase 29 P03 | 50m | 2 tasks | 5 files |
| Phase 29 P04 | 240m(含 UAT) | 3 tasks | 8 files |
| Phase 30 P01 | 25min | 2 tasks | 9 files |
| Phase 30 P02 | 55min | 3 tasks | 16 files |
| Phase 30 P03 | 18m | 2 tasks | 5 files |
| Phase 30 P04 | 20m | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

v0.3.3 roadmap decisions (2026-08-31):

- [Roadmap]: 3 phase 拆分(coarse)— 遵循 research 依赖链:mock 全清/tab 接线 → 文档摄取 → 反向创建+收口;编号续 26-28,不重置
- [Roadmap]: 数据落点裁定(kv_store JSON vs knowledge_docs 双真相源)锁 Phase 26 首个 plan — 接线前裁定是最便宜的避债点(research PITFALLS #1)
- [Roadmap]: 调度优先级(交互 run 优先于批量 run,防 cap-3 FIFO 饿死)与 tab 接线同 phase 交付(TAB-06),不后置(research PITFALLS #2)
- [Roadmap]: 一键十八份交付物 = 单 run 多步(非 18 个 run),归 Phase 26
- [Roadmap]: 三态摄取状态(extracted/partial/failed)自 Phase 27 第一天起有(research PITFALLS #3);内容 hash 幂等 = 重扫即 diff(PITFALLS #4)
- [Roadmap]: Phase 27 建议 /gsd:research-phase(pdf_oxide CJK PoC + 批量 HITL 卡 UX + context window 预算);Phase 26/28 标准模式(research flag)
- [Roadmap]: 999.1 backlog 移入 v0.3.3 正式 scope(ING/REV 需求);999.2/999.4 → v0.4.0、999.3 → v0.5+ 维持原归位
- [Roadmap]: parity 收口 gate(新增事件种类双侧 fixture)锁 Phase 28,与统一 UAT(≥20 文档批量 + 托盘后台)同收

(历史 v0.3.0/v0.3.1/v0.3.2 phase-level decisions 见 git history / PROJECT.md Key Decisions)

- [Phase 26]: tab-run candidates route to global confirmation queue via routeEngineCandidateToConsole (D-05); deliverable slot projection keyed by stable docId deliverable-${productId}-${slotCode}; persist v3 wipes fabricated ready slots
- [Phase 26]: [26-02] 调度双队列:interactive 严格优先 batch,队内各自 FIFO 不加权;priority 在 registry insert 前校验
- [Phase 26]: TabRunPanel falls back to latest finished run per tab (runsByTab drops entry on settle); retry uses userMessage/coreContext persisted on TabRunRecord; requirements tab reads committed prd deliverable slot, HITL stays global-queue single chain (D-05)
- [Phase 26]: 26-04: generateDeliverable widened to all 18 catalog codes both sides (TS+Rust parity); batch 18 = single multi-step run; competitor candidates via knowledge_write (no catalog slot); persist wipes five mock buckets (delete, no migrate)
- [Phase 27]: pdf_oxide 0.3.77 中文 PoC 通过,zip 限 deflate 避免 C 构建
- [Phase 27]: 27-02: knowledge doc_id = item.id (ing-{hash8}) 作 consume 幂等键,复用 doc_id 唯一索引;migration 0011 扩 candidates CHECK 加 ingestion_batch;consume 自动 confirm 沿 commit_deliverable 先例
- [Phase 29]: [29-01] task/schedule 关系表落地(schema 12)+ kv→关系一次性幂等搬移(meta latch pm_kv_migrated_v29,kv 保留);日期全 TEXT 零转换
- [Phase 29]: [29-02] PM 9 工具三档风险:读/轻写免确认直落库,delete+cap-5 走 pm_write HITL;pm_write 入 dedup kind 列表
- [Phase 29]: [29-03] pm_write fixture 命名 projection-cases-pm-write.json — 双侧 glob 前缀约定;确认路径 Rust 一事务收口,不回 TS executeTool
- [Phase 29]: [29-04] Tauri 下 task/schedule persist 退役、SQL 单真相源(pmRepo + refreshFromSql);UAT 三 gap 修复:system prompt 注入日期(f894b27)、create 工具 projectId 兜底 ctx.product_id(3ae51a6)、cap-5 候选 params 预烧 projectId(c0fbb01)
- [Phase 30]: catalog 单源: 同一 JSON 由 TS import 与 Rust include_str! 消费;真实条数 16 (plan 的 18 是陈旧计数);defaultContent 已退役
- [Phase 30]: [30-02] workflow_delete 复用 pm_write kind+action 路由;内置模板不入 SQLite(include_str 合并);parity fixture 前缀 projection-cases-workflow-pm-write
- [Phase 30]: [30-03] 内置竞品模板用 DEL-REL-02(catalog 真实 code);Phosphor 用 FlowArrow(无 Flow 导出);WorkflowView 一键发起无确认(D-05),参考剧本措辞卡上+userMessage 双出现
- [Phase 30]: [30-04] distill 走 workflowStore.createTemplate → executeTool('workflow_create') 单一写路径;确定性提取不烧 LLM、不进 candidates 表;沉淀入口空结果 disabled+Tooltip

### TODOs (pending)

- **cap-5 计数 resume 重置**(2026-09-02 Phase 29 UAT 发现,用户裁定记 debt 不当日修):pm_writes_used 为 run 局部变量,弹卡确认恢复(new engine_run)后归零;缓解=每次恢复需人工确认卡把关。后续改为从 agent_events 数 session 已落轻写 tool_result(唯一真相源,天然跨恢复)
- **Phase 27 挂起**(2026-09-02,用户降级优先级):修复已提交(61f9089/a070c41/07e44fd),UAT-2..7 回归按 27-HUMAN-UAT.md 清单随时可恢复;全 pass 前不生成 27-04-SUMMARY、Phase 27 不验证收口
- **优先级重定**:用户要求优先「产品 + 产研中心真正实现并可用」——待对齐缺口后重排 v0.3.3 剩余(Phase 28 反向创建是否顺延)
- 22-UAT Test 7 人工复测待真实 LLM 环境补验(非阻塞,常量互锁已闭)
- update-path params_hash 双源计算边界(升级路径 = 知识表单一真相源;v0.3.3 数据落点裁定时一并考虑)
- 结转 tech debt(非阻断):FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall、产品 chip × 语义、云 provider 凭据 UAT、taskStore/scheduleStore v1→v2 实测、MarkdownEditor chunk、CSP null

### Blockers

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260903-e4l | 统一投影层:产研业务 tab 接 knowledge_docs 产物投影(竞品 DEL-REL-02 / 测试 DEL-TST-03 / 代码 DEL-DEV-01,共享 DeliverableDocCard) | 2026-09-03 | 3da1d76 | [260903-e4l-tab-knowledge-docs](./quick/260903-e4l-tab-knowledge-docs/) |
| 260903-exg | 确认卡前台提醒:Toast(0→N 一次,带「去确认」跳转)+ Sidebar agent 红点(selectPendingCount 派生七字段+pendingDeliverables;人工验证 checkpoint 待真机) | 2026-09-03 | c30c1bd | [260903-exg-toast](./quick/260903-exg-toast/) |
| 260903-gh0 | 产物卡双源投影:DeliverableDocCard 加 knowledge_write category fallback(槽位优先,竞品分析→竞品 tab、架构设计→代码 tab);根因 = agent 落库走 knowledge_write 而非槽位流(nova.db 实测 kb-* docId) | 2026-09-03 | c29d023 | [260903-gh0-tab-knowledge-write](./quick/260903-gh0-tab-knowledge-write/) |

## Session Continuity

Last session: 2026-09-03T07:53:30.970Z
Stopped at: Completed 31-01-PLAN.md (UAT fixes done)
Resume file: None

If resuming after context loss:

1. Read `.planning/ROADMAP.md` — v0.3.3 active(26 ✅ / 27 ⏸️ / 28 ⏭️ / 29 ✅ / 30 ✅ / 31 讨论完);历史里程碑全归档;999.x 为 BACKLOG
2. Read `.planning/PROJECT.md` Current Milestone — v0.3.3 产研半落地 + 工作区入驻
3. Next action: `/gsd:plan-phase 31`(文档工作区,31-CONTEXT 8 项裁定已锁);里程碑决策点(27/28 债务 vs close)仍开放

Key files: `src-tauri/src/engine/`(Rust 引擎,协议不动)、`src/stores/rndStore.ts`(六个 generate*AI 为 mock 全清对象)、`research/RND-ROLLOUT-V0.3-V0.4.md`(路线真相源)、`docs/adr/ADR-0003-rust-run-engine.md`
