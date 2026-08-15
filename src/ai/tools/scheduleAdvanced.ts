import { z } from 'zod';
import { registerTool } from '../registry';
import { associateTaskWithEvent } from '../associations';
import { useProductStore } from '../../stores/productStore';
import { useRndStore } from '../../stores/rndStore';
import { useScheduleStore, type ScheduleEventType, type ScheduleEventStatus } from '../../stores/scheduleStore';
import { useTaskStore } from '../../stores/taskStore';
import {
  consumeDestructiveActionConfirmation,
  createDestructiveActionCandidate,
} from '../confirmations';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const eventTypes = ['meeting', 'deadline', 'task', 'reminder', 'review', 'sync'] as const;
const eventStatuses = ['未开始', '进行中', '已完成'] as const;

registerTool({
  name: 'createEvent',
  description: 'Create a calendar event. Resolve relative dates to YYYY-MM-DD before calling this tool.',
  schema: z.object({
    title: z.string().min(1),
    date: dateSchema,
    time: z.string().optional(),
    type: z.enum(eventTypes).optional(),
    location: z.string().optional(),
    projectId: z.string().optional(),
  }),
  execute: (args) => {
    const eventId = crypto.randomUUID();
    useScheduleStore.getState().createEvent({
      id: eventId,
      title: args.title,
      date: args.date,
      time: args.time ?? '',
      type: (args.type ?? 'meeting') as ScheduleEventType,
      location: args.location ?? '',
      projectId: args.projectId,
      status: '未开始',
    });
    return { success: true, eventId };
  },
});

registerTool({
  name: 'updateEvent',
  description: 'Update an existing calendar event. The task link is managed by associateTaskWithEvent and cannot be changed here.',
  schema: z.object({
    eventId: z.string().min(1),
    fields: z.object({
      title: z.string().min(1).optional(),
      date: dateSchema.optional(),
      time: z.string().optional(),
      type: z.enum(eventTypes).optional(),
      location: z.string().optional(),
      projectId: z.string().optional(),
      status: z.enum(eventStatuses).optional(),
    }),
  }),
  execute: ({ eventId, fields }) => {
    const store = useScheduleStore.getState();
    if (!store.events.some((event) => event.id === eventId)) {
      return { success: false, eventId, error: 'Event not found' };
    }
    store.updateEvent(eventId, fields);
    return { success: true, eventId };
  },
});

registerTool({
  name: 'deleteEvent',
  description: 'Permanently delete a calendar event. This is destructive and requires user confirmation. Linked task references are cleared.',
  schema: z.object({
    eventId: z.string().min(1),
    confirmed: z.boolean().optional(),
    confirmationToken: z.string().min(1).optional(),
  }).strict(),
  execute: async ({ eventId, confirmed, confirmationToken }) => {
    const scheduleStore = useScheduleStore.getState();
    const event = scheduleStore.events.find((item) => item.id === eventId);
    if (!event) {
      return { success: false, eventId, error: 'Event not found' };
    }

    const actionArgs = { eventId };
    if (!confirmed) {
      return {
        success: false,
        pendingConfirmation: true,
        destructive: true,
        ...(await createDestructiveActionCandidate('deleteEvent', actionArgs, `删除日程”${event.title}”后将无法恢复。`)),
      };
    }
    if (!confirmationToken) {
      throw new Error('A confirmation token is required before deleting an event.');
    }
    await consumeDestructiveActionConfirmation(confirmationToken, 'deleteEvent', actionArgs);

    const linkedTasks = useTaskStore
      .getState()
      .categories
      .flatMap((category) => category.tasks)
      .filter((task) => task.scheduledEventId === eventId || task.id === event.taskId);
    for (const task of linkedTasks) {
      if (task.scheduledEventId === eventId) {
        useTaskStore.getState().updateTask(task.id, { scheduledEventId: undefined });
      }
    }

    scheduleStore.deleteEvent(eventId);
    return { success: true, eventId, deleted: true, clearedTaskIds: linkedTasks.map((task) => task.id) };
  },
});

registerTool({
  name: 'listEvents',
  description: 'List calendar events, optionally filtered by an inclusive YYYY-MM-DD date range.',
  schema: z.object({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  }),
  execute: ({ startDate, endDate }) => {
    const events = useScheduleStore
      .getState()
      .events
      .filter((event) => !startDate || event.date >= startDate)
      .filter((event) => !endDate || event.date <= endDate)
      .sort((left, right) => left.date.localeCompare(right.date) || left.time.localeCompare(right.time));
    return { success: true, count: events.length, events };
  },
});

registerTool({
  name: 'associateTaskWithEvent',
  description: 'Schedule a task on the calendar by creating a task event and linking the task and event bidirectionally.',
  schema: z.object({
    taskId: z.string().min(1),
    date: dateSchema,
    time: z.string().optional(),
  }),
  execute: ({ taskId, date, time }) => associateTaskWithEvent(taskId, date, time),
});

registerTool({
  name: 'getTaskDependencies',
  description: 'Get a task together with its associated product and calendar event for planning and deadline suggestions.',
  schema: z.object({ taskId: z.string().min(1) }),
  execute: ({ taskId }) => {
    const task = useTaskStore
      .getState()
      .categories
      .flatMap((category) => category.tasks)
      .find((item) => item.id === taskId);
    if (!task) return { success: false, taskId, error: 'Task not found' };

    const product = task.projectId
      ? useProductStore.getState().products.find((item) => item.id === task.projectId) ?? null
      : null;
    const event = task.scheduledEventId
      ? useScheduleStore.getState().events.find((item) => item.id === task.scheduledEventId) ?? null
      : null;
    return { success: true, task, product, event };
  },
});

registerTool({
  name: 'getProductFeatureBreakdown',
  description: 'Get a product feature-planning context containing its milestones and R&D deliverables.',
  schema: z.object({ productId: z.string().min(1) }),
  execute: ({ productId }) => {
    const product = useProductStore.getState().products.find((item) => item.id === productId);
    if (!product) return { success: false, productId, error: 'Product not found' };

    const deliverables = useRndStore.getState().getDeliverablesForProduct(productId);
    return {
      success: true,
      product: {
        id: product.id,
        name: product.name,
        tagline: product.tagline,
        stage: product.stage,
        status: product.status,
      },
      milestones: product.milestones,
      deliverables: deliverables.map((deliverable) => ({
        id: deliverable.id,
        code: deliverable.code,
        title: deliverable.title,
        phase: deliverable.phase,
        phaseName: deliverable.phaseName,
        status: deliverable.status,
      })),
    };
  },
});

export const scheduleAdvancedToolNames = [
  'createEvent',
  'updateEvent',
  'deleteEvent',
  'listEvents',
  'associateTaskWithEvent',
  'getTaskDependencies',
  'getProductFeatureBreakdown',
] as const;
