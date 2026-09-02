// src/ai/distill.ts
// Phase 30 (30-04) — deterministic run → template step extraction (SC-3 / D-07).
// Reads the session's event log, keeps whitelist product-creating tool_calls
// whose tool_result succeeded, maps them to editable step drafts. No LLM,
// no candidates table — pure projection (planner ruling, UI-SPEC §3).
import { resolveSessionEvents } from './fork';

/** Product-creating tools worth distilling. Read-only / infra tools excluded. */
export const DISTILL_KEEP = new Set([
  'generate_deliverable',
  'knowledge_write',
  'task_create',
  'task_update',
  'task_complete',
  'schedule_create',
  'schedule_update',
  'ingest_scan',
  'ingest_submit',
]);

export interface DistilledStep {
  name: string;
  prompt: string;
  toolHint?: string;
  expectedSlotCode?: string;
}

export async function distillSessionToSteps(sessionId: string): Promise<DistilledStep[]> {
  const events = await resolveSessionEvents(sessionId);
  // toolCallId → failed (a later tool_result with ok===false kills the step).
  const failed = new Set<string>();
  const calls: { toolCallId: string; toolName: string; args: Record<string, unknown> }[] = [];

  for (const ev of events) {
    const toolCallId = typeof ev.payload.toolCallId === 'string' ? ev.payload.toolCallId : null;
    if (ev.eventType === 'tool_result' && toolCallId && ev.payload.ok === false) {
      failed.add(toolCallId);
      continue;
    }
    if (ev.eventType !== 'tool_call' || !toolCallId) continue;
    const toolName = typeof ev.payload.toolName === 'string' ? ev.payload.toolName : '';
    if (!DISTILL_KEEP.has(toolName)) continue;
    calls.push({ toolCallId, toolName, args: (ev.payload.args ?? {}) as Record<string, unknown> });
  }

  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

  return calls
    .filter((c) => !failed.has(c.toolCallId))
    .map((c) => ({
      name: str(c.args.title) ?? str(c.args.name) ?? c.toolName,
      prompt: JSON.stringify(c.args),
      toolHint: c.toolName,
      expectedSlotCode: str(c.args.code),
    }));
}
