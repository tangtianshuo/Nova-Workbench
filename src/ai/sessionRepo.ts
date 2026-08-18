// src/ai/sessionRepo.ts
// Phase 18 (v0.3.1) SESS-05 — sessions metadata repo. Mirrors eventStore.ts:
// SQLite via tauri-plugin-sql under Tauri, in-memory mirror with identical
// semantics in Node tests / web dev, one isTauri() branch.
//
// NULL workspace_id = session visible in ALL workspaces (documented behavior,
// matches migration 0007 backfill semantics).
import { isTauri } from '@/src/lib/api';
import { lazySqlite } from '@/src/stores/storage/lazySqlite';

export interface SessionMeta {
  sessionId: string;
  workspaceId: string | null;
  title: string | null;
  titleSource: string | null;
  parentSessionId: string | null;
  forkCutSeq: number | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface SessionRepo {
  upsertSessionMeta(input: { sessionId: string; workspaceId: string | null }): Promise<void>;
  listSessionsByWorkspace(workspaceId: string | null): Promise<SessionMeta[]>;
  updateTitle(sessionId: string, title: string): Promise<void>;
}

export const SESSION_UPSERT_SQL = `INSERT INTO sessions (session_id, workspace_id, created_at, last_active_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT(session_id) DO UPDATE SET last_active_at = excluded.last_active_at`;

export const SESSION_LIST_SQL = `SELECT session_id, workspace_id, title, title_source, parent_session_id, fork_cut_seq, created_at, last_active_at
  FROM sessions WHERE workspace_id = $1 OR workspace_id IS NULL
  ORDER BY last_active_at DESC`;

export const SESSION_TITLE_SQL = 'UPDATE sessions SET title = $1 WHERE session_id = $2';

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
        createdAt: now,
        lastActiveAt: now,
      });
    }
  }

  async listSessionsByWorkspace(workspaceId: string | null): Promise<SessionMeta[]> {
    // NULL workspace = visible everywhere (both stored-NULL rows and query NULL).
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === workspaceId || row.workspaceId === null)
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
      .map((row) => ({ ...row }));
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    const row = this.rows.get(sessionId);
    if (row) row.title = title;
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
  created_at: string;
  last_active_at: string;
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
    return rows.map((row) => ({
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      title: row.title,
      titleSource: row.title_source,
      parentSessionId: row.parent_session_id,
      forkCutSeq: row.fork_cut_seq,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    }));
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    const db = await lazySqlite();
    await db.execute(SESSION_TITLE_SQL, [title, sessionId]);
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
