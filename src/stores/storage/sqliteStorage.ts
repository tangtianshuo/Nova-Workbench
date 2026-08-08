// src/stores/storage/sqliteStorage.ts
// ~25-line Zustand persist adapter for tauri-plugin-sql. Per D-02 + D-03.
// ponytail: one isTauri() branch — no second storage implementation for dev.
import { createJSONStorage } from 'zustand/middleware';
import { isTauri } from '@/src/lib/api';
import { lazySqlite } from './lazySqlite';

export const sqliteStorage = isTauri()
  ? createJSONStorage(() => ({
      getItem: async (name) => {
        const db = await lazySqlite();
        const rows = await db.select<{ value: string }[]>(
          'SELECT value FROM kv_store WHERE key = $1',
          [name],
        );
        return rows[0]?.value ?? null;
      },
      setItem: async (name, value) => {
        const db = await lazySqlite();
        await db.execute(
          'INSERT OR REPLACE INTO kv_store (key, value) VALUES ($1, $2)',
          [name, value],
        );
      },
      removeItem: async (name) => {
        const db = await lazySqlite();
        await db.execute('DELETE FROM kv_store WHERE key = $1', [name]);
      },
    }))
  : createJSONStorage(() => localStorage);
