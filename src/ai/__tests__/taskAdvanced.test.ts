import assert from 'node:assert/strict';
import { executeTool, listToolNames, ToolArgError } from '../registry';
import '../tools/taskAdvanced';
import { confirmDestructiveAction, rejectDestructiveAction } from '../confirmations';
import { useTaskStore } from '../../stores/taskStore';
import type { TaskCategory } from '../../data/mockTasks';

const task = (id: string, title: string, priority: 'high' | 'medium' | 'low') => ({
  id,
  title,
  priority,
  status: '未开始',
  description: '',
  project: '',
  assignee: '我',
  assigneeAvatar: '',
  deadline: '2026-08-10',
  aiSuggestions: [],
});

const categories: TaskCategory[] = [
  { id: 'category-a', name: '需求评审', color: 'bg-blue-500', tasks: [task('task-1', '任务一', 'high'), task('task-2', '任务二', 'medium')] },
  { id: 'category-b', name: '开发实现', color: 'bg-purple-500', tasks: [] },
];

const originalCategories = useTaskStore.getState().categories;
useTaskStore.getState().setCategories(categories);

try {
  const expectedTools = [
    'updateTask',
    'deleteTask',
    'moveTask',
    'rescheduleTask',
    'setTaskPriority',
    'bulkCompleteTasks',
    'bulkDeleteTasks',
    'bulkUpdatePriority',
  ];
  for (const name of expectedTools) assert.equal(listToolNames().includes(name), true, `${name} is registered`);

  assert.deepEqual(await executeTool('updateTask', {
    taskId: 'task-1',
    fields: { title: '更新后的任务', description: '说明' },
  }), { success: true, taskId: 'task-1' });
  assert.equal(useTaskStore.getState().categories[0]?.tasks[0]?.title, '更新后的任务');

  assert.deepEqual(await executeTool('moveTask', { taskId: 'task-1', toCategoryId: 'category-b' }), {
    success: true,
    taskId: 'task-1',
    fromCategoryId: 'category-a',
    toCategoryId: 'category-b',
  });
  assert.equal(useTaskStore.getState().categories[1]?.tasks[0]?.id, 'task-1');

  assert.deepEqual(await executeTool('rescheduleTask', { taskId: 'task-1', newDate: '2026-08-15' }), {
    success: true,
    taskId: 'task-1',
    newDeadline: '2026-08-15',
  });
  assert.deepEqual(await executeTool('setTaskPriority', { taskId: 'task-1', priority: 'low' }), {
    success: true,
    taskId: 'task-1',
    priority: 'low',
  });

  assert.deepEqual(await executeTool('bulkCompleteTasks', { taskIds: ['task-1', 'missing-task', 'task-2'] }), {
    success: true,
    completed: 2,
    failed: ['missing-task'],
  });
  assert.deepEqual(await executeTool('bulkUpdatePriority', { taskIds: ['task-1', 'missing-task'], priority: 'high' }), {
    success: true,
    updated: 1,
    failed: ['missing-task'],
  });

  const beforeDelete = useTaskStore.getState().categories;
  const pendingDelete = await executeTool('deleteTask', { taskId: 'task-1' }) as {
    success: false;
    pendingConfirmation: true;
    destructive: true;
    confirmationToken: string;
    toolName: string;
    args: { taskId: string };
  };
  assert.equal(pendingDelete.pendingConfirmation, true);
  assert.equal(pendingDelete.destructive, true);
  assert.deepEqual(useTaskStore.getState().categories, beforeDelete);
  await rejectDestructiveAction(pendingDelete.confirmationToken);

  const pendingBulkDelete = await executeTool('bulkDeleteTasks', { taskIds: ['task-1', 'missing-task'] }) as {
    success: false;
    pendingConfirmation: true;
    destructive: true;
    confirmationToken: string;
    toolName: string;
    args: { taskIds: string[] };
    failed: string[];
  };
  assert.equal(pendingBulkDelete.pendingConfirmation, true);
  assert.deepEqual(pendingBulkDelete.failed, ['missing-task']);
  assert.deepEqual(useTaskStore.getState().categories, beforeDelete);
  await rejectDestructiveAction(pendingBulkDelete.confirmationToken);

  // The first candidate was rejected above; prove a fresh candidate can be
  // explicitly confirmed and then consumed exactly once.
  const confirmedCandidate = await executeTool('deleteTask', { taskId: 'task-1' }) as typeof pendingDelete;
  await confirmDestructiveAction(confirmedCandidate.confirmationToken);
  assert.deepEqual(await executeTool('deleteTask', {
    ...confirmedCandidate.args,
    confirmed: true,
    confirmationToken: confirmedCandidate.confirmationToken,
  }), { success: true, taskId: 'task-1', deleted: true });

  // GAP-13-01: a model that fabricates a token (confirmed:true + invented token)
  // must get the pending-confirmation fallback, not an unretryable tool error.
  const hallucinated = await executeTool('deleteTask', {
    taskId: 'task-2',
    confirmed: true,
    confirmationToken: 'task-2',
  }) as typeof pendingDelete;
  assert.equal(hallucinated.pendingConfirmation, true);
  assert.notEqual(hallucinated.confirmationToken, 'task-2');
  assert.equal(useTaskStore.getState().categories[0].tasks.some((item) => item.id === 'task-2'), true);
  // Repeated fallback calls dedup to the same candidate instead of piling rows.
  const hallucinatedAgain = await executeTool('deleteTask', {
    taskId: 'task-2',
    confirmed: true,
    confirmationToken: 'still-fake',
  }) as typeof pendingDelete;
  assert.equal(hallucinatedAgain.confirmationToken, hallucinated.confirmationToken);
  // Self-heal: confirm the real candidate and the delete goes through.
  await confirmDestructiveAction(hallucinated.confirmationToken);
  assert.deepEqual(await executeTool('deleteTask', {
    ...hallucinated.args,
    confirmed: true,
    confirmationToken: hallucinated.confirmationToken,
  }), { success: true, taskId: 'task-2', deleted: true });

  await assert.rejects(
    executeTool('rescheduleTask', { taskId: 'task-1', newDate: 'tomorrow' }),
    (error: unknown) => error instanceof ToolArgError && error.toolName === 'rescheduleTask',
  );

  console.log('OK: task advanced tools registered, executed, and protected destructive actions');
} finally {
  useTaskStore.getState().setCategories(originalCategories);
}
