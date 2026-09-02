import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sqliteStorage } from './storage/sqliteStorage';
import { isTauri } from '@/src/lib/api';
import * as pmRepo from './storage/pmRepo';

// D-04: type union (Phase 7 will consume 'task' for "安排到日历" flow)
export type ScheduleEventType =
  | 'meeting'
  | 'deadline'
  | 'task'
  | 'reminder'
  | 'review'
  | 'sync';

// D-01/D-03: date is YYYY-MM-DD string; projectId/taskId are optional weak links
// D-11/D-12 (Phase 7): status field mirrors Task status vocabulary for CROSS-07 sync
export type ScheduleEventStatus = '未开始' | '进行中' | '已完成';

export interface ScheduleEvent {
  id: string;
  title: string;
  time: string;        // 'HH:mm - HH:mm' 或 'HH:mm'
  date: string;        // YYYY-MM-DD (D-01)
  type: ScheduleEventType;
  location: string;
  projectId?: string;  // D-03 weak link to Product.id
  taskId?: string;     // D-03 weak link to Task.id (Phase 7 使用)
  status?: ScheduleEventStatus; // D-11/D-12 Phase 7 (CROSS-07); default '未开始'
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

  // Phase 7 cross-module hooks (CROSS-05/CROSS-07)
  setEventStatus: (eventId: string, status: ScheduleEventStatus) => void;
  clearTaskLink: (eventId: string) => void;

  // Phase 29 (29-04): 事件驱动 refresh — 从关系表全量拉回(引擎写后自愈)
  refreshFromSql: () => Promise<void>;

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

// Phase 29 (29-04): fire-and-forget SQL 写 — 本地 set 乐观更新;SQL 失败仅
// console.error 不回滚,漂移由 refreshFromSql 自愈。ON CONFLICT 幂等,联动
// (setEventStatus/clearTaskLink)再写一次该行是安全的。
const writeEventRow = (e: ScheduleEvent | undefined) => {
  if (!e) return;
  pmRepo.upsertScheduleRow(e).catch((err) =>
    console.error('[scheduleStore] upsertScheduleRow failed:', err));
};

const findEvent = (events: ScheduleEvent[], id: string) => events.find((e) => e.id === id);

// Phase 29 (29-04): base creator — Tauri 下 persist 退役(SQL 单真相源),
// INITIAL_EVENTS 仅 web 模式默认生效(Tauri 下首帧 hydration 覆盖)。
const scheduleBase = (set: any, get: () => ScheduleState) => ({
  events: isTauri() ? [] : INITIAL_EVENTS,

  addEvent: (event: ScheduleEvent) => {
    if (isTauri()) writeEventRow(event);
    set((state: ScheduleState) => {
      if (state.events.some((e) => e.id === event.id)) return state;
      const withDefaults: ScheduleEvent = { ...event, status: event.status ?? '未开始' };
      return { events: sortByDateTime([...state.events, withDefaults]) };
    });
  },

  setEvents: (events: ScheduleEvent[]) => set({ events }),

  // ── Phase 6 CRUD actions (SCHED-01/02/03) ────────────────────────────
  createEvent: (event: ScheduleEvent) => {
    if (isTauri()) writeEventRow(event);
    set((state: ScheduleState) => {
      if (state.events.some((e) => e.id === event.id)) return state;
      const withDefaults: ScheduleEvent = { ...event, status: event.status ?? '未开始' };
      return { events: sortByDateTime([...state.events, withDefaults]) };
    });
  },

  updateEvent: (eventId: string, updates: Partial<ScheduleEvent>) => {
    set((state: ScheduleState) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, ...updates } : e,
      ),
    }));
    if (isTauri()) writeEventRow(findEvent(get().events, eventId));
  },

  deleteEvent: (eventId: string) => {
    set((state: ScheduleState) => ({
      events: state.events.filter((e) => e.id !== eventId),
    }));
    if (isTauri()) pmRepo.deleteScheduleRow(eventId).catch((err) =>
      console.error('[scheduleStore] deleteScheduleRow failed:', err));
  },

  // ── Phase 7 cross-module hooks (CROSS-05/CROSS-07) ─────────────────
  setEventStatus: (eventId: string, status: ScheduleEventStatus) => {
    set((state: ScheduleState) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, status } : e,
      ),
    }));
    if (isTauri()) writeEventRow(findEvent(get().events, eventId));
  },

  clearTaskLink: (eventId: string) => {
    set((state: ScheduleState) => ({
      events: state.events.map((e) =>
        e.id === eventId ? { ...e, taskId: undefined } : e,
      ),
    }));
    if (isTauri()) writeEventRow(findEvent(get().events, eventId));
  },

  refreshFromSql: async () => {
    if (!isTauri()) return;
    try {
      set({ events: sortByDateTime(await pmRepo.loadSchedules()) });
    } catch (e) {
      console.error('[scheduleStore] refreshFromSql failed:', e);
    }
  },

  // ── Persistence ────────────────────────────────────────────────────
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
});

export const useScheduleStore = create<ScheduleState>()(
  isTauri()
    ? scheduleBase
    : persist(scheduleBase, {
      name: 'nova-schedule',
      version: 3,
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
        if (version < 3) {
          // v2 → v3 (Phase 7 D-11/D-12): backfill status = '未开始' for legacy rows
          persisted.events = persisted.events.map((e: any) => ({
            ...e,
            status: e.status ?? '未开始',
          }));
        }
        return persisted as Partial<ScheduleState>;
      },
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    }),
);
