# Feature Landscape — v0.3.3 产研半落地 + 工作区入驻

**Domain:** AI-native PM workbench — mock-to-real AI wiring + document-driven onboarding
**Researched:** 2026-08-31
**Scope:** ONLY new v0.3.3 features: mock 全清接 Rust 引擎, tab 内嵌 run 进度, 候选→HITL→落槽模式统一, 文档摄取 pipeline, 反向创建产品. Existing engine/HITL/PRD-pipeline/knowledge_docs/FTS5/multi-session/tray are dependencies, not research targets.
**Overall confidence:** MEDIUM — codebase patterns HIGH (shipped v0.3.0-3.2); comparable-product behavior MEDIUM/LOW (training data on Notion AI / Mem / Obsidian Copilot / Windsurf; web search surfaced only enterprise IDP platforms, not consumer workbench patterns).

## How Comparables Actually Behave (evidence base)

| Product | Relevant behavior | Confidence |
|---------|------------------|------------|
| **Notion AI** | Generation always shows preview state then explicit insert/discard — never silent write. Meeting-notes → action items is extract-then-review. Docs import (docx/pdf) converts to pages on user action, not auto-ingest. | MEDIUM (training + product pages) |
| **Mem** | Auto-tagging/classification of saved notes; ingestion is user-triggered save then background enrich; retrieval-first positioning (imported item searchable immediately). | MEDIUM (training, unverified) |
| **Obsidian Copilot** | Vault-local AI on top of existing markdown; per-command context assembly; no ingestion pipeline — users' files are already text. Cautionary tale for Nova: Nova must do the conversion step Copilot gets for free. | MEDIUM (training) |
| **Windsurf / Cursor** | Agent actions land as reviewable diffs with accept/reject — the "candidate before commit" norm at its strongest. Background/parallel agent runs with progress surfaced where triggered. | HIGH (well-documented UX) |
| **Enterprise IDP (Tungsten/DocAI)** | Validate-before-routing is the industry invariant for extraction: classify → extract → human validation gate → commit. Direct analog to Nova's HITL batch confirm. | MEDIUM ([Tungsten](https://www.tungstenautomation.com/blog/top-ai-powered-document-automation-platforms-for-enterprise), [DocAI](https://cloud.google.com/document-ai)) |

## Table Stakes

Missing = feature feels fake or broken.

| Feature | Why Expected | Complexity | Dependencies (existing Nova) |
|---------|--------------|------------|------------------------------|
| All AI buttons produce real LLM output | Every comparable's AI button calls a model; `setTimeout` mocks read as broken | Low-Med | engine_run + Channel (exist). Six `generate*AI` (rndStore.ts:244-500) + FullDeliverablesTab 一键生成 + runProductSkill. Uniform wiring — one shared tab-run helper, not six bespoke paths |
| In-tab progress/streaming during run | Notion/Copilot always show generation state; frozen button for 30s reads as crash | Med | Channel event stream. Progress = event-log projection scoped to the tab run — NOT a new state machine |
| Candidate → HITL confirm → 落槽 on every tab | Nova's own Phase 16 pattern; Notion insert/discard and Windsurf diff-accept are the industry norm. Never write AI output silently | Low | confirmation candidates + knowledge_docs slots (exist). Reuse-and-generalize, not rebuild. Biggest risk: drift into six card variants — one shared component |
| Mock removal with no dead UI | Post-"real AI" milestone, no-op buttons or fake data destroy trust | Low | Pure deletion; don't lose mock-era demo seeding |
| docx/pdf → text extraction | PM artifacts are Word/PDF; md/txt-only ingestion feels like a toy | Med | Rust-side, zero sidecar. docx is straightforward (zip+xml); PDF text layer is the hard half — crate choice is the one genuinely uncertain technical piece (see STACK) |
| Document classification | Mem/Notion auto-tag; imported docs must land somewhere sensible, not a flat pile | Low | LLM single-pass classify → existing knowledge categories + doc type. No ML classifier, no embeddings (Out of Scope: vector retrieval) |
| Structured draft extraction (tasks/schedule) | Granola / Notion meeting-notes→action-items is the canonical expectation | Med | LLM extract to JSON schema → drafts into taskStore/scheduleStore pending state. Draft ≠ write: extraction produces candidates only |
| Batch confirmation for extracted drafts | Extract-then-review with bulk apply/discard is the IDP norm; one-card-at-a-time for 30 items is unusable | Med | HITL queue exists but is single-card. Needs batch variant: select-all/none + per-item edit + one commit. Generalizes the Phase 16 card |
| "从工作区创建产品" entry | The onboarding promise: start from what you already have | Low-Med | Compose: pick docs → run generation with docs as context → pre-filled CreateProductModal → existing commit flow. Mostly UI glue |

## Differentiators

Not expected from comparables, but high value for Nova's positioning.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Event-log-audited generation in tabs | Comparables show a spinner; Nova can show *what the agent did* (tool calls, context injected) because runs are event-sourced | Low | Free byproduct of projecting engine events into tab UI — Nova's "real agent, not chatbot" proof |
| Tray-resident background tab runs | Kick off competitor analysis, close window, get notified — no comparable local PM tool does this | Low | Already built (tray + notifications + hide-on-close); tab runs just ride the scheduler. Zero new infra |
| Versioned knowledge slots + AI provenance badges on all deliverable types | Windsurf/Notion overwrite or sidechain; Nova's supersedes chain + 溯源徽章 is distinctive | Low | Exists for PRD (Phase 16); extending to the other deliverable types IS the "接线只做一遍" (D-04) deliverable |
| Ingestion as agent run, not script pipeline | scan→classify→extract runs through the same engine with HITL gates → resumable/auditable, vs competitors' opaque batch jobs | Med | This is the D-06 calibration point: 999.1 plans were written for TS toolLoop and must be re-checked against the Rust tool registry / headless-run constraints |
| FTS5 immediate recall of ingested docs | Imported doc searchable the moment it commits; Mem sells this as core | Low | Exists — ensure ingestion commits into knowledge_docs so FTS5 picks it up free |

## Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real file writes from 原型/代码/测试 tabs | v0.4.0 coding tools' job (D-04 boundary); without str-replace safety the diff-review UI gets built twice | Document-level generation only; committed doc lands in knowledge slot |
| Per-tab bespoke run/progress implementations | Six hand-rolled progress states = six bugs; mock era already fragmented this | One shared tab-run hook + one progress/event projection component |
| Auto-commit AI output anywhere | Industry-wide trust killer; violates Nova's own consume-at-落槽 invariant | Every artifact passes HITL card. No "smart" exceptions |
| OCR / image-understanding ingestion | Scope explosion (scanned PDFs, screenshots). PM artifacts are overwhelmingly native docx/pdf | Text-layer extraction only; no-text-layer files surfaced as "无文本层" with graceful skip. Revisit post-v0.4 |
| Embedding/semantic classification during ingestion | Explicitly Out of Scope (P2, v0.4+); FTS5 + LLM classify suffices at onboarding scale (<100 docs) | LLM single-pass classification |
| Auto-ingest-everything ("smart folder watcher") | Mem-style auto-ingest creates trust and noise problems; batch HITL exists precisely to gate this | Scan is explicit user action; extraction user-triggered per batch |
| Converging tabs into agent panel | D-05: tabs stay as edit/manage surfaces; run injection is additive | Button → in-tab run → confirmation queue → slot commit |

## Feature Dependencies

```
engine_run + Channel events (exists)
  └── tab-run helper (shared) ← six generate*AI + FullDeliverablesTab + runProductSkill
        └── in-tab progress projection
              └── HITL card (generalized Phase 16) → knowledge_docs slot commit (FTS5 free)

docx/pdf text extraction (Rust, new)
  └── ingestion run (scan → classify → extract JSON drafts)
        ├── batch HITL confirm
        │     ├── taskStore/scheduleStore draft writes
        │     └── knowledge_docs commit
        └── "从工作区创建产品" (composes everything above — build last)
```

Mock-clear wiring and ingestion are independent tracks; reverse-create entry composes both and lands last.

## MVP Recommendation

1. Tab-run helper + generalized HITL card + one tab wired end-to-end (需求) — proves the pattern
2. Remaining five generate*AI + FullDeliverablesTab + runProductSkill via same helper (bulk, mechanical)
3. docx/pdf extraction + scan→classify→extract→batch HITL
4. "从工作区创建产品" (pure composition of 1-3)

Defer: OCR/scanned-PDF handling (rabbit hole — skip, surface honestly); batch progress UI beyond single event projection per tab.

## Gaps to Address (phase-level research)

- PDF text extraction crate choice + CJK quality — HIGH priority, the only genuinely uncertain technical piece (STACK territory)
- 999.1 plans calibration against Rust tool registry / headless-run constraints (D-06 — plan-review task, not research)
- Batch HITL card UX: no batch precedent in codebase; needs a design decision (one card with checklist vs. queue of cards)

## Sources

- Codebase truth (HIGH): `.planning/research/RND-ROLLOUT-V0.3-V0.4.md` (D-01..D-08), `.planning/PROJECT.md` (v0.3.0-3.2 inventory), Phase 16 PRD pipeline pattern
- Comparable products (MEDIUM, training data, not independently verified 2026): Notion AI, Mem, Obsidian Copilot, Windsurf/Cursor UX
- IDP validate-before-routing norm: [Tungsten Automation](https://www.tungstenautomation.com/blog/top-ai-powered-document-automation-platforms-for-enterprise), [Google Cloud Document AI](https://cloud.google.com/document-ai), [Extend.ai ingestion guide](https://www.extend.ai/resources/document-ingestion-ai-processing-guide)
