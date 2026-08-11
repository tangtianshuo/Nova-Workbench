// ponytail: single home for platform detection + future Tauri API chokepoints.
// Phase 3 IPC adapter will live here too.

export function isTauri(): boolean {
  // __TAURI_INTERNALS__ is always injected by Tauri v2 (drag.js relies on it for IPC).
  // __TAURI__ is only available when withGlobalTauri is enabled.
  // ponytail: typeof window check is the stdlib SSR guard — covers Node test envs
  // and any future SSR boundary without a second isTauri variant.
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

/* === Phase 3 IPC adapter ===
 * Single chokepoint for Tauri IPC AI calls. Each function branches on isTauri():
 * - Tauri prod: invoke() + Channel<T> streaming
 * - Dev/web: fetch() + AbortController (Express still hosts /api/* per D-21)
 * Callers (ProjectCreateModal, SettingsApiKeySection) catch errors and use
 * useToast() to surface them per D-14.
 */

// Wire types matching src-tauri/src/commands.rs StreamChunk enum
// (tag = "kind", content = "data" — serde internal tagging). Token payload is
// NESTED: {"kind":"token","data":{"text":"..."}} (asserted by Rust unit test
// streamchunk_token_serializes_tagged). `data` is absent on the unit `done`
// variant — serde omits content for unit variants.
interface StreamChunk {
  kind: 'token' | 'done' | 'error' | 'tool_call';
  data?: { text?: string; message?: string; name?: string; arguments?: unknown };
}

export type Provider = 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatToolCall {
  name: string;
  args: unknown;
}

export interface ChatResult {
  content: string;
  toolCalls: ChatToolCall[];
}

export interface GenerateProjectResult {
  content: string;
}

// D-14: map AppError messages to human-readable Chinese strings.
// ponytail: prefix matching — AppError serializes via thiserror Display,
// so "network error: ..." / "invalid api key" / "cancelled" / etc. match by prefix.
// ponytail (UAT Issue #6): auth markers are checked BEFORE the generic
// 'network error' prefix — a provider 401 (DeepSeek body "Authentication Fails",
// Google "API key not valid") arrives wrapped as AppError::NetworkError, i.e.
// "network error: HTTP 401 ... auth ...", and must map to the key-invalid toast,
// not 网络连接失败.
function humanizeAIError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid api key') || lower.includes('auth') || lower.includes('api key not valid')) return 'API key 无效,请到 Settings 更新';
  if (lower.startsWith('network error')) return '网络连接失败,请检查网络';
  if (lower.includes('rate')) return '请求过于频繁,稍后再试';
  if (lower.includes('model not found') || lower.includes('does not exist')) return '模型不存在,请检查 Settings 配置';
  if (lower.includes('context length') || lower.includes('too long')) return '上下文过长,请缩短输入';
  if (lower.includes('quota') || lower.includes('billing')) return '配额不足,请检查 API 账户';
  if (lower === 'cancelled') return '已取消';
  return `AI 调用失败:${message}`;
}

export async function chatWithTools(args: {
  messages: ChatMessage[];
  tools: Record<string, unknown>[];
  systemPrompt: string;
  provider: Provider;
  onToken?: (text: string) => void;
  onToolCall?: (name: string, argsValue: unknown) => void;
  signal?: AbortSignal;
}): Promise<ChatResult> {
  if (isTauri()) {
    const { invoke, Channel } = await import('@tauri-apps/api/core');
    const requestId = crypto.randomUUID();
    const channel = new Channel<StreamChunk>();
    const streamedToolCalls: ChatToolCall[] = [];
    channel.onmessage = (message) => {
      if (message.kind === 'token' && message.data?.text) args.onToken?.(message.data.text);
      if (message.kind === 'tool_call' && message.data?.name) {
        const call = { name: message.data.name, args: message.data.arguments };
        streamedToolCalls.push(call);
        args.onToolCall?.(call.name, call.args);
      }
      if (message.kind === 'error' && message.data?.message) {
        console.error('[chatWithTools] stream error:', message.data.message);
      }
    };
    args.signal?.addEventListener('abort', () => {
      invoke('cancel_chat', { requestId }).catch(() => undefined);
    }, { once: true });
    try {
      const result = await invoke<ChatResult & { tool_calls?: ChatToolCall[] }>('chat', {
        args: {
          messages: args.messages,
          tools: args.tools,
          systemPrompt: args.systemPrompt,
          provider: args.provider,
          requestId,
        },
        onToken: channel,
      });
      const resultToolCalls = result.toolCalls ?? result.tool_calls ?? [];
      return {
        content: result.content ?? '',
        toolCalls: resultToolCalls.length ? resultToolCalls : streamedToolCalls,
      };
    } catch (error) {
      const message = typeof error === 'string' ? error : (error as Error).message ?? String(error);
      throw new Error(humanizeAIError(message));
    }
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: args.messages,
      tools: args.tools,
      systemPrompt: args.systemPrompt,
      provider: args.provider,
    }),
    signal: args.signal,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(humanizeAIError(`HTTP ${response.status}: ${errorText}`));
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI 响应没有可读内容');

  const decoder = new TextDecoder();
  const toolCalls: ChatToolCall[] = [];
  let content = '';
  let buffer = '';

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(line) as StreamChunk;
    } catch {
      console.warn('[chatWithTools] ignored malformed NDJSON line');
      return;
    }
    if (chunk.kind === 'token' && chunk.data?.text) {
      content += chunk.data.text;
      args.onToken?.(chunk.data.text);
    } else if (chunk.kind === 'tool_call' && chunk.data?.name) {
      const call = { name: chunk.data.name, args: chunk.data.arguments };
      toolCalls.push(call);
      args.onToolCall?.(call.name, call.args);
    } else if (chunk.kind === 'error' && chunk.data?.message) {
      throw new Error(humanizeAIError(chunk.data.message));
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);
    }
    buffer += decoder.decode();
    consumeLine(buffer);
  } finally {
    reader.releaseLock();
  }
  return { content, toolCalls };
}

export async function streamGenerateProject(
  prompt: string,
  filesContext: string,
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<GenerateProjectResult> {
  if (isTauri()) {
    const { invoke, Channel } = await import('@tauri-apps/api/core');
    const requestId = crypto.randomUUID(); // D-05: frontend generates, Rust uses as map key
    const channel = new Channel<StreamChunk>();
    channel.onmessage = (msg) => {
      if (msg.kind === 'token' && msg.data?.text) onToken(msg.data.text);
      // 'done' and 'error' handled by invoke() resolve/reject below
    };
    // D-04 + D-05: AbortSignal (frontend) → cancel_generate_project IPC (Rust)
    signal?.addEventListener('abort', () => {
      invoke('cancel_generate_project', { requestId }).catch(() => {
        // ponytail: swallow — caller already aborting, no toast for cancel
      });
    });
    try {
      return await invoke<GenerateProjectResult>('generate_project', {
        prompt,
        filesContext,
        requestId,
        onToken: channel,
      });
    } catch (e) {
      // e is the AppError serialized string from Rust (RESEARCH.md §Pattern 4)
      const msg = typeof e === 'string' ? e : (e as Error).message ?? String(e);
      const human = humanizeAIError(msg);
      // D-14: cancelled stays silent-exact (downstream matches '已取消' strictly)
      if (human === '已取消') throw new Error(human);
      // TEMP DIAGNOSTIC (UAT#6 auth debug — REMOVE once root cause is known):
      // surface the raw Rust/DeepSeek error so we can see exactly what came back.
      console.error('[gen-err] raw IPC error:', msg);
      throw new Error(`${human} | 原始:${msg}`);
    }
  }

  // Web fallback uses the same single /api/chat proxy as the tool loop.
  const result = await chatWithTools({
    messages: [{
      role: 'user',
      content: `${prompt}\n\nWorkspace context:\n${filesContext || '(none)'}`,
    }],
    tools: [],
    provider: 'gemini',
    systemPrompt: `Generate a project plan as JSON only. Return exactly this shape:\n${JSON.stringify({
      projectName: 'string',
      projectDescription: 'string',
      milestones: [{ title: 'string', date: 'YYYY-MM-DD', status: 'pending' }],
      tasks: [{ title: 'string', description: 'string', priority: 'high|medium|low', deadline: 'YYYY-MM-DD', milestoneIndex: 0 }],
    })}`,
    onToken,
    signal,
  });
  return { content: result.content };
}

export async function cancelGenerateProject(requestId: string): Promise<void> {
  if (!isTauri()) return; // dev: AbortController handles it (no-op here)
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('cancel_generate_project', { requestId });
}

export async function hasAPIKey(): Promise<boolean> {
  if (!isTauri()) return true; // D-09: dev assumes Express has key via .env
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('has_api_key');
}

export async function setAPIKey(key: string): Promise<void> {
  if (!isTauri()) return; // D-09: dev no-op, .env is source
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_api_key', { key });
}

export async function listProviders(): Promise<Provider[]> {
  if (!isTauri()) return ['gemini'];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('list_providers') as Promise<Provider[]>;
}

export async function setActiveProvider(provider: Provider): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_active_provider', { provider });
}

export async function getActiveProvider(): Promise<Provider> {
  if (!isTauri()) return 'gemini';
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<Provider>('get_active_provider');
}

export async function hasProviderKey(provider: Provider): Promise<boolean> {
  if (!isTauri()) return provider === 'gemini';
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<boolean>('has_provider_key', { provider });
}

export async function setProviderKey(provider: Provider, key: string): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_provider_key', { provider, key });
}
