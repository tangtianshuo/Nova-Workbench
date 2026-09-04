# Phase 20: 分支与卡片操作 - Research

**Researched:** 2026-08-18
**Domain:** Fork projection over the append-only event log (pure function) + hover UI + clipboard (codebase-grounded, zero new deps)
**Confidence:** HIGH

## Summary

This phase is a codebase extension, not an ecosystem pick. Every seam was read directly. The apparent contradiction in the roadmap ("引用式 fork 零事件复制" vs "seq 归一化 + compaction remap") resolves precisely like this: **the child session stores ZERO copied parent events; its own rows in `agent_events` start at seq 1 under the child `session_id`. "归一化" happens at PROJECTION time**: a pure `buildForkEventStream(parentPrefix, childEvents, cutSeq)` concatenates the parent prefix (parent's own seqs, already contiguous 1..cut since prefix = `seq <= cutSeq`) with the child's own events (offset by +cut), producing a normalized 1..N stream. This is exactly what SUMMARY.md prescribed ("re-seqs the combined stream 1..N ... so fromEvents, crash-tail, and orphan logic stay untouched").

The load-bearing detail: **every consumer that today calls `store.listEvents(sessionId)` must instead call a fork-aware `resolveSessionEvents(sessionId)`** for the projection to include the parent prefix — `restoreSession` (sessionRestore.ts:96) and `maybeCompactSession` (compaction.ts:130). If compaction is missed, a forked child under token pressure would compact only its own events and the parent prefix would be silently dropped from the LLM projection at the next restore (`fromEvents` filters `seq > coveredSeqEnd`). If restore is missed, `switchSession(childId)` returns `not_found` because the child has no events of its own until its first message — fixed by appending a `session_forked` marker event to the child at fork time (gives the child ≥1 row, records provenance in the audit log, and `rebuildMessages`'s `default: break` already ignores it).

Cut-point rule: the fork cut is the **first `turn_ended` with `seq > seq(assistant_message event)`** in the parent stream, and the prefix must pass `checkEventStream` clean (this is `findCompactionSplitPoint`'s pairing rule, and it structurally guarantees no orphan tool_call enters the prefix — so restore's orphan-marker appends can never touch parent events). Mid-turn / no-following-turn_ended cuts are rejected. The trickiest UI seam is mapping a store message back to its event: `chatConsoleStore` messages include **store-only synthesized assistant strings** ("已取消本次知识库写入", "PRD 已落槽..." — chatConsoleStore.ts:365/390/415/534) with no backing event, so index-zipping store messages against the event projection misaligns. Resolution: zip by ordered content match; store-only messages get copy but no fork affordance.

**Primary recommendation:** Ship in two waves. Wave 1 (pure, test-first): `buildForkEventStream` + `resolveSessionEvents` + fork cut locator + repo `createForkSession` (extends sessionRepo with `parentSessionId`/`forkCutSeq` write) — node:test suite covering pairing invariants, compaction remap, replay parity, mid-turn rejection, fork-of-fork. Wave 2 (UI): hover toolbar in AgentConsole.tsx message list, `navigator.clipboard.writeText` + toast on failure, store action `forkFromMessage` → sessions row + `session_forked` event → `switchSession(childId)`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FORK-01 | hover assistant 卡片浮出分支/复制 icon | AgentConsole.tsx:136-154 is the single message-render site (both Drawer and workspace hosts); Tailwind `group` + `opacity-0 group-hover:opacity-100` pattern; Phosphor `GitBranch`/`Copy` size 14 |
| FORK-02 | 以 turn_ended 为切点创建引用式 fork,UI 跳转,原会话不动 | buildForkEventStream (projection-time normalization, zero copy); session_forked marker event makes restoreSession(childId) non-null; switchSession existing engine |
| FORK-03 | 复制 icon → assistant 消息全文进剪贴板,失败 toast | navigator.clipboard.writeText (8 in-repo precedents); emitToast/bindToast error path; packaged-build caveat documented |
| LIST-03 | 分支 session 显示分支徽章,可识别来源 | sessions 表已有 parent_session_id/fork_cut_seq (0007); sessionRepo.listSessionsByWorkspace already returns them; Phase 20 = fork 元数据落库 + repo 返回父会话标题,徽章 UI 数据就绪 |
</phase_requirements>

## Standard Stack

Zero new dependencies (verified against package.json + Cargo.toml).

### Core
| Item | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ChatSession.fromEvents + resumeEventEmission (existing) | — | Fork projection primitives | Already compaction-aware, never re-emits, resumes on original stream (chatSession.ts:150-160, 293-317) |
| checkEventStream (existing) | — | Prefix validity gate | Same rule findCompactionSplitPoint uses (compaction.ts:73) |
| navigator.clipboard.writeText | WebView2/WKWebView builtin | FORK-03 | 8 in-repo precedents (FileArchiveView.tsx:139, WorkspaceSummaryModal.tsx:67, TaskKanban) |
| node:test + tsx --test (existing) | — | Fork pure-function tests | 190 existing tests, `src/ai/__tests__/` glob |
| @phosphor-icons/react (existing) | 2.1.10 | GitBranch / Copy duotone icons | Project convention |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| navigator.clipboard | @tauri-apps/plugin-clipboard-manager | Extra Rust dep + capability grant for what the webview does. Use navigator.clipboard, toast on failure, verify in packaged-build UAT; add plugin only if it fails (STACK.md/PITFALLS.md agreed resolution) |
| Projection-time fork resolution | Copy parent events into child rows at fork | Copy duplicates storage and breaks "引用式" locked decision; also breaks replay parity (two copies of one event diverge). Never copy |

**Installation:** none.

## Architecture Patterns

### Recommended Structure
```
src/ai/fork.ts                    (NEW ~120 LOC: buildForkEventStream, findForkCutSeq, resolveSessionEvents)
src/ai/__tests__/fork.test.ts     (NEW: pure-function suite, written FIRST)
src/ai/sessionRepo.ts             (EXTEND: createForkSession / fork-aware list)
src/ai/sessionRestore.ts          (EXTEND: listEvents → resolveSessionEvents, one line + fork tokenBudget inherit)
src/ai/compaction.ts              (EXTEND: maybeCompactSession listEvents → resolveSessionEvents, one line)
src/stores/chatConsoleStore.ts    (EXTEND: forkFromMessage action)
src/components/AgentConsole.tsx   (EXTEND: hover toolbar on assistant bubbles)
```

### Pattern 1: buildForkEventStream — the exact rules (P-C encoding)
**What:** Pure function producing the fork session's effective event stream.

```typescript
// src/ai/fork.ts
// cutSeq is in the PARENT's seq space. parentEvents = FULL normalized parent
// stream (already resolved if the parent is itself a fork). childEvents = the
// child's own rows (seq 1..M in child space).
export function buildForkEventStream(
  parentEvents: AgentEvent[],   // sorted by seq, contiguous 1..N (parent space)
  cutSeq: number,               // a turn_ended seq; prefix = seq <= cutSeq
  childEvents: AgentEvent[],    // sorted, contiguous 1..M (child space)
): { events: AgentEvent[]; invalid?: 'MID_TURN' | 'UNBALANCED' | 'NO_PREFIX_TURN' } {
  const prefix = parentEvents.filter((e) => e.seq <= cutSeq);
  // Gate 1: cut event must exist and be turn_ended (mid-turn rejection)
  const cutEvent = parentEvents.find((e) => e.seq === cutSeq);
  if (!cutEvent || cutEvent.eventType !== 'turn_ended') return { events: [], invalid: 'MID_TURN' };
  // Gate 2: prefix must contain >= 1 complete turn
  if (!prefix.some((e) => e.eventType === 'turn_ended')) return { events: [], invalid: 'NO_PREFIX_TURN' };
  // Gate 3: pairing + seq invariants hold on the prefix (no orphan tool_call)
  if (checkEventStream(prefix).length > 0) return { events: [], invalid: 'UNBALANCED' };

  // Normalization: prefix seqs are ALREADY 1..cut (parent prefix starts at 1).
  // Child events get offset += cutSeq. Build the seq map for remap.
  const remap = new Map<string, number>(); // eventId -> normalized seq
  const out: AgentEvent[] = [];
  prefix.forEach((e, i) => { remap.set(e.eventId, i + 1); out.push({ ...e, seq: i + 1 }); });
  childEvents.forEach((e, i) => { remap.set(e.eventId, prefix.length + i + 1); out.push({ ...e, seq: prefix.length + i + 1 }); });

  // Remap compaction payloads that reference seqs (the ONLY payload fields in
  // the vocabulary that store seq numbers — verified by reading compaction.ts):
  //   compaction_started.payload.splitSeq
  //   compaction_completed.payload.coveredSeqStart / coveredSeqEnd
  for (const e of out) {
    if (e.eventType === 'compaction_started' && typeof e.payload.splitSeq === 'number') {
      const src = [...prefix, ...childEvents].find((p) => p.eventId === e.eventId)!;
      e.payload = { ...e.payload, splitSeq: remap.get(src.eventId) ? /* source's own referenced events */ remapSeq(e.payload.splitSeq, src, remap) : e.payload.splitSeq };
    }
    // coveredSeqStart/coveredSeqEnd map through: for prefix events these are
    // parent-space seqs <= cutSeq → IDENTITY under this normalization (prefix
    // keeps 1..cut); for child events they are child-space seqs → += prefix.length.
  }
  return { events: out };
}
```

**Why remap is nearly trivial here (and must still be explicit):** because the prefix keeps its original seqs (1..cut) and only child events shift by a constant `prefix.length`, the remap rule degenerates to:
- `coveredSeqStart/End/splitSeq` inside **prefix** compaction events: **identity** (parent space == normalized space for seq ≤ cut).
- `coveredSeqStart/End/splitSeq` inside **child** compaction events: **+ prefix.length** (child space → normalized space).

Encode it as this two-case rule, not a general map — smaller diff, and a test locks both cases. If fromEvents later reads an un-remapped `coveredSeqEnd` (child space, e.g. 3 when normalized is 3+cut), it would replay the parent prefix as if it were post-compaction suffix → wrong projection. That is the exact failure the remap prevents.

**When to use:** any code that needs "the events of session X" for projection/replay: restore, compaction, fork-of-fork resolution.

### Pattern 2: resolveSessionEvents — fork-aware listEvents
```typescript
export async function resolveSessionEvents(sessionId: string): Promise<AgentEvent[]> {
  const store = getEventStore();
  const own = await store.listEvents(sessionId);
  const meta = await getSessionRepo().get(sessionId);       // needs a get-by-id (add to repo)
  if (!meta?.parentSessionId || meta.forkCutSeq == null) return own;
  const parent = await resolveSessionEvents(meta.parentSessionId); // recursion = fork-of-fork free
  return buildForkEventStream(parent, meta.forkCutSeq, own).events;
}
```
Switch exactly two call sites: `sessionRestore.ts:96` (`let events = await store.listEvents(targetSessionId)` → `resolveSessionEvents`) and `compaction.ts:130` (`maybeCompactSession`). Everything downstream (findOrphanToolCallEvents, findCrashTailCutSeq, fromEvents) operates on the normalized stream unchanged. **Critical safety property:** orphan-marker appends (sessionRestore.ts:107) always target `targetSessionId` — since the prefix passed Gate 3 (balanced), orphans can only exist in the child's own tail, so parent rows are never appended-to from a child restore. Compaction appends (`compaction_started/completed`) also carry `session.sessionId` = the live (child) session — correct: the child's compaction event lands in child rows with child-space seq, and Pattern 1's +prefix.length remap keeps it consistent on re-resolution. **But note:** a child compaction's `coveredSeqEnd` is child-space; `applyCompactionResult(record, suffix)` receives suffix from the *normalized* stream in `maybeCompactSession` — pass normalized events to it, and the record's coveredSeq fields must be written in the same space the restoring `fromEvents` will compare against (normalized). Test this exact round-trip (compaction in child → app restart → restore child → projection parity).

### Pattern 3: fork creation sequence (FORK-02)
1. Guard `loading` (SESS-04 lock; streaming turn has no turn_ended yet anyway).
2. `const events = await resolveSessionEvents(activeSessionId)` (parent may itself be a fork).
3. Locate the target assistant message's event: zip store messages against the event projection (user + assistant-without-toolCallId, same filter switchSession uses at chatConsoleStore.ts:236) **by ordered content match**; the first content mismatch marks a store-only synthesized message (chatConsoleStore.ts:365/390/415/434/534/548 inject assistant strings with no event) — those get no fork icon.
4. `cutSeq = seq of first turn_ended with seq > assistantSeq` (this is `findCrashTailCutSeq` over the suffix, or a one-line scan). No such event → reject (mid-turn).
5. `const childId = crypto.randomUUID()`; `sessionRepo.createForkSession({ sessionId: childId, workspaceId, parentSessionId, forkCutSeq: cutSeq, title: null })` — extends repo (new SQL: INSERT with parent columns; MemorySessionRepo mirror).
6. Append marker: `store.append({ sessionId: childId, eventType: 'session_forked', payload: { parentSessionId, parentCutSeq: cutSeq, parentEventCount: prefix.length } })` — gives the child ≥1 row so `restoreSession(childId)` is non-null, and records provenance in the audit log. `rebuildMessages` default:break ignores it (no visible message). seq allocates to 1 (SQL MAX+1 on empty child). NOTE: `ChatSession` lazy `ensureSessionCreatedEvent` fires on the child's first real message and emits `session_created` at seq 2 — harmless (duplicate marker class, both ignored by projection); alternatively stamp `sessionCreatedEmitted` — not worth it.
7. `await switchSession(childId)` — existing Phase 19 engine now resolves parent prefix and renders history verbatim. Original session rows untouched (append-only, zero writes to parent).
8. tokenBudget: child inherits parent's `session_created.payload.tokenBudget` via the resolved stream (sessionRestore.ts:136-139 already reads it from the resolved events — free).

### Pattern 4: hover toolbar (FORK-01) — AgentConsole.tsx
The message list (AgentConsole.tsx:136-154) is the only render site and serves both hosts (Drawer + workspace). Wrap the outer row:

```tsx
<div key={message.id} className={cn('group flex', ...)}>
  <div className="flex flex-col ...">
    <div className={cn('max-w-[88%] ...', bubble classes)}>{content}</div>
    {message.role === 'assistant' && (
      <div className="mt-1 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <button onClick={() => forkFromMessage(message.id)} disabled={!message.forkable || loading}
                className="text-text-tertiary hover:text-text-primary" title="从这里创建分支">
          <GitBranch size={14} />
        </button>
        <button onClick={() => copyMessage(message.content)} className="..." title="复制">
          <Copy size={14} />
        </button>
      </div>
    )}
  </div>
</div>
```
Mark `forkable` when Pattern 3 step 3 matched the message to a real event (compute once per messages-change in the store action `resolveForkableMessages()`, or lazily at first hover — prefer eager, ~20 LOC, avoids per-hover async). Copy handler: `navigator.clipboard.writeText(content).then(() => toast success, () => emitToast error '复制失败')` — never silent (FORK-03).

### Pattern 5: LIST-03 badge data
`SessionRepo.listSessionsByWorkspace` already returns `parentSessionId`/`forkCutSeq` (sessionRepo.ts:32-34). Phase 20 adds: (a) `createForkSession` writes those columns; (b) enrich the list query with the parent's title (`LEFT JOIN sessions p ON p.session_id = s.parent_session_id` → `parentTitle`) so the badge "来自 <parent title>" is one query, no N+1; (c) after the fork jump, AgentConsole shows a minimal provenance line/badge (e.g., "已从原会话创建分支" in the console header area) — the session LIST itself is Phase 21; when it lands, the badge reads `parentSessionId != null` + `parentTitle`. Roadmap decision (STATE.md): 徽章数据同落 Phase 20, 列表本体归 Phase 21.

### Anti-Patterns to Avoid
- **Never copy parent events into child rows** — breaks 引用式 locked decision, doubles storage, diverges audit.
- **Never rewrite/remap parent events in place** — append-only is the architecture invariant (Phase 13).
- **Never allocate seq in JS** for real appends — SQL-side MAX+1 is the locked pattern (eventStore.ts:148-156).
- **Don't special-case forks inside `ChatSession.fromEvents`** — SUMMARY.md: "Prefix concatenation is a pure projection-time function, never inside fromEvents". Fork resolution stays in fork.ts/restore.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Projection rebuild | New fork-specific message reconstruction | ChatSession.fromEvents on the normalized stream | Already compaction-aware, tested, replay-parity-locked |
| Prefix validity check | Custom pairing scan | checkEventStream (invariants.ts) | The five violation codes are the canonical gate |
| Session switch + restore | New fork-switch path | switchSession(childId) + restoreSession (Phase 19 engine) | Free verbatim restore; only listEvents seam changes |
| Clipboard | Tauri clipboard plugin / execCommand fallback stack | navigator.clipboard.writeText + toast on catch | 8 in-repo precedents; add plugin only on proven packaged-build failure |
| Toast | Console log / silent | emitToast via bindToast (chatConsoleStore.ts:63-71) | Bound to useToast by AgentConsole already |

**Key insight:** every heavy primitive (fromEvents, resumeEventEmission, checkEventStream, switchSession, sessions table columns) already exists. This phase is one pure function, one resolver, one repo method, and one hover toolbar.

## Common Pitfalls

### Pitfall 1: Compaction in a forked child silently drops parent history
**What goes wrong:** `maybeCompactSession` reads `store.listEvents(childId)` = child rows only → `coveredSeqEnd` is child-space and small → next restore's `fromEvents` filters `seq > coveredSeqEnd` and the parent prefix vanishes from the LLM projection (log intact, context wrong — and the compaction transcript never summarized the parent turns, so they're gone from context entirely).
**How to avoid:** `resolveSessionEvents` in maybeCompactSession; write the child's compaction `coveredSeq*` in normalized space (or child space consistently — pick ONE and lock with a round-trip test: compact child → restore → projection parity).
**Warning signs:** forked child's LLM context loses early turns after a compaction.

### Pitfall 2: switchSession(childId) returns not_found immediately after fork
**What:** explicit-id restore treats empty event list as not-found (Phase 19 decision, STATE.md).
**How to avoid:** the `session_forked` marker append (Pattern 3 step 6) guarantees ≥1 row.
**Warning signs:** fork click silently fails / reason 'not_found'.

### Pitfall 3: Store-only synthesized assistant messages misalign the message→event zip
**What:** chatConsoleStore injects assistant strings ("已取消本次知识库写入" etc.) with no events; positional zip forks from the WRONG turn.
**How to avoid:** ordered content-match zip; unmatched message = no fork affordance (copy still works). Deliberate ceiling: two identical-content assistant messages resolve to the first match — acceptable, adjacent duplicates are one turn apart at most (`# ponytail:` note it).
**Warning signs:** fork icon on a confirmation/rejection ack message.

### Pitfall 4: Mid-turn / orphan-carrying cut corrupts the child at birth (SUMMARY pitfall 1)
**What:** cutting inside a tool pair makes every future `checkEventStream` on the child fail (MISSING_TOOL_RESULT), and restore would append an interrupted tool_result into the CHILD for a call that actually completed in the parent — falsified audit.
**How to avoid:** Gates 1-3 in buildForkEventStream (turn_ended exists, ≥1 complete turn, checkEventStream clean). Reuse of findCompactionSplitPoint semantics.
**Warning signs:** SEQ_GAP / MISSING_TOOL_RESULT issues in child stream tests.

### Pitfall 5: navigator.clipboard fails in packaged build (PITFOLLS #11)
**What:** works in dev, throws NotAllowedError in packaged WebView2.
**How to avoid:** toast on catch (never silent) — shipped correct either way; flag packaged-build copy for the phase UAT; add plugin-clipboard-manager + capability entry only if UAT fails.
**Warning signs:** FORK-03 UAT step failing on Windows packaged build.

### Pitfall 6: fork_cut_seq space confusion
**What:** `fork_cut_seq` stored in the sessions row is in the PARENT's raw seq space; if any code compares it against the child's normalized stream seqs, cuts land in the wrong place.
**How to avoid:** document on the column/repo: "parent-space seq, used ONLY as input to buildForkEventStream". Test fork-of-fork explicitly (child's own cut is in ITS parent's space, resolved recursively).

### Pitfall 7: forking while streaming
**What:** loading turn has no turn_ended; cut search hits the live tail.
**How to avoid:** `loading` guard in forkFromMessage (same SESS-04 bottom line as startNewSession/switchSession) + Gate 1 rejects structurally.

## Code Examples

### Core test cases (write FIRST — success criterion 5)
```typescript
// src/ai/__tests__/fork.test.ts (node:test, fake events helper mirrors existing tests)
// 1. pairing invariants: fork stream with tool-heavy turns → checkEventStream === []
// 2. seq normalization: prefix 1..cut preserved, child events cut+1..cut+M, contiguous
// 3. compaction remap: compaction_completed in child payload → coveredSeqEnd += cut;
//    compaction in prefix → identity; fromEvents(normalized) replays correct suffix
// 4. replay parity: projection of fork === parent projection up to cut (messages equal)
// 5. mid-turn rejection: cut on tool_call seq → { invalid: 'MID_TURN' }
// 6. orphan prefix rejection: prefix with unpaired tool_call → 'UNBALANCED'
// 7. fork-of-fork: child's resolved stream becomes parent prefix for grandchild
// 8. round-trip: fork → append child turn → compact child (force) → resolveSessionEvents
//   → ChatSession.fromEvents → projection contains summary + post-compaction turns only
```

## State of the Art

Not applicable (no ecosystem movement). All claims verified by direct code reads this session.

## Open Questions

1. **Does `sessionRepo` need a `getSession(sessionId)`?** resolveSessionEvents needs parent metadata by id; listSessionsByWorkspace could be filtered but a direct get is cleaner. ~10 LOC, planner's call on placement.
2. **LIST-03 visible surface in Phase 20** — no real session list exists until Phase 21. Recommendation (aligned with roadmap decision): Phase 20 = metadata + parentTitle enrichment + a minimal in-console provenance badge after the fork jump; the list badge renders in Phase 21 reading ready data. If the verifier demands the literal "列表中显示徽章" in Phase 20, pull the earliest mock-list surface forward — check AgentWorkspaceView during planning.
3. **Child `session_created` duplication** (marker at seq 1, session_created at seq 2): harmless but slightly noisy audit. Alternative: suppress via a `suppressSessionCreated` option. Recommend ship as-is, note in UAT.

## Environment Availability

Step 2.6: no new external dependencies (all existing: Node 24.14 + node:test, Tauri webview clipboard, existing repos). Nothing to probe.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test via tsx --test (existing) |
| Config file | package.json `test` script (globs src/ai/__tests__ + stores) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (190 tests, same command) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FORK-02 | buildForkEventStream invariants/remap/parity/mid-turn | unit | `npx tsx --test src/ai/__tests__/fork.test.ts` | ❌ Wave 0 |
| FORK-02 | resolveSessionEvents + restore of empty-child fork | unit | same file | ❌ Wave 0 |
| FORK-02 | createForkSession repo (memory + SQL constant parity) | unit | same file | ❌ Wave 0 |
| FORK-01/03 | hover toolbar render + copy toast | manual-only | UAT (no React test infra in repo) | — |
| LIST-03 | listSessionsByWorkspace returns parent fields + parentTitle | unit | same file / extend sessionRepo test | partially (18 tests exist) |

### Sampling Rate
- Per task commit: `npm test`
- Phase gate: full suite green (190 + new) before /gsd:verify-work

### Wave 0 Gaps
- [ ] `src/ai/__tests__/fork.test.ts` — covers FORK-02 pure logic + repo
- [ ] `src/ai/fork.ts` — implementation target of the tests

## Sources

### Primary (HIGH confidence)
- Direct reads (this session): `src/ai/compaction.ts`, `src/ai/chatSession.ts`, `src/ai/sessionRestore.ts`, `src/ai/events/types.ts`, `src/ai/events/invariants.ts`, `src/ai/events/eventStore.ts`, `src/ai/sessionRepo.ts`, `src/stores/chatConsoleStore.ts`, `src/components/ChatPanel.tsx`, `src/components/AgentConsole.tsx`
- `.planning/research/STACK.md` / `PITFALLS.md` — clipboard conflict resolution (navigator first, plugin on proven failure)
- `.planning/phases/18-session/18-RESEARCH.md` — sessions schema + repo pattern

## Metadata

**Confidence breakdown:**
- Fork pure-function rules: HIGH — every rule traced to read code (compaction payload fields, fromEvents filter, invariants, seq allocation)
- Projection/resolver seams: HIGH — exact call sites identified (sessionRestore.ts:96, compaction.ts:130)
- UI seams: HIGH — single render site (AgentConsole.tsx:136), toast bridge, clipboard precedents
- Packaged-build clipboard: MEDIUM — dev works, packaged unverified (UAT item)

**Research date:** 2026-08-18
**Valid until:** 2026-09-17 (stable codebase, no external deps)
