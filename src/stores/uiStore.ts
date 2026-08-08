import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sqliteStorage } from './storage/sqliteStorage';

interface UIState {
  activeTab: string;
  selectedProductId: string | null;
  theme: 'light' | 'dark' | 'system';

  // Modal flags
  isSearchOpen: boolean;
  isNewTaskOpen: boolean;

  // Actions
  setActiveTab: (tab: string) => void;
  setSelectedProductId: (id: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setSearchOpen: (open: boolean) => void;
  setNewTaskOpen: (open: boolean) => void;

  // Persistence
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  activeTab: 'agent',
  selectedProductId: null,
  theme: 'light',

  isSearchOpen: false,
  isNewTaskOpen: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedProductId: (id) => set({ selectedProductId: id }),
  setTheme: (theme) => set({ theme }),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setNewTaskOpen: (open) => set({ isNewTaskOpen: open }),

  // Persistence
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'nova-ui',
      version: 1,
      storage: sqliteStorage,
      // D-13: theme moved to themeStore; isSearchOpen/isNewTaskOpen are transient modals.
      // Persist ONLY activeTab + selectedProductId — reload should not reopen modals
      // nor fight themeStore ('nova-theme' localStorage key).
      partialize: (s) => ({
        activeTab: s.activeTab,
        selectedProductId: s.selectedProductId,
      }),
      migrate: (persisted, _version) => persisted as Partial<UIState>,
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
