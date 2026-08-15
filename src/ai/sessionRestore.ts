// src/ai/sessionRestore.ts
// Phase 14 (EVT-04) — restore the most recent agent session after app restart.
// - Crash tail: the projection is cut to the last COMPLETE turn (final turn_ended).
// - Orphan tool_calls: settled by APPENDING an interrupted tool_result event — the
//   tool is NEVER re-executed (re-running could duplicate a business write).
// - Pending confirmation candidates re-surface from the persistent store (Plan 02).
// Read + append only: this file contains no UPDATE / DELETE statements.
import { ChatSession } from './chatSession';
import { listPendingDestructiveActions, listPendingKnowledgeWrites } from './confirmations';
import type { DestructiveActionCandidate, KnowledgeWriteCandidate } from './confirmations';
import { getEventStore } from './events/eventStore';
import type { AgentEvent } from './events/types';

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

let activeRestore: Promise<RestoredSession | null> | null = null;

/** EVT-04 restore entry. Deduped at module level: React StrictMode mounts the
 * ChatPanel effect twice in dev, but the body must run once per app start.
 * Returns null when no session exists. */
export function restoreLatestSession(): Promise<RestoredSession | null> {
  if (!activeRestore) activeRestore = doRestoreLatestSession();
  return activeRestore;
}

/** Test hook: clears the dedupe promise only. */
export function resetRestoreForTesting(): void {
  activeRestore = null;
}

async function doRestoreLatestSession(): Promise<RestoredSession | null> {
  const store = getEventStore();
  const sessions = await store.listSessions();
  if (sessions.length === 0) return null;
  const latest = sessions[0];
  let events = await store.listEvents(latest.sessionId);
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
      sessionId: latest.sessionId,
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
    events = await store.listEvents(latest.sessionId); // re-read: Sqlite append returns seq -1
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
  const session = ChatSession.fromEvents(projectionEvents, { sessionId: latest.sessionId, tokenBudget });
  session.resumeEventEmission();

  // 5) Surface pending confirmations that survived the restart (EVT-05 store).
  const [pendingKnowledgeWrites, pendingDestructiveActions] = await Promise.all([
    listPendingKnowledgeWrites(),
    listPendingDestructiveActions(),
  ]);

  return {
    sessionId: latest.sessionId,
    session,
    cutSeq,
    trimmedTailEventCount,
    interruptedToolCallIds,
    pendingKnowledgeWrites,
    pendingDestructiveActions,
  };
}
