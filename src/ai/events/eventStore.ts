// src/ai/events/eventStore.ts
// Phase 13 — append-only event store. Tauri: SQLite via tauri-plugin-sql (seq
// allocated SQL-side). Non-Tauri (Node tests / web dev): in-memory mirror with
// identical semantics. One isTauri() branch — same pattern as sqliteStorage.ts.
import { isTauri } from '@/src/lib/api';
import { lazySqlite } from '@/src/stores/storage/lazySqlite';
import type { AgentArtifact, AgentEvent, AgentEventInput, EventScope } from './types';

/** EVT-04: session enumeration for restore (most recent first). */
export interface SessionSummary {
  sessionId: string;
  eventCount: number;
  maxSeq: number;
  lastEventAt: string; // created_at of the newest event (ISO)
  productId: string | null; // newest non-null product_id in the session, else null
}

export interface EventStore {
  append(input: AgentEventInput): Promise<AgentEvent>;
  listEvents(sessionId: string): Promise<AgentEvent[]>;
  listSessions(): Promise<SessionSummary[]>;
  saveArtifact(artifact: AgentArtifact): Promise<void>;
  getArtifact(artifactId: string): Promise<AgentArtifact | null>;
}

/* === Scope provider === */
// Events are stamped with workspace/product/project context resolved at append
// time. toolLoop registers the real provider (uiStore.selectedProductId).
export type EventScopeProvider = () => EventScope;

let scopeProvider: EventScopeProvider | null = null;

export function setEventScopeProvider(provider: EventScopeProvider | null): void {
  scopeProvider = provider;
}

function resolveScope(input: AgentEventInput): EventScope {
  const fallback = scopeProvider ? scopeProvider() : { workspaceId: null, productId: null, projectId: null };
  return {
    workspaceId: input.workspaceId ?? fallback.workspaceId,
    productId: input.productId ?? fallback.productId,
    projectId: input.projectId ?? fallback.projectId,
  };
}

/* === Per-session serialized write chain === */
// Appends for one session are queued so seq stays contiguous even when several
// await-less callers fire events concurrently (ChatSession.addMessage is sync).
const sessionChains = new Map<string, Promise<unknown>>();

function enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const previous = sessionChains.get(sessionId) ?? Promise.resolve();
  const next = previous.then(task, task);
  sessionChains.set(sessionId, next.catch(() => undefined));
  return next;
}

/* === In-memory implementation (Node tests / web dev) === */

export class MemoryEventStore implements EventStore {
  private events: AgentEvent[] = [];
  private artifacts = new Map<string, AgentArtifact>();

  append(input: AgentEventInput): Promise<AgentEvent> {
    return enqueue(input.sessionId, async () => {
      const seq = this.events
        .filter((event) => event.sessionId === input.sessionId)
        .reduce((max, event) => Math.max(max, event.seq), 0) + 1;
      const scope = resolveScope(input);
      const event: AgentEvent = {
        eventId: crypto.randomUUID(),
        sessionId: input.sessionId,
        seq,
        eventType: input.eventType,
        createdAt: new Date().toISOString(),
        workspaceId: scope.workspaceId,
        productId: scope.productId,
        projectId: scope.projectId,
        correlationId: input.correlationId ?? null,
        payload: input.payload,
      };
      this.events.push(event);
      return event;
    });
  }

  async listEvents(sessionId: string): Promise<AgentEvent[]> {
    return this.events
      .filter((event) => event.sessionId === sessionId)
      .sort((a, b) => a.seq - b.seq)
      .map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  async listSessions(): Promise<SessionSummary[]> {
    const bySession = new Map<string, AgentEvent[]>();
    for (const event of this.events) {
      const list = bySession.get(event.sessionId) ?? [];
      list.push(event);
      bySession.set(event.sessionId, list);
    }
    const summaries: SessionSummary[] = [];
    for (const [sessionId, events] of bySession) {
      const sorted = [...events].sort((a, b) => a.seq - b.seq);
      const newest = sorted[sorted.length - 1];
      const productId = [...sorted].reverse().find((event) => event.productId !== null)?.productId ?? null;
      summaries.push({ sessionId, eventCount: sorted.length, maxSeq: newest.seq, lastEventAt: newest.createdAt, productId });
    }
    return summaries.sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt) || b.maxSeq - a.maxSeq);
  }

  async saveArtifact(artifact: AgentArtifact): Promise<void> {
    this.artifacts.set(artifact.artifactId, { ...artifact });
  }

  async getArtifact(artifactId: string): Promise<AgentArtifact | null> {
    const found = this.artifacts.get(artifactId);
    return found ? { ...found } : null;
  }

  reset(): void {
    this.events = [];
    this.artifacts.clear();
  }
}

/* === SQLite implementation (Tauri) === */

interface AgentEventRow {
  event_id: string;
  session_id: string;
  seq: number;
  event_type: string;
  created_at: string;
  workspace_id: string | null;
  product_id: string | null;
  project_id: string | null;
  correlation_id: string | null;
  payload_json: string;
}

export class SqliteEventStore implements EventStore {
  append(input: AgentEventInput): Promise<AgentEvent> {
    return enqueue(input.sessionId, async () => {
      const db = await lazySqlite();
      const scope = resolveScope(input);
      const eventId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      // seq allocated SQL-side: UNIQUE(session_id, seq) + per-session chain make
      // this race-free. Locked by research — never allocate seq in JS.
      await db.execute(
        `INSERT INTO agent_events
           (event_id, session_id, seq, event_type, created_at,
            workspace_id, product_id, project_id, correlation_id, payload_json)
         VALUES
           ($1, $2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_events WHERE session_id = $2),
            $3, $4, $5, $6, $7, $8, $9)`,
        [
          eventId,
          input.sessionId,
          input.eventType,
          createdAt,
          scope.workspaceId,
          scope.productId,
          scope.projectId,
          input.correlationId ?? null,
          JSON.stringify(input.payload),
        ],
      );
      return {
        eventId,
        sessionId: input.sessionId,
        seq: -1, // authoritative seq lives in the row; callers must not depend on it here
        eventType: input.eventType,
        createdAt,
        workspaceId: scope.workspaceId,
        productId: scope.productId,
        projectId: scope.projectId,
        correlationId: input.correlationId ?? null,
        payload: input.payload,
      };
    });
  }

  async listEvents(sessionId: string): Promise<AgentEvent[]> {
    const db = await lazySqlite();
    const rows = await db.select<AgentEventRow[]>(
      `SELECT event_id, session_id, seq, event_type, created_at,
              workspace_id, product_id, project_id, correlation_id, payload_json
       FROM agent_events WHERE session_id = $1 ORDER BY seq ASC`,
      [sessionId],
    );
    return rows.map((row) => ({
      eventId: row.event_id,
      sessionId: row.session_id,
      seq: row.seq,
      eventType: row.event_type,
      createdAt: row.created_at,
      workspaceId: row.workspace_id,
      productId: row.product_id,
      projectId: row.project_id,
      correlationId: row.correlation_id,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    }));
  }

  async listSessions(): Promise<SessionSummary[]> {
    const db = await lazySqlite();
    const rows = await db.select<Array<{ session_id: string; event_count: number; max_seq: number; last_event_at: string; product_id: string | null }>>(
      `SELECT session_id,
              COUNT(*) AS event_count,
              MAX(seq) AS max_seq,
              MAX(created_at) AS last_event_at,
              (SELECT e2.product_id FROM agent_events e2
                WHERE e2.session_id = e.session_id AND e2.product_id IS NOT NULL
                ORDER BY e2.seq DESC LIMIT 1) AS product_id
       FROM agent_events e
       GROUP BY session_id
       ORDER BY last_event_at DESC, max_seq DESC`,
    );
    return rows.map((row) => ({
      sessionId: row.session_id,
      eventCount: row.event_count,
      maxSeq: row.max_seq,
      lastEventAt: row.last_event_at,
      productId: row.product_id,
    }));
  }

  async saveArtifact(artifact: AgentArtifact): Promise<void> {
    const db = await lazySqlite();
    await db.execute(
      `INSERT INTO agent_artifacts (artifact_id, session_id, tool_name, byte_size, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [artifact.artifactId, artifact.sessionId, artifact.toolName, artifact.byteSize, artifact.content, artifact.createdAt],
    );
  }

  async getArtifact(artifactId: string): Promise<AgentArtifact | null> {
    const db = await lazySqlite();
    const rows = await db.select<Array<{ artifact_id: string; session_id: string; tool_name: string; byte_size: number; content: string; created_at: string }>>(
      `SELECT artifact_id, session_id, tool_name, byte_size, content, created_at
       FROM agent_artifacts WHERE artifact_id = $1`,
      [artifactId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      artifactId: row.artifact_id,
      sessionId: row.session_id,
      toolName: row.tool_name,
      byteSize: row.byte_size,
      content: row.content,
      createdAt: row.created_at,
    };
  }
}

/* === Singleton resolution === */

const memoryStore = new MemoryEventStore();
let sqliteStore: SqliteEventStore | null = null;

export function getEventStore(): EventStore {
  if (isTauri()) {
    if (!sqliteStore) sqliteStore = new SqliteEventStore();
    return sqliteStore;
  }
  return memoryStore;
}

/** Test access to the in-memory store (Node tests run with isTauri() === false). */
export function getMemoryEventStore(): MemoryEventStore {
  return memoryStore;
}

export function resetMemoryEventStore(): void {
  memoryStore.reset();
}
