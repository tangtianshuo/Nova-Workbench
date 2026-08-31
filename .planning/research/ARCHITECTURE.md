# Architecture: v0.3.3 产研半落地 + 工作区入驻 Integration

**Researched:** 2026-08-31
**Question:** How do the new features integrate with the existing Rust run engine (v0.3.2)?
**Confidence:** HIGH — based on shipped code (`src-tauri/src/engine/commands.rs`, `src/ai/api.ts`, `src/stores/rndStore.ts`), ADR-0003, ARCHITECTURE.md v3.0. No new external tech surveyed; this is internal-integration research.
**Supersedes:** v0.3.1 multi-session architecture research (shipped; that base is extended, not re-researched).

## Core Finding

**The engine protocol needs zero changes.** `engine_run` already accepts everything the new features require: `run_id` (frontend-minted), `session_id`, `product_id`, `workspace_id`/`workspace_root`, `session_title`, and free-form `core_context` — plus a `Channel<EngineEvent>` for streaming. All new capability is (1) frontend orchestration state, (2) two new deterministic Rust commands for document extraction, (3) reuse of the Phase 16 "候选→HITL→落槽" seam pattern for anything that must write business data. Do not touch the channel protocol or the scheduler.

## (a) Tab AI buttons → engine_run

**Command surface: no change.** Tabs call the existing `engineRun()` from `src/ai/api.ts`.

**Tab context payload:** assemble via the existing `coreContext` string (already "TS buildCoreContext() output injected into the Rust system prompt"). Each tab button builds a context containing: active productId, the deliverable code / tab kind (requirement/prototype/code/test/competitor), and the current draft/prompt inputs. No new `engine_run` parameter, no new EngineEvent variant.

**Correlation to originating tab:** the webview already mints `runId`. Keep the runId → origin mapping **entirely in the frontend** in a new store:

```
tabRunStore (NEW, src/stores/tabRunStore.ts)
  runs: Record<runId, { tabId, productId, kind, sessionId, status, lastEvent }>
  startTabRun(tabId, kind, userMessage, contextPayload) → engineRun(...)
    - mints runId + a DEDICATED sessionId (crypto.randomUUID())
    - owns the onEvent callback (store-level, not component-level)
  cancelTabRun(runId) → engineCancel
```

**Dedicated session per tab run** (not shared with chat sessions): keeps `ChatSession.fromEvents` projections from mixing tab-run events into chat, and gives replay/restore a clean boundary. This is the one convention that must be decided up front — retrofitting session separation later means event-log surgery.

**New vs modified:**
- NEW: `src/stores/tabRunStore.ts`
- NEW: `TabRunPanel` shared component (progress + event stream, see b)
- MODIFIED: 6 `generate*AI` call sites in `rndStore.ts` (244-500), `FullDeliverablesTab` button, `productStore.runProductSkill` — all delegate to `tabRunStore.startTabRun`
- MODIFIED (optional): `buildCoreContext` to accept tab-specific payload sections

## (b) In-tab progress/event-stream projection

**Channel streaming, not polling.** The `Channel` is created per `engine_run` invoke and lives as long as that invoke's promise — which is held by `tabRunStore`, not by the component. So:

- Tab switch away/back: store keeps receiving events; `TabRunPanel` re-subscribes to store state. No reconnect logic needed.
- Webview reload while run executes in Rust (tray-resident): channel dies; the run itself survives. Recovery = existing restore path — on mount, `tabRunStore` rehydrates by querying events by sessionId (the `restore.ts` / eventStore read path already exists). Poll `event_log` only for this one-shot rehydrate, never as the live path.

**`TabRunPanel` (NEW, one component, reused by all tabs):** renders run status (queued/running/waiting/done via `run_status` events), a compact event stream (tool_start/tool_end/tool_output — same EngineEventMsg kinds the chat already renders), and the cancel button. HITL confirmation cards do NOT go here — they already route through the global confirmation queue (D-05 explicitly: 确认卡走现有确认队列). The panel only needs a "waiting for confirmation → open queue" affordance.

## (c) Document ingestion: split deterministic work from agent runs

**Extraction (docx/pdf → text) is NOT a run.** It's deterministic, needs no LLM, no event log semantics, no HITL. Plain Rust commands, zero sidecar:

- NEW `engine/ingest.rs` (or `src-tauri/src/ingest.rs`): `ingest_extract(path) -> { text, meta }`
  - docx: docx = zip + XML — parse with existing zip dependency + minimal `w:t` text walk, or a small crate (`docx-rust`-class). Flag crate choice as a phase-level research point (LOW confidence until verified against current crate landscape).
  - pdf: `pdf-extract` or equivalent pure-Rust text layer. Same flag.
- Output stored as artifact (knowledge draft or `agent_artifacts`-style row if it must appear in a run's context) — keep extraction results files-in-tables, appended to runs only as context text.

**Classification + draft extraction ARE runs.** One `engine_run` per ingestion batch with the extracted text(s) in coreContext, instructing the model to classify and propose drafts. This reuses: scheduler queueing, event log audit, HITL candidates, tray background execution. Critically it also gets ingestion for free when the window is hidden — the exact v0.3.2 value proposition.

**Batch HITL for task/schedule drafts:** PM CRUD tools are absent from the Rust registry (deliberate, ADR-0003 ruling #3 — kv_store JSON, no bridge). So draft application follows the **existing legal transition pattern** (same shape as `engineCommitDeliverable` seam ①, 23-04): run proposes candidates → confirmation cards → on confirm, a TS-side applier writes into `taskStore`/`scheduleStore` (zustand persist → kv_store), then `engine_append_tool_result` lands the audit event with Rust as sole writer of `agent_events`. Either a new candidate kind (`entity_draft`) or reuse of `destructive_action` with typed args — recommend a new kind for clean card UI discrimination.

**New vs modified:**
- NEW: Rust extraction command(s) + module
- NEW: TS applier for confirmed entity drafts (one function per entity type, wired into the confirmation card flow)
- MODIFIED: `confirmationStore` card rendering for the new kind
- NO change: scheduler, loop_runner, channel protocol

## (d) Create product from workspace + kv_store interaction

Products live in kv_store JSON snapshots written by TS (`productStore`, zustand persist). Per the ADR-0003 double-writer rule, Rust must not write it. Therefore:

1. "从工作区创建产品" is a **webview-initiated user action**: user picks classified workspace docs → UI (or an agent run proposing a product brief as a candidate) → confirm card → TS applier creates the product via `productStore.addProduct` → the newly minted `productId` is handed to `tabRunStore`/subsequent runs as the `product_id` param + written into the ingestion run's context.
2. **Auto-association = pass productId into engine_run, nothing more.** `knowledge_write` / deliverable candidates already carry `productId` (22-10 gap closure hardened exactly this). The only new wiring is that the ingestion flow stores the created productId on the workspace-entry record (frontend state) and injects it into every downstream run/candidate.
3. This research assumes kv_store JSON remains the business-data truth for v0.3.3 and the TS-applier seam is acceptable transition architecture. If relational migration is pulled into this milestone, (c)/(d) change materially — that's a roadmap decision, not an architecture detail.

## Component Summary

| Component | Status | Purpose |
|---|---|---|
| `src/stores/tabRunStore.ts` | NEW | runId→origin registry; owns Channel callbacks; dedicated sessionId per tab run |
| `TabRunPanel.tsx` | NEW (shared) | in-tab progress/event projection + cancel |
| `rndStore` 6× `generate*AI` + `FullDeliverablesTab` + `runProductSkill` | MODIFIED | delegate to tabRunStore; delete setTimeout mocks |
| Rust ingest module + extract command(s) | NEW | docx/pdf → text, deterministic, no sidecar |
| `entity_draft` candidate kind + TS applier | NEW | task/schedule/product drafts → zustand stores + `engine_append_tool_result` audit |
| `engine_run` / channel / scheduler / loop_runner | UNCHANGED | — |

## Build Order (dependency-driven)

1. **Tab run infrastructure** — tabRunStore + TabRunPanel + one pilot tab (Requirement). Everything else consumes this. Smallest seam, validates the dedicated-session convention early.
2. **Mock 全清** — remaining 5 tabs + batch + runProductSkill onto the infra from step 1. Mechanical once step 1 holds.
3. **Ingestion extraction** — Rust docx/pdf commands, no engine involvement. Independent of steps 1-2; can parallel.
4. **Ingestion orchestration + batch HITL + reverse product creation** — depends on 3 (text source) and reuses 1 (run infra) + the seam pattern. Highest-risk item (new candidate kind, multi-doc context sizing) — flag for phase-level research on context window budget for large documents.

## Anti-Patterns to Avoid

- **Do not extend `engine_run`'s parameter list for tab metadata** — origin correlation is a frontend concern; core_context already carries model-visible context.
- **Do not give tabs their own confirmation UI** — D-05: the existing global queue is the single HITL surface.
- **Do not make extraction an LLM run** — deterministic work in the engine wastes the event log and adds failure modes.
- **Do not share a chat session with tab runs** — projection mixing is the expensive-to-undo mistake.

## Sources

- `src-tauri/src/engine/commands.rs` (engine_run signature, run_id minting, scheduler gate) — direct code read
- `src/ai/api.ts` (full TS IPC surface incl. engineCommitDeliverable / engineAppendToolResult seam patterns) — direct code read
- `src/stores/rndStore.ts` (mock call sites) — direct code read
- `docs/ARCHITECTURE.md` v3.0, `docs/adr/ADR-0003-rust-run-engine.md`, `.planning/research/RND-ROLLOUT-V0.3-V0.4.md`, `.planning/PROJECT.md` — provided context
