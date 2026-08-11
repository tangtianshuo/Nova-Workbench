import type { ScheduleEvent } from '../stores/scheduleStore';
import { useScheduleStore } from '../stores/scheduleStore';
import { useTaskStore } from '../stores/taskStore';

export interface AssociationResult {
  success: boolean;
  eventId?: string;
  taskId?: string;
  error?: string;
  existingEventId?: string;
}

function findTask(taskId: string) {
  return useTaskStore
    .getState()
    .categories
    .flatMap((category) => category.tasks)
    .find((task) => task.id === taskId);
}

/** Create the same bidirectional task/calendar link used by AppContext. */
export function associateTaskWithEvent(
  taskId: string,
  date: string,
  time?: string,
): AssociationResult {
  const task = findTask(taskId);
  if (!task) {
    return { success: false, taskId, error: `Task ${taskId} not found` };
  }

  if (task.scheduledEventId) {
    return {
      success: false,
      taskId,
      error: 'Task already associated with an event',
      existingEventId: task.scheduledEventId,
    };
  }

  const event: ScheduleEvent = {
    id: crypto.randomUUID(),
    title: task.title,
    time: time ?? '全天',
    date,
    type: 'task',
    location: '',
    projectId: task.projectId,
    taskId,
    status: '未开始',
  };

  // Both store writes are synchronous Zustand updates. The task is validated
  // before this point, so the two weak references are established together.
  useScheduleStore.getState().createEvent(event);
  useTaskStore.getState().updateTask(taskId, { scheduledEventId: event.id });

  return { success: true, taskId, eventId: event.id };
}

/** Clear only the task-side reference; the event owner decides whether to delete it. */
export function dissociateTaskEvent(taskId: string): AssociationResult {
  const task = findTask(taskId);
  if (!task) {
    return { success: false, taskId, error: `Task ${taskId} not found` };
  }
  if (!task.scheduledEventId) {
    return { success: false, taskId, error: 'No association' };
  }

  const eventId = task.scheduledEventId;
  useTaskStore.getState().updateTask(taskId, { scheduledEventId: undefined });
  return { success: true, taskId, eventId };
}

