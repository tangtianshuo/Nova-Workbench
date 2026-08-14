# Pitfalls Research

**Domain:** Adding agent event logging, persistent HITL confirmations, memory candidates, FTS5 retrieval, and proactive AI UX to an existing local-first Tauri desktop app
**Researched:** 2026-08-14
**Confidence:** HIGH overall (codebase-grounded); one MEDIUM flag on FTS5 compile availability (see Pitfall 6)

Scope note: pitfalls are grounded in the actual v0.2.0 code (`src/ai/chatSession.ts`, `toolLoop.ts`, `confirmations.ts`, `src/stores/storage/*`). Phase names map to the v0.3.0 milestone structure: P0 (event log base), P1 (memory + FTS5), DELIV (deliverable line), UX (entry/morning report/context menu).

## Critical Pitfalls

### Pitfall 1: Double-execution of tool calls after restore

**What goes wrong:**
Crash/quit happens between `executeTool()` and writing the result. On restart, replay sees a `tool_call` event with no `tool_result`, "helpfully" re-executes it → duplicate task created, duplicate schedule event, knowledge article written twice. The reference doc calls this out explicitly (验收标准: "同一工具请求重复恢复时不会造成重复业务写入") and the current code has zero protection: `executeTool` in `registry.ts` is fire-and-forget with no idempotency.

**Why it happens:**
Executing is the natural way to "finish" an interrupted loop, and it demos well. Naive resume logic treats unpaired tool_calls as "pending work."

**How to avoid:**
- Resume must NEVER auto-execute an orphaned `tool_call`. Mark it `interrupted` and surface it in the UI as "此操作未完成，需要重新发起" — force the model to re-request, which re-enters the confirmation pipeline.
- For extra safety, give destructive/domain-write tools an idempotency key = `correlation_id` + args hash (the pattern `consumeKnowledgeWriteConfirmation` already uses for draft matching). A `tool_result` table with UNIQUE constraint on correlation_id makes double-write structurally impossible.
- Enforce the pairing invariant with a startup check: `SELECT tool_calls missing results` → log + mark interrupted, don't execute.

**Warning signs:**
Duplicated tasks/events appear after a crash-recovery test; test "kill app mid-tool-loop, restart" in CI/UAT for every phase touching the loop.

**Phase to address:**
P0 — this is THE invariant of the event log design; retrofitting idempotency after tools have side effects is a rewrite.

---

### Pitfall 2: Replay divergence — ChatSession projection drifts from what the live loop showed

**What goes wrong:**
ChatSession rebuilt from events renders differently from the pre-crash live session: tool traces missing, turns grouped wrong, the model receiving a different context than it saw live. Divergence sources in the current code: (a) `toolLoop.ts` maintains TWO histories — `session` and a local `messages` array that maps `tool → user` and injects `[tool_result ...]` strings — replay that only replays `session` won't reproduce what the LLM saw; (b) `groupIntoTurns` splits on `role === 'assistant' && !toolCallId` — if event types don't preserve the toolCallId linkage, turn boundaries change; (c) per-iteration toolCallId is synthesized as `${iteration}-${name}-${count}` — a positional counter that replay cannot reliably reproduce.

**Why it happens:**
The refactor keeps ChatSession as the source and "also" writes events, so two write paths exist and drift. The reference doc is explicit: ChatSession must become a *projection* of the log, not a co-author.

**How to avoid:**
- Single write path: tool loop appends events; ChatSession reads from events (or is rebuilt from them). Delete the parallel `messages` array in `toolLoop.ts` — derive LLM messages from the same projection.
- Make `toolCallId` a UUID captured in the `tool_call` event payload (never a positional counter).
- Add a replay parity test: run a scripted session, snapshot `getMessagesForLLM()`, rebuild from events, assert identical output. Keep this test alive forever.

**Warning signs:**
After-restart conversation looks subtly different (missing tool chips, reordered turns); parity test deleted "because it was flaky."

**Phase to address:**
P0. Also: while refactoring, the existing tests under `src/ai/__tests__` plus the toolLoop trace-coloring behavior (the `isConfirmation ? undefined : errorMessage` filter, fixed in commit 0bbc3f2) must keep passing — that's the known regression hotspot.

---

### Pitfall 3: Two sources of truth — Zustand kv_store JSON blobs vs new normalized tables

**What goes wrong:**
v0.3.0 needs real tables (`agent_events`, `memory_candidates`, `knowledge_documents`, `knowledge_chunks`, FTS index) but all existing data lives in one JSON blob per store inside `kv_store`. If knowledge documents get a real table while `rndStore` still persists the same documents as JSON, every write has two targets; one code path forgets one (MDXEditor autosave, seed script, AI write tool, future migration) → table and store disagree, retrieval returns ghosts or misses fresh edits.

**Why it happens:**
Doing the table "just for retrieval" feels incremental, but it silently creates a sync problem the weak-association model never had.

**How to avoid:**
- One direction of truth per entity. Recommended: `knowledge_documents`/`knowledge_chunks` are the truth; `rndStore` knowledge items hydrate FROM the table at startup and all writes go through the table (store becomes a cache/projection, same pattern as ChatSession-from-events).
- Alternatively keep store-as-truth and rebuild the FTS index from store content on change (content_hash comparison). Acceptable for P1 but caps later versioning/supersede work; prefer the first.
- Write a divergence check into dev mode: after any write, assert store-vs-table content_hash match.

**Warning signs:**
Search returns deleted documents; MDXEditor edits not findable until restart; two different "update document" code paths appear.

**Phase to address:**
P1 (knowledge versioning), decided at P0 schema-design time so the event log's business-change linkage doesn't bake in the wrong keys.

---

### Pitfall 4: FTS5 default tokenizer silently returns nothing for Chinese

**What goes wrong:**
`CREATE VIRTUAL TABLE ... USING fts5(content)` with default `unicode61` tokenizer treats an entire space-free Chinese sentence as ONE token. Searching "需求" against a doc containing "需求文档" returns zero rows, silently. PM content is Chinese — this makes retrieval look "broken" in UAT or, worse, look like it works because English titles match.

**Why it happens:**
unicode61 splits on whitespace/punctuation; CJK has neither. No error is raised — empty results look like "no matches," which testers misread as a data problem.

**How to avoid (opinionated, based on current FTS5 capabilities):**
- **Do NOT use bare unicode61 for Chinese content.**
- Two viable options:
  1. **Pre-segmented unicode61 (recommended):** store a derived `search_text` column where every CJK char is space-separated (ASCII words kept whole), index that; apply the same transform to the query and issue a phrase query (`"需 求"`). Matches arbitrary-length Chinese substrings including 2-char words (需求/日程/原型 — the most common PM query length).
  2. **`tokenize='trigram'`:** one-line fix, supports substring search, BUT trigram MATCH requires queries ≥ 3 characters — 2-char Chinese words (most of them) fall through. If you take trigram, you must route short queries to a `LIKE` fallback anyway.
- If trigram: note it is case-sensitive by default (`case_sensitive 0` for English titles).
- Add a fixed regression test with pure-Chinese, mixed 中英, and 2-char queries from day one.

**Warning signs:**
FTS "works" in dev on English fixture text; Chinese queries return 0 hits with no error.

**Phase to address:**
P1 — the day the FTS table is created. Tokenizer choice is not changeable in place later without full drop + reindex, and an external-content table makes that migration trickier still.

---

### Pitfall 5: Stale FTS index after document updates/deletes

**What goes wrong:**
Index updated in the AI write tool path but not in the MDXEditor save path, the versioning/supersede path, or the delete path → search returns old versions or deleted docs. The reference doc's acceptance criterion is explicit: "文档更新后…检索不会返回失效索引." Classic with external-content FTS5 tables: they don't auto-sync unless triggers fire, and triggers only fire on the *content* table — which doesn't exist if content lives in kv_store JSON (see Pitfall 3).

**Why it happens:**
Multiple write paths into the same documents (human editor, agent tool, version supersede, product deletion cascade from v0.2.0 cross-module work).

**How to avoid:**
- Single write API for knowledge documents (one function: update content → bump version → upsert chunks → refresh index rows for that doc, in one transaction). All callers (tool, editor, supersede) route through it.
- If using `content=` external-content FTS5 keyed on `knowledge_chunks`, maintain delete-at discipline (`INSERT INTO fts(fts, rowid, ...) VALUES('delete', ...)`); a plain (self-contained) FTS5 table with `delete-all` + reinsert-per-doc is simpler and fine at P1 scale.
- Product/workspace deletion (v0.2.0 cascade cleanup already exists for stores) must include a documented retention policy for events/memories/index (acceptance criterion #6 in the reference doc). Decide once, test it.

**Warning signs:**
Search hits an old doc version after a supersede; deleted product's knowledge still searchable; index row count ≠ chunk row count (add a cheap dev-mode assertion).

**Phase to address:**
P1 (with Pitfalls 3/4); the deliverable-line phase (DELIV) adds a *fourth* write path (generated PRD → slot) and is the most likely breaker — re-verify then.

---

### Pitfall 6: FTS5 may not be compiled into the SQLite that tauri-plugin-sql bundles — verify before designing around it

**What goes wrong:**
`tauri-plugin-sql` goes through sqlx → `libsqlite3-sys`. Evidence is contradictory: rusqlite's bundled `build.rs` is generally understood to define `SQLITE_ENABLE_FTS5`, but there is an open Tauri plugins-workspace issue (#3159) about custom SQLite build flags, and sqlx's feature wiring is not guaranteed to match rusqlite's defaults. If FTS5 isn't compiled in, `CREATE VIRTUAL TABLE ... USING fts5(...)` throws at runtime — potentially discovered late, after the retrieval design assumes it.

**Why it happens:**
Compile flags live three dependencies deep in the Rust graph; nobody reads the build.rs of transitive deps.

**How to avoid:**
- **First hour of P1:** runtime probe in `initializeDatabase` — `CREATE VIRTUAL TABLE fts5_probe USING fts5(x, tokenize='trigram')` (probes FTS5 presence AND trigram, which needs SQLite ≥ 3.34). Fail loudly with a clear message.
- If absent: patch libsqlite3-sys build flags, add a small Rust-side Tauri command wrapping rusqlite `bundled` (which does enable FTS5), or degrade to pre-segmented `LIKE` over chunks as a stopgap. Decide with the probe result in hand, not by assumption. (Confidence: MEDIUM — must be empirically verified on this exact dependency tree.)

**Warning signs:**
None, if you don't probe — exactly why the probe is mandatory.

**Phase to address:**
P1 kickoff (before schema is finalized).

---

### Pitfall 7: Memory candidate spam — pending queue becomes a notification landfill

**What goes wrong:**
The model proposes a "memory candidate" nearly every turn (it's incentivized to be helpful). Within a week the user has 300 pending candidates, ignores the badge forever, and the memory system becomes noise. Related failure: near-duplicate candidates ("用户偏好简洁" × 12) because dedupe wasn't in v1.

**Why it happens:**
Reference doc rule 2 ("模型推断只能创建候选") is necessary but not sufficient — nothing in that rule rate-limits candidate creation.

**How to avoid:**
- Gate creation: explicit user cue ("记住这个") always creates; inferred preferences need a minimum confidence AND a similarity check against existing pending/confirmed memories (content hash + scope; the knowledge tool already has tags to key on).
- Dedupe/conflict/supersede BEFORE the user sees the queue: collapse duplicates into one candidate, surface conflicts as a single choice, never two buttons for the same fact.
- Cap visible pending (e.g., 20 oldest first) and use the `expires_at` field already in the reference schema — auto-expire unconfirmed low-confidence candidates at ~1 week.
- Rejected candidates must be kept (status) and fed back — otherwise the model re-proposes the same rejected memory next session. Acceptance criterion #3 depends on this.

**Warning signs:**
Pending count > 50 in dogfooding; users dismissing the badge without opening it; the same candidate reappearing after rejection.

**Phase to address:**
P1 — dedupe/conflict logic is a stated milestone feature; build it in the same plan as the confirmation UI, not after.

---

### Pitfall 8: Morning report has no trigger — desktop apps have no cron

**What goes wrong:**
Team designs "每天 9:00 生成晨报" and then realizes: Tauri apps have no background service; when the window is closed the process is gone; there is no OS-level scheduler without extra plugins/permissions (startup registration, tray-resident process — complexity creep). The feature silently degrades to "never fires."

**Why it happens:**
Server-side mental model (cron/systemd) carried into a desktop app.

**How to avoid:**
- **Lazy on-launch model (recommended):** on app start (after DB init, non-blocking), check `last_morning_report_date`; if today's report doesn't exist and local time is past the configured hour, generate it. "晨报" becomes "今天第一次打开时的简报" — which matches how PMs actually use a desktop workbench.
- Generate async after UI paints; never block `initializeDatabase` (which already runs before React renders and throws loudly).
- Persist the report as a dated row/event (it's derived state) so re-renders don't regenerate it twice.
- Do NOT add tray-resident background threads or OS auto-launch for v0.3.0 — scope creep magnet.

**Warning signs:**
Design docs mention timers/setInterval/OS registration; UAT test plan has no story for "app wasn't running at 9am."

**Phase to address:**
UX phase (morning report); the trigger decision shapes the data model (dated report row), so lock it at plan-review time.

---

### Pitfall 9: Right-click menu fights the OS webview context menu

**What goes wrong:**
Global `contextmenu` + `preventDefault()` across the app kills the native menu in inputs (copy/paste/undo gone in MDXEditor, chat input) — or behaves inconsistently across WebView2 (Windows), WKWebView (macOS), WebKitGTK (Linux). On some webviews, preventing default also loses the current text selection, so "AI: 改写这段" actions get no selection to act on. Reverse failure: only intercepting on plain divs but the event target is a nested span — menu flickers or double-opens.

**Why it happens:**
Context menu interception is per-webview quirky; the fun is in event-target details and editable-region detection.

**How to avoid:**
- Intercept selectively: skip `preventDefault` when `event.target` is inside `input/textarea/[contenteditable]` (MDXEditor is contenteditable — this is the big one) or when there's a non-collapsed selection the user might want native actions for.
- Attach at captured targets (task cards, kanban items, knowledge docs), not `window`, for v1. "右键菜单快捷 AI 动作" on domain entities is the milestone scope; a global everywhere-menu is v0.4 thinking.
- Snapshot `window.getSelection()` into state BEFORE opening the custom menu — showing the menu can clear selection in some webviews.
- Test on all three platforms; WebKitGTK is the usual offender.

**Warning signs:**
Can't paste into the chat input; bug reported only on Linux; selection-based AI action works in Chrome dev mode but not in the packaged app.

**Phase to address:**
UX phase; the "skip editable regions" rule must be in the plan, not discovered in UAT.

---

### Pitfall 10: Event log writes from the frontend — per-event IPC round trips and interleaved seq

**What goes wrong:**
Two failure modes: (a) every event = one `db.execute` IPC round trip; a 5-iteration tool loop writes dozens of rows one-by-one, and a UI hiccup mid-loop drops events silently → pairing invariant violations from mere slowness; (b) two concurrent sessions (⌘K palette + ChatPanel — both exist today) compute `seq = lastSeq + 1` in JS; both read `lastSeq` before either writes → duplicate seq within a session, replay order destroyed.

**Why it happens:**
`seq` looks like a frontend concern because everything so far has been frontend-driven via tauri-plugin-sql.

**How to avoid:**
- Assign seq in SQL, not JS: `INSERT ... seq = (SELECT COALESCE(MAX(seq),0)+1 FROM agent_events WHERE session_id = $1)` — SQLite serializes writers, atomic per statement.
- Batch events within one tool-loop iteration into a single transaction (multi-statement `execute` or a tiny Rust command `append_events(Vec<Event>)`). One IPC call per iteration is plenty.
- Enforce `UNIQUE(session_id, seq)` so a violation throws instead of corrupting replay.
- Cap payload size at the append path (see Performance Traps) — enforce at write time, not by convention.

**Warning signs:**
Events occasionally missing after rapid tool loops; UNIQUE constraint fires only under concurrent sessions; DevTools shows a burst of individual SQL IPC calls.

**Phase to address:**
P0 — this is the append path; changing it later means replaying logs written under the old scheme.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| ChatSession stays source-of-truth, events written "in parallel" | Smaller P0 diff, no ChatPanel changes | Two write paths drift; replay parity rots (Pitfall 2) | Never for v0.3.0 — this IS the core refactor |
| Long tool results stored inline in event payload | No extra table | Log bloat; context rebuild drags | Short-term if payload capped ~4 KB; artifact table per reference §6 before DELIV (PRDs are long) |
| FTS index rebuilt on every app start | No stale-index logic needed | Startup O(all docs) | P1 acceptable IF content_hash skip makes rebuild cheap; revisit at ~10k chunks |
| Memory dedupe via exact content hash only | Trivial to build | Near-dupes still spam (中文语序差异) | P1 MVP; revisit with similarity in P2 (embeddings) |
| Morning report stored only in Zustand | Fast | Regenerated every launch; no audit trail | Never — it's one dated row |
| Skip the FTS5 runtime probe | Saves an hour | Discovering no-FTS5 after schema design | Never — see Pitfall 6 |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| tauri-plugin-sql (sqlx SQLite) | Assuming FTS5/trigram compiled in | Runtime probe at init; fallback decided in advance (Pitfall 6) |
| Zustand persist (kv_store JSON) | Adding normalized tables alongside, dual-write | One truth per entity; store hydrates FROM tables (Pitfall 3) |
| MDXEditor | Forgetting it's a write path for knowledge docs | Route saves through the single document-write API incl. index refresh (Pitfall 5) |
| Existing confirmations.ts API | Deleting/replacing the in-memory Maps wholesale | Keep `create/confirm/consume/reject` signatures; swap Map for SQLite-backed storage; port the `sameDraft` draft-match and consume-once semantics — they're the valuable part |
| Rust llm.rs IPC | Writing events after the IPC response returns, widening the crash window | Write `tool_call` event BEFORE executing, `tool_result` after (Pitfall 1 ordering) |
| v0.2.0 product-deletion cascade | New tables not covered by cleanup | Extend retention policy to events/memories/index; make it a test (reference acceptance #6) |
| ⌘K palette + ChatPanel | Assuming one active session | Both entry points can run loops concurrently; seq/idempotency must tolerate it (Pitfall 10) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Event log unbounded growth | nova.db grows tens of MB/week of daily use; startup replay slows | Cap payload (~2-4 KB; big results as artifacts per reference §6); retention/archival policy for old sessions | Months of dogfooding; test with a 50k-event fixture DB |
| Full session replay on every startup | App start latency grows linearly with history | Replay only active/latest session on demand; Working Context snapshot (reference §2) + tail replay | ~10k events |
| Per-event IPC writes | UI jank during fast tool loops | Batch per iteration, seq assigned in SQL (Pitfall 10) | Immediately with streaming |
| `estimateMessageTokens = length/4` on Chinese | Wildly UNDER-estimates Chinese tokens (a Chinese char ≈ 1-2 tokens, not 0.25) → context overflow errors on Ollama | Per-script estimate: CJK chars ≈ 1 token each + ASCII/4. Fix while touching chatSession anyway | Already wrong today for Chinese; becomes load-bearing in P0 replay |
| FTS index rebuilt on start | Multi-second startup | content_hash-skip or incremental per-doc upsert | ~1-2k chunks |
| Index/query transform mismatch | English queries work, Chinese miss | Query-side transform must mirror index-side transform exactly, shared function + one test (Pitfall 4) | First Chinese UAT |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Persisting confirmation candidates/tool args containing secrets | API keys/tokens captured forever in append-only event JSON | Scrub known secret shapes in the event serializer; events outlive the session |
| Event log = full plain-SQLite audit of user data | Local attacker or synced backup leaks all content | Acceptable for local-first v1 (same posture as kv_store today); document it; never transmit payloads as telemetry |
| Stale confirmation tokens reusable after reject | Reject-then-consume race executes a refused action | Keep consume-once + status transition + draft match as today, now transactional in SQL |
| Morning report pulls ALL products' data into an unattended prompt | Cross-product data into a cloud LLM the user didn't initiate | Scope explicitly; prefer local Ollama default for proactive/unattended generations |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| Restored confirmation dialogs with no context | User approves a write they can't see the origin of | Restored candidates must show source session/message + preview before approve is enabled |
| Pending-memory badge that never clears | Notification fatigue, feature death | Cap + expire + dedupe (Pitfall 7); empty state reachable |
| Morning report fires repeatedly mid-session | Nagging | Once per day keyed on dated row; manual refresh opt-in |
| Right-click AI action with no feedback on long LLM calls | Looks frozen; re-clicks spawn duplicate loops | Immediate pending state tied to correlation_id; disable re-entry while running |
| Restored "interrupted tool call" shown as an error | Users think the app is broken | Dedicated interrupted-state UI with a re-request action, distinct from failure |
| ChatPanel regression during refactor | Lost streaming, broken trace colors, lost cancel | Port callbacks 1:1; the trace-color fix (0bbc3f2) is the canary — its test must survive |

## "Looks Done But Isn't" Checklist

- [ ] **Event log:** Kill the app mid-tool-loop (all 3 platforms). Restart. Verify: no duplicate business writes, orphaned tool_call shown as interrupted, session restores. Missing this = P0 not done.
- [ ] **Replay parity:** Snapshot `getMessagesForLLM()` live, rebuild from events, identical output — including a session that had a confirmation-pause.
- [ ] **Chinese FTS:** 2-char query (需求), pure Chinese doc, mixed 中英 title all hit; deleted doc returns nothing; superseded version not returned.
- [ ] **FTS5 probe:** `fts5_probe` executed on the real packaged build (not just dev).
- [ ] **Rejected memory:** Reject a candidate, restart, ask the same thing — must NOT reappear, must NOT surface in retrieval.
- [ ] **Concurrent sessions:** ⌘K palette and ChatPanel loops simultaneously — no seq collisions, no cross-session event bleed.
- [ ] **Confirmations survive restart:** Pending candidate visible after relaunch; approve-then-consume exactly-once even on double-click.
- [ ] **Editor write path:** Edit a doc in MDXEditor → immediately searchable with new content (no restart).
- [ ] **Product deletion:** Delete a product with events/memories/knowledge → defined, tested retention behavior.
- [ ] **Morning report:** App NOT running at target hour → report on first launch; running → once only.
- [ ] **Context menu:** Right-click inside MDXEditor/chat input still shows native edit menu on Windows/macOS/Linux.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-execution duplicates created | HIGH | Detect via duplicate correlation_id business writes or user report; dedupe script keyed on args hash; retrofit idempotency (painful — cheap to prevent) |
| Replay divergence | HIGH | If events complete: fix projection, rebuild (that's the design's promise). If events lossy: session unrecoverable |
| kv_store vs table divergence | MEDIUM | Table becomes truth; one-time reconciliation migration with content_hash compare; report diffs |
| Wrong tokenizer chosen | MEDIUM | Drop FTS table, re-transform content, full rebuild + fix query-transform call sites |
| No FTS5 in bundled SQLite | MEDIUM-HIGH | Rust-side rusqlite command or build-flag patch; SQL unchanged IF all FTS access is behind one search module — keep FTS access behind one module for exactly this reason |
| Memory spam already accumulated | LOW | Bulk-expire pending below confidence threshold; retroactive dedupe |
| Right-click broke inputs | LOW | Add editable-region guard; ship |
| Chinese token estimate wrong | LOW | Fix estimate function; one file |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Double-execution after restore | P0 | Crash-mid-loop test in every P0 plan |
| 2. Replay divergence / dual write path | P0 | Replay parity test committed and kept green |
| 3. kv_store vs tables truth split | P0 (decision) / P1 (execution) | Divergence dev-check; single write API exists |
| 4. FTS5 Chinese tokenization | P1 | Chinese 2-char/pure/mixed query regression test |
| 5. Stale index after update/delete | P1 + re-verify in DELIV | Edit→search-immediately UAT; index/chunk count assertion |
| 6. FTS5 compile availability | P1 kickoff (hour one) | Probe on packaged build |
| 7. Memory candidate spam | P1 | Pending-cap + dedupe + reject-feedback tests |
| 8. Morning report trigger | UX | First-launch-of-day behavior test; no timers in code |
| 9. Right-click vs webview | UX | 3-platform input-region menu test |
| 10. Event write batching / SQL-side seq | P0 | UNIQUE(session_id,seq) + concurrent-session test |
| Chinese token estimate (performance trap) | P0 (while touching chatSession) | CJK-weighted estimate unit test |

## Sources

- Codebase (direct read, HIGH): `src/ai/chatSession.ts`, `src/ai/toolLoop.ts`, `src/ai/confirmations.ts`, `src/stores/storage/{sqliteStorage,initializeDatabase}.ts`
- `docs/AGENT_MEMORY_REFERENCE.md` — project-authoritative design reference; acceptance criteria cited throughout
- [SQLite FTS5 official docs (trigram tokenizer, substring matching)](https://www.sqlite.org/fts5.html) — HIGH
- [Why SQLite FTS5's default tokenizer drops your CJK substrings](https://dev.to/omochi_dev/why-sqlite-fts5s-default-tokenizer-drops-your-japanese-substrings-and-the-one-line-fix-1k2d) — HIGH (consistent with official docs)
- [unicode61 not designed for CJK (sqlite-users mailing list)](https://sqlite-users.sqlite.narkize.com/N5MOmskp/) — HIGH
- [Full-text CJK Search with SQLite FTS5 Trigram Tokenizer](https://zenn.dev/kanseilink/articles/kanseilink-fts5-trigram-cjk-20260507?locale=en) — MEDIUM (practitioner article)
- [GRDB.swift #413: FTS5 tokenizers for Chinese](https://github.com/groue/GRDB.swift/issues/413) — MEDIUM
- [Tauri plugins-workspace #3159: custom build flags / unbundled sqlite](https://github.com/tauri-apps/plugins-workspace/issues/3159) vs [rusqlite libsqlite3-sys build.rs](https://github.com/rusqlite/rusqlite/blob/master/libsqlite3-sys/build.rs) — CONTRADICTORY on FTS5-in-bundled-SQLite → runtime probe mandated (Pitfall 6, MEDIUM confidence)
- [Tauri SQL plugin docs](https://v2.tauri.app/plugin/sql/) — HIGH

---
*Pitfalls research for: Nova-PM-Workspace v0.3.0 (agent event log / memory / FTS5 / proactive UX)*
*Researched: 2026-08-14*
