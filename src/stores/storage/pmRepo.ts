// Phase 29 (29-04) — task/schedule 关系表 webview 适配层。
// 引擎(29-02 工具)与本层写同一组表;列名与 migration 0012 逐列对齐。
// 日期/时间全 TEXT 零转换(deadline/date YYYY-MM-DD、time HH:mm 文本)。
import { lazySqlite } from './lazySqlite';
import type { Task, TaskCategory } from '../../data/mockTasks';
import type { ScheduleEvent, ScheduleEventType, ScheduleEventStatus } from '../scheduleStore';

type Db = Awaited<ReturnType<typeof lazySqlite>>;

const nowIso = () => new Date().toISOString();

function errContext(op: string, e: unknown): never {
  throw new Error(`[pmRepo] ${op} failed: ${String(e)}`);
}

/* === tasks === */

export async function upsertTaskRow(task: Task, categoryId = ''): Promise<void> {
  const db = await lazySqlite();
  const now = nowIso();
  try {
    await db.execute(
      `INSERT INTO tasks (id, title, status, priority, deadline, description, project, project_id, assignee, assignee_avatar, time, category_id, scheduled_event_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, status=excluded.status, priority=excluded.priority,
         deadline=excluded.deadline, description=excluded.description, project=excluded.project,
         project_id=excluded.project_id, assignee=excluded.assignee, assignee_avatar=excluded.assignee_avatar,
         time=excluded.time, category_id=excluded.category_id, scheduled_event_id=excluded.scheduled_event_id,
         updated_at=excluded.updated_at`,
      [
        task.id, task.title, task.status, task.priority, task.deadline ?? '', task.description ?? '',
        task.project ?? '', task.projectId ?? null, task.assignee ?? '', task.assigneeAvatar ?? '',
        task.time ?? '', categoryId, task.scheduledEventId ?? null,
        task.createdAt ? new Date(task.createdAt).toISOString() : now, now,
      ],
    );
  } catch (e) { errContext('upsertTaskRow', e); }
}

export async function deleteTaskRow(id: string): Promise<void> {
  const db = await lazySqlite();
  try {
    await db.execute('UPDATE schedules SET task_id = NULL WHERE task_id = $1', [id]);
    await db.execute('DELETE FROM tasks WHERE id = $1', [id]);
  } catch (e) { errContext('deleteTaskRow', e); }
}

export async function upsertCategoryRow(cat: TaskCategory, sort: number): Promise<void> {
  const db = await lazySqlite();
  try {
    await db.execute(
      'INSERT OR IGNORE INTO task_categories (id, name, color, sort) VALUES ($1,$2,$3,$4)',
      [cat.id, cat.name, cat.color, sort],
    );
  } catch (e) { errContext('upsertCategoryRow', e); }
}

interface TaskRow {
  id: string; title: string; status: string; priority: string; deadline: string;
  description: string; project: string; project_id: string | null; assignee: string;
  assignee_avatar: string; time: string; category_id: string; scheduled_event_id: string | null;
  created_at: string;
}

/** 行 → Task camelCase;aiSuggestions 不入库,回读时回 [];date/time 字符串零转换。 */
export async function loadTasks(): Promise<{ categories: TaskCategory[]; tasks: Task[] }> {
  const db = await lazySqlite();
  const catRows = await db.select<{ id: string; name: string; color: string; sort: number }[]>(
    'SELECT id, name, color, sort FROM task_categories ORDER BY sort',
  );
  const taskRows = await db.select<TaskRow[]>(
    `SELECT id, title, status, priority, deadline, description, project, project_id, assignee, assignee_avatar, time, category_id, scheduled_event_id, created_at
     FROM tasks ORDER BY created_at DESC`,
  );

  const cats: TaskCategory[] = catRows.length > 0
    ? catRows.map((c) => ({ id: c.id, name: c.name, color: c.color, tasks: [] }))
    : [{ id: 'cat-default', name: '待办', color: 'bg-blue-500', tasks: [] }];

  const byId = new Map(cats.map((c) => [c.id, c]));
  const tasks: Task[] = [];
  for (const r of taskRows) {
    const t: Task = {
      id: r.id, title: r.title, priority: (r.priority as Task['priority']) ?? 'medium',
      time: r.time || undefined, status: r.status, description: r.description,
      project: r.project, projectId: r.project_id ?? undefined,
      scheduledEventId: r.scheduled_event_id ?? undefined,
      assignee: r.assignee, assigneeAvatar: r.assignee_avatar, deadline: r.deadline,
      aiSuggestions: [],
      createdAt: Date.parse(r.created_at) || undefined,
    };
    tasks.push(t);
    (byId.get(r.category_id) ?? cats[0]).tasks.push(t);
  }
  return { categories: cats, tasks };
}

/* === schedules === */

export async function upsertScheduleRow(e: ScheduleEvent): Promise<void> {
  const db = await lazySqlite();
  const now = nowIso();
  try {
    await db.execute(
      `INSERT INTO schedules (id, title, time, date, type, location, project_id, task_id, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, time=excluded.time, date=excluded.date,
         type=excluded.type, location=excluded.location, project_id=excluded.project_id,
         task_id=excluded.task_id, status=excluded.status, updated_at=excluded.updated_at`,
      [
        e.id, e.title, e.time ?? '', e.date, e.type, e.location ?? '',
        e.projectId ?? null, e.taskId ?? null, e.status ?? '未开始', now,
      ],
    );
  } catch (err) { errContext('upsertScheduleRow', err); }
}

export async function deleteScheduleRow(id: string): Promise<void> {
  const db = await lazySqlite();
  try {
    await db.execute('DELETE FROM schedules WHERE id = $1', [id]);
  } catch (e) { errContext('deleteScheduleRow', e); }
}

interface ScheduleRow {
  id: string; title: string; time: string; date: string; type: string;
  location: string; project_id: string | null; task_id: string | null; status: string;
}

export async function loadSchedules(): Promise<ScheduleEvent[]> {
  const db = await lazySqlite();
  const rows = await db.select<ScheduleRow[]>(
    'SELECT id, title, time, date, type, location, project_id, task_id, status FROM schedules ORDER BY date, time',
  );
  return rows.map((r) => ({
    id: r.id, title: r.title, time: r.time, date: r.date,
    type: r.type as ScheduleEventType, location: r.location,
    projectId: r.project_id ?? undefined, taskId: r.task_id ?? undefined,
    status: (r.status as ScheduleEventStatus) ?? '未开始',
  }));
}
