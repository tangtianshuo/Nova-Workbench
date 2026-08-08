// src/stores/storage/lazySqlite.ts
// Module-level singleton. First call kicks off Database.load; subsequent callers
// await the same promise. No React coupling, no context. Migrations registered
// Rust-side run automatically on first connection.
import Database from '@tauri-apps/plugin-sql';

let dbPromise: Promise<Database> | null = null;

export function lazySqlite(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:nova.db');
  }
  return dbPromise;
}

export async function closeSqlite(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.close();
    dbPromise = null;
  }
}
