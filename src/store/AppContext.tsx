/**
 * Compatibility layer: AppContext now delegates to Zustand stores.
 *
 * All views still work via `useApp()`. Individual stores can be adopted
 * incrementally with `useTaskStore()`, `useProductStore()`, etc.
 *
 * This file will be removed once all views are migrated.
 */
import { createContext, useContext, ReactNode, Dispatch, SetStateAction } from 'react';
import { Task, TaskCategory } from '../data/mockTasks';
import type {
  Product,
  ProductMilestone,
  ProductDocument,
  ProductSkill,
  Project,
} from '../stores/productStore';
import type {
  ProductRequirementDesign,
  UIPrototypeScreen,
  ProductKnowledgeItem,
  CodeScaffoldItem,
  TestCaseItem,
  CompetitorAnalysisData,
  FullLifecycleDeliverable,
} from '../stores/rndStore';
import type { ScheduleEvent } from '../stores/scheduleStore';
import type { Workspace, WorkspaceFile, LocalIndexedFile } from '../stores/workspaceStore';
import { useTaskStore } from '../stores/taskStore';
import { useProductStore } from '../stores/productStore';
import { useRndStore } from '../stores/rndStore';
import { useScheduleStore } from '../stores/scheduleStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useUIStore } from '../stores/uiStore';

// Re-export all types for backward compatibility
export type {
  Product,
  ProductMilestone,
  ProductDocument,
  ProductSkill,
  Project,
  ProductRequirementDesign,
  UIPrototypeScreen,
  ProductKnowledgeItem,
  CodeScaffoldItem,
  TestCaseItem,
  CompetitorAnalysisData,
  FullLifecycleDeliverable,
  Workspace,
  WorkspaceFile,
  LocalIndexedFile,
  ScheduleEvent,
};

interface AppContextType {
  categories: TaskCategory[];
  setCategories: Dispatch<SetStateAction<TaskCategory[]>>;
  events: ScheduleEvent[];
  setEvents: Dispatch<SetStateAction<ScheduleEvent[]>>;
  projects: Product[];
  setProjects: Dispatch<SetStateAction<Product[]>>;
  products: Product[];
  setProducts: Dispatch<SetStateAction<Product[]>>;
  selectedProductId: string | null;
  setSelectedProductId: Dispatch<SetStateAction<string | null>>;
  workspaces: Workspace[];
  setWorkspaces: Dispatch<SetStateAction<Workspace[]>>;
  localIndexedFiles: LocalIndexedFile[];
  setLocalIndexedFiles: Dispatch<SetStateAction<LocalIndexedFile[]>>;

  // R&D
  requirements: Record<string, ProductRequirementDesign>;
  prototypes: Record<string, UIPrototypeScreen>;
  knowledgeBase: Record<string, ProductKnowledgeItem[]>;
  codeScaffolds: Record<string, CodeScaffoldItem[]>;
  testCases: Record<string, TestCaseItem[]>;
  competitorData: Record<string, CompetitorAnalysisData>;
  deliverables: Record<string, FullLifecycleDeliverable[]>;

  getRequirementForProduct: (productId: string) => ProductRequirementDesign;
  updateRequirement: (productId: string, updates: Partial<ProductRequirementDesign>) => void;
  generateRequirementAI: (productId: string, promptText: string, scenarioTemplate?: string) => Promise<void>;

  getPrototypeForProduct: (productId: string) => UIPrototypeScreen;
  updatePrototype: (productId: string, updates: Partial<UIPrototypeScreen>) => void;
  generatePrototypeAI: (productId: string, promptText: string, device?: 'desktop' | 'mobile' | 'tablet', theme?: 'indigo' | 'dark' | 'mint' | 'sunset') => Promise<void>;

  getKnowledgeForProduct: (productId: string) => ProductKnowledgeItem[];
  addKnowledgeItem: (productId: string, item: Omit<ProductKnowledgeItem, 'id' | 'productId' | 'updatedAt'>) => void;
  updateKnowledgeItem: (productId: string, itemId: string, updates: Partial<ProductKnowledgeItem>) => void;
  deleteKnowledgeItem: (productId: string, itemId: string) => void;
  polishKnowledgeArticleAI: (productId: string, itemId: string, action: string) => Promise<string>;

  getCodeScaffoldsForProduct: (productId: string) => CodeScaffoldItem[];
  addCodeScaffold: (productId: string, item: Omit<CodeScaffoldItem, 'id' | 'productId'>) => void;
  generateCodeScaffoldAI: (productId: string, type: 'api' | 'types' | 'component' | 'schema' | 'docker' | 'commit', promptText?: string) => Promise<void>;

  getTestCasesForProduct: (productId: string) => TestCaseItem[];
  addTestCase: (productId: string, item: Omit<TestCaseItem, 'id' | 'productId'>) => void;
  updateTestCase: (productId: string, testCaseId: string, updates: Partial<TestCaseItem>) => void;
  deleteTestCase: (productId: string, testCaseId: string) => void;
  generateTestCasesAI: (productId: string, promptText?: string) => Promise<void>;
  runTestCase: (productId: string, testCaseId: string) => Promise<void>;
  runAllTestCases: (productId: string) => Promise<void>;

  getCompetitorDataForProduct: (productId: string) => CompetitorAnalysisData;
  updateCompetitorData: (productId: string, updates: Partial<CompetitorAnalysisData>) => void;
  generateCompetitorAnalysisAI: (productId: string, customPrompt?: string) => Promise<void>;

  getDeliverablesForProduct: (productId: string) => FullLifecycleDeliverable[];
  generateDeliverableAI: (productId: string, code: string, customPrompt?: string) => Promise<void>;
  generateAllDeliverablesBatchAI: (productId: string, onProgress?: (percent: number, currentTitle: string) => void) => Promise<void>;
  syncDeliverableToDocs: (productId: string, deliverableId: string) => void;

  addTask: (task: Task, categoryId?: string) => void;
  addCategory: (name: string, color?: string) => void;
  addEvent: (event: ScheduleEvent) => void;
  // Phase 6 CRUD delegates (SCHED-01/02/03)
  createEvent: (event: ScheduleEvent) => void;
  updateEvent: (eventId: string, updates: Partial<ScheduleEvent>) => void;
  deleteEvent: (eventId: string) => void;
  addProject: (project: Product) => void;
  addProduct: (product: Product) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  addProductDocument: (productId: string, doc: ProductDocument) => void;
  toggleSkillStatus: (productId: string, skillId: string) => void;
  runProductSkill: (productId: string, skillId: string) => Promise<any>;
  addProductMilestone: (productId: string, milestone: ProductMilestone) => void;
  updateMilestoneStatus: (productId: string, milestoneId: string, status: 'completed' | 'in-progress' | 'pending') => void;
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
  deleteWorkspace: (id: string) => void;
  addLocalIndexedFile: (file: LocalIndexedFile) => void;
  completeTask: (taskId: string) => void;
  getProjectTaskCount: (projectIdOrName?: string) => number;

  // Phase 5 CRUD delegates (TASK-07/08)
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  reopenTask: (taskId: string) => void;
  moveTask: (taskId: string, fromCatId: string, toCatId: string) => void;
  setTaskProject: (taskId: string, projectId: string | undefined) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // Subscribe to stores for reactive updates
  const categories = useTaskStore((s) => s.categories);
  const setCategories = useTaskStore((s) => s.setCategories);
  const events = useScheduleStore((s) => s.events);
  const setEvents = useScheduleStore((s) => s.setEvents);
  const products = useProductStore((s) => s.products);
  const setProducts = useProductStore((s) => s.setProducts);
  const selectedProductId = useUIStore((s) => s.selectedProductId);
  const setSelectedProductId = useUIStore((s) => s.setSelectedProductId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const localIndexedFiles = useWorkspaceStore((s) => s.localIndexedFiles);
  const setLocalIndexedFiles = useWorkspaceStore((s) => s.setLocalIndexedFiles);

  // R&D store subscriptions
  const requirements = useRndStore((s) => s.requirements);
  const prototypes = useRndStore((s) => s.prototypes);
  const knowledgeBase = useRndStore((s) => s.knowledgeBase);
  const codeScaffolds = useRndStore((s) => s.codeScaffolds);
  const testCases = useRndStore((s) => s.testCases);
  const competitorData = useRndStore((s) => s.competitorData);
  const deliverables = useRndStore((s) => s.deliverables);

  // R&D actions (stable references)
  const getRequirementForProduct = useRndStore((s) => s.getRequirementForProduct);
  const updateRequirement = useRndStore((s) => s.updateRequirement);
  const generateRequirementAI = useRndStore((s) => s.generateRequirementAI);
  const getPrototypeForProduct = useRndStore((s) => s.getPrototypeForProduct);
  const updatePrototype = useRndStore((s) => s.updatePrototype);
  const generatePrototypeAI = useRndStore((s) => s.generatePrototypeAI);
  const getKnowledgeForProduct = useRndStore((s) => s.getKnowledgeForProduct);
  const addKnowledgeItem = useRndStore((s) => s.addKnowledgeItem);
  const updateKnowledgeItem = useRndStore((s) => s.updateKnowledgeItem);
  const deleteKnowledgeItem = useRndStore((s) => s.deleteKnowledgeItem);
  const polishKnowledgeArticleAI = useRndStore((s) => s.polishKnowledgeArticleAI);
  const getCodeScaffoldsForProduct = useRndStore((s) => s.getCodeScaffoldsForProduct);
  const addCodeScaffold = useRndStore((s) => s.addCodeScaffold);
  const generateCodeScaffoldAI = useRndStore((s) => s.generateCodeScaffoldAI);
  const getTestCasesForProduct = useRndStore((s) => s.getTestCasesForProduct);
  const addTestCase = useRndStore((s) => s.addTestCase);
  const updateTestCase = useRndStore((s) => s.updateTestCase);
  const deleteTestCase = useRndStore((s) => s.deleteTestCase);
  const generateTestCasesAI = useRndStore((s) => s.generateTestCasesAI);
  const runTestCase = useRndStore((s) => s.runTestCase);
  const runAllTestCases = useRndStore((s) => s.runAllTestCases);
  const getCompetitorDataForProduct = useRndStore((s) => s.getCompetitorDataForProduct);
  const updateCompetitorData = useRndStore((s) => s.updateCompetitorData);
  const generateCompetitorAnalysisAI = useRndStore((s) => s.generateCompetitorAnalysisAI);
  const getDeliverablesForProduct = useRndStore((s) => s.getDeliverablesForProduct);
  const generateDeliverableAI = useRndStore((s) => s.generateDeliverableAI);
  const generateAllDeliverablesBatchAI = useRndStore((s) => s.generateAllDeliverablesBatchAI);
  const syncDeliverableToDocs = useRndStore((s) => s.syncDeliverableToDocs);

  // Task/Product/Workspace actions
  const addTask = useTaskStore((s) => s.addTask);
  const addCategory = useTaskStore((s) => s.addCategory);
  const completeTask = useTaskStore((s) => s.completeTask);
  const getProjectTaskCount = useTaskStore((s) => s.getProjectTaskCount);
  // Phase 5 CRUD delegates
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const reopenTask = useTaskStore((s) => s.reopenTask);
  const moveTask = useTaskStore((s) => s.moveTask);
  const setTaskProject = useTaskStore((s) => s.setTaskProject);

  const addEvent = useScheduleStore((s) => s.addEvent);
  // Phase 6 CRUD delegates
  const createEvent = useScheduleStore((s) => s.createEvent);
  const updateEvent = useScheduleStore((s) => s.updateEvent);
  const deleteEvent = useScheduleStore((s) => s.deleteEvent);

  const addProduct = useProductStore((s) => s.addProduct);
  const updateProduct = useProductStore((s) => s.updateProduct);
  const deleteProduct = useProductStore((s) => s.deleteProduct);
  const addProductDocument = useProductStore((s) => s.addProductDocument);
  const toggleSkillStatus = useProductStore((s) => s.toggleSkillStatus);
  const runProductSkill = useProductStore((s) => s.runProductSkill);
  const addProductMilestone = useProductStore((s) => s.addProductMilestone);
  const updateMilestoneStatus = useProductStore((s) => s.updateMilestoneStatus);

  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);
  const addLocalIndexedFile = useWorkspaceStore((s) => s.addLocalIndexedFile);

  // Wrap addProject to also init deliverables
  const addProject = (project: Product) => {
    addProduct(project);
    useRndStore.getState().initDeliverablesForProduct(project);
  };

  // Wrap deleteProduct to clear selection
  const deleteProductWrapped = (id: string) => {
    deleteProduct(id);
    if (selectedProductId === id) setSelectedProductId(null);
  };

  const value: AppContextType = {
    categories, setCategories: setCategories as any,
    events, setEvents: setEvents as any,
    projects: products, setProjects: setProducts as any,
    products, setProducts: setProducts as any,
    selectedProductId, setSelectedProductId: setSelectedProductId as any,
    workspaces, setWorkspaces: setWorkspaces as any,
    localIndexedFiles, setLocalIndexedFiles: setLocalIndexedFiles as any,

    requirements, prototypes, knowledgeBase, codeScaffolds, testCases, competitorData, deliverables,

    getRequirementForProduct, updateRequirement, generateRequirementAI,
    getPrototypeForProduct, updatePrototype, generatePrototypeAI,
    getKnowledgeForProduct, addKnowledgeItem, updateKnowledgeItem, deleteKnowledgeItem, polishKnowledgeArticleAI,
    getCodeScaffoldsForProduct, addCodeScaffold, generateCodeScaffoldAI,
    getTestCasesForProduct, addTestCase, updateTestCase, deleteTestCase, generateTestCasesAI, runTestCase, runAllTestCases,
    getCompetitorDataForProduct, updateCompetitorData, generateCompetitorAnalysisAI,
    getDeliverablesForProduct, generateDeliverableAI, generateAllDeliverablesBatchAI, syncDeliverableToDocs,

    addTask, addCategory, addEvent, addProject,
    createEvent, updateEvent, deleteEvent,
    addProduct, updateProduct, deleteProduct: deleteProductWrapped,
    addProductDocument, toggleSkillStatus, runProductSkill,
    addProductMilestone, updateMilestoneStatus,
    addWorkspace, updateWorkspace, deleteWorkspace, addLocalIndexedFile,
    completeTask, getProjectTaskCount,
    updateTask, deleteTask, reopenTask, moveTask, setTaskProject,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
