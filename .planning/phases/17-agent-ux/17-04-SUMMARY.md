---
phase: 17-agent-ux
plan: 04
subsystem: docs
tags: [architecture, adr, documentation]
requires: []
provides:
  - "docs/ARCHITECTURE.md v2.0 — 现行架构真相源（事件日志 + tool loop + FTS5 + HITL + Tauri 壳）"
  - "docs/adr/ADR-0001 — 架构切换决策记录（GraphFlow/Rig/LanceDB 出局）"
  - "docs/adr/ADR-0002 — deepseek-harness 复用 MIT 归属"
affects: []
tech-stack:
  added: []
  patterns:
    - "ADR 记录规范（Status/Date/Context/Decision/Consequences）"
key-files:
  created:
    - docs/adr/ADR-0001-architecture-switch.md
    - docs/adr/ADR-0002-harness-mit-attribution.md
  modified:
    - docs/ARCHITECTURE.md
decisions:
  - "ARCHITECTURE.md v2.0 只描述已落地系统，对照 migrations 0002-0005 与 src/ai/ 实际模块；GraphFlow/Rig/LanceDB 仅存于否决/ADR 语境"
  - "harness 复用范围 = 设计思想 + 纯函数算法（事件配对/投影派生/恢复切分点），不引入框架/运行时；MIT 归属入 ADR-0002"
metrics:
  duration: ~10 min
  completed: 2026-08-17
---

# Phase 17 Plan 04: 架构文档重写（ARCHITECTURE.md v2.0 + 双 ADR）Summary

一句话：把 docs/ARCHITECTURE.md 从 GraphFlow/Rig/LanceDB 旧蓝图全文重写为已落地的「事件日志 + tool loop + FTS5 + HITL + Tauri 壳」真相源，并以 ADR-0001（架构切换）+ ADR-0002（deepseek-harness MIT 归属）留下正式决策记录。

## What Was Built

**Task 1 — docs/adr/ 与两个 ADR（commit 625039c）**

- `ADR-0001-architecture-switch.md`：Context 记录 v1.0 蓝图三组件（GraphFlow/Rig/LanceDB）与实际演进分叉的四个原因（pre-1.0 风险、AGENT_MEMORY_REFERENCE §9、Phase 13-16 事件日志已落地验证、结构过滤先于向量检索）；Decision 宣布三者正式出局并列出现行架构；Consequences 约束后续里程碑引用、向量检索仅作派生索引、Rust 原生后端降级为远期可选。
- `ADR-0002-harness-mit-attribution.md`：记录事件词表、配对算法、投影派生、恢复切分点四个借鉴点；复用范围严格限定为设计思想与纯函数算法（不引入 Node.js/Cordis 框架）；MIT 归属以 ADR 为正式记录，`src/ai/events/invariants.ts` 与 `src/ai/chatSession.ts` 的衍生关系可追溯。

**Task 2 — ARCHITECTURE.md v2.0 全文重写（commit b263fd7）**

按计划骨架七节：产品定位 / 架构总览（ASCII 图 + 数据流）/ 分层结构（Tauri 壳、React+zustand、src/ai/ 逐模块表、SQLite 迁移 0002-0005 表清单）/ 关键设计决策（8 条不变量）/ 真相源索引（AGENT_MEMORY_REFERENCE.md、migrations/、CLAUDE.md）/ ADR 索引 / 已否决方向（引 REQUIREMENTS.md Out of Scope 理由）。写作时逐一对照了实际迁移文件与 src/ai/ 模块清单，未凭记忆。

## Verification

- ADR：`Status: Accepted` ×2；Context/Decision/Consequences 三节各 3 命中；`GraphFlow`、`MIT`、`deepseek-harness` grep 全命中
- ARCHITECTURE.md：`事件日志`×6、`toolLoop`×3、`FTS5`×6、`HITL`×7、`Tauri`×9、`AGENT_MEMORY_REFERENCE`×3、`ADR-0001`×3、`ADR-0002`×1
- GraphFlow 仅 2 处（ADR 索引行含「正式出局」、已否决方向表）；LanceDB/Rig 各 1 处（已否决/出局语境）— 满足「≤3 且全部否决/历史语境」
- 旧文档「Rust 原生后端 / GraphFlow pipeline / LanceDB 第二大脑」章节随全文重写不复存在

## Deviations from Plan

1. **[undershoot] ADR 行数**：计划建议每篇 60-120 行，实际 42/28 行 — 全部规定内容点（Status/Date/Context/Decision/Consequences + 指定事实）均已覆盖，验收标准不含行数，未注水。
2. **[parallel-safety] 跳过 `state advance-plan`**：本计划为并行执行（17-01..05 同时跑），5 个 agent 并发递增 Current Plan 会互相覆盖产生错误计数；仅执行 append 式状态更新（decisions/metric/session/progress）。串行位置推进留给 orchestrator。

## Known Stubs

None — 纯文档计划，无代码。

## Self-Check: PASSED

- docs/ARCHITECTURE.md — FOUND
- docs/adr/ADR-0001-architecture-switch.md — FOUND
- docs/adr/ADR-0002-harness-mit-attribution.md — FOUND
- commit 625039c — FOUND
- commit b263fd7 — FOUND
