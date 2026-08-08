import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nova-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme;
}

export function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

interface ThemeStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void; // light <-> dark, skips system
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme:
    (typeof window !== 'undefined' && (localStorage.getItem(STORAGE_KEY) as Theme)) || 'system',
  setTheme: (t) => {
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(getResolvedTheme(t));
    set({ theme: t });
  },
  toggle: () => {
    const current = getResolvedTheme(get().theme);
    get().setTheme(current === 'dark' ? 'light' : 'dark');
  },
}));
