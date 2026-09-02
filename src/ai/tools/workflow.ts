// src/ai/tools/workflow.ts
// Phase 30 (30-02) — TS-side workflow_* registration for the webview manual
// path (executeTool). The agent path runs the Rust-native twins (tools.rs);
// both write the same workflow_templates table (pmRepo precedent: webview
// writes business tables via the sql plugin).
import { z } from 'zod';
import { registerTool } from '../registry';
import { lazySqlite } from '../../stores/storage/lazySqlite';
import { isTauri } from '@/src/lib/api';
import { useWorkflowStore } from '../../stores/workflowStore';
import type { WorkflowStep } from '../../stores/workflowStore';

const nowIso = () => new Date().toISOString();

const stepSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  expectedSlotCode: z.string().optional(),
  toolHint: z.string().optional(),
});

registerTool({
  name: 'workflow_search',
  description: 'List workflow templates (builtin reference + user-created) with step summaries.',
  schema: z.object({ query: z.string().optional() }),
  execute: (args) => {
    let templates = useWorkflowStore.getState().templates;
    if (args.query) {
      const q = args.query.toLowerCase();
      templates = templates.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      );
    }
    return templates.map((t) => ({
      id: t.id, name: t.name, description: t.description,
      source: t.source, stepCount: t.steps.length, steps: t.steps,
    }));
  },
});

registerTool({
  name: 'workflow_create',
  description: 'Create a workflow template (user layer). source defaults to user; distilled marks run-distilled templates.',
  schema: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    steps: z.array(stepSchema).min(1),
    source: z.enum(['user', 'distilled']).optional(),
  }),
  execute: async (args) => {
    if (!isTauri()) throw new Error('workflow_create requires Tauri (SQLite)');
    const db = await lazySqlite();
    const id = crypto.randomUUID();
    const now = nowIso();
    await db.execute(
      `INSERT INTO workflow_templates (id, name, description, steps_json, manifest_version, source, created_at, updated_at)
       VALUES ($1,$2,$3,$4,1,$5,$6,$6)`,
      [id, args.name, args.description ?? '', JSON.stringify(args.steps), args.source ?? 'user', now],
    );
    return { id, created: true };
  },
});

registerTool({
  name: 'workflow_update',
  description: 'Update name/description/steps (whole-array replace) of a workflow template.',
  schema: z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    steps: z.array(stepSchema).min(1).optional(),
  }),
  execute: async (args) => {
    if (!isTauri()) throw new Error('workflow_update requires Tauri (SQLite)');
    const db = await lazySqlite();
    const sets: string[] = [];
    const params: unknown[] = [];
    if (args.name !== undefined) { params.push(args.name); sets.push(`name = $${params.length}`); }
    if (args.description !== undefined) { params.push(args.description); sets.push(`description = $${params.length}`); }
    if (args.steps !== undefined) { params.push(JSON.stringify(args.steps as WorkflowStep[])); sets.push(`steps_json = $${params.length}`); }
    params.push(nowIso());
    sets.push(`updated_at = $${params.length}`);
    params.push(args.id);
    const n = await db.execute(
      `UPDATE workflow_templates SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    return { updated: n.rowsAffected > 0 };
  },
});

registerTool({
  name: 'workflow_delete',
  description: 'Delete a workflow template (webview path — the UI owns its confirmation UX).',
  schema: z.object({ id: z.string().min(1) }),
  execute: async (args) => {
    if (!isTauri()) throw new Error('workflow_delete requires Tauri (SQLite)');
    const db = await lazySqlite();
    const n = await db.execute('DELETE FROM workflow_templates WHERE id = $1', [args.id]);
    return { deleted: n.rowsAffected > 0 };
  },
});
