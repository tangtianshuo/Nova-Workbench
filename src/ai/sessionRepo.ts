// src/ai/sessionRepo.ts
// Phase 18 (v0.3.1) SESS-05 — sessions metadata repo. Mirrors eventStore.ts:
// SQLite via tauri-plugin-sql under Tauri, in-memory mirror with identical
// semantics in Node tests / web dev, one isTauri() branch.
//
// NULL workspace_id = session visible in ALL workspaces (documented behavior,
// matches migration 0007 backfill semantics).
import { isTauri } from '@/src/lib/api';
import { lazySqlite } from '@/src/stores/storage/lazySqlite';
import { getEventStore } from '@/src/ai/events/eventStore';

export interface SessionMeta {
  sessionId: string;
  workspaceId: string | null;
  title: string | null;
  titleSource: string | null;
  parentSessionId: string | null;
  /** Parent-space seq — input to buildForkEventStream ONLY (Pitfall 6). */
  forkCutSeq: number | null;
  /** Title of the parent session (LEFT JOIN), null for non-forks. */
  parentTitle: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface SessionRepo {
  upsertSessionMeta(input: { sessionId: string; workspaceId: string | null }): Promise<void>;
  listSessionsByWorkspace(workspaceId: string | null): Promise<SessionMeta[]>;
  updateTitle(sessionId: string, title: string, titleSource: 'llm' | 'fallback'): Promise<void>;
  /** Phase 21 (LIST-01): batch message counts per session (one SQL round-trip). */
  countMessagesBySession(sessionIds: string[]): Promise<Map<string, number>>;
  /** Phase 20: fork metadata by explicit id (resolveSessionEvents). */
  getSession(sessionId: string): Promise<SessionMeta | null>;
  /** Phase 20: create a fork session row (parent_session_id + fork_cut_seq). */
  createForkSession(input: {
    sessionId: string;
    workspaceId: string | null;
    parentSessionId: string;
    forkCutSeq: number;
    title: string | null;
  }): Promise<void>;
}

export const SESSION_UPSERT_SQL = `INSERT INTO sessions (session_id, workspace_id, created_at, last_active_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT(session_id) DO UPDATE SET last_active_at = excluded.last_active_at`;

export const SESSION_LIST_SQL = `SELECT s.session_id, s.workspace_id, s.title, s.title_source, s.parent_session_id, s.fork_cut_seq, s.created_at, s.last_active_at, p.title AS parent_title
  FROM sessions s LEFT JOIN sessions p ON p.session_id = s.parent_session_id
  WHERE s.workspace_id = $1 OR s.workspace_id IS NULL
  ORDER BY s.last_active_at DESC`;

export const SESSION_TITLE_SQL =
  'UPDATE sessions SET title = $1, title_source = $2 WHERE session_id = $3 AND title IS NULL';

// Canonical text ($N style). SQLite impl builds the IN-list dynamically from
// the ids array ($1..$n, callers cap at 50 ids). Keep in sync with the built
// variant below — SQL parity tests lock the shape.
export const SESSION_MESSAGE_COUNT_SQL = `SELECT session_id, COUNT(*) AS message_count FROM agent_events WHERE session_id IN ($1, $2, $3, $4, $5) AND event_type IN ('user_message','assistant_message') GROUP BY session_id`;

export const SESSION_GET_SQL = `SELECT s.session_id, s.workspace_id, s.title, s.title_source, s.parent_session_id, s.fork_cut_seq, s.created_at, s.last_active_at, p.title AS parent_title
  FROM sessions s LEFT JOIN sessions p ON p.session_id = s.parent_session_id
  WHERE s.session_id = $1`;

export const SESSION_FORK_INSERT_SQL = `INSERT INTO sessions (session_id, workspace_id, title, title_source, parent_session_id, fork_cut_seq, created_at, last_active_at)
  VALUES ($1, $2, $3, 'fork', $4, $5, $6, $6)`;

/* === In-memory implementation (Node tests / web dev) === */

export class MemorySessionRepo implements SessionRepo {
  private rows = new Map<string, SessionMeta>();

  async upsertSessionMeta(input: { sessionId: string; workspaceId: string | null }): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.rows.get(input.sessionId);
    // INSERT OR IGNORE semantics: conflict updates last_active_at only.
    if (existing) {
      existing.lastActiveAt = now;
    } else {
      this.rows.set(input.sessionId, {
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        title: null,
        titleSource: null,
        parentSessionId: null,
        forkCutSeq: null,
        parentTitle: null,
        createdAt: now,
        lastActiveAt: now,
      });
    }
  }

  async listSessionsByWorkspace(workspaceId: string | null): Promise<SessionMeta[]> {
    // NULL workspace = visible everywhere (both stored-NULL rows and query NULL).
    // parentTitle mirrors the SQL LEFT JOIN (resolved at read time so a parent
    // title set after the fork still shows through).
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === workspaceId || row.workspaceId === null)
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
      .map((row) => ({ ...row, parentTitle: row.parentSessionId ? this.rows.get(row.parentSessionId)?.title ?? null : null }));
  }

  async getSession(sessionId: string): Promise<SessionMeta | null> {
    const row = this.rows.get(sessionId);
    if (!row) return null;
    return {
      ...row,
      parentTitle: row.parentSessionId ? this.rows.get(row.parentSessionId)?.title ?? null : null,
    };
  }

  async createForkSession(input: {
    sessionId: string;
    workspaceId: string | null;
    parentSessionId: string;
    forkCutSeq: number;
    title: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    this.rows.set(input.sessionId, {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      title: input.title,
      titleSource: 'fork',
      parentSessionId: input.parentSessionId,
      forkCutSeq: input.forkCutSeq,
      parentTitle: this.rows.get(input.parentSessionId)?.title ?? null,
      createdAt: now,
      lastActiveAt: now,
    });
  }

  async updateTitle(sessionId: string, title: string, titleSource: 'llm' | 'fallback'): Promise<void> {
    const row = this.rows.get(sessionId);
    if (row && row.title === null) {
      row.title = title;
      row.titleSource = titleSource;
    }
  }

  async countMessagesBySession(sessionIds: string[]): Promise<Map<string, number>> {
    // ponytail: N+1 per-session listEvents — memory impl is test/web-dev only,
    // SQLite path is the single aggregate SQL; switch to a shared in-memory
    // index if web-dev lists grow large.
    const store = getEventStore();
    const counts = new Map<string, number>();
    for (const id of sessionIds) {
      const events = await store.listEvents(id);
      const n = events.filter((e) => e.eventType === 'user_message' || e.eventType === 'assistant_message').length;
      if (n > 0) counts.set(id, n);
    }
    return counts;
  }

  resetForTesting(): void {
    this.rows.clear();
  }
}

/* === SQLite implementation (Tauri) === */

interface SessionRow {
  session_id: string;
  workspace_id: string | null;
  title: string | null;
  title_source: string | null;
  parent_session_id: string | null;
  fork_cut_seq: number | null;
  parent_title: string | null;
  created_at: string;
  last_active_at: string;
}

function rowToMeta(row: SessionRow): SessionMeta {
  return {
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    title: row.title,
    titleSource: row.title_source,
    parentSessionId: row.parent_session_id,
    forkCutSeq: row.fork_cut_seq,
    parentTitle: row.parent_title,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

export class SqliteSessionRepo implements SessionRepo {
  async upsertSessionMeta(input: { sessionId: string; workspaceId: string | null }): Promise<void> {
    const db = await lazySqlite();
    const now = new Date().toISOString();
    await db.execute(SESSION_UPSERT_SQL, [input.sessionId, input.workspaceId, now, now]);
  }

  async listSessionsByWorkspace(workspaceId: string | null): Promise<SessionMeta[]> {
    const db = await lazySqlite();
    const rows = await db.select<SessionRow[]>(SESSION_LIST_SQL, [workspaceId]);
    return rows.map(rowToMeta);
  }

  async getSession(sessionId: string): Promise<SessionMeta | null> {
    const db = await lazySqlite();
    const rows = await db.select<SessionRow[]>(SESSION_GET_SQL, [sessionId]);
    return rows[0] ? rowToMeta(rows[0]) : null;
  }

  async createForkSession(input: {
    sessionId: string;
    workspaceId: string | null;
    parentSessionId: string;
    forkCutSeq: number;
    title: string | null;
  }): Promise<void> {
    const db = await lazySqlite();
    const now = new Date().toISOString();
    await db.execute(SESSION_FORK_INSERT_SQL, [input.sessionId, input.workspaceId, input.title, input.parentSessionId, input.forkCutSeq, now]);
  }

  async updateTitle(sessionId: string, title: string, titleSource: 'llm' | 'fallback'): Promise<void> {
    const db = await lazySqlite();
    await db.execute(SESSION_TITLE_SQL, [title, titleSource, sessionId]);
  }

  async countMessagesBySession(sessionIds: string[]): Promise<Map<string, number>> {
    if (sessionIds.length === 0) return new Map();
    const db = await lazySqlite();
    const placeholders = sessionIds.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `SELECT session_id, COUNT(*) AS message_count FROM agent_events WHERE session_id IN (${placeholders}) AND event_type IN ('user_message','assistant_message') GROUP BY session_id`;
    const rows = await db.select<{ session_id: string; message_count: number }[]>(sql, sessionIds);
    return new Map(rows.map((r) => [r.session_id, r.message_count]));
  }
}

/* === Singleton resolution === */

const memoryRepo = new MemorySessionRepo();
let sqliteRepo: SqliteSessionRepo | null = null;

export function getSessionRepo(): SessionRepo {
  if (isTauri()) {
    if (!sqliteRepo) sqliteRepo = new SqliteSessionRepo();
    return sqliteRepo;
  }
  return memoryRepo;
}

/** Test access to the in-memory repo singleton (Node tests run with isTauri() === false). */
export function getMemorySessionRepo(): MemorySessionRepo {
  return memoryRepo;
}

/** Test hook: clears the in-memory session table. */
export function resetMemorySessionRepo(): void {
  memoryRepo.resetForTesting();
}
