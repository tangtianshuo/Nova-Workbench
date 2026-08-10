import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task, TaskCategory, INITIAL_CATEGORIES } from '../data/mockTasks';
import { useProductStore } from './productStore';
import { useScheduleStore } from './scheduleStore';
import { sqliteStorage } from './storage/sqliteStorage';

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

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
  categories: INITIAL_CATEGORIES,

  setCategories: (categories) => set({ categories }),

  addCategory: (name, color = 'bg-blue-500') =>
    set((state) => {
      if (state.categories.some((c) => c.name === name)) return state;
      return {
        categories: [
          ...state.categories,
          { id: `cat-${Date.now()}`, name, color, tasks: [] },
        ],
      };
    }),

  addTask: (newTask, categoryId) =>
    set((state) => {
      if (state.categories.some((cat) => cat.tasks.some((t) => t.id === newTask.id))) return state;
      const newCats = [...state.categories];
      const targetIndex = categoryId ? newCats.findIndex((c) => c.id === categoryId) : 0;
      const finalIndex = targetIndex >= 0 ? targetIndex : 0;
      newCats[finalIndex] = {
        ...newCats[finalIndex],
        tasks: [newTask, ...newCats[finalIndex].tasks],
      };
      return { categories: newCats };
    }),

  completeTask: (taskId) => {
    // Read scheduledEventId BEFORE the state update so we can propagate.
    const before = get()
      .categories.flatMap((c) => c.tasks)
      .find((t) => t.id === taskId);
    const eventId = before?.scheduledEventId;
    set((state) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((task) =>
          task.id === taskId ? { ...task, status: '已完成' } : task
        ),
      })),
    }));
    // CROSS-07 (D-11): mark the linked schedule event as completed for visual sync.
    if (eventId) {
      useScheduleStore.getState().setEventStatus(eventId, '已完成');
    }
  },

  getProjectTaskCount: (projectIdOrName) => {
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
  updateTask: (taskId, updates) =>
    set((state) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      })),
    })),

  deleteTask: (taskId) => {
    // Read scheduledEventId BEFORE the state update so we can clear the reverse link.
    const before = get()
      .categories.flatMap((c) => c.tasks)
      .find((t) => t.id === taskId);
    const eventId = before?.scheduledEventId;
    // CROSS-05: clear the reverse taskId reference on the schedule event.
    if (eventId) {
      useScheduleStore.getState().clearTaskLink(eventId);
    }
    set((state) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.filter((t) => t.id !== taskId),
      })),
    }));
  },

  reopenTask: (taskId) =>
    set((state) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((t) =>
          t.id === taskId ? { ...t, status: '未开始' } : t
        ),
      })),
    })),

  moveTask: (taskId, fromCatId, toCatId) =>
    set((state) => {
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
    }),

  // D-10: setting projectId mirrors task.project = product.name (legacy compat)
  setTaskProject: (taskId, projectId) =>
    set((state) => {
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
    }),

  // Phase 7 CROSS-03 (D-05): clear projectId/project on every task tied to a deleted product.
  unlinkProjectTasks: (projectId) =>
    set((state) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((t) =>
          t.projectId === projectId ? { ...t, projectId: undefined, project: '' } : t
        ),
      })),
    })),

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
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
    },
  ),
);
