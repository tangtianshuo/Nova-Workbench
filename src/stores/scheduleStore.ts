import { create } from 'zustand';

export interface ScheduleEvent {
  id: string;
  title: string;
  time: string;
  date: number;
  type: string;
  location: string;
}

const INITIAL_EVENTS: ScheduleEvent[] = [
  { id: '1', title: '需求评审会', time: '10:00 - 11:30', date: 15, type: 'meeting', location: '会议室 3A' },
  { id: '2', title: '设计走查', time: '14:00 - 15:00', date: 15, type: 'review', location: '线上会议' },
  { id: '3', title: '团队周报对齐', time: '17:00 - 18:00', date: 15, type: 'sync', location: 'Tencent Meeting' },
];

interface ScheduleState {
  events: ScheduleEvent[];
  addEvent: (event: ScheduleEvent) => void;
  setEvents: (events: ScheduleEvent[]) => void;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  events: INITIAL_EVENTS,

  addEvent: (event) =>
    set((state) => {
      if (state.events.some((e) => e.id === event.id)) return state;
      return { events: [...state.events, event].sort((a, b) => a.date - b.date) };
    }),

  setEvents: (events) => set({ events }),
}));
