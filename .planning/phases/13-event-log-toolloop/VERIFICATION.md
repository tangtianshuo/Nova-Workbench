# Phase 13 Verification: Event Log 底座 + ToolLoop 重构

**Verified:** 2026-08-15
**Verdict:** Goal ACHIEVED
**Status:** PASS

## Goal Achievement

**Phase Goal:** Agent 运行时的每一步都作为不可变事件落入 SQLite,LLM messages 从单一真相派生 — 后续一切记忆/恢复/审计能力的基础

Every success criterion verified against actual code and executed tests. The event-log substrate (migration 0002 + EventStore dual implementation), the ChatSession projection refactor, and the single-history toolLoop rewrite are all present on disk, type-clean, and covered by 19 phase-13 tests inside a 44/44 green suite. The locked CONTEXT.md contract held: no caller-visible signature changes, confirmations.ts / ChatPanel.tsx zero-diff, §3 schema exact match, replay parity permanent test live, trace-color canary intact.

## Success Criteria Verification

### SC1: 对话结束后 `agent_events` 可见完整配对事件序列(连续 seq + correlation_id) — SATISFIED
- **Migration** `src-tauri/migrations/0002_agent_events.sql`: `agent_events` with `UNIQUE(session_id, seq)`, `PRAGMA journal_mode = WAL`, `agent_artifacts`, idempotent `schema_version → 2`; registered in `src-tauri/src/lib.rs` as version 2; `APP_SCHEMA_VERSION = 2` in `initializeDatabase.ts` (line 6).
- **Emission path:** `ChatSession.addMessage` dual-writes every message via a per-session serial promise chain (`chatSession.ts:174-179`); `toolLoop.ts` adds the user message (line 99), every assistant/tool_call/tool_result row (lines 133/141/151/169/189/208/215), and `turn_ended` via `recordTurnEnd` on ALL four exit paths through the `endTurn` helper (lines 105-109, 134, 152, 191, 216).
- **Executed evidence:** test "a tool turn lands as a paired, contiguous, correlated event sequence" asserts the exact sequence `session_created → user_message → tool_call → tool_result → assistant_message → turn_ended`, `seq = [1..6]`, and `correlationId` stamped on every event from seq 2 onward — PASS in `npm test`.
- **Caveat (accepted):** the SQLite INSERT path (`(SELECT COALESCE(MAX(seq), 0) + 1 ...)` + `UNIQUE` backstop) is code-verified but exercised only by manual UAT — see Residual Risks.

### SC2: 缺失 tool_result 的事件流被 invariant checker 检测并报告(不静默通过) — SATISFIED
- `src/ai/events/invariants.ts`: `checkEventStream` detects all five violation codes (MISSING_TOOL_RESULT / DUPLICATE_TOOL_CALL / DUPLICATE_TOOL_RESULT / RESULT_BEFORE_CALL / SEQ_GAP); `assertEventStreamValid` does `console.error` + throw (lines 75-83).
- Turn-end audit wired into the live loop: `auditSessionEvents` (`toolLoop.ts:82-92`) runs `checkEventStream` on every turn close, reporting via `console.error` — never silent.
- **Executed evidence:** test "audit reports a turn whose tool_result never arrived" — hand-rolled orphan stream yields exactly 1 issue, code `MISSING_TOOL_RESULT`, toolCallId `tc-orphan`, and `assertEventStreamValid` throws `/invariant violation/`. Violation report visible in the `npm test` output (`[event-log] invariant violations detected [...]`). Also covered by `phase13EventLog.test.ts` tests 4-6.

### SC3: ChatPanel 展示与 LLM messages 来自同一派生 — toolLoop 无第二份历史 — SATISFIED
- `toolLoop.ts:114`: `const messages = session.getMessagesForLLM().map(...)` re-derived on EVERY iteration inside the loop — no array survives across iterations.
- Grep proofs (verified this run): `messages.push(` → 0 matches in toolLoop.ts; old `stringifyResult` / `slice(0, 2000)` → 0 matches.
- `git diff 19e2dc0..HEAD -- src/ai/toolLoop.ts` shows removal of the old `messages.push({ role: 'assistant', ... })` lines and the pre-existing dual-history `messages` array.
- ChatPanel passes its single `sessionRef.current` into `runToolLoop` (`ChatPanel.tsx:93,132`); its local `messages` useState is display-only render state (unchanged from before the phase) and never feeds the LLM — the dual-history divergence bug is eliminated by construction.

### SC4: 同一会话回放两次派生完全一致(replay parity)+ 中文 token 不再溢出 — SATISFIED
- `src/ai/__tests__/phase13ReplayParity.test.ts` — marked **PERMANENT (do not delete)**; covers multi-turn session with parallel tool calls, tool_error retry, and >4KB artifact; asserts `deepEqual` + byte-level `JSON.stringify` equivalence across live vs replay A vs replay B. Passes in `npm test`.
- `ChatSession.fromEvents` rebuilds with `__emitEvents: false` (`chatSession.ts:208-242`) — replay never re-emits.
- `src/ai/tokenEstimate.ts`: CJK regex covers radicals/CJK punctuation/kana/unified ideographs/compat/fullwidth; each CJK char = 1 token. `chatSession.ts` budget math (`trimToBudget`/`trimOversizedTurn`/`estimateTokens`) uses it exclusively; grep confirms `length / 4` survives only in comments/test names, never in production logic. Tests anchor: "8 hanzi = 8 tokens" and "60-CJK-char turn dropped by budget that length/4 would keep" — both PASS.

### SC5: >4KB 工具结果在模型历史中只有摘要 + 引用 ID,完整内容在 artifacts 表 — SATISFIED
- `src/ai/events/artifacts.ts`: `ARTIFACT_THRESHOLD_CHARS = 4096`, `ARTIFACT_HEAD_CHARS = 512`; `prepareToolResult` inlines small results, artifact-izes large ones with `summary + artifactId + head(512)`.
- Live wiring: `toolLoop.ts:165-168` — `prepareToolResult` + `getEventStore().saveArtifact(prepared.artifact)` before the tool row enters the session.
- **Executed evidence:** "oversized tool results leave only summary + artifact reference in model history" — 6000-char payload: derived history contains artifactId + `"summary"`, does NOT contain 1000 contiguous payload chars; `getArtifact` returns the full 6000-char content. Replay parity test adds the same bounds on a rebuilt session. Both PASS.

## Requirements Verification

| Req | Verdict | Evidence |
|-----|---------|----------|
| EVT-01 (每步入 SQLite 事件日志,seq + correlation_id) | SATISFIED | eventStore.ts dual implementation; chatSession.ts dual-write; toolLoop wires every step; SC1 test asserts full sequence + correlation stamping. SQL-side seq via `COALESCE(MAX(seq),0)+1` subquery (locked decision honored). |
| EVT-02 (tool_call↔tool_result 严格成对,缺失/重复可检测) | SATISFIED | invariants.ts five violation codes; assertEventStreamValid throws loudly; turn-end audit in toolLoop; SC2 tests pass. |
| EVT-03 (ChatSession = 事件日志投影,消除双历史) | SATISFIED | chatSession.ts rewritten (dual-write, lazy session_created, fromEvents, collapseToolCallAssistants); toolLoop re-derives per iteration; 0 `messages.push(` matches; phase10 contract tests still 4/4 (no regression). |
| EVT-06 (UUID toolCallId) | SATISFIED | `toolLoop.ts:140` `crypto.randomUUID()`; grep `${iteration}-` → 0 matches in toolLoop.ts; git diff shows removal of positional `${iteration}-${call.name}-${toolCallsExecuted}`. |
| EVT-07 (中文 token 估算修复) | SATISFIED | tokenEstimate.ts CJK-aware; consumed by chatSession budget; 0 production `length/4`; regression-anchor tests pass. |
| EVT-08 (>4KB 工具结果 artifact 化) | SATISFIED | artifacts.ts + migration `agent_artifacts` table + toolLoop wiring + 2 dedicated passing tests. |

**6/6 Phase-13 requirements verified complete** — matches REQUIREMENTS.md markings.

## Locked Decisions (13-CONTEXT.md contract) — ALL HELD

| Decision | Evidence |
|----------|----------|
| JS-side writes via tauri-plugin-sql; DDL in Rust migration; llm.rs untouched | Migration 0002 registered in lib.rs; `git diff --stat 19e2dc0..HEAD` does not touch `llm.rs` |
| ChatSession projection + serial promise chain + fromEvents | `chatSession.ts` (`lastEventPromise` chain, `fromEvents` with `__emitEvents: false`) |
| toolCallId = UUID | `toolLoop.ts:140` |
| seq SQL-side + `UNIQUE(session_id, seq)` + WAL | migration lines 6/19; INSERT subquery; JS never allocates seq |
| Event fields per AGENT_MEMORY_REFERENCE §3 | DDL is an exact 10-field match: event_id/session_id/seq/event_type/created_at/workspace_id/product_id/project_id/correlation_id/payload_json; the 6 required event types present in `AGENT_EVENT_TYPES` (session_created/user_message/assistant_message/tool_call/tool_result/turn_ended) |
| >4KB → artifacts | see SC5 |
| CJK token fix | see SC4 |
| Replay parity = PERMANENT test; 0bbc3f2 trace-color canary | `phase13ReplayParity.test.ts` header "PERMANENT ... do not delete"; `toolLoop.ts:182` `isConfirmation ? undefined : errorMessage` intact with 0bbc3f2 canary comment (line 178) |
| Append-only, corrections via new events | `ChatSession.clear()` clears in-memory projection only; comment documents event log append-only |
| runToolLoop / ToolLoopCallbacks signatures unchanged | `git show 19e2dc0:src/ai/toolLoop.ts` vs HEAD: `ToolLoopCallbacks`, `RunToolLoopArgs`, `ToolLoopResult` blocks byte-identical |
| confirmations.ts + ChatPanel.tsx zero-diff | git history: last commits touching them (`789354f`, `6043724`) predate all 13-* commits; absent from the phase diff range |

## Command Outputs (executed this verification)

| Command | Result |
|---------|--------|
| `npm run lint` (`tsc --noEmit`) | **0 errors** (clean exit, no diagnostics) |
| `npm test` (`tsx --test src/stores/__tests__/*.test.ts src/ai/__tests__/*.test.ts`) | **tests 44, pass 44, fail 0, cancelled 0** (duration ~9.3s) — matches the claimed 44/44 |
| Phase-13 test files in suite | phase13EventLog 8/8, phase13ChatSessionProjection 6/6, phase13ToolLoopEvents 4/4, phase13ReplayParity 1/1 (PERMANENT) = 19 tests |
| `git log --oneline` | All 13 wave commits present: 3df4734, ca5bc37, 6d32557, 1eb4af1 (wave 1); adea45d, 8a6ba34 (wave 2); 7b40679, 6fce17a, 275b8dc (wave 3) + plan-metadata commits |
| `git diff --stat 19e2dc0..HEAD` | 22 files; source changes confined to events/, chatSession.ts, toolLoop.ts, tokenEstimate.ts, migration 0002, lib.rs, initializeDatabase.ts (version bump), package.json (test glob), 4 test files |
| Grep: `messages.push(` in toolLoop.ts | 0 matches |
| Grep: `${iteration}-` / `slice(0, 2000)` / `stringifyResult` in toolLoop.ts | 0 matches |
| Grep: `length / 4` in src/ai | comments/test names only — no production logic |

## Residual Risks (accepted — documented in 13-03-SUMMARY, not counted against the phase)

1. **`SqliteEventStore.append` returns `seq: -1`** — authoritative seq is SQL-side by locked decision; callers must read it back via `listEvents`. Documented in code (eventStore.ts:145) and the summary.
2. **Real-table INSERT path has no automated coverage** — Node tests exercise `MemoryEventStore` (identical semantics). SC1's SQLite evidence depends on manual UAT (`tauri:dev` → trigger a tool call → inspect `nova.db` for the paired sequence + `agent_artifacts ≥ 1`). The INSERT SQL and UNIQUE constraint were code-reviewed this verification and are correct; the fix point for any UAT-found issue is Plan 01's store/migration, never JS-side seq allocation.

## Housekeeping Gaps (non-blocking, fix at phase closure)

1. **ROADMAP.md is stale:** still shows "Plans: 1/3 plans executed", only `13-01-PLAN.md` checked, progress table "1/3 In Progress" — contradicted by the actual state (3/3 executed, verified here). STATE.md is correct ("Phase: 13 ... COMPLETE, Plan: 3 of 3").
2. **STATE.md requirements metric undercounts:** lists 5 satisfied (omits EVT-07) while REQUIREMENTS.md correctly marks all 6 complete; EVT-07 implementation is verified above.

## Gaps Requiring a Fix Plan

None. No blockers found. The two housekeeping items above are bookkeeping updates, not goal-achievement gaps.

---
*Verifier: GSD phase verification (goal-backward). All evidence re-derived from on-disk code, git history, and freshly executed commands — executor claims independently confirmed.*
