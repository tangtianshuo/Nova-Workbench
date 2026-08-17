---
phase: 14-confirm-restore-compaction
verified: 2026-08-15
status: PASS
---

# Phase 14 Verification: 持久化确认 + 会话恢复 + 上下文压缩

**Verified:** 2026-08-15
**Verdict:** Goal ACHIEVED
**Status:** PASS

## Goal Achievement

**Phase Goal:** 应用崩溃或重启后,agent 的执行状态(待确认项、最近会话、未完成工具调用关系)可恢复且不会重复执行 — 可恢复执行底座闭环

Every success criterion verified against actual code and executed tests — all claims in the four plan summaries reproduced independently this run. The persistent confirmation store (migration 0003 + canonical-JSON SHA-256 params_hash + atomic conditional-UPDATE consume), the async confirmation facade (zero in-memory Maps, byte-identical API surface), the token-pressure compaction (0.8 gate + pairing-balanced split + append-only + sourced summaries), and the crash-safe session restore (tail cut + orphan interrupted-marking without re-execution) are all present on disk, type-clean, and covered by 36 Phase-14 tests inside an 80/80 green suite. All CONTEXT locked decisions held, including the ChatPanel constructor canary and the unchanged `runToolLoop`/`ToolLoopCallbacks` signatures. Real kill-process behavior remains manual UAT (accepted limitation, recorded below).

## Gate Commands (actual output)

| Command | Result |
|---------|--------|
| `npm run lint` | `tsc --noEmit` — **0 errors, exit 0** |
| `npm test` | **tests 80 / pass 80 / fail 0** (duration ~8.6 s), exit 0 |
| `npx tsx --test` on the 5 phase-14 suites | **tests 36 / pass 36 / fail 0** (9 store + 7 facade + 8 compaction + 9 restore + 3 integration) |
| `npx tsx --test src/ai/__tests__/phase13ReplayParity.test.ts` | **1/1 pass** — PERMANENT replay-parity canary unbroken |

## Success Criteria Verification

### SC1: 杀进程重启后挂起的待确认项仍在确认队列;确认消费后重启不再出现(原子条件 UPDATE) — SATISFIED

- **Persistence substrate:** `src-tauri/migrations/0003_confirmation_candidates.sql` creates `agent_confirmation_candidates` (PK `confirmation_token`, `kind` CHECK `('knowledge_write','destructive_action')`, `status` CHECK `('pending','confirmed','consumed','rejected')`, `params_hash`, `params_json`, created/expires/confirmed/consumed/rejected timestamps) + composite `(kind,status,expires_at)` and `params_hash` indexes + idempotent `schema_version → 3`. Registered in `src-tauri/src/lib.rs` (`Migration { version: 3 }`, `include_str!`); `APP_SCHEMA_VERSION = 3` in `src/stores/storage/initializeDatabase.ts`. Forward-only: zero DROP statements.
- **params_hash:** `src/ai/paramsHash.ts` — `canonicalJsonStringify` (recursive key sort, array order preserved matching old `sameDraft` positional semantics, `undefined` dropped) + WebCrypto `crypto.subtle` SHA-256 → 64-char lowercase hex. Known vector `'abc' → ba7816bf…` asserted in the store test (line 35); key-order invariance + array-order sensitivity both tested.
- **Atomic consume (the core claim):** `SqliteConfirmationStore.consume` (`confirmationStore.ts:286-316`) pre-validates (not_found/expired/not_confirmed/params_mismatch) then executes `UPDATE … SET status='consumed', consumed_at=$2 WHERE confirmation_token=$1 AND status='confirmed' AND consumed_at IS NULL AND rejected_at IS NULL AND expires_at > $2` and throws `already_settled` unless `rowsAffected === 1` — exactly one concurrent winner. `MemoryConfirmationStore.consume` mirrors the semantics with synchronous check+mutation.
- **Facade migration:** `src/ai/confirmations.ts` rewritten — `grep -c "new Map"` = 0; all 11 original public functions kept their names with only `async`/`Promise<>` added (verified by `git show 4d0c388:src/ai/confirmations.ts` comparison); all 7 error strings byte-identical; `listPendingKnowledgeWrites` / `listPendingDestructiveActions` added for restart re-listing; both consume paths re-hash via `computeParamsHash` (tamper detection).
- **All consumers awaited:** `knowledgeWrite.ts:129,131`; `taskAdvanced.ts:65,71,183,189`; `scheduleAdvanced.ts:90,96`; `ChatPanel.tsx:243,268,281,313` (+ `void`-wrapped reject onClick at 391, 405); `ProductKnowledgeTab.tsx:101,124,428`.
- **Executed evidence:** store suite — `Promise.allSettled` double-consume yields exactly 1 fulfilled / 1 rejected with `code === 'already_settled'` (lines 107-118); TTL-expired rows (`ttlMs: -1000`) cannot confirm/consume/list. Facade suite — restart survival via re-listing for BOTH streams; sequential second consume rejected `/invalid or expired/`; concurrent double-consume succeeds exactly once; tampered draft (content change + tag reorder) rejected with mismatch message while the original stays consumable; reject removes from queue; expired candidate disappears.
- **Caveat (accepted):** real kill-process restart is simulated in Node via persistent-store re-listing against the memory impl; real-process UAT under `tauri:dev` is manual (UAT-A).

### SC2: 崩溃在 tool_call 与 tool_result 之间 → 恢复后该 tool_call 标记 interrupted,业务数据无重复写入 — SATISFIED

- **Orphan detection:** `findOrphanToolCallEvents` (`sessionRestore.ts:40-52`) scans the seq-sorted stream pairing `tool_call`/`tool_result` by `toolCallId`; previously-appended interrupted markers count as results (idempotent).
- **Settlement by APPEND, never re-execution:** `doRestoreLatestSession` (`sessionRestore.ts:81-99`) appends a `tool_result` event per orphan with `{ ok: false, interrupted: true, reason: 'app-restart' }` preserving the original `correlationId`. Grep proofs this run: `executeTool` refs in sessionRestore.ts = **0**; `DELETE FROM|UPDATE ` refs = **0**. There is no retry/re-run code path anywhere in the restore module.
- **Executed evidence:** "orphan tool_call is marked interrupted" — marker exists with `ok:false`, `interrupted:true`, `reason:'app-restart'`; `checkEventStream(events)` deep-equals `[]` after marking; marker lives in the trimmed tail (`seq > cutSeq`). "restore is idempotent" — second restore appends nothing, exactly one marker exists, zero orphans found. "restore never re-executes tools" — every new event is `tool_result`, zero re-emitted `tool_call`, one new event per orphan. Integration: WAIT (`awaitingConfirmation`) tail is already paired → nothing marked interrupted, pending candidate re-surfaces.
- **Caveat (accepted):** real mid-tool-loop kill verified only via fixtures in Node; real-process UAT manual (UAT-C).

### SC3: 恢复的会话可继续对话,历史完整;崩溃尾切到最后完整 turn,无残缺消息 — SATISFIED

- **Crash-tail cut:** `findCrashTailCutSeq` (`sessionRestore.ts:29-35`) returns the largest `turn_ended` seq (0 when no complete turn); projection filtered to `seq <= cutSeq` (lines 109-111). Tail events remain in the append-only log; they never reach the LLM projection. A `compaction_completed` stranded in the tail is conservatively ignored with re-expansion to raw history (no data loss, documented at lines 104-108).
- **Continue-conversation:** `ChatSession.resumeEventEmission` (`chatSession.ts:153-156`) re-enables live emission on the ORIGINAL stream and forces `sessionCreatedEmitted = true` so `session_created` is never re-emitted. `tokenBudget` round-trips from the `session_created` payload with 8 000 fallback.
- **ChatPanel wiring:** mount-time `useEffect` (`ChatPanel.tsx:108-138`) with `cancelled` flag + module-level promise dedupe (`sessionRestore.ts:54-62`) for StrictMode double-mount; `sessionRef.current` swapped to the restored session; history rendered (user + non-tool assistant messages); newest pending candidates re-surfaced. `restoreComplete` flips on EVERY terminal path (`.then` line 129 + `.catch` line 133) and gates submission in 3 places: handleSubmit guard (151), Enter keydown (323), submit-button `disabled` (438) — the textarea stays editable, only sending is blocked, so no user message can be orphaned in the throwaway pre-restore session.
- **Executed evidence:** "crash tail is cut to the last complete turn" — `cutSeq === turn_ended.seq`, `trimmedTailEventCount === 3` (2 crash-tail events + 1 marker), crash-tail content excluded from projection while complete-turn content is present; "no complete turn" — `cutSeq 0` + empty LLM projection + orphan still marked; "restores the most recent of multiple sessions"; integration — post-restore write lands at `seq = maxSeq + 1` on the same `sessionId` with `session_created` count staying exactly 1.
- **Caveat (accepted):** real restart → continue-conversation is manual UAT (UAT-D).

### SC4: token 压力 ≥0.8×窗口触发压缩;只在配对平衡处切分;agent_events 无丢失;摘要带事件范围/生成时间/模型 — SATISFIED

- **0.8 gate:** `COMPACTION_PRESSURE_RATIO = 0.8` (`compaction.ts:14`); `maybeCompactSession` returns null when `tokenPressure(session) < 0.8` unless `force` (line 128). Trigger wired at the top of every toolLoop iteration BEFORE message derivation (`toolLoop.ts:117-119`).
- **Pairing-balanced split only:** `findCompactionSplitPoint` (`compaction.ts:58-77`) accepts a candidate only when it `turn_ended` (line 68), suffix tokens fit the 0.5×window keep-target (70), prefix contains ≥1 `turn_ended` (72), and Phase 13's `checkEventStream(prefix).length === 0` (73) — the pairing invariant IS the split oracle. Returns 0 → compaction skipped when nothing qualifies.
- **Append-only / zero event loss:** only two `store.append` calls (`compaction_started`, `compaction_completed`); repo-wide grep `DELETE FROM agent_events|UPDATE agent_events` = **0 matches**. Compaction changes only the model-visible projection (`applyCompactionResult`, `chatSession.ts:307-310`).
- **CMP-02 provenance:** `compaction_completed` payload = `coveredSeqStart/End`, `summaryText`, `model` (provider, or `ollama:<model>`), `generatedAt` + `coveredEventCount`, `tokenCountBefore`, `startedAt` (`compaction.ts:152-168`). Earlier history enters context as a sourced summary: `formatCompactionSummary` → `[历史压缩摘要 | 覆盖事件 seq X-Y | 生成于 ISO | 模型 M]` prepended by `getMessagesForLLM` (`chatSession.ts:45-47, 324-326`); compaction-aware `fromEvents` replays only `seq > coveredSeqEnd` and hydrates the record (`chatSession.ts:278-302`); successive compactions carry `[earlier compressed summary]` forward (`compaction.ts:86-87`).
- **Executed evidence (8-test suite):** no compaction below 0.8 (no `compaction_started` appended); trigger at ≥0.8 keeps original events byte-identical + exactly 2 new events in order; provenance assertions (`coveredSeqStart === 1`, `generatedAt` parseable, `model === 'deepseek'`, ollama variant `ollama:qwen3:8b`); split point pairing-balanced (`checkEventStream(prefix) === []`) on a `turn_ended` with the unpaired tail left in the suffix; projection leads with the sourced summary containing seq range + model + summaryText; replay parity across compaction; no-valid-split → skip with log untouched; successive compaction carries the earlier summary.
- **Caveat (accepted):** long-conversation crossing of the real 0.8 gate under `tauri:dev` is manual UAT (UAT-E); tests use an injected fake summarizer (no real LLM calls), which is the correct test isolation, not a gap.

## Requirements Verdicts

| REQ | Verdict | Evidence |
|-----|---------|----------|
| **EVT-04** (restart restores most recent session; orphan tool_calls interrupted, never auto-retried; crash tail cut to last complete turn) | SATISFIED | `sessionRestore.ts` (tail cut + append-only interrupted markers + pending-confirmation re-surfacing incl. unfinished approvals), `EventStore.listSessions` both impls (`eventStore.ts:94-109, 206-217`), `resumeEventEmission`, ChatPanel restore wiring + 3 submit gates; 12 tests. Kill-process path = manual UAT (accepted). |
| **EVT-05** (confirmation candidates → SQLite table; params_hash = canonical-JSON SHA-256; expiry; atomic conditional-UPDATE consume; restart-safe, no double-consume) | SATISFIED | Migration 0003 (registered, `APP_SCHEMA_VERSION=3`), `paramsHash.ts`, `confirmationStore.ts` dual impl with conditional UPDATE + `rowsAffected` check, facade rewrite with zero Maps, 16 tests across store + facade suites. Real-SQLite path = manual UAT (accepted). |
| **CMP-01** (≥0.8×window trigger; split only at pairing-balanced points; original event log lossless) | SATISFIED | `COMPACTION_PRESSURE_RATIO = 0.8` gate; `checkEventStream(prefix) === 0` split condition; 0 DELETE/UPDATE on `agent_events`; toolLoop trigger +9 lines; 8 tests. |
| **CMP-02** (summary records covered event range, generation time, model; earlier history enters context as sourced summary) | SATISFIED | `compaction_completed` payload fields; `formatCompactionSummary` attribution; `getMessagesForLLM` prefix; provenance + replay-parity tests. |

## CONTEXT Locked Decisions — Held

| Locked decision | Status |
|---|---|
| EVT-05 SQLite migration, SHA-256 canonical params_hash, expiry, atomic conditional UPDATE, both candidate streams | Held — all verified above; `kind` column discriminates both streams in one table |
| EVT-04 restore of most recent session incl. unfinished approvals; orphan → interrupted, never auto-retried; crash tail cut to last complete turn | Held — pending candidates re-surfaced by restore (integration test 2); 0 executeTool refs; tail cut proven |
| CMP-01 ≥0.8 trigger; pairing-balanced split only; `agent_events` never lose events | Held |
| CMP-02 summary records range/time/model; sourced summary enters context | Held |
| Phase 13 inheritance: EventStore-mediated writes, single derived history, `runToolLoop`/`ToolLoopCallbacks` signatures unchanged, append-only log | Held — `git diff 4d0c388..HEAD -- src/ai/toolLoop.ts` = exactly +9 additive lines (1 import + 8 trigger), interface blocks byte-identical; PERMANENT replay-parity test green; `messages` re-derived every iteration |
| Dual-impl pattern (memory for Node tests/web dev, isTauri() branch), tests runnable without Tauri | Held — singleton trio mirrors `eventStore.ts`; all 36 phase-14 tests run in plain Node |
| ChatPanel constructor canary `useRef(new ChatSession({ tokenBudget: 8_000 }))` byte-identical | Held — found at line 95 (shift from 93 caused by 14-02/14-04 additions, anticipated by the orchestrator; string matches byte-for-byte); constructor still side-effect-free (`NOTE: no event emission here` canary at `chatSession.ts:140`) |

## Residual Risks / UAT Items (accepted, non-blocking)

1. **Real kill-process restart behavior (SC1/SC2/SC3)** is simulated via fixtures against the memory implementations in Node. The real-process UAT checklist from the plans remains manual under `tauri:dev`: UAT-A (pending confirmation survives kill → confirm → consumed), UAT-C (kill mid tool-loop → interrupted marker, no duplicate business write), UAT-D (restart → history visible → new message continues same session_id at seq max+1), UAT-E (long conversation crosses 0.8 gate → compaction events, event count only grows).
2. **`SqliteConfirmationStore` real-SQLite path is untested in Node** — the memory implementation covers the semantics and the SQL is code-reviewed (conditional UPDATE + rowsAffected). Same residual class as Phase 13's `SqliteEventStore.append` real-INSERT UAT item, which carries over.
3. **`SqliteEventStore.append` returning `seq = -1`** is handled in restore by re-reading the event list after orphan-marker appends (`sessionRestore.ts:100-102`) — code-verified; real-DB sequencing confirmed only by UAT-D.

## Gaps

None blocking. All four success criteria, all four requirements, and every locked CONTEXT decision are evidenced in code and passing tests. The two caveats above are explicitly accepted phase boundaries (manual UAT against real Tauri/SQLite), not implementation gaps.

## Recommendation

Mark Phase 14 complete: ROADMAP `Plans: 4/4`, requirements EVT-04/EVT-05/CMP-01/CMP-02 → Complete; schedule the UAT-A/C/D/E checklist items (plus the carried-over Phase 13 SQLite-append UAT) as the manual sign-off before or alongside Phase 15 start.

---
*Verified: 2026-08-15 — goal-backward verification against actual code, executed commands, and git history (trust-nothing re-check of all four plan summaries).*
