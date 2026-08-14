# Feature Landscape — v0.3.0 Agent 闭环

**Domain:** AI-native PM desktop workbench — v0.3.0 new capabilities (recoverable agent runtime, long-term memory, deliverable production line, agent UX)
**Researched:** 2026-08-14
**Scope:** ONLY the four v0.3.0 pillars. Existing v0.2.0 features (CRUD, ChatPanel, HITL tools) are dependencies, not re-researched.

## How Comparables Actually Behave (evidence base)

| Product | Relevant behavior | Confidence |
|---------|------------------|------------|
| **Claude Code** (memory) | Layered memory: user-curated `CLAUDE.md` (user/project scope) + auto-memory directory (`~/.claude/projects/<path>/memory/`) with `MEMORY.md` as index; first ~200 lines auto-injected into context each session; Claude writes memories itself during work with visible "Writing memory" indicators; user manages/edits via `/memory`. Scoped files, not one global blob. | HIGH ([official docs](https://code.claude.com/docs/en/memory)) |
| **Claude Code** (session resume) | Sessions persisted as append-only JSONL transcripts; `--continue` / `--resume` restores full conversation incl. tool results after restart/crash; session picker UI. | HIGH (official docs + training data) |
| **Cursor** (rules) | Rules files (.cursor/rules, scoped global/project/language), loaded into context per scope — never auto-written by the model. No candidate confirmation; user authors everything. | MEDIUM |
| **ChatGPT / Copilot memory** | Silent auto-save of inferred preferences → user manages via flat settings list (view/delete, disable). No pre-save confirmation. Widely criticized for wrong/creepy inferences → the confirmation flow Nova already has is a genuine differentiator. | MEDIUM (well-known behavior) |
| **Mem.ai** | Fully automatic organization: no folders, AI groups/relates notes, question-based retrieval of synthesized answers. Trade-off: user loses control/auditability. | MEDIUM ([comparison](https://speakwiseapp.com/blog/mem-ai-vs-reflect), [Mem's own guide](https://get.mem.ai/guides/mem-vs-reflect-compared)) |
| **Reflect** | Manual-first minimal vault + ChatGPT integration; daily notes surface. AI assists, doesn't manage. | MEDIUM (same sources) |
| **Notion AI** | Right-click / selection AI actions (summarize, improve, translate) inline in blocks; AI drafts land in the page as editable content the user then refines. No persistent cross-session memory. | MEDIUM (training data) |
| **GitHub Copilot Workspace** | Generate plan → step-by-step review (each step approvable/editable) → apply. HITL at structured checkpoints, output lands in structured artifact (PR). Closest analog to Nova's deliverable→slot flow. | MEDIUM (training data; product sunset but the pattern persists) |
| **Obsidian Copilot plugins** | Selection-based AI commands via command palette / editor menu; vault notes as retrieval corpus (local-first, plain Markdown + derived index). | LOW (plugin ecosystem churn) |

**Cross-cutting takeaways:**
1. Every surviving product separates **original record** (transcript/vault/JSONL) from **model-visible projection** (index/summary/rules) — matches AGENT_MEMORY_REFERENCE.md §6 exactly.
2. Nobody mainstream does pre-save memory confirmation — but the criticism of silent inference (ChatGPT) validates Nova's HITL candidate flow as a deliberate differentiator, not missing table stakes.
3. Session restore is universally append-only-log + rebuild; in-flight tool calls at crash time are marked cancelled/orphaned, never auto-retried (idempotency is the user's job to verify, per AGENT_MEMORY_REFERENCE §10).

---

## Table Stakes

Users of any "agent with memory" desktop product expect these. Missing = broken trust.

| Feature | Why Expected | Complexity | Depends on (existing) |
|---------|--------------|------------|----------------------|
| Session survives app restart (chat history restores, can continue) | Claude Code / ChatGPT / Copilot all do this; losing chat on restart reads as data loss | Medium | ChatPanel, chatSession.ts, tauri-plugin-sql |
| Session list / picker ("continue previous conversation") | Standard in every AI assistant since 2023 | Low | ChatPanel |
| Tool call ↔ tool result pairing integrity after restore | Corrupted replay = hallucinated history = agent misbehaves silently | Medium | toolLoop.ts, registry.ts |
| Confirmation candidates survive restart (pending HITL not lost) | A pending approval that vanishes on restart is the #1 recoverability complaint pattern | Low-Med | confirmations.ts |
| Memory management list: see everything agent "knows", delete any item | ChatGPT settings memory list is the baseline expectation | Low | knowledge tools, SQLite |
| Rejected memories never surface in retrieval | Users check immediately after rejecting; failure = trust destroyed | Low | FTS5 retrieval (new) |
| Memory source traceability ("why does it think this") | Claude Code memory files inspectable; ChatGPT shows referenced memories per answer | Medium | Event Log (new P0) |
| Retrieval scoped by product/workspace (no cross-product leakage) | PM data is per-product; leaking product A facts into product B chat reads as a bug | Medium | uiStore.selectedProductId, workspaceStore |
| Morning report: today's schedule + overdue tasks + pending confirmations | Every "AI chief of staff" product (Mem positioning, Copilot daily digest) leads with this | Medium | scheduleStore, taskStore, candidate store (new) |
| AI deliverable draft is editable before landing | Notion AI / Copilot Workspace: nobody accepts generated → slot without edit pass | Low | MDXEditor, rndStore deliverables |
| Generated content visibly marked AI-generated with provenance | Provenance expectations from Copilot Workspace / NotebookLM citations | Low | knowledge_documents source fields (new) |
| Cancel/stop agent mid-run with clean state after cancel | Exists in v0.2.0 (取消); must hold under event log | Low | Channel streaming |

## Differentiators

Not expected by default — they ARE Nova's stated value proposition ("懂你、能替你干活").

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Pre-save memory candidate confirmation** (confidence, dedupe, supersede) | Solves the #1 complaint about ChatGPT memory (wrong silent inferences). Nobody mainstream does this well. | Med-High | Already prototyped in knowledge tools; v0.3.0 makes it persistent + versioned. `supersedes` chain is the hard part |
| **Auditable event log** ("who changed what, when, via which agent turn") | None of the comparables expose this to users; for a PM tool this is accountability gold | High | Pure P0 plumbing + minimal viewer; full audit UI deferred to v0.4 |
| **Deliverable generation → HITL → structured slot with version history** | Copilot Workspace pattern applied to PM deliverables: 18-slot catalog exists, agent fills slots, old versions auditable | Medium | Highest user-visible value in the milestone |
| **Contextual global entry** (⌘K carries current view/product context) | Raycast-style; agent knows "I'm on product X's task list" without being told | Low-Med | uiStore.activeTab + selectedProductId already carry this |
| **Right-click quick AI actions scoped to entity** (task → "拆解子任务"; text → "存为知识") | Notion AI selection actions analog; kills chat round-trips for common ops | Medium | Context-menu infra is new; 3-5 actions hard ceiling |
| **Sourced retrieval results** (model gets source_type/source_id/version, UI shows citation) | NotebookLM/Perplexity-level citation behavior in a local-first PM tool | Medium | Requires knowledge_chunks + version fields |

## Anti-Features

Explicitly do NOT build (validated by comparable-product failures + PROJECT.md Out of Scope).

| Anti-Feature | Why Avoid (evidence) | What to Do Instead |
|--------------|---------------------|-------------------|
| Silent auto-write of inferred preferences to long-term memory | ChatGPT's most-complained-about behavior; erodes trust, hard to unwind | Candidate → confirm flow (keep) |
| Full auto-orchestrated pipeline (需求→PRD→原型→代码→测试 one run) | Copilot Workspace tried plan-to-PR automation and got sunset; PROJECT.md formally rejects engineless workflows | Single-deliverable generate → confirm → slot; loop later |
| Vector/embedding retrieval in v0.3.0 | PROJECT.md Out of Scope; structure filtering (product/type/time) delivers most PM value first (memory reference §5) | FTS5 + tag/scope filters |
| Copying business facts (tasks/products) into free-text "memories" | Second source of truth = drift; explicitly rejected §9 | Business facts stay in domain stores; events reference them |
| Morning report as blocking modal / LLM-only narration | Digests that must be dismissed get turned off; pure-LLM digests hallucinate the schedule already in SQLite | Structured cards from stores, optional one-line LLM summary on top; dismissible panel |
| Right-click submenu with 15 AI actions | Menu bloat kills usage; Obsidian plugin ecosystem's common failure | 3-5 curated actions per entity type |
| Editable/deletable event log via UI | Breaks audit + replay invariants (append-only is the point) | Corrections are new events; log read-only in UI |
| Inline agent embedded in every view | Deferred by user decision to v0.4+ | Global entry + context menu carry context instead |

## Feature Dependencies

```
Event Log (P0)
  ├─→ Session restore / session list
  ├─→ Persisted confirmation candidates
  ├─→ Memory candidate provenance (source_event_id)
  └─→ Audit/replay viewer (defer)

Memory candidates (P1)
  ├─→ Event Log (source binding)
  ├─→ Morning report "pending candidates" section
  └─→ FTS5 retrieval scoping

FTS5 retrieval
  └─→ knowledge_documents version+source fields
      └─→ Sourced citations in chat

Deliverable production line
  ├─→ rndStore 18-slot catalog (exists)
  ├─→ Persisted confirmations (P0) — accept lands the slot
  ├─→ MDXEditor (exists) — edit-before-land
  └─→ knowledge_documents versioning — deliverable lands as versioned doc

Global entry + context menu + morning report
  ├─→ uiStore activeTab/selectedProductId (exists)
  ├─→ taskStore/scheduleStore queries (exist)
  └─→ candidate store (P1) — pending section
```

**Build order implication:** Event Log is the keystone — 4 of 6 other features depend on it. Deliverable line is mostly wire-up of existing pieces plus P0 confirmations.

## MVP Recommendation

Prioritize (per pillar):
1. **Event Log + session rebuild + persisted confirmations** (P0) — everything else hangs off it
2. **Memory candidate confirmation + management list + FTS5 scoped retrieval** — minimum: candidate CRUD, reject-never-retrieves invariant, scope filter
3. **Deliverable line: PRD generation → MDXEditor edit → confirm → rndStore slot, versioned** — pick ONE deliverable type (PRD) end-to-end before generalizing to the 18-slot catalog
4. **Morning report as structured cards + global entry context passing** — cheapest high-visibility win; do last

Defer:
- **Audit/replay viewer UI**: P0 plumbing ships now; viewer is read-only SQL queries later
- **Right-click context menu**: ship after morning report proves the contextual-entry pattern
- **LLM-narrated digest text**: structured cards first, narration only if users want it
- **Compaction/artifacts**: P2 per memory reference; only a token-budget guard in v0.3.0

## Sources

- [Claude Code memory docs](https://code.claude.com/docs/en/memory) — HIGH, official
- [Claude memory tool (platform)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) — HIGH, official
- [Mem vs Reflect comparison](https://speakwiseapp.com/blog/mem-ai-vs-reflect), [Mem official comparison](https://get.mem.ai/guides/mem-vs-reflect-compared) — MEDIUM
- [PCMag best AI note apps 2026](https://www.pcmag.com/picks/best-ai-tools-taking-notes) — MEDIUM
- docs/AGENT_MEMORY_REFERENCE.md (project-internal, authoritative for this milestone) — HIGH
- ChatGPT/Copilot Workspace/Notion AI/Cursor/Obsidian-plugin behaviors — training data, MEDIUM/LOW as flagged in table

---
*Feature research for: Nova v0.3.0 功能闭环 — Agent Event Log / 长期记忆 / 交付物生产线 / Agent UX*
*Researched: 2026-08-14*
