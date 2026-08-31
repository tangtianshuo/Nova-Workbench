---
gsd_state_version: 1.0
milestone: v0.3.3
milestone_name: 产研半落地 + 工作区入驻(RND-ROLLOUT ①层)
current_plan: Not started
status: roadmap_created
stopped_at: ""
last_updated: "2026-08-31"
last_activity: 2026-08-31
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-31)

**Core value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Current focus:** v0.3.3 产研半落地 + 工作区入驻 — mock 全清接 Rust 引擎 + tab 接 run + 999.1 工作区入驻(路线:research/RND-ROLLOUT-V0.3-V0.4.md)

## Current Position

Phase: 26 (Mock 全清 — tab 接引擎) — Not started
Plan: —
Status: Roadmap created, awaiting user approval → `/gsd:plan-phase 26`
Last activity: 2026-08-31 — v0.3.3 roadmap created (Phases 26-28, 14/14 需求覆盖)

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

### TODOs (pending)

- 22-UAT Test 7 人工复测待真实 LLM 环境补验(非阻塞,常量互锁已闭)
- update-path params_hash 双源计算边界(升级路径 = 知识表单一真相源;v0.3.3 数据落点裁定时一并考虑)
- 结转 tech debt(非阻断):FTS5 packaged-build probe、真进程 kill 恢复实测、中文长尾 recall、产品 chip × 语义、云 provider 凭据 UAT、taskStore/scheduleStore v1→v2 实测、MarkdownEditor chunk、CSP null

### Blockers

None.

## Session Continuity

Last session: 2026-08-31
Stopped at: v0.3.3 roadmap created(Phases 26-28,14/14 覆盖)— 待用户批准后 `/gsd:plan-phase 26`
Resume file: None

If resuming after context loss:

1. Read `.planning/ROADMAP.md` — v0.3.3 active(Phases 26-28);历史里程碑全归档;999.x 为 BACKLOG
2. Read `.planning/PROJECT.md` Current Milestone — v0.3.3 产研半落地 + 工作区入驻
3. Read `.planning/research/SUMMARY.md` — 架构结论:引擎协议零改动,增量 = tabRunStore + Rust 提取命令 + HITL 复用
4. Next action: `/gsd:plan-phase 26`

Key files: `src-tauri/src/engine/`(Rust 引擎,协议不动)、`src/stores/rndStore.ts`(六个 generate*AI 为 mock 全清对象)、`research/RND-ROLLOUT-V0.3-V0.4.md`(路线真相源)、`docs/adr/ADR-0003-rust-run-engine.md`
