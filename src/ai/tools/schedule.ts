import { registerTool } from '../registry';
import { z } from 'zod';
import { useScheduleStore, type ScheduleEventType, type ScheduleEventStatus } from '../../stores/scheduleStore';

const eventTypes = ['meeting', 'deadline', 'task', 'reminder', 'review', 'sync'] as const;
const eventStatuses = ['未开始', '进行中', '已完成'] as const;

registerTool({
  name: 'createScheduleEvent',
  description: 'Create a schedule event with an ISO date, time, type, and location.',
  schema: z.object({
    title: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD'),
    time: z.string().optional(),
    type: z.enum(eventTypes).optional(),
    location: z.string().optional(),
    projectId: z.string().optional(),
    taskId: z.string().optional(),
    status: z.enum(eventStatuses).optional(),
  }),
  execute: (args) => {
    const id = crypto.randomUUID();
    useScheduleStore.getState().createEvent({
      id,
      title: args.title,
      date: args.date,
      time: args.time ?? '',
      type: (args.type ?? 'meeting') as ScheduleEventType,
      location: args.location ?? '',
      projectId: args.projectId,
      taskId: args.taskId,
      status: args.status as ScheduleEventStatus | undefined,
    });
    return { eventId: id };
  },
});

registerTool({
  name: 'listScheduleEvents',
  description: 'List schedule events, optionally filtered by product or date range.',
  schema: z.object({
    projectId: z.string().optional(),
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  execute: (args) => useScheduleStore.getState().events
    .filter((event) => !args.projectId || event.projectId === args.projectId)
    .filter((event) => !args.fromDate || event.date >= args.fromDate)
    .filter((event) => !args.toDate || event.date <= args.toDate)
    .slice(0, 50)
    .map((event) => ({ ...event })),
});
