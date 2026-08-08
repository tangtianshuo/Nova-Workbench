// src/stores/storage/initializeDatabase.ts
// Per D-04. Startup orchestration: load → sanity SELECT → version check →
// read has_seeded (seeding itself is wired in 02-04, this just reads).
import { lazySqlite } from './lazySqlite';

export const APP_SCHEMA_VERSION = 1;

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

  // Step 5 (D-04 + D-09): seeding gate read. Seeding itself happens in 02-04.
  // Read the flag now so 02-04 can act on it without re-querying.
  // (For 02-02, this function just validates the substrate is healthy.)
}
