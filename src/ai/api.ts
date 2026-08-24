// src/ai/api.ts
// Phase 22 (22-06) — engine IPC adapter. The Rust run engine owns the agent
// loop; the webview starts runs via invoke('engine_run') + Channel<EngineEvent>
// (same shape as lib/api.ts chatWithTools). Tool schemas live in Rust
// (engine/tools.rs) — the model-visible list is NOT sourced from the TS
// registry anymore.
import type { Provider } from '@/src/lib/api';

/** HITL candidate emitted by the engine (kind discriminates the shape). */
export interface EnginePendingCandidate {
  kind: 'knowledge_write' | 'memory_write' | 'destructive_action' | string;
  confirmationToken: string;
  summary?: string | null;
  /** knowledge_write / destructive_action args (Rust candidate shape). */
  args?: Record<string, unknown>;
  content?: string;
  scope?: string;
  productId?: string | null;
}

/** ToolLoopResult 同形 (engine/channel.rs EngineRunResult, camelCase wire). */
export interface EngineRunResult {
  content: string;
  iterations: number;
  toolCallsExecuted: number;
  truncated: boolean;
  pendingConfirmation?: EnginePendingCandidate | null;
}

/** Seven-variant channel protocol (engine/channel.rs, tag=kind/content=data). */
export interface EngineEventMsg {
  kind: 'token' | 'tool_start' | 'tool_end' | 'event' | 'confirmation' | 'done' | 'error';
  data?: {
    text?: string;
    name?: string;
    ok?: boolean;
    seq?: number;
    event_type?: string;
    candidate?: EnginePendingCandidate;
    result?: EngineRunResult;
    message?: string;
  };
}

export interface EngineRunParams {
  /** Cancel key (engine_cancel); frontend-minted UUID. */
  runId: string;
  userMessage: string;
  sessionId: string;
  provider: Provider;
  ollamaModel?: string;
  workspaceId?: string | null;
  productId?: string | null;
  /** TS buildCoreContext() output — injected into the Rust system prompt. */
  coreContext: string;
  onEvent: (event: EngineEventMsg) => void;
}

/** Start one full agent turn in the Rust engine. Desktop-only (isTauri). */
export async function engineRun(params: EngineRunParams): Promise<EngineRunResult> {
  const { invoke, Channel } = await import('@tauri-apps/api/core');
  const channel = new Channel<EngineEventMsg>();
  channel.onmessage = params.onEvent;
  return invoke<EngineRunResult>('engine_run', {
    runId: params.runId,
    userMessage: params.userMessage,
    sessionId: params.sessionId,
    provider: params.provider,
    ollamaModel: params.ollamaModel ?? null,
    workspaceId: params.workspaceId ?? null,
    productId: params.productId ?? null,
    coreContext: params.coreContext,
    onEvent: channel,
  });
}

/** Cancel an in-flight run. Idempotent (run may have ended naturally). */
export async function engineCancel(runId: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('engine_cancel', { runId });
}

/** Confirm a HITL candidate (atomic conditional UPDATE in Rust). */
export async function engineConfirmCandidate(confirmationToken: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('engine_confirm_candidate', { token: confirmationToken });
}

/** Reject a HITL candidate — also the cancel semantics for a waiting card. */
export async function engineRejectCandidate(confirmationToken: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('engine_reject_candidate', { token: confirmationToken });
}

/**
 * Post-confirmation settlement: the tool re-executed in TS (executeTool stays
 * TS in Phase 22), the events land via Rust — sole writer. Fresh UUID when the
 * caller has no original tool_call id (Rust appends the pairing tool_call).
 */
export async function engineAppendToolResult(args: {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  ok: boolean;
  payloadJson: unknown;
  args?: Record<string, unknown>;
}): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('engine_append_tool_result', {
    sessionId: args.sessionId,
    toolCallId: args.toolCallId,
    toolName: args.toolName,
    ok: args.ok,
    payloadJson: args.payloadJson,
    args: args.args ?? null,
  });
}
