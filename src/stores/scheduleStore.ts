import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sqliteStorage } from './storage/sqliteStorage';

// D-04: type union (Phase 7 will consume 'task' for "安排到日历" flow)
export type ScheduleEventType =
  | 'meeting'
  | 'deadline'
  | 'task'
  | 'reminder'
  | 'review'
  | 'sync';

// D-01/D-03: date is YYYY-MM-DD string; projectId/taskId are optional weak links
export interface ScheduleEvent {
  id: string;
  title: string;
  time: string;        // 'HH:mm - HH:mm' 或 'HH:mm'
  date: string;        // YYYY-MM-DD (D-01)
  type: ScheduleEventType;
  location: string;
  projectId?: string;  // D-03 weak link to Product.id
  taskId?: string;     // D-03 weak link to Task.id (Phase 7 使用)
}

export const INITIAL_EVENTS: ScheduleEvent[] = [
  { id: '1', title: '需求评审会', time: '10:00 - 11:30', date: '2025-05-15', type: 'meeting', location: '会议室 3A' },
  { id: '2', title: '设计走查', time: '14:00 - 15:00', date: '2025-05-15', type: 'review', location: '线上会议' },
  { id: '3', title: '团队周报对齐', time: '17:00 - 18:00', date: '2025-05-15', type: 'sync', location: 'Tencent Meeting' },
];

// Module-level sort helper (used by addEvent / createEvent)
const sortByDateTime = (events: ScheduleEvent[]) =>
  [...events].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

interface ScheduleState {
  events: ScheduleEvent[];
  addEvent: (event: ScheduleEvent) => void;
  setEvents: (events: ScheduleEvent[]) => void;

  // Phase 6 CRUD (SCHED-01/02/03)
  createEvent: (event: ScheduleEvent) => void;
  updateEvent: (eventId: string, updates: Partial<ScheduleEvent>) => void;
  deleteEvent: (eventId: string) => void;

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      events: INITIAL_EVENTS,

      addEvent: (event) =>
        set((state) => {
          if (state.events.some((e) => e.id === event.id)) return state;
          return { events: sortByDateTime([...state.events, event]) };
        }),

      setEvents: (events) => set({ events }),

      // ── Phase 6 CRUD actions (SCHED-01/02/03) ──────────────────────────
      createEvent: (event) =>
        set((state) => {
          if (state.events.some((e) => e.id === event.id)) return state;
          return { events: sortByDateTime([...state.events, event]) };
        }),

      updateEvent: (eventId, updates) =>
        set((state) => ({
          events: state.events.map((e) =>
            e.id === eventId ? { ...e, ...updates } : e,
          ),
        })),

      deleteEvent: (eventId) =>
        set((state) => ({
          events: state.events.filter((e) => e.id !== eventId),
        })),

      // ── Persistence ────────────────────────────────────────────────────
      _hasHydrated: false,
      _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'nova-schedule',
      version: 2,
      storage: sqliteStorage,
      partialize: (s) => ({ events: s.events }),
      migrate: (persisted: any, version: number) => {
        if (!persisted || !persisted.events) return persisted as Partial<ScheduleState>;
        if (version < 2) {
          // v1 → v2: number date → YYYY-MM-DD (D-02, May 2025 anchor) + backfill weak-link fields
          persisted.events = persisted.events.map((e: any) => ({
            ...e,
            date:
              typeof e.date === 'number'
                ? `2025-05-${String(e.date).padStart(2, '0')}`
                : e.date,
            projectId: e.projectId ?? undefined,
            taskId: e.taskId ?? undefined,
          }));
        }
        return persisted as Partial<ScheduleState>;
      },
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
