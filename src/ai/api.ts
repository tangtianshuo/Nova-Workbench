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
  kind: 'token' | 'tool_start' | 'tool_end' | 'tool_output' | 'event' | 'confirmation' | 'done' | 'error' | 'run_status';
  data?: {
    text?: string;
    name?: string;
    /** tool_output: exec stdout/stderr chunk (23-02 renders it). */
    stream?: string;
    isStderr?: boolean;
    ok?: boolean;
    seq?: number;
    event_type?: string;
    candidate?: EnginePendingCandidate;
    result?: EngineRunResult;
    message?: string;
    /** run_status (24-01 scheduler): "queued" | "running". */
    run_id?: string;
    status?: string;
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
  /** Active workspace folderPath — fs/exec tool root (23-01). */
  workspaceRoot?: string | null;
  /** 24-02 tray run-list display title (session title or message prefix). */
  sessionTitle?: string | null;
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
    workspaceRoot: params.workspaceRoot ?? null,
    sessionTitle: params.sessionTitle ?? null,
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
 * Confirm an exec_approval candidate (23-02): Rust confirms+consumes, optionally
 * learns the command into agent.exec.whitelist, RE-EXECUTES the subprocess
 * itself and settles the [confirmed rerun] events — no TS executeTool seam.
 * Resolves with the execution payload ({ok, exitCode, stdout, stderr, ...}).
 */
export async function engineExecConfirmed(
  sessionId: string,
  confirmationToken: string,
  allowPermanently: boolean,
): Promise<Record<string, unknown>> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('engine_exec_confirmed', {
    sessionId,
    token: confirmationToken,
    allowPermanently,
  });
}

/** Whitelist learning backup path (main path: engineExecConfirmed true). */
export async function engineWhitelistAdd(command: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('engine_whitelist_add', { command });
}

/**
 * Confirm an fs_write candidate (23-03): Rust confirms+consumes, executes the
 * write itself (std::fs, workspace-locked) and settles the [confirmed rerun]
 * events — no TS executeTool seam. Resolves with the operation payload
 * ({operation, path, written/created/deleted/moved} or {error}).
 */
export async function engineFsApply(sessionId: string, confirmationToken: string): Promise<Record<string, unknown>> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('engine_fs_apply', { sessionId, token: confirmationToken });
}

/**
 * Seam ① (23-04): land the deliverable_committed audit event via Rust — sole
 * writer of agent_events. Called by commitToSlot AFTER the TS executeTool half
 * (consume + knowledgeRepo upsert + rndStore slot projection, transition-period
 * legal) succeeded. Rust confirms+consumes of record (tolerating the TS
 * consumption on the shared nova.db) and appends the event exactly-once
 * (docId+version idempotent).
 */
export async function engineCommitDeliverable(args: {
  sessionId: string;
  token: string;
  code: string;
  title: string;
  editedDraft: string;
  productId: string;
  docId: string;
  version: number;
  ftsHitCount: number;
  ftsImmediateHit: boolean;
}): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('engine_commit_deliverable', {
    sessionId: args.sessionId,
    token: args.token,
    code: args.code,
    title: args.title,
    editedDraft: args.editedDraft,
    productId: args.productId,
    docId: args.docId,
    version: args.version,
    ftsHitCount: args.ftsHitCount,
    ftsImmediateHit: args.ftsImmediateHit,
  });
}

/**
 * Seam ② (23-05): confirm + consume a memory candidate and land the memories
 * row in Rust — one user action (已记住 click) is one invoke. Resolves with
 * the camelCase MemoryRecord (memoryRowid/memoryId/version/content/...).
 */
export async function engineConsumeMemory(confirmationToken: string): Promise<Record<string, unknown>> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('engine_consume_memory', { token: confirmationToken });
}

/** Reject a memory candidate (忽略 click) — Rust sole writer of the reject path. */
export async function engineRejectMemory(confirmationToken: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('engine_reject_memory', { token: confirmationToken });
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
