import { create } from 'zustand';
import type { KnowledgeDocInput } from '../ai/knowledgeRepo';
import { persist } from 'zustand/middleware';
import { useProductStore } from './productStore';
import { sqliteStorage } from './storage/sqliteStorage';
import type { Product } from '../data/mockProducts';
import {
  type ProductRequirementDesign,
  type UIPrototypeScreen,
  type ProductKnowledgeItem,
  type CodeScaffoldItem,
  type TestCaseItem,
  type CompetitorAnalysisData,
  type FullLifecycleDeliverable,
  INITIAL_KNOWLEDGE_BASE,
} from '../data/mockRndData';
import { DELIVERABLES_CATALOG } from '../data/deliverableCatalog';

export type {
  ProductRequirementDesign,
  UIPrototypeScreen,
  ProductKnowledgeItem,
  CodeScaffoldItem,
  TestCaseItem,
  CompetitorAnalysisData,
  FullLifecycleDeliverable,
};

// ponytail: typed empty fallbacks for unknown productIds. Replaces the
// INITIAL_X.p1 silent fallback that froze wrong-product data into persistence.
const EMPTY_REQUIREMENT: ProductRequirementDesign = {
  id: '', productId: '', title: '', version: 'v0.0.0', updatedAt: '',
  status: '草稿', author: '', businessGoal: '', targetAudience: [],
  coreSummary: '', userStories: [], useCases: [], boundaryChecks: [],
  flowchartNodes: [], prdMarkdown: '',
};

const EMPTY_PROTOTYPE: UIPrototypeScreen = {
  id: '', title: '', device: 'desktop', theme: 'indigo', route: '',
  description: '', sections: [],
  designTokens: { primaryColor: '', fontFamily: '', borderRadius: '', spacingScale: '' },
  reactCode: '',
};

const EMPTY_COMPETITOR: CompetitorAnalysisData = {
  productId: '', productName: '', updatedAt: '',
  radarData: [], competitors: [],
  swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
  differentiationStrategy: '', gapAnalysis: [],
};

// Helper — Phase 26 (26-01): explicit empty slots only. The catalog drives
// metadata (id/phase/code/title/...); content readiness is projected from
// knowledge_docs (hydrateDeliverableSlots). No fabricated seed content.
export function buildInitialDeliverables(product: Product): FullLifecycleDeliverable[] {
  return DELIVERABLES_CATALOG.map((cat) => ({
    id: `del-${product.id}-${cat.code}`,
    productId: product.id,
    phase: cat.phase,
    phaseName: cat.phaseName,
    code: cat.code,
    title: cat.title,
    category: cat.category,
    format: cat.format,
    icon: cat.icon,
    summary: cat.summary,
    status: 'draft' as const,
    generatedAt: '待生成',
    wordCount: '0 字',
    tags: [cat.phaseName, cat.format.toUpperCase()],
    content: '',
  }));
}

// ─── State shape ──────────────────────────────────────────────────────────────

interface RndState {
  requirements: Record<string, ProductRequirementDesign>;
  prototypes: Record<string, UIPrototypeScreen>;
  knowledgeBase: Record<string, ProductKnowledgeItem[]>;
  codeScaffolds: Record<string, CodeScaffoldItem[]>;
  testCases: Record<string, TestCaseItem[]>;
  competitorData: Record<string, CompetitorAnalysisData>;
  deliverables: Record<string, FullLifecycleDeliverable[]>;

  // ── Requirements ──────────────────────────────────────────────────────────
  getRequirementForProduct: (productId: string) => ProductRequirementDesign;
  updateRequirement: (productId: string, updates: Partial<ProductRequirementDesign>) => void;

  // ── Prototypes ────────────────────────────────────────────────────────────
  getPrototypeForProduct: (productId: string) => UIPrototypeScreen;
  updatePrototype: (productId: string, updates: Partial<UIPrototypeScreen>) => void;

  // ── Knowledge ─────────────────────────────────────────────────────────────
  // knowledgeBase is a PROJECTION of src/ai/knowledgeRepo.ts (source of truth:
  // SQLite knowledge_docs since Phase 15). Writes go through the repo single
  // write API; the local bucket is refreshed afterwards.
  getKnowledgeForProduct: (productId: string) => ProductKnowledgeItem[];
  addKnowledgeItem: (productId: string, item: Omit<ProductKnowledgeItem, 'id' | 'productId' | 'updatedAt'>, opts?: { sourceType?: KnowledgeDocInput['sourceType'] }) => Promise<void>;
  updateKnowledgeItem: (productId: string, itemId: string, updates: Partial<ProductKnowledgeItem>, opts?: { sourceType?: KnowledgeDocInput['sourceType'] }) => Promise<void>;
  deleteKnowledgeItem: (productId: string, itemId: string) => void;
  hydrateKnowledgeFromRepo: () => Promise<void>;

  // ── Deliverables projection (26-01: knowledge_docs is the sole truth source)
  hydrateDeliverableSlots: () => Promise<void>;

  // ── Code Scaffolds ────────────────────────────────────────────────────────
  getCodeScaffoldsForProduct: (productId: string) => CodeScaffoldItem[];
  addCodeScaffold: (productId: string, item: Omit<CodeScaffoldItem, 'id' | 'productId'>) => void;

  // ── Test Cases ────────────────────────────────────────────────────────────
  getTestCasesForProduct: (productId: string) => TestCaseItem[];
  addTestCase: (productId: string, item: Omit<TestCaseItem, 'id' | 'productId'>) => void;
  updateTestCase: (productId: string, testCaseId: string, updates: Partial<TestCaseItem>) => void;
  deleteTestCase: (productId: string, testCaseId: string) => void;
  runTestCase: (productId: string, testCaseId: string) => Promise<void>;
  runAllTestCases: (productId: string) => Promise<void>;

  // ── Competitor Analysis ───────────────────────────────────────────────────
  getCompetitorDataForProduct: (productId: string) => CompetitorAnalysisData;
  updateCompetitorData: (productId: string, updates: Partial<CompetitorAnalysisData>) => void;

  // ── Deliverables ──────────────────────────────────────────────────────────
  getDeliverablesForProduct: (productId: string) => FullLifecycleDeliverable[];
  commitDeliverableDraft: (productId: string, slotCode: string, content: string,
    aiSource: { sessionId: string; eventId: string; generatedAt: string; docId: string; version: number }) => void;
  syncDeliverableToDocs: (productId: string, deliverableId: string) => void;

  // ── Product init helper ───────────────────────────────────────────────────
  initDeliverablesForProduct: (product: Product) => void;

  // ── Phase 7 product-rnd linkage (L6/L7) ───────────────────────────────────
  cleanupProduct: (productId: string) => void;
  getDeliverableStatusForPhase: (
    productId: string,
    phase: 'requirement' | 'design' | 'dev' | 'test' | 'release',
  ) => { total: number; ready: number; generating: number; draft: number };

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

// Helper to get product from productStore
const getProd = (productId: string): Product | null => {
  const products = useProductStore.getState().products;
  return products.find((p) => p.id === productId) ?? null;
};

// Phase 15: KnowledgeDoc (repo) → ProductKnowledgeItem (projection). readTime
// lives only in the projection; repo docs carry no reading-time estimate.
export function docToItem(doc: { docId: string; productId: string; title: string; category: string; tags: string[]; summary: string; content: string; author: string; updatedAt: string }): ProductKnowledgeItem {
  return {
    id: doc.docId,
    productId: doc.productId,
    title: doc.title,
    category: doc.category as ProductKnowledgeItem['category'],
    tags: doc.tags,
    author: doc.author,
    updatedAt: doc.updatedAt,
    readTime: '—',
    summary: doc.summary,
    content: doc.content,
  };
}

export const useRndStore = create<RndState>()(
  persist(
    (set, get) => ({
  requirements: {},
  prototypes: {},
  knowledgeBase: INITIAL_KNOWLEDGE_BASE,
  codeScaffolds: {},
  testCases: {},
  competitorData: {},
  deliverables: (() => {
    const map: Record<string, FullLifecycleDeliverable[]> = {};
    useProductStore.getState().products.forEach((p) => {
      map[p.id] = buildInitialDeliverables(p);
    });
    return map;
  })(),

  // ── Requirements ────────────────────────────────────────────────────────
  getRequirementForProduct: (productId) => get().requirements[productId] ?? EMPTY_REQUIREMENT,

  updateRequirement: (productId, updates) =>
    set((state) => ({
      requirements: {
        ...state.requirements,
        [productId]: { ...get().getRequirementForProduct(productId), ...updates, updatedAt: new Date().toISOString() },
      },
    })),

  // ── Prototypes ──────────────────────────────────────────────────────────
  getPrototypeForProduct: (productId) => get().prototypes[productId] ?? EMPTY_PROTOTYPE,

  updatePrototype: (productId, updates) =>
    set((state) => ({
      prototypes: { ...state.prototypes, [productId]: { ...get().getPrototypeForProduct(productId), ...updates } },
    })),

  // ── Knowledge ───────────────────────────────────────────────────────────
  getKnowledgeForProduct: (productId) => {
    const { knowledgeBase } = get();
    if (knowledgeBase[productId]) return knowledgeBase[productId];
    console.warn('[rndStore] unknown productId in getKnowledgeForProduct:', productId);
    return [];
  },

  addKnowledgeItem: async (productId, item, opts) => {
    const { getKnowledgeRepo } = await import('@/src/ai/knowledgeRepo');
    const doc = await getKnowledgeRepo().upsertDoc({
      docId: `kb-${productId}-${Date.now()}`,
      productId,
      title: item.title,
      category: item.category,
      tags: item.tags,
      summary: item.summary,
      content: item.content,
      author: item.author,
      sourceType: opts?.sourceType ?? 'user',
    });
    const projected = docToItem(doc);
    if (item.readTime) projected.readTime = item.readTime;
    set((state) => ({
      knowledgeBase: {
        ...state.knowledgeBase,
        [productId]: [projected, ...(state.knowledgeBase[productId] || [])],
      },
    }));
  },

  updateKnowledgeItem: async (productId, itemId, updates, opts) => {
    const existing = (get().knowledgeBase[productId] || []).find((k) => k.id === itemId);
    if (!existing) return;
    const merged: ProductKnowledgeItem = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    // Same docId → new version row in the repo (MEM-04 audit chain).
    const { getKnowledgeRepo } = await import('@/src/ai/knowledgeRepo');
    await getKnowledgeRepo().upsertDoc({
      docId: itemId,
      productId,
      title: merged.title,
      category: merged.category,
      tags: merged.tags,
      summary: merged.summary,
      content: merged.content,
      author: merged.author,
      sourceType: opts?.sourceType ?? 'user',
    });
    set((state) => ({
      knowledgeBase: {
        ...state.knowledgeBase,
        [productId]: (state.knowledgeBase[productId] || []).map((k) => k.id === itemId ? merged : k),
      },
    }));
  },

  deleteKnowledgeItem: (productId, itemId) =>
    set((state) => ({
      knowledgeBase: { ...state.knowledgeBase, [productId]: (state.knowledgeBase[productId] || []).filter((k) => k.id !== itemId) },
    })),

  // Phase 15: rebuild the knowledgeBase projection from the repo (SQLite on
  // Tauri, in-memory mirror in web dev). Called once at boot after the seed gate.
  hydrateKnowledgeFromRepo: async () => {
    const { getKnowledgeRepo } = await import('@/src/ai/knowledgeRepo');
    const docs = await getKnowledgeRepo().getCurrentDocs();
    const base: Record<string, ProductKnowledgeItem[]> = {};
    for (const doc of docs) {
      // Phase 16: 'deliverable' 类文档归属研发中心卡槽,在 KnowledgeBaseView 仅经
      // FTS5 搜索命中,不进浏览列表/分类侧栏 — 侧栏 categories 由本投影派生
      // (KnowledgeBaseView.tsx:38-41),且跳过避免 ProductKnowledgeItem category
      // 联合类型撒谎。注:UI-SPEC Surface 4 的「appears automatically」按此口径
      // 理解为仅搜索命中(checker 修正)。
      if (doc.category === 'deliverable') continue;
      (base[doc.productId] ??= []).push(docToItem(doc));
    }
    set({ knowledgeBase: base });
  },

  // Phase 26 (26-01, PITFALLS #5 adjudication): deliverables is a PROJECTION of
  // knowledge_docs. Slot key = the stable docId convention from the Phase 16
  // commit path (generateDeliverable.ts): `deliverable-${productId}-${slotCode}`.
  // Docs without a matching catalog slot are skipped.
  hydrateDeliverableSlots: async () => {
    const { getKnowledgeRepo } = await import('@/src/ai/knowledgeRepo');
    const docs = await getKnowledgeRepo().getCurrentDocs();
    const deliverableDocs = docs.filter((doc) => doc.category === 'deliverable');
    if (deliverableDocs.length === 0) return;
    set((state) => {
      const deliverables: Record<string, FullLifecycleDeliverable[]> = {};
      for (const [productId, list] of Object.entries(state.deliverables)) {
        deliverables[productId] = list.map((slot) => {
          const doc = deliverableDocs.find((d) => d.docId === `deliverable-${productId}-${slot.code}`);
          if (!doc) return slot;
          return {
            ...slot,
            status: 'ready' as const,
            content: doc.content,
            generatedAt: doc.updatedAt,
            wordCount: `${doc.content.length} 字`,
          };
        });
      }
      return { deliverables };
    });
  },

  // ── Code Scaffolds ──────────────────────────────────────────────────────
  getCodeScaffoldsForProduct: (productId) => {
    const { codeScaffolds } = get();
    if (codeScaffolds[productId]) return codeScaffolds[productId];
    console.warn('[rndStore] unknown productId in getCodeScaffoldsForProduct:', productId);
    return [];
  },

  addCodeScaffold: (productId, item) =>
    set((state) => ({
      codeScaffolds: { ...state.codeScaffolds, [productId]: [{ ...item, id: `scaff-${productId}-${Date.now()}`, productId }, ...(state.codeScaffolds[productId] || [])] },
    })),

  // ── Test Cases ──────────────────────────────────────────────────────────
  getTestCasesForProduct: (productId) => {
    const { testCases } = get();
    if (testCases[productId]) return testCases[productId];
    console.warn('[rndStore] unknown productId in getTestCasesForProduct:', productId);
    return [];
  },

  addTestCase: (productId, item) =>
    set((state) => ({
      testCases: { ...state.testCases, [productId]: [{ ...item, id: `TC-${Date.now().toString().slice(-4)}`, productId }, ...(state.testCases[productId] || [])] },
    })),

  updateTestCase: (productId, testCaseId, updates) =>
    set((state) => ({
      testCases: { ...state.testCases, [productId]: (state.testCases[productId] || []).map((t) => t.id === testCaseId ? { ...t, ...updates } : t) },
    })),

  deleteTestCase: (productId, testCaseId) =>
    set((state) => ({
      testCases: { ...state.testCases, [productId]: (state.testCases[productId] || []).filter((t) => t.id !== testCaseId) },
    })),

  runTestCase: async (productId, testCaseId) => {
    get().updateTestCase(productId, testCaseId, { status: 'pending' });
    await new Promise((r) => setTimeout(r, 600));
    get().updateTestCase(productId, testCaseId, { status: 'passed' });
  },

  runAllTestCases: async (productId) => {
    const list = get().getTestCasesForProduct(productId);
    list.forEach((t) => get().updateTestCase(productId, t.id, { status: 'pending' }));
    await new Promise((r) => setTimeout(r, 1200));
    list.forEach((t) => get().updateTestCase(productId, t.id, { status: 'passed' }));
  },

  // ── Competitor Analysis ─────────────────────────────────────────────────
  getCompetitorDataForProduct: (productId) => get().competitorData[productId] ?? EMPTY_COMPETITOR,

  updateCompetitorData: (productId, updates) =>
    set((state) => ({
      competitorData: { ...state.competitorData, [productId]: { ...get().getCompetitorDataForProduct(productId), ...updates, updatedAt: new Date().toISOString() } },
    })),

  // ── Deliverables ────────────────────────────────────────────────────────
  getDeliverablesForProduct: (productId) => {
    const { deliverables } = get();
    if (deliverables[productId]) return deliverables[productId];
    const prod = getProd(productId);
    if (!prod) {
      console.warn('[rndStore] unknown productId in getDeliverablesForProduct:', productId);
      return [];
    }
    const list = buildInitialDeliverables(prod);
    set((state) => ({ deliverables: { ...state.deliverables, [productId]: list } }));
    return list;
  },

  // Phase 16 (DELIV-02/03): AI slot projection — the truth source is the
  // knowledge_docs version chain (docId/version pointer); this only mirrors
  // the current version into the R&D center slot with AI provenance.
  commitDeliverableDraft: (productId, slotCode, content, aiSource) => {
    const list = get().getDeliverablesForProduct(productId);
    if (!list.some((d) => d.code === slotCode)) {
      throw new Error(`[rndStore] deliverable slot not found: ${slotCode}`);
    }
    set((state) => ({
      deliverables: {
        ...state.deliverables,
        [productId]: state.deliverables[productId].map((d) => d.code === slotCode
          ? { ...d, content, status: 'ready' as const, generatedAt: aiSource.generatedAt, wordCount: `${content.length} 字`, aiSource }
          : d),
      },
    }));
  },

  syncDeliverableToDocs: (productId, deliverableId) => {
    const list = get().getDeliverablesForProduct(productId);
    const target = list.find((d) => d.id === deliverableId || d.code === deliverableId);
    if (!target) return;
    useProductStore.getState().addProductDocument(productId, {
      id: `doc-${Date.now()}`,
      title: `${target.title}.md`,
      category: target.phase === 'requirement' ? 'PRD需求' : target.phase === 'dev' ? '架构设计' : target.phase === 'design' ? 'API规范' : '发版规划',
      version: 'v1.0.0',
      author: 'AI 成果物工厂',
      updatedAt: new Date().toISOString(),
      wordCount: target.wordCount || '3,500 字',
      summary: target.summary,
      content: target.content,
    });
  },

  // ── Product init helper ─────────────────────────────────────────────────
  initDeliverablesForProduct: (product) =>
    set((state) => ({
      deliverables: { ...state.deliverables, [product.id]: buildInitialDeliverables(product) },
    })),

  // ── Phase 7 product-rnd linkage (L6/L7) ─────────────────────────────────
  cleanupProduct: (productId) =>
    set((state) => {
      const omit = <T,>(rec: Record<string, T>, key: string): Record<string, T> => {
        const { [key]: _removed, ...rest } = rec;
        return rest;
      };
      return {
        requirements: omit(state.requirements, productId),
        prototypes: omit(state.prototypes, productId),
        knowledgeBase: omit(state.knowledgeBase, productId),
        codeScaffolds: omit(state.codeScaffolds, productId),
        testCases: omit(state.testCases, productId),
        competitorData: omit(state.competitorData, productId),
        deliverables: omit(state.deliverables, productId),
      };
    }),

  getDeliverableStatusForPhase: (productId, phase) => {
    // getDeliverablesForProduct lazily initializes the entry when missing (existing pattern)
    const list = get().getDeliverablesForProduct(productId);
    const phaseList = list.filter((d) => d.phase === phase);
    return {
      total: phaseList.length,
      ready: phaseList.filter((d) => d.status === 'ready').length,
      generating: phaseList.filter((d) => d.status === 'generating').length,
      draft: phaseList.filter((d) => d.status === 'draft').length,
    };
  },

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'nova-rnd',
      version: 3,
      storage: sqliteStorage,
      partialize: (s) => ({
        requirements: s.requirements,
        prototypes: s.prototypes,
        codeScaffolds: s.codeScaffolds,
        testCases: s.testCases,
        competitorData: s.competitorData,
        deliverables: s.deliverables,
      }),
      migrate: (persisted, _version) => {
        const state = persisted as Partial<RndState>;
        // Phase 15: knowledgeBase is a repo projection — strip it from old
        // persisted buckets so stale kv data can never shadow SQLite.
        delete state.knowledgeBase;
        // Phase 26 (26-04) mock 全清,锁定决策「直接删除,不迁移」: these buckets
        // were only ever filled by mock seeds / mock generate actions — wipe them.
        state.requirements = {};
        state.prototypes = {};
        state.codeScaffolds = {};
        state.testCases = {};
        state.competitorData = {};
        // Phase 26 (26-01, v3): mock 全清 — persisted slots that are 'ready'
        // WITHOUT a Phase 16 commit provenance (aiSource) were fabricated seed
        // data; reset them to explicit empty slots. Real committed slots
        // (commitDeliverableDraft always stamps aiSource) survive, and
        // hydrateDeliverableSlots re-projects knowledge_docs at boot.
        if (state.deliverables) {
          const reset: typeof state.deliverables = {};
          for (const [productId, list] of Object.entries(state.deliverables)) {
            reset[productId] = (list ?? []).map((slot) =>
              slot.status !== 'ready' || slot.aiSource
                ? slot
                : { ...slot, status: 'draft' as const, generatedAt: '待生成', wordCount: '0 字', content: '' },
            );
          }
          state.deliverables = reset;
        }
        return state;
      },
      onRehydrateStorage: () => (state) => {
        // No knowledgeBase merge-back anymore: hydrateKnowledgeFromRepo() owns
        // that bucket after initializeDatabase (Tauri) / INITIAL_KNOWLEDGE_BASE
        // stays as the web-dev initial value.
        state?._setHydrated();
      },
    },
  ),
);
