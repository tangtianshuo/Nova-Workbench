// src/ai/toolLoop.ts
// Phase 13 Plan 03 — single-history event-driven toolLoop.
// The loop maintains NO second messages array: every LLM request re-derives
// messages from the ChatSession projection via session.getMessagesForLLM().
// Each step (user/assistant/tool_call/tool_result/turn_ended) lands in the
// event log via the session's dual-write addMessage; toolCallId is a UUID;
// >4KB results are artifact-ized via prepareToolResult; turn-end audit runs
// checkEventStream and reports violations loud. Public API (RunToolLoopArgs,
// ToolLoopCallbacks, ToolLoopResult) byte-compatible with callers.
import { chatWithTools, type ChatMessage, type Provider } from '@/src/lib/api';
import { buildCoreContext } from './context';
import { ChatSession } from './chatSession';
import { buildSystemPrompt } from './prompts';
import { executeTool, ToolArgError, toolsToSchemas } from './registry';
import { useUIStore } from '@/src/stores/uiStore';
import './tools/knowledgeWrite';
import {
  ConfirmationRequiredError,
  type DestructiveActionCandidate,
  type KnowledgeWriteCandidate,
} from './confirmations';
import { getEventStore, setEventScopeProvider } from './events/eventStore';
import { checkEventStream } from './events/invariants';
import { prepareToolResult } from './events/artifacts';
import { maybeCompactSession } from './compaction';

export {
  confirmDestructiveAction,
  confirmKnowledgeWrite,
  getKnowledgeWriteCandidate,
  rejectDestructiveAction,
  rejectKnowledgeWrite,
} from './confirmations';

// Event scope stamping: current selected product. workspace/project linkage is
// deferred (see 13-CONTEXT deferred ideas) — columns exist, values stay null.
setEventScopeProvider(() => ({
  workspaceId: null,
  productId: useUIStore.getState().selectedProductId,
  projectId: null,
}));

const MAX_ITERATIONS = 5;

export interface ToolLoopCallbacks {
  onToken?: (text: string) => void;
  onToolStart?: (name: string, args: unknown) => void;
  onToolEnd?: (name: string, result: unknown, error?: string) => void;
  onConfirmationRequired?: (candidate: KnowledgeWriteCandidate) => void;
  onDestructiveConfirmationRequired?: (candidate: DestructiveActionCandidate) => void;
}

export interface RunToolLoopArgs {
  userMessage: string;
  provider: Provider;
  session?: ChatSession;
  systemPromptOverride?: string;
  signal?: AbortSignal;
  callbacks?: ToolLoopCallbacks;
}

export interface ToolLoopResult {
  content: string;
  iterations: number;
  toolCallsExecuted: number;
  truncated: boolean;
  pendingConfirmation?: KnowledgeWriteCandidate;
  pendingDestructiveConfirmation?: DestructiveActionCandidate;
}

function isDestructiveConfirmation(value: unknown): value is DestructiveActionCandidate {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return result.pendingConfirmation === true
    && typeof result.confirmationToken === 'string'
    && typeof result.toolName === 'string'
    && typeof result.summary === 'string'
    && !!result.args
    && typeof result.args === 'object';
}

/** Loud, never-silent audit: report pairing/seq issues at turn boundaries. */
async function auditSessionEvents(sessionId: string): Promise<void> {
  try {
    const events = await getEventStore().listEvents(sessionId);
    const issues = checkEventStream(events);
    if (issues.length > 0) {
      console.error('[event-log] invariant violations at turn end', issues);
    }
  } catch (error) {
    console.error('[event-log] turn-end audit failed', error);
  }
}

export async function runToolLoop(args: RunToolLoopArgs): Promise<ToolLoopResult> {
  const session = args.session ?? new ChatSession();
  // One turn = one correlation id; every event emitted this run carries it.
  const correlationId = crypto.randomUUID();
  session.setCorrelationId(correlationId);
  session.addMessage('user', args.userMessage);
  const systemPrompt = args.systemPromptOverride ?? buildSystemPrompt({ coreContext: buildCoreContext() });
  const argErrorCount = new Map<string, number>();
  let content = '';
  let toolCallsExecuted = 0;

  const endTurn = async (outcome: 'completed' | 'tool_limit' | 'awaiting_confirmation' | 'awaiting_destructive_confirmation', iterations: number) => {
    session.recordTurnEnd({ outcome, iterations, toolCallsExecuted, correlationId });
    await session.flushEvents();
    await auditSessionEvents(session.sessionId);
  };

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    // CMP-01: at token pressure >= COMPACTION_PRESSURE_RATIO (0.8) x context window,
    // compact at a pairing-balanced turn boundary BEFORE the next LLM request.
    // Append-only: agent_events never lose events; only the model-visible projection
    // changes (sourced summary + suffix).
    await maybeCompactSession(session, args.provider, {
      ollamaModel: args.provider === 'ollama' ? useUIStore.getState().ollamaModel : undefined,
    });

    // Single source of truth: derive the LLM messages from the session projection
    // on EVERY iteration. No second history array survives across iterations.
    const messages: ChatMessage[] = session.getMessagesForLLM().map((message) => ({
      role: message.role === 'tool' ? 'user' : message.role,
      content: message.content,
    }));

    const result = await chatWithTools({
      messages,
      tools: toolsToSchemas(),
      systemPrompt,
      provider: args.provider,
      // ponytail: pull from store via getState() (this is a plain async fn, not a
      // component). Only Ollama branch reads it; undefined for others.
      ollamaModel: args.provider === 'ollama' ? useUIStore.getState().ollamaModel : undefined,
      onToken: args.callbacks?.onToken,
      signal: args.signal,
    });
    content = result.content;

    if (result.toolCalls.length === 0) {
      session.addMessage('assistant', content);
      await endTurn('completed', iteration);
      return { content, iterations: iteration, toolCallsExecuted, truncated: false };
    }

    for (const call of result.toolCalls) {
      // EVT-06: UUID replaces the old positional iteration-name-count id.
      const toolCallId = crypto.randomUUID();
      session.addMessage('assistant', content || '[requesting tools]', toolCallId, call.name, { args: call.args });
      args.callbacks?.onToolStart?.(call.name, call.args);
      try {
        const toolResult = await executeTool(call.name, call.args);
        if (isDestructiveConfirmation(toolResult)) {
          args.callbacks?.onToolEnd?.(call.name, toolResult);
          args.callbacks?.onDestructiveConfirmationRequired?.(toolResult);
          // WAIT outcome lands as a normal tool_result ({ ok: false } semantics)
          // so tool_call/tool_result pairing stays balanced across the pause.
          const waitText = `[tool_result ${call.name}] ${JSON.stringify({ ok: false, awaitingConfirmation: true, summary: toolResult.summary })}`;
          session.addMessage('tool', waitText, toolCallId, call.name, { ok: false, awaitingConfirmation: true });
          await endTurn('awaiting_destructive_confirmation', iteration);
          return {
            content,
            iterations: iteration,
            toolCallsExecuted,
            truncated: false,
            pendingDestructiveConfirmation: toolResult,
          };
        }
        toolCallsExecuted += 1;
        args.callbacks?.onToolEnd?.(call.name, toolResult);
        // EVT-08: >4KB results go to the artifacts store; model history keeps
        // summary + artifactId + head fragment only.
        const prepared = prepareToolResult({ sessionId: session.sessionId, toolCallId, toolName: call.name, value: toolResult });
        if (prepared.artifact) {
          await getEventStore().saveArtifact(prepared.artifact);
        }
        session.addMessage('tool', prepared.modelText, toolCallId, call.name, {
          ok: true,
          artifactId: prepared.artifact?.artifactId ?? null,
        });
      } catch (error) {
        const isConfirmation = error instanceof ConfirmationRequiredError;
        const errorMessage = error instanceof Error ? error.message : String(error);
        // ponytail: ConfirmationRequiredError 是预期的"等待确认"流程,不是错误。
        // confirmation 时 onToolEnd 的 error 参数保持 undefined,trace 显示 ok —
        // 这是 0bbc3f2 金丝雀行为,不得改动。
        args.callbacks?.onToolEnd?.(
          call.name,
          null,
          isConfirmation ? undefined : errorMessage,
        );
        if (isConfirmation) {
          // Key order deliberately matches the destructive branch ({ ok, awaitingConfirmation, ... })
          // so both WAIT branches share one greppable `ok: false, awaitingConfirmation: true` prefix.
          // (JSON 解析与键序无关,语义不变。)
          const waitText = `[tool_result ${call.name}] ${JSON.stringify({ ok: false, awaitingConfirmation: true, error: errorMessage })}`;
          session.addMessage('tool', waitText, toolCallId, call.name, { ok: false, awaitingConfirmation: true, error: errorMessage });
          args.callbacks?.onConfirmationRequired?.(error.candidate);
          await endTurn('awaiting_confirmation', iteration);
          return {
            content,
            iterations: iteration,
            toolCallsExecuted,
            truncated: false,
            pendingConfirmation: error.candidate,
          };
        }
        const previousErrors = argErrorCount.get(call.name) ?? 0;
        const isRetryAvailable = error instanceof ToolArgError && previousErrors < 1;
        if (error instanceof ToolArgError) {
          argErrorCount.set(call.name, previousErrors + 1);
        }
        const errorText = `[tool_error ${call.name}] ${errorMessage}. ${isRetryAvailable
          ? 'Please correct the arguments and retry once.'
          : 'No more argument retries are available for this tool call.'}`;
        session.addMessage('tool', errorText, toolCallId, call.name, { ok: false, error: errorMessage, retryAvailable: isRetryAvailable });
      }
    }
  }

  const limitedContent = `${content}${content ? '\n\n' : ''}[tool loop reached the ${MAX_ITERATIONS}-iteration limit]`;
  // Close the turn in the projection too (old code dropped this from the session).
  session.addMessage('assistant', limitedContent);
  await endTurn('tool_limit', MAX_ITERATIONS);
  return {
    content: limitedContent,
    iterations: MAX_ITERATIONS,
    toolCallsExecuted,
    truncated: true,
  };
}
