import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../tools/scheduleAdvanced';
import { confirmDestructiveAction, rejectDestructiveAction } from '../confirmations';
import { associateTaskWithEvent } from '../associations';
import { executeTool, listToolNames } from '../registry';
import { INITIAL_PRODUCTS_DATA } from '../../data/mockProducts';
import { INITIAL_CATEGORIES, type TaskCategory } from '../../data/mockTasks';
import { useProductStore } from '../../stores/productStore';
import { useRndStore } from '../../stores/rndStore';
import { INITIAL_EVENTS } from '../../stores/scheduleStore';
import { useScheduleStore } from '../../stores/scheduleStore';
import { useTaskStore } from '../../stores/taskStore';

const taskCategory: TaskCategory = {
  id: 'ai-test-category',
  name: 'AI test',
  color: 'bg-blue-500',
  tasks: [{
    id: 'ai-task-1',
    title: 'AI calendar task',
    priority: 'high',
    status: '未开始',
    description: 'test task',
    project: INITIAL_PRODUCTS_DATA[0].name,
    projectId: INITIAL_PRODUCTS_DATA[0].id,
    assignee: '我',
    assigneeAvatar: '',
    deadline: '2026-08-12',
    aiSuggestions: [],
  }],
};

test('schedule advanced tools register and preserve task/event links', async () => {
  const originalCategories = useTaskStore.getState().categories;
  const originalEvents = useScheduleStore.getState().events;
  const originalProducts = useProductStore.getState().products;
  const originalDeliverables = useRndStore.getState().deliverables;
  try {
    useTaskStore.setState({ categories: [taskCategory] });
    useScheduleStore.setState({ events: [] });
    useProductStore.setState({ products: [INITIAL_PRODUCTS_DATA[0]] });
    useRndStore.setState({ deliverables: {} });

    assert.deepEqual(
      listToolNames().filter((name) => name === 'createEvent' || name === 'updateEvent' || name === 'deleteEvent' || name === 'listEvents' || name === 'associateTaskWithEvent' || name === 'getTaskDependencies' || name === 'getProductFeatureBreakdown'),
      ['createEvent', 'updateEvent', 'deleteEvent', 'listEvents', 'associateTaskWithEvent', 'getTaskDependencies', 'getProductFeatureBreakdown'],
    );

    const association = associateTaskWithEvent('ai-task-1', '2026-08-13', '09:00');
    assert.equal(association.success, true);
    const eventId = association.eventId as string;
    assert.equal(useTaskStore.getState().categories[0].tasks[0].scheduledEventId, eventId);
    assert.equal(useScheduleStore.getState().events[0].taskId, 'ai-task-1');

    const duplicate = associateTaskWithEvent('ai-task-1', '2026-08-14');
    assert.deepEqual(duplicate, {
      success: false,
      taskId: 'ai-task-1',
      error: 'Task already associated with an event',
      existingEventId: eventId,
    });

    const created = await executeTool('createEvent', {
      title: 'Planning sync',
      date: '2026-08-15',
      time: '14:00',
      type: 'sync',
    }) as { success: boolean; eventId: string };
    assert.equal(created.success, true);
    const updated = await executeTool('updateEvent', {
      eventId: created.eventId,
      fields: { title: 'Updated planning sync', location: 'Room 3A' },
    }) as { success: boolean };
    assert.equal(updated.success, true);
    assert.equal(useScheduleStore.getState().events.find((event) => event.id === created.eventId)?.title, 'Updated planning sync');

    const dependencies = await executeTool('getTaskDependencies', { taskId: 'ai-task-1' }) as {
      success: boolean;
      task: { id: string };
      product: { id: string } | null;
      event: { id: string } | null;
    };
    assert.equal(dependencies.success, true);
    assert.equal(dependencies.task.id, 'ai-task-1');
    assert.equal(dependencies.product?.id, INITIAL_PRODUCTS_DATA[0].id);
    assert.equal(dependencies.event?.id, eventId);

    const pendingDelete = await executeTool('deleteEvent', { eventId }) as {
      pendingConfirmation: boolean;
      confirmationToken: string;
      args: { eventId: string };
    };
    assert.equal(pendingDelete.pendingConfirmation, true);
    assert.equal(useScheduleStore.getState().events.some((item) => item.id === eventId), true);
    rejectDestructiveAction(pendingDelete.confirmationToken);

    const confirmedCandidate = await executeTool('deleteEvent', { eventId }) as typeof pendingDelete;
    confirmDestructiveAction(confirmedCandidate.confirmationToken);
    const deleted = await executeTool('deleteEvent', {
      ...confirmedCandidate.args,
      confirmed: true,
      confirmationToken: confirmedCandidate.confirmationToken,
    }) as { success: boolean };
    assert.equal(deleted.success, true);
    assert.equal(useScheduleStore.getState().events.length, 1);
    assert.equal(useScheduleStore.getState().events[0].id, created.eventId);
    assert.equal(useTaskStore.getState().categories[0].tasks[0].scheduledEventId, undefined);
  } finally {
    useTaskStore.setState({ categories: originalCategories });
    useScheduleStore.setState({ events: originalEvents });
    useProductStore.setState({ products: originalProducts });
    useRndStore.setState({ deliverables: originalDeliverables });
  }
});

test('schedule advanced tools filter events and return product milestones/deliverables', async () => {
  const originalCategories = useTaskStore.getState().categories;
  const originalEvents = useScheduleStore.getState().events;
  const originalProducts = useProductStore.getState().products;
  const originalDeliverables = useRndStore.getState().deliverables;
  try {
    useTaskStore.setState({ categories: INITIAL_CATEGORIES });
    useScheduleStore.setState({ events: [
      { ...INITIAL_EVENTS[0], id: 'ai-event-late', date: '2026-08-20' },
      { ...INITIAL_EVENTS[1], id: 'ai-event-early', date: '2026-08-11' },
    ] });
    useProductStore.setState({ products: [INITIAL_PRODUCTS_DATA[0]] });
    useRndStore.setState({ deliverables: {} });

    const listed = await executeTool('listEvents', { startDate: '2026-08-12', endDate: '2026-08-21' }) as {
      count: number;
      events: Array<{ id: string; date: string }>;
    };
    assert.equal(listed.count, 1);
    assert.deepEqual(listed.events.map((event) => event.id), ['ai-event-late']);

    const breakdown = await executeTool('getProductFeatureBreakdown', { productId: 'p1' }) as {
      success: boolean;
      milestones: unknown[];
      deliverables: Array<{ code: string; title: string; phase: string; status: string }>;
    };
    assert.equal(breakdown.success, true);
    assert.ok(breakdown.milestones.length > 0);
    assert.ok(breakdown.deliverables.every((item) => item.code && item.title && item.phase && item.status));

    const missing = await executeTool('getProductFeatureBreakdown', { productId: 'missing-product' }) as { success: boolean; error: string };
    assert.deepEqual(missing, { success: false, productId: 'missing-product', error: 'Product not found' });
  } finally {
    useTaskStore.setState({ categories: originalCategories });
    useScheduleStore.setState({ events: originalEvents });
    useProductStore.setState({ products: originalProducts });
    useRndStore.setState({ deliverables: originalDeliverables });
  }
});
