// src/ai/knowledgeRepo.ts
// Phase 15 (MEM-04/06/07) — versioned knowledge docs + FTS5 hybrid retrieval.
// Tauri: SQLite (knowledge_docs + knowledge_fts, migration 0004); non-Tauri
// (Node tests / web dev): in-memory mirror with FTS-equivalent token semantics
// (same toFtsTokens tokenizer — Pitfall 9). Same singleton pattern as
// memoryStore.ts / confirmationStore.ts.
//
// No transactions: tauri-plugin-sql has no cross-execute transaction support
// (Pitfall 1), so every lifecycle operation is written to fail safe —
// superseded-without-successor is repairable by re-running upsertDoc
// (idempotent), and a missing FTS row is repairable via rebuildFts().
import { isTauri } from '@/src/lib/api';
import { lazySqlite } from '@/src/stores/storage/lazySqlite';
import { toFtsIndexedText, toFtsMatchString, toFtsTokens } from './ftsTokens';

export interface KnowledgeDocInput {
  docId: string;
  productId: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  author: string;
  sourceType?: 'seed' | 'agent' | 'user';
  sourceSessionId?: string;
  /** Phase 16 (DELIV-03): correlation_id of the generating turn (agent_events source-event pointer). */
  sourceEventId?: string;
  /** Seeding/backfill only — defaults to now. Mock relative strings ('刚刚') must be ISO-converted by the caller. */
  updatedAt?: string;
}

export interface KnowledgeDoc {
  docRowid: number;
  docId: string;
  version: number;
  productId: string;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  content: string;
  author: string;
  sourceType: string;
  sourceSessionId: string | null;
  sourceEventId: string | null;
  createdAt: string;
  updatedAt: string;
  supersededAt: string | null;
}

export interface KnowledgeHit {
  docId: string;
  version: number;
  title: string;
  category: string;
  tags: string[];
  summary: string;
  productId: string;
  sourceType: string;
  updatedAt: string;
  author: string;
  score?: number;
}

export interface SearchFilters {
  productId?: string;
  tag?: string;
  since?: string;
}

export interface KnowledgeRepo {
  /** Single write API: same docId again = new version row, previous row superseded. */
  upsertDoc(input: KnowledgeDocInput): Promise<KnowledgeDoc>;
  /** Current versions only (superseded_at IS NULL), newest first. */
  getCurrentDocs(productId?: string): Promise<KnowledgeDoc[]>;
  /** Audit: full version history of one docId. */
  listVersions(docId: string): Promise<KnowledgeDoc[]>;
  search(query: string, filters?: SearchFilters & { limit?: number }): Promise<KnowledgeHit[]>;
  deleteByProduct(productId: string): Promise<void>;
  /** Repair path: wipe FTS and re-index all current versions. */
  rebuildFts(): Promise<void>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function copyDoc(doc: KnowledgeDoc): KnowledgeDoc {
  return { ...doc, tags: [...doc.tags] };
}

/* === In-memory implementation (Node tests / web dev) === */

const FIELD_WEIGHTS: Array<[string, (d: KnowledgeDoc) => string, number]> = [
  ['title', (d) => d.title, 8],
  ['category', (d) => d.category, 5],
  ['tags', (d) => d.tags.join(' '), 5],
  ['summary', (d) => d.summary, 3],
  ['content', (d) => d.content, 1],
];

export class MemoryKnowledgeRepo implements KnowledgeRepo {
  private docs = new Map<string, KnowledgeDoc[]>();
  private nextRowid = 1;

  async upsertDoc(input: KnowledgeDocInput): Promise<KnowledgeDoc> {
    const now = nowIso();
    const versions = this.docs.get(input.docId) ?? [];
    const current = versions.find((v) => v.supersededAt === null);
    if (current) current.supersededAt = now;
    const doc: KnowledgeDoc = {
      docRowid: this.nextRowid++,
      docId: input.docId,
      version: (versions[versions.length - 1]?.version ?? 0) + 1,
      productId: input.productId,
      title: input.title,
      category: input.category,
      tags: [...input.tags],
      summary: input.summary,
      content: input.content,
      author: input.author,
      sourceType: input.sourceType ?? 'user',
      sourceSessionId: input.sourceSessionId ?? null,
      sourceEventId: input.sourceEventId ?? null,
      createdAt: current?.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      supersededAt: null,
    };
    versions.push(doc);
    this.docs.set(input.docId, versions);
    return copyDoc(doc);
  }

  async getCurrentDocs(productId?: string): Promise<KnowledgeDoc[]> {
    const current = [...this.docs.values()]
      .map((versions) => versions.find((v) => v.supersededAt === null))
      .filter((d): d is KnowledgeDoc => Boolean(d))
      .filter((d) => !productId || d.productId === productId);
    current.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    return current.map(copyDoc);
  }

  async listVersions(docId: string): Promise<KnowledgeDoc[]> {
    return (this.docs.get(docId) ?? []).map(copyDoc);
  }

  async search(query: string, filters?: SearchFilters & { limit?: number }): Promise<KnowledgeHit[]> {
    const tokens = toFtsTokens(query);
    const limit = filters?.limit ?? 50;
    let docs = await this.getCurrentDocs(filters?.productId);
    if (filters?.since) docs = docs.filter((d) => d.updatedAt >= filters.since!);

    let hits: KnowledgeHit[];
    if (tokens.length > 0) {
      // FTS5 MATCH equivalence: every quoted token AND-ed, matched per field.
      hits = [];
      for (const doc of docs) {
        const fields = FIELD_WEIGHTS.map(([name, get, weight]) => ({
          name,
          value: get(doc).toLocaleLowerCase().normalize('NFKC'),
          weight,
        }));
        const allTokensPresent = tokens.every((t) => fields.some((f) => f.value.includes(t)));
        if (!allTokensPresent) continue;
        let score = 0;
        const phrase = query.toLocaleLowerCase().normalize('NFKC');
        for (const f of fields) {
          if (phrase && f.value.includes(phrase)) score += f.weight * 2;
          for (const t of tokens) if (f.value.includes(t)) score += f.weight;
        }
        hits.push(toHit(doc, score));
      }
      hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.title.localeCompare(b.title));
    } else {
      hits = docs.map((d) => toHit(d)); // filters-only mode: already updated_at DESC
    }

    if (filters?.tag) hits = hits.filter((h) => h.tags.includes(filters.tag!));
    return hits.slice(0, limit);
  }

  async deleteByProduct(productId: string): Promise<void> {
    for (const [docId, versions] of this.docs) {
      const remaining = versions.filter((v) => v.productId !== productId);
      if (remaining.length === 0) this.docs.delete(docId);
      else this.docs.set(docId, remaining);
    }
  }

  async rebuildFts(): Promise<void> {
    /* memory impl: FTS is derived at query time — nothing to rebuild */
  }

  reset(): void {
    this.docs.clear();
    this.nextRowid = 1;
  }
}

function toHit(doc: KnowledgeDoc, score?: number): KnowledgeHit {
  return {
    docId: doc.docId,
    version: doc.version,
    title: doc.title,
    category: doc.category,
    tags: [...doc.tags],
    summary: doc.summary,
    productId: doc.productId,
    sourceType: doc.sourceType,
    updatedAt: doc.updatedAt,
    author: doc.author,
    ...(score !== undefined ? { score } : {}),
  };
}

/* === SQLite implementation (Tauri) === */

interface KnowledgeDocRow {
  doc_rowid: number;
  doc_id: string;
  version: number;
  product_id: string;
  title: string;
  category: string;
  tags_json: string;
  summary: string;
  content: string;
  author: string;
  source_type: string;
  source_session_id: string | null;
  source_event_id: string | null;
  created_at: string;
  updated_at: string;
  superseded_at: string | null;
}

function mapRow(row: KnowledgeDocRow): KnowledgeDoc {
  return {
    docRowid: row.doc_rowid,
    docId: row.doc_id,
    version: row.version,
    productId: row.product_id,
    title: row.title,
    category: row.category,
    tags: JSON.parse(row.tags_json) as string[],
    summary: row.summary,
    content: row.content,
    author: row.author,
    sourceType: row.source_type,
    sourceSessionId: row.source_session_id,
    sourceEventId: row.source_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supersededAt: row.superseded_at,
  };
}

export class SqliteKnowledgeRepo implements KnowledgeRepo {
  async upsertDoc(input: KnowledgeDocInput): Promise<KnowledgeDoc> {
    const db = await lazySqlite();
    const now = nowIso();
    const updatedAt = input.updatedAt ?? now;
    // Step 1: retire the current version (single atomic statement).
    await db.execute(
      'UPDATE knowledge_docs SET superseded_at = $2 WHERE doc_id = $1 AND superseded_at IS NULL',
      [input.docId, now],
    );
    // Step 2: append the next version (version derived in SQL from the chain).
    await db.execute(
      `INSERT INTO knowledge_docs
         (doc_id, version, product_id, title, category, tags_json, summary, content, author,
          source_type, source_session_id, source_event_id, created_at, updated_at, superseded_at)
       VALUES ($1, (SELECT COALESCE(MAX(version), 0) + 1 FROM knowledge_docs WHERE doc_id = $1),
               $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL)`,
      [
        input.docId, input.productId, input.title, input.category,
        JSON.stringify(input.tags), input.summary, input.content, input.author,
        input.sourceType ?? 'user', input.sourceSessionId ?? null, input.sourceEventId ?? null,
        now, updatedAt,
      ],
    );
    const rows = await db.select<KnowledgeDocRow[]>(
      'SELECT * FROM knowledge_docs WHERE doc_id = $1 ORDER BY version DESC LIMIT 1',
      [input.docId],
    );
    const row = rows[0];
    if (!row) throw new Error(`[knowledgeRepo] upsertDoc failed for ${input.docId}`);
    // Step 3: index the new version into FTS (superseded rows keep their FTS
    // rows forever and are filtered out at query time — migration 0004 note).
    await db.execute(
      `INSERT INTO knowledge_fts (title, content, summary, tags, doc_rowid)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        toFtsIndexedText(row.title),
        toFtsIndexedText(row.content),
        toFtsIndexedText(row.summary),
        toFtsIndexedText((JSON.parse(row.tags_json) as string[]).join(' ')),
        row.doc_rowid,
      ],
    );
    return mapRow(row);
  }

  async getCurrentDocs(productId?: string): Promise<KnowledgeDoc[]> {
    const db = await lazySqlite();
    const rows = await db.select<KnowledgeDocRow[]>(
      `SELECT * FROM knowledge_docs
        WHERE superseded_at IS NULL AND ($1 IS NULL OR product_id = $1)
        ORDER BY updated_at DESC`,
      [productId ?? null],
    );
    return rows.map(mapRow);
  }

  async listVersions(docId: string): Promise<KnowledgeDoc[]> {
    const db = await lazySqlite();
    const rows = await db.select<KnowledgeDocRow[]>(
      'SELECT * FROM knowledge_docs WHERE doc_id = $1 ORDER BY version ASC',
      [docId],
    );
    return rows.map(mapRow);
  }

  async search(query: string, filters?: SearchFilters & { limit?: number }): Promise<KnowledgeHit[]> {
    const db = await lazySqlite();
    const limit = filters?.limit ?? 50;
    let rows: KnowledgeDocRow[];
    if (query.trim().length > 0) {
      // Hybrid: FTS5 MATCH + structural filters in one WHERE (RESEARCH Pattern 2).
      rows = await db.select<KnowledgeDocRow[]>(
        `SELECT d.* FROM knowledge_fts f
           JOIN knowledge_docs d ON d.doc_rowid = f.doc_rowid
          WHERE knowledge_fts MATCH $1
            AND d.superseded_at IS NULL
            AND ($2 IS NULL OR d.product_id = $2)
            AND ($3 IS NULL OR d.updated_at >= $3)
          ORDER BY f.rank
          LIMIT $4`,
        [toFtsMatchString(query), filters?.productId ?? null, filters?.since ?? null, limit],
      );
    } else {
      // Filters-only mode still triggers search (locked): skip FTS, order by recency.
      rows = await db.select<KnowledgeDocRow[]>(
        `SELECT * FROM knowledge_docs
          WHERE superseded_at IS NULL
            AND ($1 IS NULL OR product_id = $1)
            AND ($2 IS NULL OR updated_at >= $2)
          ORDER BY updated_at DESC
          LIMIT $3`,
        [filters?.productId ?? null, filters?.since ?? null, limit],
      );
    }
    let docs = rows.map(mapRow);
    if (filters?.tag) docs = docs.filter((d) => d.tags.includes(filters.tag!));
    return docs.map((d) => toHit(d));
  }

  async deleteByProduct(productId: string): Promise<void> {
    const db = await lazySqlite();
    // FTS first: a leftover orphan docs row is unsearchable (fail-safe order).
    await db.execute(
      'DELETE FROM knowledge_fts WHERE doc_rowid IN (SELECT doc_rowid FROM knowledge_docs WHERE product_id = $1)',
      [productId],
    );
    await db.execute('DELETE FROM knowledge_docs WHERE product_id = $1', [productId]);
  }

  async rebuildFts(): Promise<void> {
    const db = await lazySqlite();
    await db.execute('DELETE FROM knowledge_fts');
    const rows = await db.select<KnowledgeDocRow[]>(
      'SELECT * FROM knowledge_docs WHERE superseded_at IS NULL',
    );
    for (const row of rows) {
      await db.execute(
        `INSERT INTO knowledge_fts (title, content, summary, tags, doc_rowid)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          toFtsIndexedText(row.title),
          toFtsIndexedText(row.content),
          toFtsIndexedText(row.summary),
          toFtsIndexedText((JSON.parse(row.tags_json) as string[]).join(' ')),
          row.doc_rowid,
        ],
      );
    }
  }
}

/* === Singleton resolution === */

const memoryRepo = new MemoryKnowledgeRepo();
let sqliteRepo: SqliteKnowledgeRepo | null = null;

export function getKnowledgeRepo(): KnowledgeRepo {
  if (isTauri()) {
    if (!sqliteRepo) sqliteRepo = new SqliteKnowledgeRepo();
    return sqliteRepo;
  }
  return memoryRepo;
}

/** Test access to the in-memory repo (Node tests run with isTauri() === false). */
export function getMemoryKnowledgeRepo(): MemoryKnowledgeRepo {
  return memoryRepo;
}

export function resetMemoryKnowledgeRepo(): void {
  memoryRepo.reset();
}

/** Convenience wrapper for the context assembler / tool loop (15-02 references this name). */
export async function searchKnowledgeHybrid(query: string, limit: number): Promise<KnowledgeHit[]> {
  return getKnowledgeRepo().search(query, { limit });
}
