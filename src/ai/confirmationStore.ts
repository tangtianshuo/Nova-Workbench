// src/ai/confirmationStore.ts
// Phase 14 (EVT-05) — persistent confirmation candidates. Tauri: SQLite via
// tauri-plugin-sql; non-Tauri (Node tests / web dev): in-memory mirror with
// identical semantics. One isTauri() branch — same pattern as eventStore.ts.
// Consumption is an ATOMIC conditional UPDATE: UPDATE ... WHERE status='confirmed'
// AND consumed_at IS NULL — restart or concurrent callers can never double-consume.
import { isTauri } from '@/src/lib/api';
import { lazySqlite } from '@/src/stores/storage/lazySqlite';
import { computeParamsHash } from './paramsHash';

// 'deliverable_draft' (Phase 16): PRD-pipeline candidates — see confirmations.ts.
export type ConfirmationKind = 'knowledge_write' | 'destructive_action' | 'deliverable_draft';
export type ConfirmationStatus = 'pending' | 'confirmed' | 'consumed' | 'rejected';

export interface PersistedConfirmation {
  confirmationToken: string;
  kind: ConfirmationKind;
  status: ConfirmationStatus;
  paramsHash: string;
  params: Record<string, unknown>;
  summary: string | null;
  sessionId: string | null;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  consumedAt: string | null;
  rejectedAt: string | null;
}

export type ConfirmationFailureCode =
  | 'not_found'
  | 'expired'
  | 'not_confirmed'
  | 'params_mismatch'
  | 'already_settled';

export class ConfirmationStoreError extends Error {
  constructor(
    public readonly code: ConfirmationFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'ConfirmationStoreError';
  }
}

export const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ConfirmationStore {
  create(input: {
    kind: ConfirmationKind;
    params: Record<string, unknown>;
    summary: string | null;
    sessionId: string | null;
    ttlMs?: number;
  }): Promise<PersistedConfirmation>;
  get(confirmationToken: string): Promise<PersistedConfirmation | null>;
  confirm(confirmationToken: string): Promise<PersistedConfirmation>;
  consume(confirmationToken: string, paramsHash: string): Promise<PersistedConfirmation>;
  reject(confirmationToken: string): Promise<boolean>;
  listActive(kind: ConfirmationKind): Promise<PersistedConfirmation[]>;
  /** Rejected rows (newest first) still inside their TTL — anti-repropose injection has a natural bound. */
  listRejected(kind: ConfirmationKind, limit?: number): Promise<PersistedConfirmation[]>;
}

/* === Shared helpers === */

function nowIso(): string {
  return new Date().toISOString();
}

function deepCopyRow(row: PersistedConfirmation): PersistedConfirmation {
  return {
    ...row,
    params: JSON.parse(JSON.stringify(row.params)),
  };
}

function failureFor(
  row: PersistedConfirmation | null,
  requiredStatus?: ConfirmationStatus,
): ConfirmationStoreError | null {
  if (!row) return new ConfirmationStoreError('not_found', 'Confirmation candidate not found.');
  if (row.expiresAt <= nowIso())
    return new ConfirmationStoreError('expired', 'Confirmation candidate has expired.');
  if (row.status === 'consumed' || row.status === 'rejected')
    return new ConfirmationStoreError('already_settled', 'Confirmation candidate is already settled.');
  if (requiredStatus && row.status !== requiredStatus)
    return new ConfirmationStoreError('not_confirmed', 'Confirmation candidate has not been confirmed.');
  return null;
}

/* === In-memory implementation (Node tests / web dev) === */

export class MemoryConfirmationStore implements ConfirmationStore {
  private rows = new Map<string, PersistedConfirmation>();

  async create(input: {
    kind: ConfirmationKind;
    params: Record<string, unknown>;
    summary: string | null;
    sessionId: string | null;
    ttlMs?: number;
  }): Promise<PersistedConfirmation> {
    const confirmationToken = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? CONFIRMATION_TTL_MS)).toISOString();
    const paramsHash = await computeParamsHash(input.params);
    const row: PersistedConfirmation = {
      confirmationToken,
      kind: input.kind,
      status: 'pending',
      paramsHash,
      params: JSON.parse(JSON.stringify(input.params)),
      summary: input.summary,
      sessionId: input.sessionId,
      createdAt,
      expiresAt,
      confirmedAt: null,
      consumedAt: null,
      rejectedAt: null,
    };
    this.rows.set(confirmationToken, row);
    return deepCopyRow(row);
  }

  async get(confirmationToken: string): Promise<PersistedConfirmation | null> {
    const row = this.rows.get(confirmationToken);
    return row ? deepCopyRow(row) : null;
  }

  async confirm(confirmationToken: string): Promise<PersistedConfirmation> {
    const row = this.rows.get(confirmationToken);
    const failure = failureFor(row ?? null);
    if (failure) throw failure;
    // Idempotent re-confirm (status already 'confirmed' after crash restore):
    // keep the original confirmedAt so second-confirmation doesn't mutate history.
    row.status = 'confirmed';
    row.confirmedAt ??= nowIso();
    return deepCopyRow(row);
  }

  async consume(confirmationToken: string, paramsHash: string): Promise<PersistedConfirmation> {
    const row = this.rows.get(confirmationToken);
    const preFailure = failureFor(row ?? null);
    if (preFailure) throw preFailure;
    if (row.status !== 'confirmed')
      throw new ConfirmationStoreError('not_confirmed', 'Confirmation candidate has not been confirmed.');
    if (row.paramsHash !== paramsHash)
      throw new ConfirmationStoreError('params_mismatch', 'Confirmation params hash does not match.');
    // Single-threaded atomicity: check + mutation are synchronous.
    row.status = 'consumed';
    row.consumedAt = nowIso();
    return deepCopyRow(row);
  }

  async reject(confirmationToken: string): Promise<boolean> {
    const row = this.rows.get(confirmationToken);
    if (!row) return false;
    const failure = failureFor(row);
    if (failure) return false;
    if (row.status !== 'pending' && row.status !== 'confirmed') return false;
    row.status = 'rejected';
    row.rejectedAt = nowIso();
    return true;
  }

  async listActive(kind: ConfirmationKind): Promise<PersistedConfirmation[]> {
    const now = nowIso();
    const result: PersistedConfirmation[] = [];
    for (const row of this.rows.values()) {
      if (row.kind !== kind) continue;
      if (row.status !== 'pending' && row.status !== 'confirmed') continue;
      if (row.expiresAt <= now) continue;
      result.push(deepCopyRow(row));
    }
    result.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    return result;
  }

  async listRejected(kind: ConfirmationKind, limit?: number): Promise<PersistedConfirmation[]> {
    const now = nowIso();
    const result: PersistedConfirmation[] = [];
    for (const row of this.rows.values()) {
      if (row.kind !== kind || row.status !== 'rejected' || row.expiresAt <= now) continue;
      result.push(deepCopyRow(row));
    }
    result.sort((a, b) =>
      (a.rejectedAt ?? '') < (b.rejectedAt ?? '') ? 1 : (a.rejectedAt ?? '') > (b.rejectedAt ?? '') ? -1 : 0,
    );
    return result.slice(0, limit ?? 5);
  }

  reset(): void {
    this.rows.clear();
  }
}

/* === SQLite implementation (Tauri) === */

interface ConfirmationCandidateRow {
  confirmation_token: string;
  kind: string;
  status: string;
  params_hash: string;
  params_json: string;
  summary: string | null;
  session_id: string | null;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  consumed_at: string | null;
  rejected_at: string | null;
}

function mapRow(row: ConfirmationCandidateRow): PersistedConfirmation {
  return {
    confirmationToken: row.confirmation_token,
    kind: row.kind as ConfirmationKind,
    status: row.status as ConfirmationStatus,
    paramsHash: row.params_hash,
    params: JSON.parse(row.params_json) as Record<string, unknown>,
    summary: row.summary,
    sessionId: row.session_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    consumedAt: row.consumed_at,
    rejectedAt: row.rejected_at,
  };
}

export class SqliteConfirmationStore implements ConfirmationStore {
  async create(input: {
    kind: ConfirmationKind;
    params: Record<string, unknown>;
    summary: string | null;
    sessionId: string | null;
    ttlMs?: number;
  }): Promise<PersistedConfirmation> {
    const db = await lazySqlite();
    const confirmationToken = crypto.randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? CONFIRMATION_TTL_MS)).toISOString();
    const paramsHash = await computeParamsHash(input.params);
    const paramsJson = JSON.stringify(input.params);
    await db.execute(
      `INSERT INTO agent_confirmation_candidates
         (confirmation_token, kind, status, params_hash, params_json, summary, session_id, created_at, expires_at)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8)`,
      [confirmationToken, input.kind, paramsHash, paramsJson, input.summary, input.sessionId, createdAt, expiresAt],
    );
    return {
      confirmationToken,
      kind: input.kind,
      status: 'pending',
      paramsHash,
      params: JSON.parse(JSON.stringify(input.params)),
      summary: input.summary,
      sessionId: input.sessionId,
      createdAt,
      expiresAt,
      confirmedAt: null,
      consumedAt: null,
      rejectedAt: null,
    };
  }

  async get(confirmationToken: string): Promise<PersistedConfirmation | null> {
    const db = await lazySqlite();
    const rows = await db.select<ConfirmationCandidateRow[]>(
      `SELECT * FROM agent_confirmation_candidates WHERE confirmation_token = $1`,
      [confirmationToken],
    );
    const row = rows[0];
    return row ? mapRow(row) : null;
  }

  async confirm(confirmationToken: string): Promise<PersistedConfirmation> {
    const db = await lazySqlite();
    const now = nowIso();
    const result = await db.execute(
      `UPDATE agent_confirmation_candidates
          SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, $2)
        WHERE confirmation_token = $1
          AND status IN ('pending', 'confirmed')
          AND consumed_at IS NULL
          AND rejected_at IS NULL
          AND expires_at > $2`,
      [confirmationToken, now],
    );
    if (result.rowsAffected !== 1) {
      const row = await this.get(confirmationToken);
      const failure = failureFor(row);
      throw failure ?? new ConfirmationStoreError('already_settled', 'Confirmation candidate was already settled.');
    }
    const row = await this.get(confirmationToken);
    if (!row) throw new ConfirmationStoreError('not_found', 'Confirmation candidate not found.');
    return row;
  }

  async consume(confirmationToken: string, paramsHash: string): Promise<PersistedConfirmation> {
    const db = await lazySqlite();
    const row = await this.get(confirmationToken);
    const preFailure = failureFor(row);
    if (preFailure) throw preFailure;
    if (row.status !== 'confirmed')
      throw new ConfirmationStoreError('not_confirmed', 'Confirmation candidate has not been confirmed.');
    if (row.paramsHash !== paramsHash)
      throw new ConfirmationStoreError('params_mismatch', 'Confirmation params hash does not match.');
    const now = nowIso();
    // Atomic conditional UPDATE: exactly one concurrent caller wins.
    const result = await db.execute(
      `UPDATE agent_confirmation_candidates
          SET status = 'consumed', consumed_at = $2
        WHERE confirmation_token = $1
          AND status = 'confirmed'
          AND consumed_at IS NULL
          AND rejected_at IS NULL
          AND expires_at > $2`,
      [confirmationToken, now],
    );
    if (result.rowsAffected !== 1) {
      throw new ConfirmationStoreError(
        'already_settled',
        'Confirmation candidate was consumed by another caller.',
      );
    }
    const updated = await this.get(confirmationToken);
    if (!updated) throw new ConfirmationStoreError('not_found', 'Confirmation candidate not found.');
    return updated;
  }

  async reject(confirmationToken: string): Promise<boolean> {
    const db = await lazySqlite();
    const now = nowIso();
    const result = await db.execute(
      `UPDATE agent_confirmation_candidates
          SET status = 'rejected', rejected_at = $2
        WHERE confirmation_token = $1
          AND status IN ('pending', 'confirmed')
          AND consumed_at IS NULL
          AND expires_at > $2`,
      [confirmationToken, now],
    );
    return result.rowsAffected === 1;
  }

  async listActive(kind: ConfirmationKind): Promise<PersistedConfirmation[]> {
    const db = await lazySqlite();
    const now = nowIso();
    const rows = await db.select<ConfirmationCandidateRow[]>(
      `SELECT * FROM agent_confirmation_candidates
        WHERE kind = $1
          AND status IN ('pending', 'confirmed')
          AND consumed_at IS NULL
          AND rejected_at IS NULL
          AND expires_at > $2
        ORDER BY created_at ASC`,
      [kind, now],
    );
    return rows.map(mapRow);
  }

  async listRejected(kind: ConfirmationKind, limit?: number): Promise<PersistedConfirmation[]> {
    const db = await lazySqlite();
    // Rejected rows keep their row TTL (24h natural expiry) — the anti-repropose
    // injection stays bounded; it never permanently bans future generations.
    const rows = await db.select<ConfirmationCandidateRow[]>(
      `SELECT * FROM agent_confirmation_candidates
        WHERE kind = $1 AND status = 'rejected' AND expires_at > $2
        ORDER BY rejected_at DESC LIMIT $3`,
      [kind, nowIso(), limit ?? 5],
    );
    return rows.map(mapRow);
  }
}

/* === Singleton resolution === */

const memoryStore = new MemoryConfirmationStore();
let sqliteStore: SqliteConfirmationStore | null = null;

export function getConfirmationStore(): ConfirmationStore {
  if (isTauri()) {
    if (!sqliteStore) sqliteStore = new SqliteConfirmationStore();
    return sqliteStore;
  }
  return memoryStore;
}

/** Test access to the in-memory store (Node tests run with isTauri() === false). */
export function getMemoryConfirmationStore(): MemoryConfirmationStore {
  return memoryStore;
}

export function resetMemoryConfirmationStore(): void {
  memoryStore.reset();
}
