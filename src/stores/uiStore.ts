import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Provider } from '@/src/lib/api';
import { sqliteStorage } from './storage/sqliteStorage';

interface UIState {
  activeTab: string;
  selectedProductId: string | null;
  selectedTaskId: string | null;
  theme: 'light' | 'dark' | 'system';
  activeAIProvider: Provider;

  // Modal flags
  isSearchOpen: boolean;
  isNewTaskOpen: boolean;
  isChatPanelOpen: boolean;

  // Actions
  setActiveTab: (tab: string) => void;
  setSelectedProductId: (id: string | null) => void;
  setSelectedTaskId: (id: string | null) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setActiveAIProvider: (provider: Provider) => void;
  setSearchOpen: (open: boolean) => void;
  setNewTaskOpen: (open: boolean) => void;
  setChatPanelOpen: (open: boolean) => void;

  // Persistence
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  activeTab: 'agent',
  selectedProductId: null,
  selectedTaskId: null,
  theme: 'light',
  activeAIProvider: 'deepseek',

  isSearchOpen: false,
  isNewTaskOpen: false,
  isChatPanelOpen: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedProductId: (id) => set({ selectedProductId: id }),
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  setTheme: (theme) => set({ theme }),
  setActiveAIProvider: (provider) => set({ activeAIProvider: provider }),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setNewTaskOpen: (open) => set({ isNewTaskOpen: open }),
  setChatPanelOpen: (open) => set({ isChatPanelOpen: open }),

  // Persistence
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'nova-ui',
      version: 1,
      storage: sqliteStorage,
      // D-13: theme moved to themeStore; isSearchOpen/isNewTaskOpen are transient modals.
      // Persist navigation and provider selection; modal flags stay transient so
      // reload never reopens a dialog or chat panel.
      partialize: (s) => ({
        activeTab: s.activeTab,
        selectedProductId: s.selectedProductId,
        activeAIProvider: s.activeAIProvider,
      }),
      migrate: (persisted, _version) => persisted as Partial<UIState>,
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
