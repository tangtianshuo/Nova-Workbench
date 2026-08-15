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
import type { ScheduleEvent, ScheduleEventStatus } from '../stores/scheduleStore';
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
  ScheduleEventStatus,
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
  addKnowledgeItem: (productId: string, item: Omit<ProductKnowledgeItem, 'id' | 'productId' | 'updatedAt'>) => Promise<void>;
  updateKnowledgeItem: (productId: string, itemId: string, updates: Partial<ProductKnowledgeItem>) => Promise<void>;
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

  // Phase 7 schedule delegates (CROSS-05/CROSS-07)
  setEventStatus: (eventId: string, status: ScheduleEventStatus) => void;
  clearTaskLink: (eventId: string) => void;

  // Phase 7 rnd delegates (L6/L7)
  cleanupProduct: (productId: string) => void;
  getDeliverableStatusForPhase: (
    productId: string,
    phase: 'requirement' | 'design' | 'dev' | 'test' | 'release',
  ) => { total: number; ready: number; generating: number; draft: number };

  // Phase 7 task delegate (CROSS-03)
  unlinkProjectTasks: (projectId: string) => void;

  // Phase 7 cross-store wrappers (CROSS-01/02/03, L7)
  arrangeOnCalendar: (taskId: string) => {
    success: boolean;
    event?: ScheduleEvent;
    reason?: 'no-deadline' | 'already-arranged' | 'task-not-found';
  };
  // Quick 260811-v3i: auto-sync task↔schedule based on deadline changes.
  // One call covers create/update/remove/noop — see implementation below.
  syncTaskSchedule: (
    taskId: string,
    prevDeadline?: string,
  ) => { action: 'created' | 'updated' | 'removed' | 'noop'; eventId?: string };
  getDeleteProductImpact: (productId: string) => {
    taskCount: number;
    eventCount: number;
    hasRndData: boolean;
  };
  doDeleteProduct: (productId: string) => void;
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
  // Phase 7 schedule delegates
  const setEventStatus = useScheduleStore((s) => s.setEventStatus);
  const clearTaskLink = useScheduleStore((s) => s.clearTaskLink);
  // Phase 7 rnd delegates
  const cleanupProduct = useRndStore((s) => s.cleanupProduct);
  const getDeliverableStatusForPhase = useRndStore((s) => s.getDeliverableStatusForPhase);
  // Phase 7 task delegate
  const unlinkProjectTasks = useTaskStore((s) => s.unlinkProjectTasks);

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

  // Phase 7 (CROSS-01/CROSS-02, D-01/D-02): schedule a task to the calendar and
  // establish the bidirectional task↔event link. Reads via getState() so this
  // wrapper stays a plain function (no React state dependency).
  const arrangeOnCalendar = (taskId: string) => {
    const task = useTaskStore
      .getState()
      .categories.flatMap((c) => c.tasks)
      .find((t) => t.id === taskId);
    if (!task) return { success: false as const, reason: 'task-not-found' as const };
    if (task.scheduledEventId)
      return { success: false as const, reason: 'already-arranged' as const };
    if (!task.deadline) return { success: false as const, reason: 'no-deadline' as const };

    // Task.deadline is 'YYYY-MM-DD HH:mm' (or just 'YYYY-MM-DD'). Split into date/time.
    const [datePart, timePart] = task.deadline.split(' ');
    const event: ScheduleEvent = {
      id: crypto.randomUUID(),
      title: task.title, // D-02: title mirrors task (user can edit later)
      time: timePart ? timePart : '全天',
      date: datePart, // YYYY-MM-DD
      type: 'task',
      location: '',
      projectId: task.projectId,
      taskId: task.id,
      status: '未开始',
    };
    useScheduleStore.getState().createEvent(event);
    useTaskStore.getState().updateTask(taskId, { scheduledEventId: event.id });
    return { success: true as const, event };
  };

  // Quick 260811-v3i: auto-sync task↔schedule. Covers all deadline-change cases
  // in one call: noop / remove old event / create new / update existing.
  // prevDeadline enables case (5) "deadline unchanged" → noop, avoiding spurious updates.
  const syncTaskSchedule = (
    taskId: string,
    prevDeadline?: string,
  ): { action: 'created' | 'updated' | 'removed' | 'noop'; eventId?: string } => {
    const task = useTaskStore
      .getState()
      .categories.flatMap((c) => c.tasks)
      .find((t) => t.id === taskId);
    if (!task) return { action: 'noop' as const };

    const hasDeadline = !!task.deadline;
    const linkedId = task.scheduledEventId;

    // (1) no deadline, no link → noop
    if (!hasDeadline && !linkedId) return { action: 'noop' as const };

    // (2) no deadline but linked → remove old event (deleteEvent is pure filter,
    // reverse taskId link disappears with the event)
    if (!hasDeadline && linkedId) {
      useScheduleStore.getState().deleteEvent(linkedId);
      useTaskStore.getState().updateTask(taskId, { scheduledEventId: undefined });
      return { action: 'removed' as const };
    }

    // Has deadline: split date/time
    const [datePart, timePart] = task.deadline!.split(' ');

    // (3) deadline but no link → create via arrangeOnCalendar
    if (hasDeadline && !linkedId) {
      const result = arrangeOnCalendar(taskId);
      return result.success
        ? { action: 'created' as const, eventId: result.event!.id }
        : { action: 'noop' as const };
    }

    // (4)+(5) deadline + link → update only if deadline actually changed
    if (prevDeadline !== task.deadline) {
      useScheduleStore.getState().updateEvent(linkedId!, {
        date: datePart,
        time: timePart ?? '全天',
        title: task.title, // weak sync: align title on deadline change
      });
      return { action: 'updated' as const, eventId: linkedId };
    }
    return { action: 'noop' as const };
  };

  // Phase 7 (CROSS-03, D-04): compute the blast radius of deleting a product
  // BEFORE the actual delete, so UI can render an accurate confirmation dialog.
  const getDeleteProductImpact = (productId: string) => {
    const taskCount = useTaskStore
      .getState()
      .categories.flatMap((c) => c.tasks)
      .filter((t) => t.projectId === productId).length;
    const eventCount = useScheduleStore
      .getState()
      .events.filter((e) => e.projectId === productId).length;
    const rnd = useRndStore.getState();
    const hasRndData =
      !!rnd.deliverables[productId] ||
      !!rnd.requirements[productId] ||
      !!rnd.prototypes[productId] ||
      !!rnd.knowledgeBase[productId] ||
      !!rnd.codeScaffolds[productId] ||
      !!rnd.testCases[productId] ||
      !!rnd.competitorData[productId];
    return { taskCount, eventCount, hasRndData };
  };

  // Phase 7 (CROSS-03, D-05/D-06, L7): execute the cascading delete after the
  // user has confirmed. Order matters: clear reverse links first, then rnd data,
  // finally the product row and selection state.
  const doDeleteProduct = (productId: string) => {
    // 1. Detach all tasks from this product (CROSS-03)
    useTaskStore.getState().unlinkProjectTasks(productId);
    // 2. Detach all schedule events from this product (CROSS-03)
    const eventsForProduct = useScheduleStore
      .getState()
      .events.filter((e) => e.projectId === productId);
    eventsForProduct.forEach((e) =>
      useScheduleStore.getState().updateEvent(e.id, { projectId: undefined }),
    );
    // 2.5 Detach all workspaces from this product (dangling projectId fix)
    useWorkspaceStore.getState().unlinkProjectWorkspaces(productId);
    // 3. Cascade-clean rndStore for this product (L7)
    useRndStore.getState().cleanupProduct(productId);
    // 4. Remove the product itself
    deleteProduct(productId);
    // 5. Clear the selection if it pointed at the deleted product
    if (selectedProductId === productId) setSelectedProductId(null);
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
    addProduct, updateProduct, deleteProduct,
    addProductDocument, toggleSkillStatus, runProductSkill,
    addProductMilestone, updateMilestoneStatus,
    addWorkspace, updateWorkspace, deleteWorkspace, addLocalIndexedFile,
    completeTask, getProjectTaskCount,
    updateTask, deleteTask, reopenTask, moveTask, setTaskProject,
    // Phase 7 delegates + wrappers
    setEventStatus, clearTaskLink,
    cleanupProduct, getDeliverableStatusForPhase,
    unlinkProjectTasks,
    arrangeOnCalendar, syncTaskSchedule, getDeleteProductImpact, doDeleteProduct,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
