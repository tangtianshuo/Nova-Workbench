// Morning report data derivation (17-03 / UX-03) — pure functions, zero React/zustand.
import type { Task } from '../data/mockTasks';
import type { ScheduleEvent } from './scheduleStore';

// Task.deadline is free text ('2025-05-16', '2026-08-16 18:00', '明天 12:00', '').
// Only a leading YYYY-MM-DD is parseable; anything else never counts as overdue. Never throws.
export function isOverdueDeadline(deadline: string, today: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline ?? '');
  if (!m) return false;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < todayMidnight;
}

export function selectOverdueTasks(tasks: Task[], today: Date): Task[] {
  return tasks.filter(
    (t) => t.status !== '已完成' && t.status !== 'done' && isOverdueDeadline(t.deadline ?? '', today),
  );
}

export function selectTodayEvents(events: ScheduleEvent[], todayKey: string): ScheduleEvent[] {
  return events.filter((e) => e.date === todayKey).sort((a, b) => a.time.localeCompare(b.time));
}
