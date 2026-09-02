import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task, TaskCategory, INITIAL_CATEGORIES } from '../data/mockTasks';
import { useProductStore } from './productStore';
import { useScheduleStore } from './scheduleStore';
import { sqliteStorage } from './storage/sqliteStorage';
import { isTauri } from '@/src/lib/api';
import * as pmRepo from './storage/pmRepo';

interface TaskState {
  categories: TaskCategory[];
  setCategories: (categories: TaskCategory[]) => void;
  addCategory: (name: string, color?: string) => void;
  addTask: (task: Task, categoryId?: string) => void;
  completeTask: (taskId: string) => void;
  getProjectTaskCount: (projectIdOrName?: string) => number;

  // Phase 5 CRUD (TASK-07/08/09)
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  reopenTask: (taskId: string) => void;
  moveTask: (taskId: string, fromCatId: string, toCatId: string) => void;
  setTaskProject: (taskId: string, projectId: string | undefined) => void;

  // Phase 7 cross-module (CROSS-03) — unlink all tasks referencing a product
  unlinkProjectTasks: (projectId: string) => void;

  // Phase 29 (29-04): 事件驱动 refresh — 从关系表全量拉回(引擎写后自愈)
  refreshFromSql: () => Promise<void>;

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

// Phase 29 (29-04): fire-and-forget SQL 写 — 本地 set 乐观更新;SQL 失败仅 console.error
// 不回滚,关系表与内存的短期漂移由 refreshFromSql 自愈。
const writeTaskRow = (task: Task | undefined, categoryId: string) => {
  if (!task) return;
  pmRepo.upsertTaskRow(task, categoryId).catch((e) =>
    console.error('[taskStore] upsertTaskRow failed:', e));
};

const findTask = (state: TaskState, id: string): { task: Task; categoryId: string } | undefined => {
  for (const cat of state.categories) {
    const t = cat.tasks.find((x) => x.id === id);
    if (t) return { task: t, categoryId: cat.id };
  }
  return undefined;
};

// Phase 29 (29-04): base creator — Tauri 下 persist 退役(SQL 单真相源),web dev 维持 localStorage。
const taskBase = (set: any, get: () => TaskState) => ({
  categories: INITIAL_CATEGORIES,

  setCategories: (categories: TaskCategory[]) => set({ categories }),

  addCategory: (name: string, color = 'bg-blue-500') =>
    set((state: TaskState) => {
      if (state.categories.some((c) => c.name === name)) return state;
      const cat: TaskCategory = { id: `cat-${Date.now()}`, name, color, tasks: [] };
      if (isTauri()) pmRepo.upsertCategoryRow(cat, state.categories.length).catch((e) =>
        console.error('[taskStore] upsertCategoryRow failed:', e));
      return { categories: [...state.categories, cat] };
    }),

  addTask: (newTask: Task, categoryId?: string) =>
    set((state: TaskState) => {
      if (state.categories.some((cat) => cat.tasks.some((t) => t.id === newTask.id))) return state;
      const newCats = [...state.categories];
      const targetIndex = categoryId ? newCats.findIndex((c) => c.id === categoryId) : 0;
      const finalIndex = targetIndex >= 0 ? targetIndex : 0;
      newCats[finalIndex] = {
        ...newCats[finalIndex],
        tasks: [newTask, ...newCats[finalIndex].tasks],
      };
      if (isTauri()) writeTaskRow(newTask, newCats[finalIndex].id);
      return { categories: newCats };
    }),

  completeTask: (taskId: string) => {
    // Read scheduledEventId BEFORE the state update so we can propagate.
    const before = get()
      .categories.flatMap((c) => c.tasks)
      .find((t) => t.id === taskId);
    const eventId = before?.scheduledEventId;
    set((state: TaskState) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((task) =>
          task.id === taskId ? { ...task, status: '已完成' } : task
        ),
      })),
    }));
    if (isTauri()) {
      const found = findTask(get(), taskId);
      if (found) writeTaskRow(found.task, found.categoryId);
    }
    // CROSS-07 (D-11): mark the linked schedule event as completed for visual sync.
    if (eventId) {
      useScheduleStore.getState().setEventStatus(eventId, '已完成');
    }
  },

  getProjectTaskCount: (projectIdOrName?: string) => {
    if (!projectIdOrName) return 0;
    const { categories } = get();
    let count = 0;
    categories.forEach((cat) => {
      cat.tasks.forEach((task) => {
        if (task.project === projectIdOrName || cat.name === projectIdOrName) {
          count++;
        }
      });
    });
    return count;
  },

  // ── Phase 5 CRUD actions (TASK-07/08) ──────────────────────────────────
  updateTask: (taskId: string, updates: Partial<Task>) => {
    set((state: TaskState) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      })),
    }));
    if (isTauri()) {
      const found = findTask(get(), taskId);
      if (found) writeTaskRow(found.task, found.categoryId);
    }
  },

  deleteTask: (taskId: string) => {
    // Read scheduledEventId BEFORE the state update so we can clear the reverse link.
    const before = get()
      .categories.flatMap((c) => c.tasks)
      .find((t) => t.id === taskId);
    const eventId = before?.scheduledEventId;
    // CROSS-05: clear the reverse taskId reference on the schedule event.
    if (eventId) {
      useScheduleStore.getState().clearTaskLink(eventId);
    }
    set((state: TaskState) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.filter((t) => t.id !== taskId),
      })),
    }));
    if (isTauri()) pmRepo.deleteTaskRow(taskId).catch((e) =>
      console.error('[taskStore] deleteTaskRow failed:', e));
  },

  reopenTask: (taskId: string) => {
    set((state: TaskState) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((t) =>
          t.id === taskId ? { ...t, status: '未开始' } : t
        ),
      })),
    }));
    if (isTauri()) {
      const found = findTask(get(), taskId);
      if (found) writeTaskRow(found.task, found.categoryId);
    }
  },

  moveTask: (taskId: string, fromCatId: string, toCatId: string) => {
    set((state: TaskState) => {
      const fromCat = state.categories.find((c) => c.id === fromCatId);
      const toCat = state.categories.find((c) => c.id === toCatId);
      if (!fromCat || !toCat) return state;
      const task = fromCat.tasks.find((t) => t.id === taskId);
      if (!task) return state;
      return {
        categories: state.categories.map((cat) => {
          if (cat.id === fromCatId) {
            return { ...cat, tasks: cat.tasks.filter((t) => t.id !== taskId) };
          }
          if (cat.id === toCatId) {
            return { ...cat, tasks: [task, ...cat.tasks] };
          }
          return cat;
        }),
      };
    });
    if (isTauri()) {
      const found = findTask(get(), taskId);
      if (found) writeTaskRow(found.task, found.categoryId);
    }
  },

  // D-10: setting projectId mirrors task.project = product.name (legacy compat)
  setTaskProject: (taskId: string, projectId: string | undefined) => {
    set((state: TaskState) => {
      const productName = projectId
        ? useProductStore.getState().products.find((p) => p.id === projectId)?.name ?? ''
        : '';
      return {
        categories: state.categories.map((cat) => ({
          ...cat,
          tasks: cat.tasks.map((t) =>
            t.id === taskId ? { ...t, projectId, project: productName } : t
          ),
        })),
      };
    });
    if (isTauri()) {
      const found = findTask(get(), taskId);
      if (found) writeTaskRow(found.task, found.categoryId);
    }
  },

  // Phase 7 CROSS-03 (D-05): clear projectId/project on every task tied to a deleted product.
  unlinkProjectTasks: (projectId: string) => {
    set((state: TaskState) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((t) =>
          t.projectId === projectId ? { ...t, projectId: undefined, project: '' } : t
        ),
      })),
    }));
    if (isTauri()) {
      for (const cat of get().categories) {
        for (const t of cat.tasks) {
          if (!t.projectId && t.project === '') writeTaskRow(t, cat.id);
        }
      }
    }
  },

  refreshFromSql: async () => {
    if (!isTauri()) return;
    try {
      const { categories } = await pmRepo.loadTasks();
      set({ categories });
    } catch (e) {
      console.error('[taskStore] refreshFromSql failed:', e);
    }
  },

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
});

export const useTaskStore = create<TaskState>()(
  isTauri()
    ? taskBase
    : persist(taskBase, {
      name: 'nova-task',
      version: 2,
      storage: sqliteStorage,
      partialize: (s) => ({ categories: s.categories }),
      migrate: (persisted: any, version: number) => {
        if (!persisted || !persisted.categories) return persisted as Partial<TaskState>;
        if (version < 2) {
          // v1 → v2: backfill projectId/scheduledEventId on legacy tasks
          persisted.categories = persisted.categories.map((cat: any) => ({
            ...cat,
            tasks: (cat.tasks || []).map((t: any) => ({
              ...t,
              projectId: t.projectId ?? undefined,
              scheduledEventId: t.scheduledEventId ?? undefined,
            })),
          }));
        }
        return persisted as Partial<TaskState>;
      },
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    }),
);
