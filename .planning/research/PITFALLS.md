# Pitfalls Research — v0.3.1 Multi-Session + Fork

**Domain:** Adding multi-session chat (workspace isolation, restore, reference-based fork, LLM auto-title, dropdown switching, clipboard copy) to an existing single-session event-sourced agent runtime
**Researched:** 2026-08-18
**Confidence:** HIGH — grounded in actual code (`sessionRestore.ts`, `chatConsoleStore.ts`, PROJECT.md v0.3.1 scope). Web search not needed; every pitfall below traces to a concrete line or locked design decision.

Scope note: this replaces the v0.3.0 pitfalls file (that milestone shipped; its pitfalls are now tests). Phase mapping uses working names: **P-A** (data model + migration 0007), **P-B** (multi-session runtime + restore), **P-C** (fork + copy + dropdowns + titles). Adjust to final phase numbering.

---

## Critical Pitfalls

### Pitfall 1: Fork cut-point lands mid-turn — dangling tool_call at the cut seq
**What goes wrong:** Reference-based fork projects `parent events where seq <= fork_cut_seq` + child events. If the user hovers an assistant message and forks at the seq of that message's `message_appended` event, but that turn contained tool calls whose `tool_result` events have *higher* seqs, the child projection starts with open tool_calls. `findOrphanToolCallEvents` (sessionRestore.ts:40) will then see them as orphans on the child's next restore and append `interrupted` tool_results — the parent turn's tools become permanently "interrupted" in the child branch, and the pairing invariant scanner may flag the child stream.
**Why it happens:** The event log interleaves `tool_call` / `tool_result` / `message_appended` / `turn_ended` events within one turn. Message-level hover gives you a message seq, not a turn boundary. The existing crash-tail logic already knows the correct boundary: `findCrashTailCutSeq` cuts at `turn_ended`.
**Consequences:** Child session corrupted at birth; replay parity tests fail; LLM projection contains an unanswered tool_call which some providers reject outright (Anthropic hard-errors on unpaired tool_use).
**Prevention:** Reuse `findCrashTailCutSeq` semantics — fork cut must be a **turn boundary**: `fork_cut_seq = seq of the turn_ended at-or-before the hovered message`. Concretely: derive the hovered message's turn (correlationId or last turn_ended ≤ message seq) and cut there. Add one test: fork at a seq inside a tool-heavy turn → child projection has zero open tool_calls. Also reuse the existing orphan-settle logic as a safety net for child restore, but the cut rule should make it unreachable.
**Detection:** Pairing-invariant violation codes on the child session; provider 400 "tool_use without tool_result".
**Phase:** P-C (fork). Design the cut rule in P-C's spec before any UI.

### Pitfall 2: `sessions[0]` restore assumption survives the migration
**What goes wrong:** `doRestoreLatestSession` picks `sessions[0]` from `listSessions()` (sessionRestore.ts:71-73) — "the latest session is THE session". With 50 sessions across workspaces, this restores whichever row the current ORDER BY returns, ignoring `activeSessionId`, workspace filter, and fork children. A forked child (1 message) can easily outrank the parent by `updated_at`.
**Consequences:** App restart drops the user into a random/forked session; silent, looks like data loss.
**Prevention:** Restore becomes two steps: (1) read persisted `activeSessionId` (uiStore persist or sessions table `last_active` flag); (2) fallback to "latest session **in the last active workspace**, excluding sessions whose parent chain is broken" only when the id no longer exists. Delete the "sessions[0] = the session" mental model entirely — add a comment and a test that restores with 3 sessions present and asserts the persisted id wins.
**Detection:** Test: seed 3 sessions, set active to the oldest, restore, assert `sessionId === oldest`.
**Phase:** P-B (multi-session runtime). This is the single most load-bearing refactor in P-B.

### Pitfall 3: Module-level singleton state vs `activeSessionId` — the dropdown race
**What goes wrong:** `chatConsoleStore` holds module-level `sessionRef`, `streamingResponseRef`, `streamingTraceRef`, `restorePromise`, `nextId`. All are **global by construction**. Adding `activeSessionId` as store state while `sessionRef.current` stays module-level creates two sources of truth: a session switch that swaps `activeSessionId` but not `sessionRef.current` (or swaps it mid-`submit`) streams tokens from session A's tool loop into session B's message list. The two hosts (Drawer + page) both render the same store, so whichever is visible shows the corruption.
**Why it happens:** The Phase 17 lock ("sessionRef is module-level") was correct for one conversation. Multi-session needs the ref to be **keyed**, not removed.
**Consequences:** Cross-session message bleed — the worst user-visible bug class in this milestone; also poisons the event log if submit appends to the wrong session.
**Prevention:**
1. Make `sessionRef` a `Map<sessionId, ChatSession>` (or replace with `activeSessionRef` guarded by a check that `runToolLoop`'s session id matches `get().activeSessionId` at submit time and at every callback).
2. Capture `const sessionId = get().activeSessionId` at submit start; in `onToken`/`onToolEnd`/final `set()`, bail if `get().activeSessionId !== sessionId` (stream completes into the void; final message is written to the *correct* session's list on switch-back, or simply persisted via event log and re-projected on switch).
3. Project.md already locks "streaming 中锁定切换" — implement it as: session switch disabled while `loading === true` (disable dropdown options + recent-list clicks). This is the cheap correct answer; don't build concurrent-stream multiplexing.
**Detection:** Test: submit in session A, switch to B mid-stream (force-allowed in test), assert B's messages unchanged and A's stream landed in A.
**Phase:** P-B. Lock the submit-capture pattern in P-B; P-C dropdowns inherit it.

### Pitfall 4: Stale session metadata vs event truth divergence (title, message count, fork badge)
**What goes wrong:** The new `sessions` table stores `title`, and the "最近任务" list wants `标题+时间+消息数+分支标识`. Every denormalized field is a divergence risk: title updated by LLM race (Pitfall 5), message count stale after crash-tail trimming (a session restored with `trimmedTailEventCount > 0` has fewer *projected* messages than *logged* events), `updated_at` not bumped by background candidate consumption.
**Consequences:** List shows "12 条消息" but opening shows 9; users conclude sessions are broken.
**Prevention:** Rule: **metadata table holds only what events cannot answer cheaply** — `title` (LLM-generated, has no event), `parent_session_id`, `fork_cut_seq`, `workspace_id`. Message count, last-activity time, fork badge: derive from event log (one indexed query per list render is fine at desktop scale; `COUNT()` + `MAX(seq)` on `agent_events` grouped by session). If count derivation is too slow later, add a cache with explicit invalidation on append — not before. Add a parity test: derived list row vs `ChatSession.fromEvents` projection for a fixed seed.
**Detection:** Manual: fork, chat in child, reopen list — counts must match both sessions.
**Phase:** P-A (schema design: keep the table thin) + P-C (list reads derived values).

### Pitfall 5: Title generation race — user switches session while LLM titles the old one
**What goes wrong:** After first turn, fire an LLM title call for session X. User immediately switches to session Y or opens the dropdown. The title response arrives and writes (a) to the wrong session row if the write path reads `activeSessionId` at completion time, or (b) is displayed nowhere because X isn't active, and the list doesn't refresh — user sees "新对话" forever until remount.
**Consequences:** Wrong titles on wrong sessions (data corruption, hard to notice), or stale titles (minor annoyance).
**Prevention:**
1. The title task must **carry its own sessionId** captured at request time — never read `activeSessionId` on completion.
2. Write via `UPDATE sessions SET title = ? WHERE session_id = ? AND title IS NULL/original-fallback` — guard against overwriting a title the user-visible state already committed (out-of-scope manual rename makes this simpler; still guard against double-fire from StrictMode).
3. After write, refresh the session list state (a `sessionListVersion` counter or just re-query) so the dropdown updates while open.
4. StrictMode: same promise-dedupe pattern as `restorePromise` — key the dedupe on sessionId.
5. Failure fallback (first-message truncation) must be applied in the **same guarded write path**, not a separate code path that can race the LLM response arriving late.
**Detection:** Test: mock LLM with 500ms delay, trigger title, switch session, resolve, assert titles on both rows.
**Phase:** P-C (titles). The guarded-write helper belongs in P-A/P-B's session repo if one exists by then.

### Pitfall 6: Pending confirmation candidates global → session-scoped filter breaks existing flows
**What goes wrong:** `listPendingKnowledgeWrites()` / `listPendingDestructiveActions()` / memory + PRD card refreshes (chatConsoleStore:124-127, 132-163) are **global queries** today. Scope asks for "pending 确认卡片按 session 过滤". Two failure modes: (a) filter added to the *queries* when candidates were created in a session the current session forked from — fork prefix means the candidate's `sessionId` points at the parent; filtering `WHERE session_id = active` hides a candidate whose confirmation the child projection still shows. (b) Forgetting to scope means session B shows session A's delete confirmation — a user confirming it executes a destructive tool while looking at an unrelated conversation.
**Consequences:** (b) is a **safety issue**, not a UX bug. (a) is a mysterious disappearing card.
**Prevention:** Add `session_id` to the candidates tables (P-A migration), set at creation from the tool loop's session. Scoping rule: a candidate is visible in session X if `session_id == X` **or** X's ancestor chain (follow `parent_session_id` up to `fork_cut_seq` relevance) contains it — simplest safe v1: strict `session_id == X`, and document that forking away from a pending confirmation abandons it (it remains confirmable by reopening the parent). Destructive candidates: strict scoping, no inheritance — never let a fork re-surface a delete. Write the decision into the P-A spec.
**Detection:** UAT: create pending delete in session A, switch to B, assert no delete card in B.
**Phase:** P-A (column + migration) → P-B (filtered queries + store state keys per session).

### Pitfall 7: Workspace deletion orphans sessions (and breaks restore + fork chains)
**What goes wrong:** Sessions get `workspace_id`. Project.md locks "删除不级联" as a general principle, and workspace deletion is an existing v0.2.0 feature. After deleting a workspace: sessions with a dangling `workspace_id` either (a) vanish from every filtered list (current-workspace filter) — invisible but restorable-by-accident via `activeSessionId`, or (b) crash list queries if the code assumes join integrity.
**Consequences:** Ghost sessions; restore into a deleted workspace shows a session the UI can't navigate to; fork badge rendering may dereference a missing workspace name.
**Prevention:** Decide in P-A: **orphan policy = reassign to a "default/未分类" workspace sentinel** (nullable `workspace_id` displayed as 未分类) — matches the nullable-FK house style. List query: `LEFT JOIN workspaces`, render missing as 未分类, never assume presence. Restore: if `activeSessionId`'s workspace is gone, restore into the sentinel bucket and let the dropdown show 未分类. One test: delete workspace with 2 sessions, assert both visible under 未分类 and restorable.
**Detection:** UAT step in P-B or P-C: delete workspace → agent page list still renders.
**Phase:** P-A (schema: nullable FK + sentinel) + P-B (restore fallback).

### Pitfall 8: Migration 0007 rollback / corruption — SQL-side seq allocation and the migrations array
**What goes wrong:** `tauri-plugin-sql` migrations run a JS array of SQL strings on startup. Failure modes specific to this milestone: (a) migration 0007 partially applies (new tables created, `agent_events.workspace_id` column add fails midway — plugin transactionality across multiple statements in one migration entry is not guaranteed on all backends); (b) existing `agent_events` rows get `workspace_id = NULL` and every workspace-filtered query silently excludes **the entire existing history** — user upgrades and their agent conversation disappears; (c) seq allocation: if child-session events continue the parent's seq space vs start their own, a wrong choice breaks the "seq strictly increasing per session" assumption in `findCrashTailCutSeq` / `listEvents` ordering.
**Consequences:** (b) is the likeliest: the v0.3.0 conversation looks deleted on upgrade. This is the "migration ate my data" class — trust-destroying.
**Prevention:**
1. Backfill in the same migration: `UPDATE agent_events SET workspace_id = <last-active-or-sentinel>` before any index on it. Existing events must map to a real, visible session (also insert a `sessions` row for the legacy session if none exists — the legacy single session needs a metadata row or it's invisible to the new list).
2. One migration entry = one atomic concern; wrap multi-statement entries in `BEGIN/COMMIT` if the plugin's Sqlite backend doesn't.
3. Seq decision, lock it explicitly: **each session owns its own seq space starting at 1** (matches current per-session `listEvents` ordering). Fork child events append with the child's own seqs; the fork *projection* = parent events `<= fork_cut_seq` (parent seqs) + child events (child seqs) — do **not** concatenate raw and sort by seq across two spaces. Document in the P-A spec; this is the #1 silent-corruption source in reference-fork designs.
4. Rollback safety: plugin has no down-migration. Before shipping, manually test upgrade from a real v0.3.0 database file (copy one from a dev machine) — not just fresh installs. Keep a copy of the pre-0007 file for the test fixture.
**Detection:** Automated: migration test over a fixture v0.3.0 DB asserting legacy session appears in list with correct workspace. Manual: packaged build upgrade test.
**Phase:** P-A. This is P-A's acceptance criterion, not an afterthought.

---

## Moderate Pitfalls

### Pitfall 9: `nextId` counter collision across session switches
**What goes wrong:** `nextId` is a single module counter for React keys. On session switch, messages are re-projected with fresh ids from the same counter — fine. But if switch-back re-projects while an async `set` from the old session's stream lands (Pitfall 3 mitigation incomplete), duplicate keys appear. Cheap fix: on switch, project messages with ids from `${sessionId}:${seq}` composite keys instead of the counter. **Phase:** P-B.

### Pitfall 10: Streaming switch-lock deadlocks the UI
**What goes wrong:** "streaming 中锁定切换" implemented as disabling the dropdown is correct, but if the LLM call hangs (provider timeout long), the user is locked out of *all* sessions. Prevention: lock is really just "submit guard" — keep switch *navigable* but route the in-flight stream to its owning session (Pitfall 3 pattern), OR keep the hard lock but bound it by the existing tool-loop timeout. Pick one in P-B spec; don't ship an unbounded lock. **Phase:** P-B.

### Pitfall 11: Clipboard copy fails silently in Tauri webview
**What goes wrong:** `navigator.clipboard.writeText` in a Tauri v2 webview requires window focus and, depending on platform/capabilities, the clipboard-manager plugin or `allow-write-text` permission; on Windows WebView2 it can throw `NotAllowedError` when triggered from a non-focused frame, and in prod builds the default capability set does **not** include clipboard write. Symptom: button "works" in dev (browser-ish context) and fails in the packaged app.
**Prevention:** Use `writeText` from `@tauri-apps/plugin-clipboard-manager` when `isTauri()` (project already has the platform-split pattern in `src/lib/api.ts`), add the plugin + capability entry in P-C, and fall back to `navigator.clipboard` for web dev mode. Show a toast on failure — never silent. **Phase:** P-C.

### Pitfall 12: Fork projection re-runs compaction/aux-event replay incorrectly
**What goes wrong:** The parent prefix may contain `compaction_completed` events; the child inherits the parent's tokenBudget and compaction state via `ChatSession.fromEvents`. If fork projection reuses restore code paths naively, the `cutSeq` semantics differ (restore cuts at last `turn_ended`; fork cuts at an arbitrary earlier `turn_ended`) — code sharing is fine, but `trimmedTailEventCount`-style reporting and any `session_created` tokenBudget lookup (sessionRestore.ts:114) must look for the **child's** `session_created`, not inherit the parent event's. Prevention: fork = create child `session_created` event first, then projection = parent prefix + child events; all metadata reads target child events. Test: fork mid-conversation, assert tokenBudget and message count. **Phase:** P-C.

### Pitfall 13: Dropdown selection triggers restore-like async gap — blank panel flash
**What goes wrong:** Switching session requires `listEvents` + projection (async). If the store clears `messages` optimistically then awaits, the panel flashes empty; if it keeps old messages until load, a slow load shows session A under session B's title. Prevention: a `switching` state — render skeleton (project has `<ViewLoading />` pattern), never mixed content; and disable input during switch (reuse `loading` semantics but distinct flag so Pitfall 3's capture check doesn't misfire). **Phase:** P-B.

---

## Minor Pitfalls

### Pitfall 14: StrictMode double-mount breaks per-session dedupe keyed globally
The `restorePromise` / `activeRestore` module singletons (chatConsoleStore:80, sessionRestore.ts:54) are once-per-app-start by design. Multi-session: restore is still once-per-start (restore *active* session), but **title generation** and any session-switch dedupe must key their promise cache on sessionId, else the second mount's call is swallowed by an unrelated session's cache. **Phase:** P-B/P-C.

### Pitfall 15: Message-count badge uses logged events, not projected messages
Related to Pitfall 4: crash-trimmed tails mean `COUNT(agent_events)` ≠ projected messages. Derive count from projection-shaped filter (user/assistant non-tool messages) or accept the badge lies after a crash. Decide explicitly, don't stumble into it. **Phase:** P-C.

### Pitfall 16: Ctrl+Shift+K dropdown state leaks into Ctrl+K
The two Selects live in ChatPanel header. Ensure ChatPanel props/mode split doesn't leave workspace/session dropdown state mounted in pure ⌘K mode (size jump, focus steal). Trivial if the dropdowns are conditional on a `variant` prop — put that in the P-C spec. **Phase:** P-C.

---

## Phase-Specific Warnings

| Phase topic | Likely pitfall | Mitigation |
|-------------|---------------|------------|
| P-A migration 0007 | Legacy history invisible after upgrade; seq-space ambiguity (Pitfall 8) | Backfill workspace_id + legacy sessions row; lock per-session seq space; fixture-DB migration test; packaged-build upgrade check |
| P-A schema | Fat metadata table → divergence (Pitfall 4); orphaned workspace FK (Pitfall 7) | Thin table (title/parent/cut_seq/workspace_id nullable); derived counts from events |
| P-B runtime | sessions[0] restore (Pitfall 2); global singleton vs activeSessionId (Pitfall 3); global pending candidates (Pitfall 6b) | activeSessionId-persisted restore; sessionId-captured callbacks + streaming lock; session-scoped candidate queries |
| P-C fork | Mid-turn cut / dangling tool_call (Pitfall 1); title race (Pitfall 5); child metadata from parent events (Pitfall 12) | turn_ended cut rule + orphan test; guarded title write keyed by sessionId; child-first metadata reads |
| P-C copy/dropdown | Clipboard permission in packaged build (Pitfall 11); blank-panel flash (Pitfall 13); Ctrl+K leak (Pitfall 16) | clipboard-manager plugin + capability + fallback + toast; `switching` skeleton; conditional dropdown render |

## Sources

- Codebase: `src/ai/sessionRestore.ts` (restore/orphan/cut logic), `src/stores/chatConsoleStore.ts` (module singletons, submit/callback flow, card refreshes), `.planning/PROJECT.md` (v0.3.1 scope + locked decisions, no-cascade constraint)
- Confidence: HIGH for all codebase-traced pitfalls. MEDIUM implicitly on Tauri clipboard capability specifics (Pitfall 11) — verify exact plugin/capability name against current `@tauri-apps/plugin-clipboard-manager` docs during P-C planning.
