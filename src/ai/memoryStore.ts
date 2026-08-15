// src/ai/memoryStore.ts
// Phase 15 (MEM-01/02/03/05) — long-term memory storage: candidate queue
// (anti-flood trio: hash dedup / cap eviction / TTL derived expiry) + versioned
// memories (supersedes chain, soft delete). Same dual-impl pattern as
// confirmationStore.ts: in-memory for Node tests / web dev, SQLite via
// tauri-plugin-sql under isTauri(). Consumption is an ATOMIC conditional UPDATE
// (status='confirmed' AND consumed_at IS NULL) — no cross-execute transactions.
// user_directed proposals (locked decision, second half): the user explicitly
// said 记住, so propose runs confirm+consume immediately — they never enter the
// pending queue; model_inferred stays pending for UI confirmation (first half,
// unchanged). memories.source_candidate_token keeps the audit chain.
import { isTauri } from '@/src/lib/api';
import { lazySqlite } from '@/src/stores/storage/lazySqlite';
import { computeParamsHash } from './paramsHash';

export const MEMORY_CANDIDATE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (locked decision)
export const MEMORY_CANDIDATE_CAP = 20; // ~20 queue cap (locked decision)

export type MemoryCandidateOrigin = 'model_inferred' | 'user_directed';
export type MemoryCandidateStatus = 'pending' | 'confirmed' | 'consumed' | 'rejected';
export type MemoryScope = 'global' | 'product';

export interface MemoryCandidate {
  candidateToken: string;
  content: string;
  contentHash: string;
  origin: MemoryCandidateOrigin;
  scope: MemoryScope;
  productId: string | null;
  status: MemoryCandidateStatus;
  sessionId: string | null;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
  consumedAt: string | null;
  rejectedAt: string | null;
}

export interface MemoryRecord {
  memoryRowid: number;
  memoryId: string;
  version: number;
  content: string;
  contentHash: string;
  origin: MemoryCandidateOrigin;
  scope: MemoryScope;
  productId: string | null;
  sourceType: string;
  sourceSessionId: string | null;
  sourceCandidateToken: string | null;
  supersedesRowid: number | null;
  createdAt: string;
  confirmedAt: string;
  supersededAt: string | null;
  deletedAt: string | null;
}

export interface ProposeInput {
  content: string;
  origin: MemoryCandidateOrigin;
  scope: MemoryScope;
  productId?: string;
  sessionId?: string;
  /** Test hook — mirrors confirmationStore.create ttlMs. */
  ttlMs?: number;
}

export type ProposeResult = {
  ok: true;
  candidateToken: string;
  deduplicated: boolean;
  reason?: 'duplicate_pending' | 'previously_rejected';
  evictedOldest: boolean;
  autoConfirmed?: boolean;
  memoryRowid?: number;
};

export interface InsertMemoryInput {
  memoryId?: string;
  content: string;
  origin: MemoryCandidateOrigin;
  scope: MemoryScope;
  productId?: string;
  sourceSessionId?: string;
  sourceCandidateToken?: string;
  sourceType?: string;
  supersedesRowid?: number;
}

export type MemoryStoreFailureCode = 'not_found' | 'expired' | 'not_confirmed' | 'already_settled';

export class MemoryStoreError extends Error {
  constructor(
    public readonly code: MemoryStoreFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryStoreError';
  }
}

export interface MemoryStore {
  propose(input: ProposeInput): Promise<ProposeResult>;
  get(candidateToken: string): Promise<MemoryCandidate | null>;
  confirm(candidateToken: string): Promise<MemoryCandidate>;
  reject(candidateToken: string): Promise<boolean>;
  listPending(): Promise<MemoryCandidate[]>;
  listRejected(limit?: number): Promise<MemoryCandidate[]>;
  consumeIntoMemories(candidateToken: string): Promise<MemoryRecord>;
  insertMemory(input: InsertMemoryInput): Promise<MemoryRecord>;
  listActiveMemories(productId?: string): Promise<MemoryRecord[]>;
  listAllMemories(): Promise<MemoryRecord[]>;
  listRecentUserDirected(limit?: number): Promise<MemoryCandidate[]>;
  deleteMemory(memoryRowid: number): Promise<void>;
  deleteByProduct(productId: string): Promise<void>;
  stats(): Promise<{ pendingCount: number; dedupHits: number; evictions: number }>;
}

/* === Shared helpers === */

function nowIso(): string {
  return new Date().toISOString();
}

function failureFor(
  row: MemoryCandidate | null,
  requiredStatus?: MemoryCandidateStatus,
): MemoryStoreError | null {
  if (!row) return new MemoryStoreError('not_found', 'Memory candidate not found.');
  if (row.expiresAt <= nowIso())
    return new MemoryStoreError('expired', 'Memory candidate has expired.');
  if (row.status === 'consumed' || row.status === 'rejected')
    return new MemoryStoreError('already_settled', 'Memory candidate is already settled.');
  if (requiredStatus && row.status !== requiredStatus)
    return new MemoryStoreError('not_confirmed', 'Memory candidate has not been confirmed.');
  return null;
}

function insertInputFromCandidate(candidate: MemoryCandidate): InsertMemoryInput {
  return {
    content: candidate.content,
    origin: candidate.origin,
    scope: candidate.scope,
    productId: candidate.productId ?? undefined,
    sourceSessionId: candidate.sessionId ?? undefined,
    sourceCandidateToken: candidate.candidateToken,
    sourceType: 'agent_confirmation',
  };
}

function copyCandidate(row: MemoryCandidate): MemoryCandidate {
  return { ...row };
}

function copyMemory(row: MemoryRecord): MemoryRecord {
  return { ...row };
}

/* === In-memory implementation (Node tests / web dev) === */

export class MemoryMemoryStore implements MemoryStore {
  private candidates = new Map<string, MemoryCandidate>();
  private memories = new Map<number, MemoryRecord>();
  private nextRowid = 1;
  private dedupHits = 0;
  private evictions = 0;

  async propose(input: ProposeInput): Promise<ProposeResult> {
    const contentHash = await computeParamsHash({
      content: input.content,
      scope: input.scope,
      productId: input.productId,
    });
    const existing = [...this.candidates.values()].find((r) => r.contentHash === contentHash);

    if (existing) {
      const expired = existing.expiresAt <= nowIso();
      const live = !expired && (existing.status === 'pending' || existing.status === 'confirmed');
      if (live || existing.status === 'consumed') {
        this.dedupHits++;
        return {
          ok: true,
          candidateToken: existing.candidateToken,
          deduplicated: true,
          reason: 'duplicate_pending',
          evictedOldest: false,
        };
      }
      if (existing.status === 'rejected' && input.origin === 'model_inferred') {
        this.dedupHits++;
        return {
          ok: true,
          candidateToken: existing.candidateToken,
          deduplicated: true,
          reason: 'previously_rejected',
          evictedOldest: false,
        };
      }
      // rejected + user_directed: revive (explicit instruction beats history), or
      // expired pending/confirmed: refresh TTL — the UNIQUE hash blocks a new row.
      existing.status = 'pending';
      existing.expiresAt = new Date(Date.now() + (input.ttlMs ?? MEMORY_CANDIDATE_TTL_MS)).toISOString();
      existing.origin = input.origin;
      await this.evictIfFull(existing.candidateToken);
      return this.finishPropose(existing, input);
    }

    const row: MemoryCandidate = {
      candidateToken: crypto.randomUUID(),
      content: input.content,
      contentHash,
      origin: input.origin,
      scope: input.scope,
      productId: input.productId ?? null,
      status: 'pending',
      sessionId: input.sessionId ?? null,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + (input.ttlMs ?? MEMORY_CANDIDATE_TTL_MS)).toISOString(),
      confirmedAt: null,
      consumedAt: null,
      rejectedAt: null,
    };
    const evictedOldest = await this.evictIfFull(row.candidateToken);
    this.candidates.set(row.candidateToken, row);
    const result = await this.finishPropose(row, input);
    return { ...result, evictedOldest };
  }

  /** Cap eviction BEFORE insert (plan step order: count -> evict -> insert). */
  private async evictIfFull(excludeToken: string): Promise<boolean> {
    let live = 0;
    const now = nowIso();
    for (const r of this.candidates.values()) {
      if (r.candidateToken !== excludeToken && r.status === 'pending' && r.expiresAt > now) live++;
    }
    if (live < MEMORY_CANDIDATE_CAP) return false;
    const oldest = [...this.candidates.values()]
      .filter((r) => r.candidateToken !== excludeToken && r.status === 'pending' && r.expiresAt > now)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))[0];
    if (!oldest) return false;
    oldest.expiresAt = nowIso();
    this.evictions++;
    return true;
  }

  /** user_directed auto chain (locked decision second half). */
  private async finishPropose(row: MemoryCandidate, input: ProposeInput): Promise<ProposeResult> {
    const base: ProposeResult = {
      ok: true,
      candidateToken: row.candidateToken,
      deduplicated: false,
      evictedOldest: false,
    };
    if (input.origin === 'user_directed') {
      await this.confirm(row.candidateToken);
      const record = await this.consumeIntoMemories(row.candidateToken);
      return { ...base, autoConfirmed: true, memoryRowid: record.memoryRowid };
    }
    return base;
  }

  private livePendingCount(): number {
    const now = nowIso();
    let n = 0;
    for (const r of this.candidates.values()) {
      if (r.status === 'pending' && r.expiresAt > now) n++;
    }
    return n;
  }

  async get(candidateToken: string): Promise<MemoryCandidate | null> {
    const row = this.candidates.get(candidateToken);
    return row ? copyCandidate(row) : null;
  }

  async confirm(candidateToken: string): Promise<MemoryCandidate> {
    const row = this.candidates.get(candidateToken);
    const failure = failureFor(row ?? null);
    if (failure) throw failure;
    row.status = 'confirmed';
    row.confirmedAt ??= nowIso();
    return copyCandidate(row);
  }

  async reject(candidateToken: string): Promise<boolean> {
    const row = this.candidates.get(candidateToken);
    if (!row) return false;
    const failure = failureFor(row);
    if (failure) return false;
    row.status = 'rejected';
    row.rejectedAt = nowIso();
    return true;
  }

  async listPending(): Promise<MemoryCandidate[]> {
    const now = nowIso();
    const rows = [...this.candidates.values()]
      .filter((r) => r.status === 'pending' && r.expiresAt > now)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    return rows.map(copyCandidate);
  }

  async listRejected(limit = 10): Promise<MemoryCandidate[]> {
    const rows = [...this.candidates.values()]
      .filter((r) => r.status === 'rejected' && r.rejectedAt)
      .sort((a, b) => (a.rejectedAt! < b.rejectedAt! ? 1 : a.rejectedAt! > b.rejectedAt! ? -1 : 0))
      .slice(0, limit);
    return rows.map(copyCandidate);
  }

  async consumeIntoMemories(candidateToken: string): Promise<MemoryRecord> {
    const row = this.candidates.get(candidateToken);
    const preFailure = failureFor(row ?? null, 'confirmed');
    if (preFailure) throw preFailure;
    // Single-threaded atomicity: check + mutation are synchronous.
    row.status = 'consumed';
    row.consumedAt = nowIso();
    return this.insertMemory(insertInputFromCandidate(row));
  }

  async insertMemory(input: InsertMemoryInput): Promise<MemoryRecord> {
    const memoryId = input.memoryId ?? crypto.randomUUID();
    const contentHash = await computeParamsHash({
      content: input.content,
      scope: input.scope,
      productId: input.productId,
    });
    let version = 1;
    for (const m of this.memories.values()) {
      if (m.memoryId === memoryId) version = Math.max(version, m.version + 1);
    }
    const now = nowIso();
    const row: MemoryRecord = {
      memoryRowid: this.nextRowid++,
      memoryId,
      version,
      content: input.content,
      contentHash,
      origin: input.origin,
      scope: input.scope,
      productId: input.productId ?? null,
      sourceType: input.sourceType ?? 'agent_confirmation',
      sourceSessionId: input.sourceSessionId ?? null,
      sourceCandidateToken: input.sourceCandidateToken ?? null,
      supersedesRowid: input.supersedesRowid ?? null,
      createdAt: now,
      confirmedAt: now,
      supersededAt: null,
      deletedAt: null,
    };
    this.memories.set(row.memoryRowid, row);
    if (input.supersedesRowid !== undefined) {
      const old = this.memories.get(input.supersedesRowid);
      if (old && old.supersededAt === null) old.supersededAt = now;
    }
    return copyMemory(row);
  }

  async listActiveMemories(productId?: string): Promise<MemoryRecord[]> {
    const rows = [...this.memories.values()]
      .filter(
        (m) =>
          m.supersededAt === null &&
          m.deletedAt === null &&
          (m.scope === 'global' || (productId !== undefined && m.productId === productId)),
      )
      // memoryRowid tiebreak: tight-loop inserts share a confirmedAt millisecond;
      // newest-first must stay deterministic (Phase 15 overflow test flake).
      .sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : a.confirmedAt > b.confirmedAt ? -1 : b.memoryRowid - a.memoryRowid));
    return rows.map(copyMemory);
  }

  async listAllMemories(): Promise<MemoryRecord[]> {
    return [...this.memories.values()].map(copyMemory);
  }

  async listRecentUserDirected(limit = 5): Promise<MemoryCandidate[]> {
    const rows = [...this.candidates.values()]
      .filter((r) => r.status === 'consumed' && r.origin === 'user_directed' && r.consumedAt)
      .sort((a, b) => (a.consumedAt! < b.consumedAt! ? 1 : a.consumedAt! > b.consumedAt! ? -1 : 0))
      .slice(0, limit);
    return rows.map(copyCandidate);
  }

  async deleteMemory(memoryRowid: number): Promise<void> {
    const row = this.memories.get(memoryRowid);
    if (row && row.deletedAt === null) row.deletedAt = nowIso();
  }

  async deleteByProduct(productId: string): Promise<void> {
    const now = nowIso();
    for (const m of this.memories.values()) {
      if (m.productId === productId && m.deletedAt === null) m.deletedAt = now;
    }
  }

  async stats(): Promise<{ pendingCount: number; dedupHits: number; evictions: number }> {
    return {
      pendingCount: this.livePendingCount(),
      dedupHits: this.dedupHits,
      evictions: this.evictions,
    };
  }

  reset(): void {
    this.candidates.clear();
    this.memories.clear();
    this.nextRowid = 1;
    this.dedupHits = 0;
    this.evictions = 0;
  }
}

/* === SQLite implementation (Tauri) === */

interface CandidateRow {
  candidate_token: string;
  content: string;
  content_hash: string;
  origin: string;
  scope: string;
  product_id: string | null;
  status: string;
  session_id: string | null;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
  consumed_at: string | null;
  rejected_at: string | null;
}

interface MemoryRow {
  memory_rowid: number;
  memory_id: string;
  version: number;
  content: string;
  content_hash: string;
  origin: string;
  scope: string;
  product_id: string | null;
  source_type: string;
  source_session_id: string | null;
  source_candidate_token: string | null;
  supersedes_rowid: number | null;
  created_at: string;
  confirmed_at: string;
  superseded_at: string | null;
  deleted_at: string | null;
}

function mapCandidate(row: CandidateRow): MemoryCandidate {
  return {
    candidateToken: row.candidate_token,
    content: row.content,
    contentHash: row.content_hash,
    origin: row.origin as MemoryCandidateOrigin,
    scope: row.scope as MemoryScope,
    productId: row.product_id,
    status: row.status as MemoryCandidateStatus,
    sessionId: row.session_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    consumedAt: row.consumed_at,
    rejectedAt: row.rejected_at,
  };
}

function mapMemory(row: MemoryRow): MemoryRecord {
  return {
    memoryRowid: row.memory_rowid,
    memoryId: row.memory_id,
    version: row.version,
    content: row.content,
    contentHash: row.content_hash,
    origin: row.origin as MemoryCandidateOrigin,
    scope: row.scope as MemoryScope,
    productId: row.product_id,
    sourceType: row.source_type,
    sourceSessionId: row.source_session_id,
    sourceCandidateToken: row.source_candidate_token,
    supersedesRowid: row.supersedes_rowid,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    supersededAt: row.superseded_at,
    deletedAt: row.deleted_at,
  };
}

export class SqliteMemoryStore implements MemoryStore {
  private dedupHits = 0;
  private evictions = 0;

  async propose(input: ProposeInput): Promise<ProposeResult> {
    const db = await lazySqlite();
    const contentHash = await computeParamsHash({
      content: input.content,
      scope: input.scope,
      productId: input.productId,
    });
    const now = nowIso();
    const existingRows = await db.select<CandidateRow[]>(
      `SELECT * FROM memory_candidates WHERE content_hash = $1`,
      [contentHash],
    );
    const existing = existingRows[0] ? mapCandidate(existingRows[0]) : null;

    let token: string;
    let evictedOldest = false;
    if (existing) {
      const expired = existing.expiresAt <= now;
      const live = !expired && (existing.status === 'pending' || existing.status === 'confirmed');
      if (live || existing.status === 'consumed') {
        this.dedupHits++;
        return {
          ok: true,
          candidateToken: existing.candidateToken,
          deduplicated: true,
          reason: 'duplicate_pending',
          evictedOldest: false,
        };
      }
      if (existing.status === 'rejected' && input.origin === 'model_inferred') {
        this.dedupHits++;
        return {
          ok: true,
          candidateToken: existing.candidateToken,
          deduplicated: true,
          reason: 'previously_rejected',
          evictedOldest: false,
        };
      }
      // rejected + user_directed: revive. expired pending/confirmed: refresh TTL.
      token = existing.candidateToken;
      await db.execute(
        `UPDATE memory_candidates
            SET status = 'pending', origin = $2, expires_at = $3,
                confirmed_at = NULL, consumed_at = NULL, rejected_at = NULL
          WHERE candidate_token = $1`,
        [token, input.origin, new Date(Date.now() + (input.ttlMs ?? MEMORY_CANDIDATE_TTL_MS)).toISOString()],
      );
    } else {
      token = crypto.randomUUID();
      // Cap eviction BEFORE insert (plan step order: count -> evict -> insert).
      const countRows = await db.select<{ n: number }[]>(
        `SELECT COUNT(*) AS n FROM memory_candidates WHERE status = 'pending' AND expires_at > $1`,
        [now],
      );
      if ((countRows[0]?.n ?? 0) >= MEMORY_CANDIDATE_CAP) {
        await db.execute(
          `UPDATE memory_candidates
              SET expires_at = $1
            WHERE candidate_token = (
              SELECT candidate_token FROM memory_candidates
               WHERE status = 'pending' AND expires_at > $1
               ORDER BY created_at ASC LIMIT 1
            )`,
          [now],
        );
        this.evictions++;
        evictedOldest = true;
      }
      await db.execute(
        `INSERT INTO memory_candidates
           (candidate_token, content, content_hash, origin, scope, product_id, status,
            session_id, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)`,
        [
          token,
          input.content,
          contentHash,
          input.origin,
          input.scope,
          input.productId ?? null,
          input.sessionId ?? null,
          now,
          new Date(Date.now() + (input.ttlMs ?? MEMORY_CANDIDATE_TTL_MS)).toISOString(),
        ],
      );
    }

    const base: ProposeResult = {
      ok: true,
      candidateToken: token,
      deduplicated: false,
      evictedOldest,
    };
    if (input.origin === 'user_directed') {
      await this.confirm(token);
      const record = await this.consumeIntoMemories(token);
      return { ...base, autoConfirmed: true, memoryRowid: record.memoryRowid };
    }
    return base;
  }

  async get(candidateToken: string): Promise<MemoryCandidate | null> {
    const db = await lazySqlite();
    const rows = await db.select<CandidateRow[]>(
      `SELECT * FROM memory_candidates WHERE candidate_token = $1`,
      [candidateToken],
    );
    return rows[0] ? mapCandidate(rows[0]) : null;
  }

  async confirm(candidateToken: string): Promise<MemoryCandidate> {
    const db = await lazySqlite();
    const now = nowIso();
    const result = await db.execute(
      `UPDATE memory_candidates
          SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, $2)
        WHERE candidate_token = $1
          AND status IN ('pending', 'confirmed')
          AND consumed_at IS NULL
          AND rejected_at IS NULL
          AND expires_at > $2`,
      [candidateToken, now],
    );
    const row = await this.get(candidateToken);
    if (result.rowsAffected !== 1) {
      throw failureFor(row) ?? new MemoryStoreError('already_settled', 'Memory candidate was already settled.');
    }
    if (!row) throw new MemoryStoreError('not_found', 'Memory candidate not found.');
    return row;
  }

  async reject(candidateToken: string): Promise<boolean> {
    const db = await lazySqlite();
    const now = nowIso();
    const result = await db.execute(
      `UPDATE memory_candidates
          SET status = 'rejected', rejected_at = $2
        WHERE candidate_token = $1
          AND status IN ('pending', 'confirmed')
          AND consumed_at IS NULL
          AND expires_at > $2`,
      [candidateToken, now],
    );
    return result.rowsAffected === 1;
  }

  async listPending(): Promise<MemoryCandidate[]> {
    const db = await lazySqlite();
    const rows = await db.select<CandidateRow[]>(
      `SELECT * FROM memory_candidates
        WHERE status = 'pending' AND expires_at > $1
        ORDER BY created_at ASC`,
      [nowIso()],
    );
    return rows.map(mapCandidate);
  }

  async listRejected(limit = 10): Promise<MemoryCandidate[]> {
    const db = await lazySqlite();
    const rows = await db.select<CandidateRow[]>(
      `SELECT * FROM memory_candidates
        WHERE status = 'rejected'
        ORDER BY rejected_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map(mapCandidate);
  }

  async consumeIntoMemories(candidateToken: string): Promise<MemoryRecord> {
    const db = await lazySqlite();
    const row = await this.get(candidateToken);
    const preFailure = failureFor(row, 'confirmed');
    if (preFailure) throw preFailure;
    const now = nowIso();
    // Atomic conditional UPDATE: exactly one concurrent caller wins.
    const result = await db.execute(
      `UPDATE memory_candidates
          SET status = 'consumed', consumed_at = $2
        WHERE candidate_token = $1
          AND status = 'confirmed'
          AND consumed_at IS NULL
          AND rejected_at IS NULL
          AND expires_at > $2`,
      [candidateToken, now],
    );
    if (result.rowsAffected !== 1) {
      throw new MemoryStoreError('already_settled', 'Memory candidate was consumed by another caller.');
    }
    return this.insertMemory(insertInputFromCandidate(row!));
  }

  async insertMemory(input: InsertMemoryInput): Promise<MemoryRecord> {
    const db = await lazySqlite();
    const memoryId = input.memoryId ?? crypto.randomUUID();
    const contentHash = await computeParamsHash({
      content: input.content,
      scope: input.scope,
      productId: input.productId,
    });
    const now = nowIso();
    if (input.supersedesRowid !== undefined) {
      // Single-statement supersede; old row stays for audit (MEM-05).
      await db.execute(
        `UPDATE memories SET superseded_at = $2
          WHERE memory_rowid = $1 AND superseded_at IS NULL`,
        [input.supersedesRowid, now],
      );
    }
    await db.execute(
      `INSERT INTO memories
         (memory_id, version, content, content_hash, origin, scope, product_id,
          source_type, source_session_id, source_candidate_token, supersedes_rowid,
          created_at, confirmed_at)
       VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM memories WHERE memory_id = $2),
               $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      [
        memoryId,
        memoryId,
        input.content,
        contentHash,
        input.origin,
        input.scope,
        input.productId ?? null,
        input.sourceType ?? 'agent_confirmation',
        input.sourceSessionId ?? null,
        input.sourceCandidateToken ?? null,
        input.supersedesRowid ?? null,
        now,
      ],
    );
    const rows = await db.select<MemoryRow[]>(
      `SELECT * FROM memories WHERE memory_id = $1 ORDER BY version DESC LIMIT 1`,
      [memoryId],
    );
    if (!rows[0]) throw new MemoryStoreError('not_found', 'Inserted memory row not found.');
    return mapMemory(rows[0]);
  }

  async listActiveMemories(productId?: string): Promise<MemoryRecord[]> {
    const db = await lazySqlite();
    const rows = await db.select<MemoryRow[]>(
      `SELECT * FROM memories
        WHERE superseded_at IS NULL AND deleted_at IS NULL
          AND (scope = 'global' OR ($1 IS NOT NULL AND product_id = $1))
        ORDER BY confirmed_at DESC`,
      [productId ?? null],
    );
    return rows.map(mapMemory);
  }

  async listAllMemories(): Promise<MemoryRecord[]> {
    const db = await lazySqlite();
    const rows = await db.select<MemoryRow[]>(`SELECT * FROM memories ORDER BY memory_rowid ASC`);
    return rows.map(mapMemory);
  }

  async listRecentUserDirected(limit = 5): Promise<MemoryCandidate[]> {
    const db = await lazySqlite();
    const rows = await db.select<CandidateRow[]>(
      `SELECT * FROM memory_candidates
        WHERE status = 'consumed' AND origin = 'user_directed'
        ORDER BY consumed_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map(mapCandidate);
  }

  async deleteMemory(memoryRowid: number): Promise<void> {
    const db = await lazySqlite();
    await db.execute(
      `UPDATE memories SET deleted_at = $2 WHERE memory_rowid = $1 AND deleted_at IS NULL`,
      [memoryRowid, nowIso()],
    );
  }

  async deleteByProduct(productId: string): Promise<void> {
    const db = await lazySqlite();
    await db.execute(
      `UPDATE memories SET deleted_at = $2 WHERE product_id = $1 AND deleted_at IS NULL`,
      [productId, nowIso()],
    );
  }

  async stats(): Promise<{ pendingCount: number; dedupHits: number; evictions: number }> {
    const db = await lazySqlite();
    const rows = await db.select<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM memory_candidates WHERE status = 'pending' AND expires_at > $1`,
      [nowIso()],
    );
    return { pendingCount: rows[0]?.n ?? 0, dedupHits: this.dedupHits, evictions: this.evictions };
  }
}

/* === Singleton resolution === */

const memoryStore = new MemoryMemoryStore();
let sqliteStore: SqliteMemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (isTauri()) {
    if (!sqliteStore) sqliteStore = new SqliteMemoryStore();
    return sqliteStore;
  }
  return memoryStore;
}

/** Test access to the in-memory store (Node tests run with isTauri() === false). */
export function getMemoryMemoryStore(): MemoryMemoryStore {
  return memoryStore;
}

export function resetMemoryMemoryStore(): void {
  memoryStore.reset();
}
