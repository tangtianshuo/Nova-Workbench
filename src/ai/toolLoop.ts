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

export {
  confirmDestructiveAction,
  confirmKnowledgeWrite,
  getKnowledgeWriteCandidate,
  rejectDestructiveAction,
  rejectKnowledgeWrite,
} from './confirmations';

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

function stringifyResult(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 2000);
  } catch {
    return String(value);
  }
}

export async function runToolLoop(args: RunToolLoopArgs): Promise<ToolLoopResult> {
  const session = args.session ?? new ChatSession();
  session.addMessage('user', args.userMessage);
  const messages: ChatMessage[] = session.getMessagesForLLM().map((message) => ({
    role: message.role === 'tool' ? 'user' : message.role,
    content: message.content,
  }));
  const systemPrompt = args.systemPromptOverride ?? buildSystemPrompt({ coreContext: buildCoreContext() });
  const argErrorCount = new Map<string, number>();
  let content = '';
  let toolCallsExecuted = 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
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
      return { content, iterations: iteration, toolCallsExecuted, truncated: false };
    }

    messages.push({ role: 'assistant', content: content || '[requesting tools]' });
    for (const call of result.toolCalls) {
      const toolCallId = `${iteration}-${call.name}-${toolCallsExecuted}`;
      session.addMessage('assistant', content || '[requesting tools]', toolCallId, call.name);
      args.callbacks?.onToolStart?.(call.name, call.args);
      try {
        const toolResult = await executeTool(call.name, call.args);
        if (isDestructiveConfirmation(toolResult)) {
          args.callbacks?.onToolEnd?.(call.name, toolResult);
          args.callbacks?.onDestructiveConfirmationRequired?.(toolResult);
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
        session.addMessage('tool', stringifyResult({ ok: true, data: toolResult }), toolCallId, call.name);
        messages.push({
          role: 'user',
          content: `[tool_result ${call.name}] ${stringifyResult({ ok: true, data: toolResult })}`,
        });
      } catch (error) {
        const isConfirmation = error instanceof ConfirmationRequiredError;
        const errorMessage = error instanceof Error ? error.message : String(error);
        // ponytail: ConfirmationRequiredError 是预期的"等待确认"流程,不是错误。
        // 把 errorMessage 透传给 onToolEnd 会让 ChatPanel 的 trace 翻红(⚠️ 失败),
        // 误导用户。confirmation 时跳过 error 参数,trace 显示 ok;LLM 历史仍记录
        // { ok: false } payload(工具确实没完成),只有 UI 面的回调被过滤。
        args.callbacks?.onToolEnd?.(
          call.name,
          null,
          isConfirmation ? undefined : errorMessage,
        );
        session.addMessage('tool', stringifyResult({ ok: false, error: errorMessage }), toolCallId, call.name);
        if (isConfirmation) {
          args.callbacks?.onConfirmationRequired?.(error.candidate);
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
        messages.push({
          role: 'user',
          content: `[tool_error ${call.name}] ${errorMessage}. ${isRetryAvailable
            ? 'Please correct the arguments and retry once.'
            : 'No more argument retries are available for this tool call.'}`,
        });
      }
    }
  }

  return {
    content: `${content}${content ? '\n\n' : ''}[tool loop reached the ${MAX_ITERATIONS}-iteration limit]`,
    iterations: MAX_ITERATIONS,
    toolCallsExecuted,
    truncated: true,
  };
}
