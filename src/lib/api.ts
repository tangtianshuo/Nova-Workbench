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
  kind: 'token' | 'done' | 'error';
  data?: { text?: string; message?: string }; // token→data.text, error→data.message
}

export interface GenerateProjectResult {
  content: string;
}

// D-14: map AppError messages to human-readable Chinese strings.
// ponytail: prefix matching — AppError serializes via thiserror Display,
// so "network error: ..." / "invalid api key" / "cancelled" / etc. match by prefix.
function humanizeAIError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.startsWith('network error')) return '网络连接失败,请检查网络';
  if (lower.includes('invalid api key') || lower.includes('auth')) return 'API key 无效,请到 Settings 更新';
  if (lower.includes('rate')) return '请求过于频繁,稍后再试';
  if (lower === 'cancelled') return '已取消';
  return `AI 调用失败:${message}`;
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
      throw new Error(humanizeAIError(msg));
    }
  }

  // dev/web fallback per D-21: Express still hosts /api/generate-project.
  // Ponytail: no streaming here — fetch returns the whole blob. Tokens are
  // replayed via onToken for UX parity (Deferred: web prod streaming is OUT).
  const resp = await fetch('/api/generate-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, filesContext }),
    signal,
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    throw new Error(humanizeAIError(`HTTP ${resp.status}: ${errText}`));
  }
  const data = await resp.json();
  // Replay synthesized tokens for UX parity (dev mode only)
  if (data.projectDescription) onToken(data.projectDescription);
  return { content: JSON.stringify(data) } as GenerateProjectResult;
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
