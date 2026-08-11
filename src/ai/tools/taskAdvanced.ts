import { z } from 'zod';
import { registerTool } from '../registry';
import { useTaskStore } from '../../stores/taskStore';
import {
  consumeDestructiveActionConfirmation,
  createDestructiveActionCandidate,
} from '../confirmations';

const prioritySchema = z.enum(['high', 'medium', 'low']);
const statusSchema = z.enum(['未开始', '进行中', '已完成']);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const taskIdSchema = z.string().min(1);

const updateFieldsSchema = z.object({
  title: z.string().min(1).optional(),
  priority: prioritySchema.optional(),
  status: statusSchema.optional(),
  description: z.string().optional(),
  deadline: isoDateSchema.optional(),
});

function findTask(taskId: string) {
  const categories = useTaskStore.getState().categories;
  for (const category of categories) {
    const task = category.tasks.find((item) => item.id === taskId);
    if (task) return { category, task };
  }
  return undefined;
}

function uniqueTaskIds(taskIds: string[]): string[] {
  return [...new Set(taskIds)];
}

registerTool({
  name: 'updateTask',
  description: 'Update one or more fields of an existing task. Example: 把任务优先级改为低。',
  schema: z.object({
    taskId: taskIdSchema.describe('The unique task ID'),
    fields: updateFieldsSchema,
  }),
  execute: ({ taskId, fields }) => {
    if (!findTask(taskId)) return { success: false, error: 'Task not found', taskId };
    useTaskStore.getState().updateTask(taskId, fields);
    return { success: true, taskId };
  },
});

registerTool({
  name: 'deleteTask',
  description: '[DESTRUCTIVE: confirmation required] Permanently delete one task. Example: 删除那个重复任务。',
  schema: z.object({
    taskId: taskIdSchema.describe('The unique task ID'),
    confirmed: z.boolean().optional(),
    confirmationToken: z.string().min(1).optional(),
  }).strict(),
  execute: ({ taskId, confirmed, confirmationToken }) => {
    if (!findTask(taskId)) return { success: false, error: 'Task not found', taskId };
    const actionArgs = { taskId };
    if (!confirmed) {
      return {
        success: false,
        pendingConfirmation: true,
        destructive: true,
        ...createDestructiveActionCandidate('deleteTask', actionArgs, '删除任务后将无法恢复。'),
      };
    }
    if (!confirmationToken) {
      throw new Error('A confirmation token is required before deleting a task.');
    }
    consumeDestructiveActionConfirmation(confirmationToken, 'deleteTask', actionArgs);
    useTaskStore.getState().deleteTask(taskId);
    return {
      success: true,
      taskId,
      deleted: true,
    };
  },
});

registerTool({
  name: 'moveTask',
  description: 'Move a task to another kanban category. Example: 把这个任务挪到开发实现。',
  schema: z.object({
    taskId: taskIdSchema.describe('The unique task ID'),
    toCategoryId: z.string().min(1).describe('The target category ID'),
  }),
  execute: ({ taskId, toCategoryId }) => {
    const located = findTask(taskId);
    if (!located) return { success: false, error: 'Task not found', taskId };

    const targetCategory = useTaskStore.getState().categories.find((category) => category.id === toCategoryId);
    if (!targetCategory) return { success: false, error: 'Target category not found', taskId, toCategoryId };
    if (located.category.id === toCategoryId) {
      return { success: false, error: 'Task is already in the target category', taskId, toCategoryId };
    }

    useTaskStore.getState().moveTask(taskId, located.category.id, toCategoryId);
    return {
      success: true,
      taskId,
      fromCategoryId: located.category.id,
      toCategoryId,
    };
  },
});

registerTool({
  name: 'rescheduleTask',
  description: 'Change a task deadline. The date must already be normalized to YYYY-MM-DD. Example: 把任务截止日期改到 2026-08-15。',
  schema: z.object({
    taskId: taskIdSchema.describe('The unique task ID'),
    newDate: isoDateSchema.describe('The new deadline in YYYY-MM-DD format'),
  }),
  execute: ({ taskId, newDate }) => {
    if (!findTask(taskId)) return { success: false, error: 'Task not found', taskId };
    useTaskStore.getState().updateTask(taskId, { deadline: newDate });
    return { success: true, taskId, newDeadline: newDate };
  },
});

registerTool({
  name: 'setTaskPriority',
  description: 'Set the priority of one task. Example: 把任务优先级改为高。',
  schema: z.object({
    taskId: taskIdSchema.describe('The unique task ID'),
    priority: prioritySchema,
  }),
  execute: ({ taskId, priority }) => {
    if (!findTask(taskId)) return { success: false, error: 'Task not found', taskId };
    useTaskStore.getState().updateTask(taskId, { priority });
    return { success: true, taskId, priority };
  },
});

registerTool({
  name: 'bulkCompleteTasks',
  description: 'Mark multiple tasks as completed. Example: 把这几个任务都标记为已完成。',
  schema: z.object({ taskIds: z.array(taskIdSchema).min(1).max(50) }),
  execute: ({ taskIds }) => {
    const failed: string[] = [];
    let completed = 0;
    const store = useTaskStore.getState();

    for (const taskId of uniqueTaskIds(taskIds)) {
      if (!findTask(taskId)) {
        failed.push(taskId);
        continue;
      }
      store.completeTask(taskId);
      completed += 1;
    }

    return { success: true, completed, failed };
  },
});

registerTool({
  name: 'bulkDeleteTasks',
  description: '[DESTRUCTIVE: confirmation required] Permanently delete multiple tasks. Example: 删除这些重复任务。',
  schema: z.object({
    taskIds: z.array(taskIdSchema).min(1).max(50),
    confirmed: z.boolean().optional(),
    confirmationToken: z.string().min(1).optional(),
  }).strict(),
  execute: ({ taskIds, confirmed, confirmationToken }) => {
    const existingTaskIds: string[] = [];
    const failed: string[] = [];

    for (const taskId of uniqueTaskIds(taskIds)) {
      if (findTask(taskId)) existingTaskIds.push(taskId);
      else failed.push(taskId);
    }

    if (existingTaskIds.length === 0) return { success: false, deleted: 0, failed };
    const actionArgs = { taskIds: existingTaskIds };
    if (!confirmed) {
      return {
        success: false,
        pendingConfirmation: true,
        destructive: true,
        failed,
        ...createDestructiveActionCandidate('bulkDeleteTasks', actionArgs, `将删除 ${existingTaskIds.length} 个任务，删除后无法恢复。`),
      };
    }
    if (!confirmationToken) {
      throw new Error('A confirmation token is required before deleting tasks.');
    }
    consumeDestructiveActionConfirmation(confirmationToken, 'bulkDeleteTasks', actionArgs);
    const store = useTaskStore.getState();
    existingTaskIds.forEach((id) => store.deleteTask(id));
    return {
      success: true,
      deleted: existingTaskIds.length,
      failed,
    };
  },
});

registerTool({
  name: 'bulkUpdatePriority',
  description: 'Set the priority of multiple tasks. Example: 把所有高优先级任务改为中优先级。',
  schema: z.object({
    taskIds: z.array(taskIdSchema).min(1).max(50),
    priority: prioritySchema,
  }),
  execute: ({ taskIds, priority }) => {
    const failed: string[] = [];
    let updated = 0;
    const store = useTaskStore.getState();

    for (const taskId of uniqueTaskIds(taskIds)) {
      if (!findTask(taskId)) {
        failed.push(taskId);
        continue;
      }
      store.updateTask(taskId, { priority });
      updated += 1;
    }

    return { success: true, updated, failed };
  },
});
