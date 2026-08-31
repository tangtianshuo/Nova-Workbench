# Project Research Summary

**Project:** Nova — v0.3.3 产研半落地 + 工作区入驻
**Domain:** AI-native PM desktop workbench (Tauri v2 + React 19), extending the shipped v0.3.2 Rust run engine
**Researched:** 2026-08-31
**Confidence:** HIGH overall (architecture/pitfalls from direct code reads; one uncertain piece: PDF extraction crate)

## Executive Summary

v0.3.3 adds three capabilities on top of the locked v0.3.2 engine: (1) mock 全清 — all six rndStore `generate*AI` + FullDeliverablesTab + `runProductSkill` wired to real `engine_run` with in-tab progress, (2) a zero-sidecar document ingestion pipeline (docx/pdf → text → classify → extract drafts → batch HITL), and (3) "从工作区创建产品". The single most important architecture finding: **the engine protocol needs zero changes.** `engine_run` already accepts run/session/product/workspace ids, free-form `core_context`, and a Channel. All new capability is frontend orchestration (a new `tabRunStore`), two deterministic Rust extraction commands, and reuse of the Phase 16 候选→HITL→落槽 seam. Do not touch the channel protocol, scheduler loop, or loop_runner.

The stack is unusually lean: only 2-3 pure-Rust crates (`pdf_oxide` exact-pinned for CJK, `zip` + `quick-xml` for a ~100-LOC docx walker), zero new npm packages, zero sidecars. Everything UI-facing already exists (Channel events, Radix primitives, confirmation queue). The industry norm across all comparables (Notion AI, Windsurf, enterprise IDP) is uniform: candidate → review → commit, never silent writes — exactly Nova's existing HITL pattern, so the work is largely generalization, not invention.

Top risks are self-inflicted, not technical: (a) kv_store JSON vs knowledge_docs becoming dual sources of truth for deliverables (adjudicate before wiring), (b) cap-3 FIFO starvation of interactive chat runs once tab entries multiply run sources (priority fix ships with tab wiring, not after), (c) scanned/no-text-layer PDFs failing silently (three-state `extraction_status` from day one), (d) new event kinds eroding replay-parity discipline (bilateral fixtures mandatory per new kind).

## Key Findings

### Recommended Stack (STACK.md)
- `pdf_oxide` (`=0.3.x` pin, `cjk-form-fonts`) — CJK quality is the deciding criterion; fallback `unpdf` 0.6.4, one-file swap behind `ingest/pdf.rs`
- `zip` + `quick-xml` — hand-rolled docx walker (~100 LOC); docx-crate ecosystem weak
- Everything else: nothing new. Rejected: sidecars, `pdf-extract` (weak CJK), docx crates, Tika/poppler, OCR, embedding libs

### Expected Features (FEATURES.md)
- **Must have:** all AI buttons real via one shared tab-run helper; in-tab streaming progress; candidate→HITL→落槽 on every tab; docx/pdf extraction + classification + draft extraction; batch confirmation (per-document aggregate cards, opt-in); "从工作区创建产品" (build last); mock/fabricate removal with no dead UI
- **Differentiators:** event-log-audited generation visible in tabs (free byproduct); tray-resident background tab runs; provenance badges extended to all deliverable types; FTS5 immediate recall
- **Defer:** OCR, real file writes from prototype/code tabs (v0.4), batch progress beyond single tab projection

### Architecture (ARCHITECTURE.md)
1. `tabRunStore` (NEW) — runId→origin registry, owns Channels, **dedicated sessionId per tab run** (never share chat sessions)
2. `TabRunPanel` (NEW, shared) — status + layered event summary + cancel; HITL stays in global queue (D-05)
3. Rust ingest module (NEW) — deterministic extraction commands, NOT LLM runs
4. `entity_draft` candidate kind + TS applier → zustand write + `engine_append_tool_result` audit
5. UNCHANGED: scheduler, loop_runner, channel protocol, `engine_run` signature

### Critical Pitfalls (PITFALLS.md)
1. Dual truth source kv vs knowledge_docs — adjudicate first, field-mapping table, no parallel read-write
2. Chat starvation under cap-3 FIFO — interactive priority or merge 十八份 into one run; same plan as wiring
3. Silent no-text-layer PDFs — three-state status + char threshold, day one
4. Ingestion idempotency — content-addressed docId, rescan = diff
5. Parity erosion — every new event kind needs bilateral fixture in same plan; fail-loud projections

## Implications for Roadmap

1. **Phase 1: Mock 全清 — tab 接引擎 + 数据落点裁定.** tabRunStore + TabRunPanel + 需求-tab pilot, then bulk wiring of remaining tabs/skills; scheduler priority fix; event-kind rules. Avoids pitfalls 4/5/6/12/13. Research flag: NO (in-repo patterns).
2. **Phase 2: 文档摄取 — Rust 提取 + 编排 + 批量 HITL.** ingest modules, scan→classify→extract runs with `ingest_minimal` context profile, aggregate HITL cards + `entity_draft` appliers, three-state status, content-addressed ids. Avoids pitfalls 1/2/3/7/8/11. Research flag: **YES** — pdf_oxide PoC on real Chinese PDFs, batch card UX, context-window budget.
3. **Phase 3: 反向创建产品 + 收口.** Pure composition; parity close-out gate (bilateral fixtures per new kind); UAT incl. ≥20-doc batch + tray background. Research flag: NO.

Ordering follows the dependency chain in FEATURES/ARCHITECTURE: infra → bulk wiring → extraction (parallelizable) → orchestration → composition. Adjudication-first in Phase 1's first plan is the cheapest debt avoidance in the milestone.

## Confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Web-search only; re-verify versions at add time; pdf_oxide pre-1.0 |
| Features | MEDIUM | Codebase HIGH; comparables MEDIUM (training data) |
| Architecture | HIGH | Direct code reads + ADR-0003 |
| Pitfalls | HIGH | Repo audits; crate pitfalls MEDIUM |

**Gaps:** pdf_oxide feature-flag/CJK PoC; batch HITL card design decision; 999.1 plan calibration vs Rust tool registry (D-06, plan-review); crate version pins.
