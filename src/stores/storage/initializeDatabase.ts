// src/stores/storage/initializeDatabase.ts
// Per D-04 + D-09. Startup orchestration:
// load → sanity SELECT → version check → has_seeded gate → seed → flip flag.
import { lazySqlite } from './lazySqlite';

export const APP_SCHEMA_VERSION = 6;

interface MetaRow {
  value: string;
}

/**
 * Runs BEFORE React renders (called from src/main.tsx).
 * Throws on unrecoverable failures — caller shows a blank screen with console error.
 * Ponytail: no error UI polish this phase; throw is the loudest signal.
 */
export async function initializeDatabase(): Promise<void> {
  // Dev/web mode: skip DB init entirely, localStorage adapter handles everything.
  const { isTauri } = await import('@/src/lib/api');
  if (!isTauri()) {
    return;
  }

  const db = await lazySqlite();

  // Step 3 (D-04): sanity SELECT — surface silent migration failure (PITFALLS Pitfall 2)
  try {
    await db.select<{ key: string }[]>('SELECT key FROM kv_store LIMIT 1');
  } catch (err) {
    throw new Error(
      '[initializeDatabase] kv_store sanity SELECT failed — schema may be corrupted. ' +
        'Delete nova.db in app data dir and restart. Cause: ' + String(err),
    );
  }

  // Step 4 (D-04): schema_version guard (refuse to start on too-new DB)
  const versionRows = await db.select<MetaRow[]>(
    'SELECT value FROM meta WHERE key = $1',
    ['schema_version'],
  );
  const dbVersion = parseInt(versionRows[0]?.value ?? '0', 10);
  if (dbVersion > APP_SCHEMA_VERSION) {
    throw new Error(
      `[initializeDatabase] DB schema_version (${dbVersion}) is newer than app expected (${APP_SCHEMA_VERSION}). ` +
        'Refusing to start — upgrade the app.',
    );
  }

  // Step 5 (D-04 + D-09): one-shot seed gate.
  // has_seeded is 'true' after the first successful seed and never reset by app code.
  // Only manual nova.db deletion re-triggers seeding (expected per D-10).
  const seededRows = await db.select<MetaRow[]>(
    'SELECT value FROM meta WHERE key = $1',
    ['has_seeded'],
  );
  if (seededRows[0]?.value === 'false') {
    await seedAllStores(db);
    await db.execute(
      "UPDATE meta SET value = 'true' WHERE key = $1",
      ['has_seeded'],
    );
  }

  // Phase 15: knowledge seed gate — independent from has_seeded (which is
  // already 'true' on existing installs). One-shot kv_store → knowledge_docs
  // migration, mock fallback (Pitfall 3/4).
  const knowledgeSeedRows = await db.select<MetaRow[]>(
    'SELECT value FROM meta WHERE key = $1',
    ['knowledge_seed_v15'],
  );
  if (!knowledgeSeedRows[0]) {
    await migrateKnowledgeIntoSqlite(db);
    await db.execute(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('knowledge_seed_v15', 'true')",
    );
  }

  // knowledgeBase is a repo projection now — rebuild it from SQLite every boot.
  const { useRndStore } = await import('../rndStore');
  await useRndStore.getState().hydrateKnowledgeFromRepo();
}

async function migrateKnowledgeIntoSqlite(db: Awaited<ReturnType<typeof lazySqlite>>): Promise<void> {
  const { getKnowledgeRepo } = await import('@/src/ai/knowledgeRepo');
  const { INITIAL_KNOWLEDGE_BASE } = await import('@/src/data/mockRndData');
  type KnowledgeItem = { id: string; productId: string; title: string; category: string; tags: string[]; author: string; updatedAt: string; summary: string; content: string };

  // 1) Prefer the user's existing persisted data (rndStore kv blob).
  let source: Record<string, KnowledgeItem[]> = {};
  try {
    const rows = await db.select<{ value: string }[]>(
      'SELECT value FROM kv_store WHERE key = $1',
      ['nova-rnd'],
    );
    const persisted = rows[0] ? JSON.parse(rows[0].value) as { state?: { knowledgeBase?: Record<string, KnowledgeItem[]> } } : null;
    source = persisted?.state?.knowledgeBase ?? {};
  } catch {
    source = {}; // unreadable blob → mock fallback below
  }
  // 2) Empty bucket → mock fallback.
  const hasUserdata = Object.values(source).some((items) => items.length > 0);
  const base = hasUserdata ? source : INITIAL_KNOWLEDGE_BASE;

  // 3) Seed each item. Mock relative strings ('刚刚'/'3 天前') are unparseable —
  // fall back to now (Pitfall 4).
  for (const [productId, items] of Object.entries(base)) {
    for (const item of items) {
      const ts = Date.parse(item.updatedAt);
      await getKnowledgeRepo().upsertDoc({
        docId: item.id,
        productId: item.productId || productId,
        title: item.title,
        category: item.category,
        tags: item.tags,
        summary: item.summary,
        content: item.content,
        author: item.author,
        sourceType: 'seed',
        updatedAt: Number.isNaN(ts) ? new Date().toISOString() : new Date(ts).toISOString(),
      });
    }
  }
}

async function seedAllStores(db: Awaited<ReturnType<typeof lazySqlite>>): Promise<void> {
  const { buildInitialSeed } = await import('./seedData');
  const seeds = buildInitialSeed();

  // Promise.all is safe: SQLite serializes writes anyway, and partial-fail
  // mitigation is that has_seeded only flips after ALL inserts resolve.
  // If any insert throws, has_seeded stays 'false' and next launch retries.
  await Promise.all(
    Object.entries(seeds).map(([key, value]) =>
      db.execute(
        'INSERT OR REPLACE INTO kv_store (key, value) VALUES ($1, $2)',
        [key, JSON.stringify(value)],
      ),
    ),
  );
}

