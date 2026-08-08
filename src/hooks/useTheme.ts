import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Theme,
  useThemeStore,
  getResolvedTheme,
  applyTheme,
} from '@/src/stores/themeStore';

export type { Theme };

function isLinux(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /linux/i.test(navigator.platform) || /linux/i.test(navigator.userAgent);
}

// Detect GNOME/GTK color preference via the Tauri Rust command (Linux only).
// Returns null when not in Tauri, on non-Linux platforms, or when gsettings is absent
// (KDE/XFCE) — caller falls back to prefers-color-scheme.
async function detectGtkTheme(): Promise<'light' | 'dark' | null> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      // Rust returns "'prefer-dark'" (single-quoted GVariant) or null on non-Linux / failure.
      // Use .includes() not strict === to tolerate GVariant quoting (Pitfall 8).
      const raw = await invoke<string | null>('get_gnome_color_scheme');
      if (raw?.includes('dark')) return 'dark';
      if (raw?.includes('light')) return 'light';
    } catch {
      // gsettings missing or command rejected — fall through.
    }
  }
  // Legacy fallback: GTK_THEME env var ("-dark" suffix indicates dark variant).
  const gtkTheme = (typeof process !== 'undefined' && process?.env?.GTK_THEME) || '';
  if (gtkTheme.includes('-dark') || gtkTheme.includes(':dark')) return 'dark';
  return null;
}

export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggle = useThemeStore((s) => s.toggle);

  const resolved = getResolvedTheme(theme);

  // Apply resolved theme to <html> whenever it changes.
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // macOS / Windows: follow prefers-color-scheme changes while in System mode.
  // D-04: early-return when theme !== 'system' so manual override is never overwritten.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // Linux: GTK detection shim (Tauri#9427 — prefers-color-scheme broken on WebKitGTK).
  // D-04: only active in System mode; manual override wins.
  // ponytail: 2s polling on Linux; dconf notify is better but harder to wire — switch if perf or battery bites.
  useEffect(() => {
    if (theme !== 'system' || !isLinux()) return;
    let cancelled = false;
    const check = async () => {
      const gtk = await detectGtkTheme();
      if (!cancelled && gtk) applyTheme(gtk);
    };
    check();
    const id = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [theme]);

  return { theme, resolved, setTheme, toggle };
}
