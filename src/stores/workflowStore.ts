// src/stores/workflowStore.ts
// Phase 30 (30-02) — workflow template state. builtin JSON is the read-only
// reference layer (always first); SQLite user/distilled templates are merged
// in by refreshFromSql (engine writes + webview manual actions both land there).
import { create } from 'zustand';
import { isTauri } from '@/src/lib/api';
import { engineListWorkflows } from '@/src/ai/api';

export interface WorkflowStep {
  name: string;
  prompt: string;
  expectedSlotCode?: string;
  toolHint?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  source: 'builtin' | 'user' | 'distilled';
  updatedAt?: string;
}

interface WorkflowState {
  templates: WorkflowTemplate[];
  /** builtin JSON + engineListWorkflows merged (builtin read-only first). */
  refreshFromSql: () => Promise<void>;
  /** Webview manual path (UI 用) — executeTool workflow_* tools write SQLite. */
  createTemplate: (t: Omit<WorkflowTemplate, 'id' | 'source'> & { source?: 'user' | 'distilled' }) => Promise<{ id: string }>;
  renameTemplate: (id: string, name: string) => Promise<{ updated: boolean }>;
  deleteTemplate: (id: string) => Promise<void>;
}

// Same single-source JSON the Rust engine include_str!s (D-01).
import builtinJson from '@/src/data/workflow-templates-builtin.json';
const BUILTIN = builtinJson as WorkflowTemplate[];

const builtinOnly = (): WorkflowTemplate[] =>
  BUILTIN.map((t) => ({ ...t, source: 'builtin' as const }));

export const useWorkflowStore = create<WorkflowState>()((set) => ({
  templates: builtinOnly(),

  refreshFromSql: async () => {
    if (!isTauri()) return;
    try {
      const rows = await engineListWorkflows();
      const user = rows.map((r) => ({
        ...r,
        steps: (r.steps ?? []) as WorkflowStep[],
        source: r.source ?? 'user',
      })) as WorkflowTemplate[];
      set({ templates: [...builtinOnly(), ...user] });
    } catch (e) {
      console.error('[workflowStore] refreshFromSql failed:', e);
    }
  },

  createTemplate: async (t) => {
    const { executeTool } = await import('@/src/ai/registry');
    const result = (await executeTool('workflow_create', t)) as { id: string };
    await useWorkflowStore.getState().refreshFromSql();
    return result;
  },

  renameTemplate: async (id, name) => {
    const { executeTool } = await import('@/src/ai/registry');
    const result = (await executeTool('workflow_update', { id, name })) as { updated: boolean };
    await useWorkflowStore.getState().refreshFromSql();
    return result;
  },

  deleteTemplate: async (id) => {
    const { executeTool } = await import('@/src/ai/registry');
    await executeTool('workflow_delete', { id });
    await useWorkflowStore.getState().refreshFromSql();
  },
}));
