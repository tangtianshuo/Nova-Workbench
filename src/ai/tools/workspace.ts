import { registerTool } from '../registry';
import { z } from 'zod';
import { useProductStore } from '../../stores/productStore';
import { useScheduleStore } from '../../stores/scheduleStore';
import { useTaskStore } from '../../stores/taskStore';
import { useUIStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const MAX_WORKSPACE_FILES = 50;
const MAX_CONTENT_SNIPPET_LENGTH = 500;

function summarizeWorkspaceFile(file: {
  id: string;
  name: string;
  type: string;
  size: string;
  updatedAt: string;
  contentSnippet?: string;
}) {
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    updatedAt: file.updatedAt,
    contentSnippet: file.contentSnippet?.slice(0, MAX_CONTENT_SNIPPET_LENGTH),
  };
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

registerTool({
  name: 'listWorkspaceFiles',
  description: 'List bounded file metadata and index summaries for the current or specified workspace.',
  schema: z.object({
    workspaceId: z.string().min(1).optional(),
  }),
  execute: (args) => {
    const workspaces = useWorkspaceStore.getState().workspaces;
    const workspace = args.workspaceId
      ? workspaces.find((item) => item.id === args.workspaceId)
      : workspaces[0];

    if (!workspace) {
      return {
        ok: false,
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          message: 'No matching workspace is available.',
          workspaceId: args.workspaceId ?? null,
        },
      };
    }

    const files = workspace.files.slice(0, MAX_WORKSPACE_FILES).map(summarizeWorkspaceFile);
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      folderPath: workspace.folderPath,
      projectId: workspace.projectId,
      files,
      truncated: workspace.files.length > MAX_WORKSPACE_FILES,
    };
  },
});

registerTool({
  name: 'getCurrentContext',
  description: 'Read the current UI selection and a compact summary of active product work.',
  schema: z.object({}),
  execute: () => {
    const ui = useUIStore.getState();
    const products = useProductStore.getState().products;
    const tasks = useTaskStore.getState().categories.flatMap((category) => category.tasks);
    const events = useScheduleStore.getState().events;
    const workspaces = useWorkspaceStore.getState().workspaces;
    const selectedProduct = ui.selectedProductId
      ? products.find((product) => product.id === ui.selectedProductId)
      : undefined;
    const selectedTasks = tasks
      .filter((task) => !ui.selectedProductId || task.projectId === ui.selectedProductId)
      .filter((task) => task.status !== '已完成')
      .slice(0, 10)
      .map((task) => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, deadline: task.deadline }));
    const today = isoDateToday();
    const upcomingEvents = events
      .filter((event) => event.date >= today)
      .slice(0, 5)
      .map((event) => ({ id: event.id, title: event.title, date: event.date, time: event.time, type: event.type }));

    return {
      activeView: ui.activeTab,
      selectedProduct: selectedProduct
        ? { id: selectedProduct.id, name: selectedProduct.name, tagline: selectedProduct.tagline, stage: selectedProduct.stage }
        : null,
      activeTasks: selectedTasks,
      upcomingEvents,
      workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name, projectId: workspace.projectId })),
    };
  },
});

registerTool({
  name: 'updateWorkspaceSummary',
  description: 'Replace the persisted summary for a workspace.',
  schema: z.object({
    workspaceId: z.string().min(1),
    summary: z.string(),
  }),
  execute: (args) => {
    const workspace = useWorkspaceStore.getState().workspaces.find((item) => item.id === args.workspaceId);
    if (!workspace) return { ok: false, error: 'Workspace not found', workspaceId: args.workspaceId };
    useWorkspaceStore.getState().updateWorkspace(args.workspaceId, { summary: args.summary });
    return { ok: true, workspaceId: args.workspaceId };
  },
});
