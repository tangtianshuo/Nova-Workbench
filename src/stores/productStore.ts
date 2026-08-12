import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Product,
  ProductMilestone,
  ProductDocument,
  ProductSkill,
  INITIAL_PRODUCTS_DATA,
} from '../data/mockProducts';
import { sqliteStorage } from './storage/sqliteStorage';

export type { Product, ProductMilestone, ProductDocument, ProductSkill } from '../data/mockProducts';
export type Project = Product;

interface ProductState {
  products: Product[];

  // CRUD
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  setProducts: (products: Product[]) => void;

  // Document operations
  addProductDocument: (productId: string, doc: ProductDocument) => void;

  // Skill operations
  toggleSkillStatus: (productId: string, skillId: string) => void;
  runProductSkill: (productId: string, skillId: string) => Promise<any>;

  // Milestone operations
  addProductMilestone: (productId: string, milestone: ProductMilestone) => void;
  updateMilestoneStatus: (productId: string, milestoneId: string, status: 'completed' | 'in-progress' | 'pending') => void;

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
  products: INITIAL_PRODUCTS_DATA,

  addProduct: (product) =>
    set((state) => {
      if (state.products.some((p) => p.id === product.id)) return state;
      return { products: [...state.products, product] };
    }),

  updateProduct: (id, updates) =>
    set((state) => ({
      products: state.products.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  deleteProduct: (id) =>
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    })),

  setProducts: (products) => set({ products }),

  addProductDocument: (productId, doc) =>
    set((state) => ({
      products: state.products.map((p) => {
        if (p.id !== productId) return p;
        return { ...p, documents: [doc, ...p.documents] };
      }),
    })),

  toggleSkillStatus: (productId, skillId) =>
    set((state) => ({
      products: state.products.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          associatedSkills: p.associatedSkills.map((s) => {
            if (s.id !== skillId) return s;
            return { ...s, status: s.status === 'active' ? 'idle' as const : 'active' as const };
          }),
        };
      }),
    })),

  runProductSkill: async (productId, skillId) => {
    set((state) => ({
      products: state.products.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          associatedSkills: p.associatedSkills.map((s) =>
            s.id === skillId ? { ...s, status: 'running' as const } : s
          ),
        };
      }),
    }));

    await new Promise((r) => setTimeout(r, 1400));

    set((state) => ({
      products: state.products.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          associatedSkills: p.associatedSkills.map((s) => {
            if (s.id !== skillId) return s;
            return {
              ...s,
              status: 'active' as const,
              invocations: s.invocations + 1,
              lastInvoked: '刚刚',
            };
          }),
        };
      }),
    }));

    return { success: true, timestamp: new Date().toLocaleTimeString() };
  },

  addProductMilestone: (productId, milestone) =>
    set((state) => ({
      products: state.products.map((p) => {
        if (p.id !== productId) return p;
        return { ...p, milestones: [...p.milestones, milestone] };
      }),
    })),

  updateMilestoneStatus: (productId, milestoneId, status) =>
    set((state) => ({
      products: state.products.map((p) => {
        if (p.id !== productId) return p;
        return {
          ...p,
          milestones: p.milestones.map((m, idx) => {
            const mId = m.id || `m-${idx}`;
            if (mId === milestoneId || m.title === milestoneId) {
              return { ...m, status };
            }
            return m;
          }),
        };
      }),
    })),

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'nova-product',
      version: 2,
      storage: sqliteStorage,
      partialize: (s) => ({ products: s.products }),
      migrate: (persisted, _version) => {
        const state = persisted as Partial<ProductState>;
        if (!state.products) return state;
        // v1→v2: backfill milestone.deliverableCodes from latest mock data.
        // Additive — only fills codes when milestone lacks them, never overwrites.
        const mockById = new Map(INITIAL_PRODUCTS_DATA.map((p) => [p.id, p]));
        state.products = state.products.map((p) => {
          const mock = mockById.get(p.id);
          if (!mock) return p;
          const mockMsById = new Map((mock.milestones || []).map((m) => [m.id, m]));
          return {
            ...p,
            milestones: (p.milestones || []).map((m) => {
              if (m.deliverableCodes && m.deliverableCodes.length > 0) return m;
              const mockMs = m.id ? mockMsById.get(m.id) : undefined;
              return mockMs?.deliverableCodes ? { ...m, deliverableCodes: mockMs.deliverableCodes } : m;
            }),
          };
        });
        return state;
      },
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
