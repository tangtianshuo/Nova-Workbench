import { create } from 'zustand';
import { Task, TaskCategory, INITIAL_CATEGORIES } from '../data/mockTasks';

interface TaskState {
  categories: TaskCategory[];
  setCategories: (categories: TaskCategory[]) => void;
  addCategory: (name: string, color?: string) => void;
  addTask: (task: Task, categoryId?: string) => void;
  completeTask: (taskId: string) => void;
  getProjectTaskCount: (projectIdOrName?: string) => number;
}

export const useTaskStore = create<TaskState>((set, get) => ({
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

  completeTask: (taskId) =>
    set((state) => ({
      categories: state.categories.map((cat) => ({
        ...cat,
        tasks: cat.tasks.map((task) =>
          task.id === taskId ? { ...task, status: '已完成' } : task
        ),
      })),
    })),

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
}));
