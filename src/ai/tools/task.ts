import { registerTool } from '../registry';
import { z } from 'zod';
import { useProductStore } from '../../stores/productStore';
import { useTaskStore } from '../../stores/taskStore';

const prioritySchema = z.enum(['high', 'medium', 'low']);

registerTool({
  name: 'createTask',
  description: 'Create a task in the task board.',
  schema: z.object({
    title: z.string().min(1).describe('Task title'),
    priority: prioritySchema.optional(),
    deadline: z.string().describe('Task deadline, preferably YYYY-MM-DD').optional(),
    description: z.string().optional(),
    categoryId: z.string().optional(),
    projectId: z.string().optional(),
  }),
  execute: (args) => {
    const id = crypto.randomUUID();
    const project = args.projectId
      ? useProductStore.getState().products.find((product) => product.id === args.projectId)
      : undefined;

    useTaskStore.getState().addTask({
      id,
      title: args.title,
      priority: args.priority ?? 'medium',
      deadline: args.deadline ?? '',
      description: args.description ?? '',
      project: project?.name ?? '',
      projectId: args.projectId,
      assignee: '我',
      assigneeAvatar: '',
      status: '未开始',
      time: '',
      aiSuggestions: [],
    }, args.categoryId);

    return { taskId: id };
  },
});

registerTool({
  name: 'listTasks',
  description: 'List tasks, optionally filtered by product, status, or priority.',
  schema: z.object({
    projectId: z.string().optional(),
    status: z.string().optional(),
    priority: prioritySchema.optional(),
  }),
  execute: (args) => {
    let tasks = useTaskStore.getState().categories.flatMap((category) => category.tasks);
    if (args.projectId) tasks = tasks.filter((task) => task.projectId === args.projectId);
    if (args.status) tasks = tasks.filter((task) => task.status === args.status);
    if (args.priority) tasks = tasks.filter((task) => task.priority === args.priority);

    return tasks.slice(0, 50).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      deadline: task.deadline,
      project: task.project,
      projectId: task.projectId,
    }));
  },
});
