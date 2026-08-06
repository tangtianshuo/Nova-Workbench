import { create } from 'zustand';

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
}

export const useUIStore = create<UIState>((set) => ({
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
}));
