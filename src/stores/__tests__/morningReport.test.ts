import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../../data/mockTasks';
import type { ScheduleEvent } from '../scheduleStore';
import {
  isOverdueDeadline,
  selectOverdueTasks,
  selectTodayEvents,
} from '../reportSelectors';

// Local-midnight construction keeps the suite timezone-independent.
const todayOf = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 't-1',
  title: '任务',
  priority: 'medium',
  status: '进行中',
  description: '',
  project: '',
  assignee: '',
  assigneeAvatar: '',
  deadline: '',
  aiSuggestions: [],
  ...overrides,
});

const makeEvent = (overrides: Partial<ScheduleEvent>): ScheduleEvent => ({
  id: 'e-1',
  title: '事件',
  time: '09:00',
  date: '2026-08-17',
  type: 'meeting',
  location: '',
  ...overrides,
});

test('isOverdueDeadline: past date is overdue, far future is not', () => {
  assert.equal(isOverdueDeadline('2025-05-16', todayOf(2026, 8, 17)), true);
  assert.equal(isOverdueDeadline('2099-01-01', todayOf(2026, 8, 17)), false);
});

test('isOverdueDeadline: unparseable or empty deadline never overdue, never throws', () => {
  assert.equal(isOverdueDeadline('明天 12:00', todayOf(2026, 8, 17)), false);
  assert.equal(isOverdueDeadline('', todayOf(2026, 8, 17)), false);
  assert.equal(isOverdueDeadline('下周三', todayOf(2026, 8, 17)), false);
});

test('isOverdueDeadline: deadline equal to today is NOT overdue (strictly before only)', () => {
  assert.equal(isOverdueDeadline('2026-08-17', todayOf(2026, 8, 17)), false);
  assert.equal(isOverdueDeadline('2026-08-16', todayOf(2026, 8, 17)), true);
});

test('selectOverdueTasks: excludes 已完成/done, excludes unparseable, keeps overdue', () => {
  const tasks = [
    makeTask({ id: 'a', deadline: '2026-08-01 10:00' }), // overdue, kept
    makeTask({ id: 'b', deadline: '2026-08-01 10:00', status: '已完成' }), // done, excluded
    makeTask({ id: 'c', deadline: '2026-08-01 10:00', status: 'done' }), // done, excluded
    makeTask({ id: 'd', deadline: '明天 12:00' }), // unparseable, excluded
    makeTask({ id: 'e', deadline: '2099-01-01' }), // future, excluded
  ];
  const result = selectOverdueTasks(tasks, todayOf(2026, 8, 17));
  assert.deepEqual(result.map((t) => t.id), ['a']);
});

test('selectTodayEvents: only date === todayKey, sorted by time ascending', () => {
  const events = [
    makeEvent({ id: 'x2', time: '14:00 - 15:00' }),
    makeEvent({ id: 'x1', time: '09:00 - 09:30' }),
    makeEvent({ id: 'other', date: '2026-08-18', time: '08:00' }),
  ];
  const result = selectTodayEvents(events, '2026-08-17');
  assert.deepEqual(result.map((e) => e.id), ['x1', 'x2']);
});

test('isOverdueDeadline: ISO-prefixed deadline compares by date part only', () => {
  // '2026-08-16 18:00' — deadline day is yesterday relative to today
  assert.equal(isOverdueDeadline('2026-08-16 18:00', todayOf(2026, 8, 17)), true);
  // Same-day deadline with a time is still not overdue (date part equal)
  assert.equal(isOverdueDeadline('2026-08-17 18:00', todayOf(2026, 8, 17)), false);
});
