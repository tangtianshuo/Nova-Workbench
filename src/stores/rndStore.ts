import { create } from 'zustand';
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
  INITIAL_REQUIREMENTS,
  INITIAL_PROTOTYPES,
  INITIAL_KNOWLEDGE_BASE,
  INITIAL_CODE_SCAFFOLDS,
  INITIAL_TEST_CASES,
  INITIAL_COMPETITOR_DATA,
  FULL_LIFECYCLE_DELIVERABLES_CATALOG,
} from '../data/mockRndData';

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

// Helper
export function buildInitialDeliverables(product: Product): FullLifecycleDeliverable[] {
  return FULL_LIFECYCLE_DELIVERABLES_CATALOG.map((cat, idx) => ({
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
    status: idx < 6 ? 'ready' as const : 'draft' as const,
    generatedAt: idx < 6 ? '2025-06-01 15:30' : '待生成',
    wordCount: idx < 6 ? `${Math.floor(2500 + Math.random() * 2000)} 字` : '0 字',
    tags: [cat.phaseName, cat.format.toUpperCase()],
    content: cat.defaultContent(product),
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
  generateRequirementAI: (productId: string, promptText: string, scenarioTemplate?: string) => Promise<void>;

  // ── Prototypes ────────────────────────────────────────────────────────────
  getPrototypeForProduct: (productId: string) => UIPrototypeScreen;
  updatePrototype: (productId: string, updates: Partial<UIPrototypeScreen>) => void;
  generatePrototypeAI: (productId: string, promptText: string, device?: 'desktop' | 'mobile' | 'tablet', theme?: 'indigo' | 'dark' | 'mint' | 'sunset') => Promise<void>;

  // ── Knowledge ─────────────────────────────────────────────────────────────
  // knowledgeBase is a PROJECTION of src/ai/knowledgeRepo.ts (source of truth:
  // SQLite knowledge_docs since Phase 15). Writes go through the repo single
  // write API; the local bucket is refreshed afterwards.
  getKnowledgeForProduct: (productId: string) => ProductKnowledgeItem[];
  addKnowledgeItem: (productId: string, item: Omit<ProductKnowledgeItem, 'id' | 'productId' | 'updatedAt'>) => Promise<void>;
  updateKnowledgeItem: (productId: string, itemId: string, updates: Partial<ProductKnowledgeItem>) => Promise<void>;
  deleteKnowledgeItem: (productId: string, itemId: string) => void;
  polishKnowledgeArticleAI: (productId: string, itemId: string, action: string) => Promise<string>;
  hydrateKnowledgeFromRepo: () => Promise<void>;

  // ── Code Scaffolds ────────────────────────────────────────────────────────
  getCodeScaffoldsForProduct: (productId: string) => CodeScaffoldItem[];
  addCodeScaffold: (productId: string, item: Omit<CodeScaffoldItem, 'id' | 'productId'>) => void;
  generateCodeScaffoldAI: (productId: string, type: 'api' | 'types' | 'component' | 'schema' | 'docker' | 'commit', promptText?: string) => Promise<void>;

  // ── Test Cases ────────────────────────────────────────────────────────────
  getTestCasesForProduct: (productId: string) => TestCaseItem[];
  addTestCase: (productId: string, item: Omit<TestCaseItem, 'id' | 'productId'>) => void;
  updateTestCase: (productId: string, testCaseId: string, updates: Partial<TestCaseItem>) => void;
  deleteTestCase: (productId: string, testCaseId: string) => void;
  generateTestCasesAI: (productId: string, promptText?: string) => Promise<void>;
  runTestCase: (productId: string, testCaseId: string) => Promise<void>;
  runAllTestCases: (productId: string) => Promise<void>;

  // ── Competitor Analysis ───────────────────────────────────────────────────
  getCompetitorDataForProduct: (productId: string) => CompetitorAnalysisData;
  updateCompetitorData: (productId: string, updates: Partial<CompetitorAnalysisData>) => void;
  generateCompetitorAnalysisAI: (productId: string, customPrompt?: string) => Promise<void>;

  // ── Deliverables ──────────────────────────────────────────────────────────
  getDeliverablesForProduct: (productId: string) => FullLifecycleDeliverable[];
  generateDeliverableAI: (productId: string, code: string, customPrompt?: string) => Promise<void>;
  generateAllDeliverablesBatchAI: (productId: string, onProgress?: (percent: number, currentTitle: string) => void) => Promise<void>;
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
function docToItem(doc: { docId: string; productId: string; title: string; category: string; tags: string[]; summary: string; content: string; author: string; updatedAt: string }): ProductKnowledgeItem {
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
  requirements: INITIAL_REQUIREMENTS,
  prototypes: INITIAL_PROTOTYPES,
  knowledgeBase: INITIAL_KNOWLEDGE_BASE,
  codeScaffolds: INITIAL_CODE_SCAFFOLDS,
  testCases: INITIAL_TEST_CASES,
  competitorData: INITIAL_COMPETITOR_DATA,
  deliverables: (() => {
    const map: Record<string, FullLifecycleDeliverable[]> = {};
    useProductStore.getState().products.forEach((p) => {
      map[p.id] = buildInitialDeliverables(p);
    });
    return map;
  })(),

  // ── Requirements ────────────────────────────────────────────────────────
  getRequirementForProduct: (productId) => {
    const { requirements } = get();
    if (requirements[productId]) return requirements[productId];
    const prod = getProd(productId);
    if (!prod) {
      console.warn('[rndStore] unknown productId in getRequirementForProduct:', productId);
      return EMPTY_REQUIREMENT;
    }
    return {
      id: `req-${productId}-1`,
      productId,
      title: `${prod.name} 需求规格说明与业务流转设计 (PRD)`,
      version: prod.version || 'v1.0.0',
      updatedAt: new Date().toISOString(),
      status: '草稿' as const,
      author: prod.owner,
      businessGoal: prod.positioning || prod.description,
      targetAudience: prod.targetAudience || ['互联网企业产研团队'],
      coreSummary: prod.description || '全自动需求分析与设计方案。',
      userStories: prod.featureMatrix?.map((f, i) => ({
        id: `US-${100 + i}`, epic: f.module || 'Core', role: '终端用户 / 业务管理人员',
        feature: f.name, benefit: f.desc, priority: (f.priority || 'P0') as 'P0' | 'P1' | 'P2',
        acceptanceCriteria: [`Given 用户触发 ${f.name} 流程, When 输入合法参数, Then 得到预期业务响应并更新看板状态。`],
      })) || [],
      useCases: [{
        id: 'UC-01', title: `${prod.name} 核心操作流转`, actor: '产品经理 / 研发负责人',
        preCondition: '系统已完成初始化配置',
        mainFlow: ['1. 用户登录系统并进入操作中枢；', '2. 选定目标模块并发起业务调度；', '3. 系统完成校验并产出目标交付物。'],
        altFlow: ['2a. 若缺少关键依赖，系统提供一键补充提示。'],
        postCondition: '数据持久化入库，更新项目燃尽进度。',
      }],
      boundaryChecks: [{ scenario: '网络波动或超时', riskLevel: 'medium' as const, impact: '请求失败', handlingStrategy: '自动重试与本地优雅降级。' }],
      flowchartNodes: [
        { id: '1', label: '1. 需求意图输入', type: 'start' as const, desc: '自然语言输入' },
        { id: '2', label: '2. 智能结构化拆解', type: 'agent' as const, desc: 'AI 解析' },
        { id: '3', label: '3. 交付物矩阵推导', type: 'end' as const, desc: 'PRD/用例/代码' },
      ],
      prdMarkdown: `# 【${prod.name}】产品需求规格说明书\n\n## 1. 业务目标\n${prod.description}\n\n## 2. 核心功能\n${prod.featureMatrix?.map(f => `- **${f.name}**：${f.desc}`).join('\n') || ''}`,
    };
  },

  updateRequirement: (productId, updates) =>
    set((state) => ({
      requirements: {
        ...state.requirements,
        [productId]: { ...get().getRequirementForProduct(productId), ...updates, updatedAt: new Date().toISOString() },
      },
    })),

  generateRequirementAI: async (productId, promptText, scenarioTemplate) => {
    const prod = getProd(productId);
    await new Promise((r) => setTimeout(r, 1200));
    const existing = get().getRequirementForProduct(productId);
    const generatedTitle = promptText ? `【${prod.name}】${promptText.slice(0, 20)}... 需求规格书` : `${prod.name} 智能需求设计方案 (v${prod.version})`;
    set((state) => ({
      requirements: {
        ...state.requirements,
        [productId]: {
          ...existing,
          id: `req-${productId}-${Date.now()}`,
          title: generatedTitle,
          version: `${prod.version}-rev`,
          status: '已评审' as const,
          businessGoal: promptText || prod.positioning,
          coreSummary: `由 AI 需求引擎围绕【${scenarioTemplate || '全场景业务'}】自动推导的结构化 PRD 与用户故事。`,
          prdMarkdown: `# ${generatedTitle}\n\n## 1. 业务目标与价值\n${promptText || prod.description}`,
        },
      },
    }));
  },

  // ── Prototypes ──────────────────────────────────────────────────────────
  getPrototypeForProduct: (productId) => {
    const { prototypes } = get();
    if (prototypes[productId]) return prototypes[productId];
    const prod = getProd(productId);
    if (!prod) {
      console.warn('[rndStore] unknown productId in getPrototypeForProduct:', productId);
      return EMPTY_PROTOTYPE;
    }
    return {
      id: `proto-${productId}-1`,
      title: `${prod.name} 核心交互原型`,
      device: 'desktop' as const, theme: 'indigo' as const,
      route: '/app/dashboard',
      description: `针对 ${prod.name} 的高保真交互体验沙箱。`,
      sections: [
        { title: '核心数据概览', type: 'stats' as const, data: [
          { label: '活跃用户', value: prod.metrics?.dau || '1.2k', change: '+12%', color: 'text-indigo-600' },
          { label: '系统健康度', value: prod.health === 'healthy' ? '98.5%' : '88.0%', change: '运行稳定', color: 'text-emerald-600' },
          { label: '已就绪交付物', value: '18 份', change: '全套就绪', color: 'text-blue-600' },
        ]},
        { title: '智能交互与任务看板', type: 'kanban' as const, data: prod.featureMatrix?.slice(0, 3) || [] },
      ],
      designTokens: { primaryColor: '#4F46E5', fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif', borderRadius: '16px', spacingScale: '4px / 8px / 16px / 24px / 32px' },
      reactCode: `export function ${prod.name.replace(/[^a-zA-Z0-9]/g, '')}Prototype() {\n  return <div>就绪</div>;\n}`,
    };
  },

  updatePrototype: (productId, updates) =>
    set((state) => ({
      prototypes: { ...state.prototypes, [productId]: { ...get().getPrototypeForProduct(productId), ...updates } },
    })),

  generatePrototypeAI: async (productId, promptText, device = 'desktop', theme = 'indigo') => {
    await new Promise((r) => setTimeout(r, 1200));
    const prod = getProd(productId);
    set((state) => ({
      prototypes: {
        ...state.prototypes,
        [productId]: {
          id: `proto-${productId}-${Date.now()}`,
          title: promptText ? `【${prod.name}】${promptText}` : `${prod.name} AI 交互原型设计`,
          device, theme, route: '/app/interactive-sandbox',
          description: promptText || `基于 ${prod.name} 核心需求自动生成的多端响应式交互原型。`,
          sections: [
            { title: '实时业务指标大屏', type: 'stats' as const, data: [
              { label: '核心业务流转率', value: '96.8%', change: '+8.4%', color: 'text-indigo-600' },
              { label: '端到端响应耗时', value: '145ms', change: '极速', color: 'text-emerald-600' },
              { label: '测试用例通过率', value: '100%', change: '全部通过', color: 'text-blue-600' },
            ]},
          ],
          designTokens: { primaryColor: '#4F46E5', fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif', borderRadius: '16px', spacingScale: '4px / 8px / 16px / 24px / 32px' },
          reactCode: `export function GeneratedView() { return <div>${prod.name}</div>; }`,
        },
      },
    }));
  },

  // ── Knowledge ───────────────────────────────────────────────────────────
  getKnowledgeForProduct: (productId) => {
    const { knowledgeBase } = get();
    if (knowledgeBase[productId]) return knowledgeBase[productId];
    console.warn('[rndStore] unknown productId in getKnowledgeForProduct:', productId);
    return [];
  },

  addKnowledgeItem: async (productId, item) => {
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
      sourceType: 'user',
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

  updateKnowledgeItem: async (productId, itemId, updates) => {
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
      sourceType: 'user',
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

  polishKnowledgeArticleAI: async (productId, itemId, action) => {
    const list = get().knowledgeBase[productId] || [];
    const target = list.find((k) => k.id === itemId);
    if (!target) return '';
    const polished = `${target.content}\n\n### 📌 AI 自动补充与沉淀 (${action})`;
    await get().updateKnowledgeItem(productId, itemId, { content: polished });
    return polished;
  },

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

  generateCodeScaffoldAI: async (productId, type, promptText) => {
    await new Promise((r) => setTimeout(r, 1000));
    const prod = getProd(productId);
    const filenames: Record<string, string> = { api: 'src/api/routes.ts', types: 'src/types/schema.ts', component: 'src/components/CoreFeature.tsx', schema: 'db/migrations/schema.sql', docker: 'Dockerfile', commit: 'git-commit-msg.txt' };
    get().addCodeScaffold(productId, {
      name: `${prod.name} ${type.toUpperCase()} 自动工程代码`,
      type, language: type === 'schema' ? 'sql' : type === 'api' || type === 'types' || type === 'component' ? 'typescript' : 'text',
      filename: filenames[type],
      description: promptText || `由 AI 架构引擎针对 ${prod.name} 自动生成的工程代码规范。`,
      code: type === 'schema' ? `CREATE TABLE tbl_${prod.id}_core (id VARCHAR(64) PRIMARY KEY);` : `export interface Payload { id: string; status: 'active' | 'pending'; }`,
    });
  },

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

  generateTestCasesAI: async (productId, promptText) => {
    await new Promise((r) => setTimeout(r, 1200));
    const prod = getProd(productId);
    const cases: TestCaseItem[] = [
      { id: `TC-${Math.floor(100 + Math.random() * 900)}`, productId, module: '全自动生成引擎', title: promptText ? `验证【${promptText}】正向流转` : `验证 ${prod.name} 全流程成果物秒级推导`, type: '功能测试', priority: 'P0', preconditions: '已选定当前产品并进入成果物中心', steps: ['1. 点击一键生成按钮;', '2. 检查生成的 Markdown 及 JSON 完整性;'], expectedResult: '各阶段成果物格式严谨无缺失，用时 <= 3s。', status: 'passed', automated: true },
      { id: `TC-${Math.floor(100 + Math.random() * 900)}`, productId, module: '边界容错', title: '验证高并发请求下的速率限制与断点恢复', type: '边界条件', priority: 'P1', preconditions: '模拟网络抖动或连续点击', steps: ['1. 连续快速触发生成请求;', '2. 检查 UI 防抖与后端锁机制;'], expectedResult: '系统有效防抖，无重复冗余任务入库。', status: 'passed', automated: true },
    ];
    set((state) => ({ testCases: { ...state.testCases, [productId]: [...cases, ...(state.testCases[productId] || [])] } }));
  },

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
  getCompetitorDataForProduct: (productId) => {
    const { competitorData } = get();
    if (competitorData[productId]) return competitorData[productId];
    const prod = getProd(productId);
    if (!prod) {
      console.warn('[rndStore] unknown productId in getCompetitorDataForProduct:', productId);
      return EMPTY_COMPETITOR;
    }
    return { productId, productName: prod.name, updatedAt: new Date().toISOString(), radarData: INITIAL_COMPETITOR_DATA.p1.radarData, competitors: INITIAL_COMPETITOR_DATA.p1.competitors, swot: INITIAL_COMPETITOR_DATA.p1.swot, differentiationStrategy: `### 🎯 【${prod.name}】核心破局`, gapAnalysis: INITIAL_COMPETITOR_DATA.p1.gapAnalysis };
  },

  updateCompetitorData: (productId, updates) =>
    set((state) => ({
      competitorData: { ...state.competitorData, [productId]: { ...get().getCompetitorDataForProduct(productId), ...updates, updatedAt: new Date().toISOString() } },
    })),

  generateCompetitorAnalysisAI: async (productId, customPrompt) => {
    await new Promise((r) => setTimeout(r, 1400));
    const prod = getProd(productId);
    get().updateCompetitorData(productId, {
      radarData: [
        { dimension: 'AI 全自动工程化', ourProduct: 96, compA: 65, compB: 50, compC: 45 },
        { dimension: '多 Agent 协同深度', ourProduct: 94, compA: 72, compB: 68, compC: 50 },
        { dimension: '本地资产与文件深度绑定', ourProduct: 92, compA: 45, compB: 35, compC: 82 },
        { dimension: '全流程成果物一键矩阵', ourProduct: 99, compA: 58, compB: 48, compC: 38 },
        { dimension: '产研全链路协同', ourProduct: 95, compA: 68, compB: 88, compC: 52 },
        { dimension: '轻量化易用性与响应速度', ourProduct: 90, compA: 88, compB: 72, compC: 78 },
      ],
      swot: {
        strengths: [`【${prod.name}】闭环交付优势`],
        weaknesses: ['品牌知名度仍需拓展'],
        opportunities: ['全球数字化产研团队的刚性需求'],
        threats: ['海外巨头快速集成 AI 插件'],
      },
    });
  },

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

  generateDeliverableAI: async (productId, code, customPrompt) => {
    const list = get().getDeliverablesForProduct(productId);
    const prod = getProd(productId);
    const target = list.find((d) => d.code === code);
    if (!target) return;
    set((state) => ({
      deliverables: { ...state.deliverables, [productId]: state.deliverables[productId].map((d) => d.code === code ? { ...d, status: 'generating' as const } : d) },
    }));
    await new Promise((r) => setTimeout(r, 800));
    const generatedContent = [
      `# ${target.title}`,
      '',
      `产品：${prod?.name || productId}`,
      customPrompt ? `\n补充要求：${customPrompt}` : '',
      '',
      '## 交付目标',
      target.summary,
      '',
      '## 验收要点',
      '- 明确范围、输入输出和责任边界',
      '- 记录关键风险与验证方式',
    ].join('\n');
    set((state) => ({
      deliverables: { ...state.deliverables, [productId]: state.deliverables[productId].map((d) => d.code === code ? { ...d, status: 'ready' as const, content: generatedContent, generatedAt: new Date().toISOString(), wordCount: `${generatedContent.length} 字` } : d) },
    }));
  },

  generateAllDeliverablesBatchAI: async (productId, onProgress) => {
    const list = get().getDeliverablesForProduct(productId);
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      onProgress?.(Math.round(((i + 1) / list.length) * 100), item.title);
      set((state) => ({
        deliverables: { ...state.deliverables, [productId]: state.deliverables[productId].map((d, idx) => idx === i ? { ...d, status: 'generating' as const } : d) },
      }));
      await new Promise((r) => setTimeout(r, 200));
      set((state) => ({
        deliverables: { ...state.deliverables, [productId]: state.deliverables[productId].map((d, idx) => idx === i ? { ...d, status: 'ready' as const, generatedAt: new Date().toISOString(), wordCount: `${Math.floor(2500 + Math.random() * 2000)} 字` } : d) },
      }));
    }
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
      version: 2,
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
