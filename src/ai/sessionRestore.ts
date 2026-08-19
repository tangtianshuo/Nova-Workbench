// src/ai/sessionRestore.ts
// Phase 14 (EVT-04) / Phase 19 (SESS-03) — session restore after app restart.
// Two paths, same settlement pipeline (orphan tool_result append + crash tail cut
// + tokenBudget rebuild + live emission resume + pending confirmations):
//   1. restoreSession(sessionId) — restore ANY session by explicit id (multi-session
//      switching). Queries that session's events directly; never touches listSessions().
//   2. restoreSession() / restoreLatestSession() — crash-recovery startup path:
//      restores the most recent session (listSessions()[0], the documented "latest"
//      semantic, not an assumption).
// - Orphan tool_calls: settled by APPENDING an interrupted tool_result event — the
//   tool is NEVER re-executed (re-running could duplicate a business write).
// - Pending confirmation candidates re-surface from the persistent store (Plan 02).
// Read + append only: no mutation of existing rows.
import { ChatSession } from './chatSession';
import { listPendingDestructiveActions, listPendingKnowledgeWrites } from './confirmations';
import type { DestructiveActionCandidate, KnowledgeWriteCandidate } from './confirmations';
import { getEventStore } from './events/eventStore';
import type { AgentEvent } from './events/types';
import { resolveSessionEvents } from './fork';

const DEFAULT_RESTORE_TOKEN_BUDGET = 8_000;

export interface RestoredSession {
  sessionId: string;
  session: ChatSession;
  /** seq of the turn_ended the projection was cut to (0 = no complete turn). */
  cutSeq: number;
  /** Number of events excluded from the projection (crash tail + appended markers). */
  trimmedTailEventCount: number;
  interruptedToolCallIds: string[];
  pendingKnowledgeWrites: KnowledgeWriteCandidate[];
  pendingDestructiveActions: DestructiveActionCandidate[];
}

/** Largest seq of a turn_ended event; 0 when the session has no complete turn. */
export function findCrashTailCutSeq(events: AgentEvent[]): number {
  let cutSeq = 0;
  for (const event of events) {
    if (event.eventType === 'turn_ended' && event.seq > cutSeq) cutSeq = event.seq;
  }
  return cutSeq;
}

/** tool_call events whose toolCallId has no tool_result later in the stream.
 * Interrupted markers appended by an earlier restore count as results, so the
 * scan is idempotent — a second restore finds zero orphans. */
export function findOrphanToolCallEvents(events: AgentEvent[]): AgentEvent[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const open = new Map<string, AgentEvent>();
  for (const event of sorted) {
    const payload = event.payload;
    if (event.eventType === 'tool_call' && typeof payload.toolCallId === 'string') {
      open.set(payload.toolCallId, event);
    } else if (event.eventType === 'tool_result' && typeof payload.toolCallId === 'string') {
      open.delete(payload.toolCallId);
    }
  }
  return [...open.values()];
}

const activeRestores = new Map<string, Promise<RestoredSession | null>>();

/** Restore entry. Deduped PER sessionId while IN FLIGHT: concurrent calls for the
 * same session share one promise; different sessions restore independently. The
 * cache entry is removed on settle — a completed result (including a null from a
 * mid-write/empty read) must never be frozen, or later clicks on that session
 * would silently no-op forever even after its events land. No-arg (crash-recovery
 * startup path, deduped under '__latest__') restores the most recent session.
 * Returns null when the session does not exist / has no events. */
export function restoreSession(sessionId?: string): Promise<RestoredSession | null> {
  const key = sessionId ?? '__latest__';
  let promise = activeRestores.get(key);
  if (!promise) {
    promise = doRestore(sessionId).finally(() => {
      if (activeRestores.get(key) === promise) activeRestores.delete(key);
    });
    activeRestores.set(key, promise);
  }
  return promise;
}

/** Compat alias (Phase 14 callers): no-arg latest-session restore. */
export function restoreLatestSession(): Promise<RestoredSession | null> {
  return restoreSession();
}

/** Test hook: clears all dedupe promises. */
export function resetRestoreForTesting(): void {
  activeRestores.clear();
}

async function doRestore(sessionId?: string): Promise<RestoredSession | null> {
  const store = getEventStore();
  // Resolve the target session id. With an explicit id, query that session's
  // events directly (P-B: never assume sessions[0]). Without, take the latest.
  let targetSessionId = sessionId;
  if (!targetSessionId) {
    const sessions = await store.listSessions();
    if (sessions.length === 0) return null;
    targetSessionId = sessions[0].sessionId; // no-arg path: documented "latest" semantic
  }
  let events = await resolveSessionEvents(targetSessionId); // fork-aware (Phase 20)
  if (events.length === 0) return null;

  // 1) Orphan tool_calls from a crashed tool loop: mark interrupted by APPENDING a
  //    tool_result. Never re-execute the tool — no business write may happen twice.
  const orphans = findOrphanToolCallEvents(events);
  const interruptedToolCallIds: string[] = [];
  for (const orphan of orphans) {
    const payload = orphan.payload;
    const toolCallId = String(payload.toolCallId);
    const toolName = typeof payload.toolName === 'string' ? payload.toolName : 'unknown';
    await store.append({
      sessionId: targetSessionId,
      eventType: 'tool_result',
      payload: {
        toolCallId,
        toolName,
        ok: false,
        interrupted: true,
        reason: 'app-restart',
        modelText: `[tool_result ${toolName}] ${JSON.stringify({ ok: false, interrupted: true, reason: 'app restarted before tool completion' })}`,
      },
      correlationId: orphan.correlationId,
    });
    interruptedToolCallIds.push(toolCallId);
  }
  if (orphans.length > 0) {
    events = await resolveSessionEvents(targetSessionId); // re-read: Sqlite append returns seq -1
  }

  // 2) Crash tail: cut the projection to the last COMPLETE turn. Events after cutSeq
  //    stay in the append-only log; they simply never reach the LLM projection.
  //    NOTE: a compaction_completed event stranded in the crash tail (crash between
  //    compaction and the next turn_ended) is conservatively ignored — the projection
  //    re-expands to raw history and the next compaction re-compresses it. No data loss.
  const cutSeq = findCrashTailCutSeq(events);
  const projectionEvents = events.filter((event) => event.seq <= cutSeq);
  const trimmedTailEventCount = events.length - projectionEvents.length;

  // 3) tokenBudget recorded on session_created; fall back to the app default.
  const sessionCreated = events.find((event) => event.eventType === 'session_created');
  const tokenBudget = typeof sessionCreated?.payload.tokenBudget === 'number'
    ? sessionCreated.payload.tokenBudget
    : DEFAULT_RESTORE_TOKEN_BUDGET;

  // 4) Rebuild the projection, then resume live emission on the ORIGINAL stream.
  const session = ChatSession.fromEvents(projectionEvents, { sessionId: targetSessionId, tokenBudget });
  session.resumeEventEmission();

  // 5) Surface pending confirmations that survived the restart (EVT-05 store).
  const [pendingKnowledgeWrites, pendingDestructiveActions] = await Promise.all([
    listPendingKnowledgeWrites(),
    listPendingDestructiveActions(),
  ]);

  return {
    sessionId: targetSessionId,
    session,
    cutSeq,
    trimmedTailEventCount,
    interruptedToolCallIds,
    pendingKnowledgeWrites,
    pendingDestructiveActions,
  };
}
