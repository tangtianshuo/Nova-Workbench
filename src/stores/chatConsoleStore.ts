// Phase 17 (UX-01) — conversation state single ownership.
// Extracted verbatim from ChatPanel.tsx component state/handlers so the
// Drawer host and the agent-tab page host share ONE conversation.
// Transient store (never written to disk — same class as uiStore modal flags).
import { create } from 'zustand';
import { executeTool } from '@/src/ai';
import {
  engineAppendToolResult,
  engineCommitDeliverable,
  engineConfirmCandidate,
  engineConsumeMemory,
  engineExecConfirmed,
  engineFsApply,
  engineRejectCandidate,
  engineRejectMemory,
  engineRun,
  type EnginePendingCandidate,
} from '@/src/ai/api';
import { buildCoreContext } from '@/src/ai/context';
import {
  confirmDeliverableDraft,
  listPendingDeliverableDrafts,
  listPendingExecApprovals,
  listPendingFsWrites,
  rejectDeliverableDraft,
  type DestructiveActionCandidate,
  type KnowledgeWriteCandidate,
  type DeliverableDraftCandidate,
  type ExecApprovalPendingCandidate,
  type FsWritePendingCandidate,
} from '@/src/ai/confirmations';
import { getMemoryStore, type MemoryCandidate } from '@/src/ai/memoryStore';
import { ChatSession } from '@/src/ai/chatSession';
import { restoreSession } from '@/src/ai/sessionRestore';
import { findForkCutSeq, resolveSessionEvents } from '@/src/ai/fork';
import { getSessionRepo } from '@/src/ai/sessionRepo';
import { generateSessionTitle } from '@/src/ai/titleGenerator';
import { getEventStore } from '@/src/ai/events/eventStore';
import type { AgentEvent } from '@/src/ai/events/types';
import { useUIStore } from '@/src/stores/uiStore';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { isTauri } from '@/src/lib/api';
import type { Provider } from '@/src/lib/api';

export type ToolTraceStatus = 'running' | 'ok' | 'error';

export interface ToolOutputLine {
  text: string;
  isStderr: boolean;
}

export interface ToolTraceItem {
  id: number;
  name: string;
  status: ToolTraceStatus;
  /** exec stdout/stderr lines streamed via EngineEvent tool_output (23-02). */
  outputLines?: ToolOutputLine[];
}

/** exec_approval 确认卡(23-02):Rust exec 候选 → 三选项卡(拒绝/仅本次/永久)。 */
export interface ExecApprovalCandidate {
  confirmationToken: string;
  command: string;
  args: string[];
  summary: string;
}

/** fs_write 确认卡(23-03):Rust fs 写候选(write/mkdir/delete/move)→ 两选项卡。 */
export interface FsWriteCandidate {
  confirmationToken: string;
  operation: 'write' | 'mkdir' | 'delete' | 'move';
  path: string;
  content?: string;
  summary: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: ToolTraceItem[];
}

export const PROVIDER_LABELS: Record<Provider, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

export function formatMemoryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* === Phase 22 (22-06) engine candidate mapping === */

/** Rust knowledge_write candidate ({kind, confirmationToken, summary, args})
 * → TS KnowledgeWriteCandidate card shape. */
function toKnowledgeWriteCandidate(
  candidate: EnginePendingCandidate,
  sessionId: string,
): KnowledgeWriteCandidate {
  return {
    ...(candidate.args ?? {}),
    confirmationToken: candidate.confirmationToken,
    sessionId,
  } as KnowledgeWriteCandidate;
}

/** Rust destructive_action candidate → TS DestructiveActionCandidate card. */
function toDestructiveCandidate(
  candidate: EnginePendingCandidate,
): DestructiveActionCandidate {
  return {
    confirmationToken: candidate.confirmationToken,
    toolName: String(candidate.args?.toolName ?? ''),
    args: (candidate.args?.args as Record<string, unknown>) ?? {},
    summary: candidate.summary ?? '',
  } as DestructiveActionCandidate;
}

/* === Toast bridge (component binds useToast; store stays React-free) === */

export interface ConsoleToast {
  type: 'success' | 'error' | 'warning';
  title: string;
  description?: string;
}

let toastSink: ((t: ConsoleToast) => void) | null = null;

export function bindToast(fn: ((t: ConsoleToast) => void) | null) {
  toastSink = fn;
}

function emitToast(t: ConsoleToast) {
  toastSink?.(t);
}

/* === Module-level refs (17-UI-SPEC locked: sessionRef is module-level) === */

export const sessionRef = { current: new ChatSession({ tokenBudget: 8_000 }) };
let nextId = 0;
let streamingResponseRef = '';
let streamingTraceRef: ToolTraceItem[] = [];
// Module-level promise dedupe — StrictMode double mount safe (Phase 14 pattern).
let restorePromise: Promise<void> | null = null;

/* === Phase 20 (FORK): message ↔ event zip === */

interface ProjectedMessage {
  role: 'user' | 'assistant';
  content: string;
  seq: number;
}

/** Event-stream projection in conversation order (same filter as rebuildMessages,
 * user/assistant only). */
function projectConversationEvents(events: AgentEvent[]): ProjectedMessage[] {
  return [...events]
    .sort((a, b) => a.seq - b.seq)
    .filter((e) => e.eventType === 'user_message' || e.eventType === 'assistant_message')
    .map((e) => ({
      role: (e.eventType === 'user_message' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: String(e.payload.content ?? ''),
      seq: e.seq,
    }));
}

/** Ordered content match: per store message, the backing event seq (null =
 * store-only, e.g. ack injections — not forkable). First mismatch ends the
 * match window; everything after is treated as store-only.
 * ponytail: 相同内容的两条 assistant 消息解析到第一条 — 相邻重复至多隔一个 turn,可接受。 */
function resolveMessageSeqs(messages: ChatMessage[], events: AgentEvent[]): (number | null)[] {
  const projected = projectConversationEvents(events);
  let pi = 0;
  return messages.map((message) => {
    if (pi >= projected.length) return null;
    const candidate = projected[pi];
    if (candidate.role !== message.role || candidate.content !== message.content) return null;
    pi += 1;
    return candidate.seq;
  });
}

/* === Store === */

interface ChatConsoleState {
  activeSessionId: string;
  messages: ChatMessage[];
  input: string;
  streamingResponse: string;
  streamingTrace: ToolTraceItem[];
  loading: boolean;
  /** 24-01 SCHED-01: run queued behind the 3-slot cap; flipped by run_status events. */
  isQueued: boolean;
  restoreComplete: boolean;
  pendingConfirmation: KnowledgeWriteCandidate | null;
  pendingDestructiveAction: DestructiveActionCandidate | null;
  pendingExecApproval: ExecApprovalCandidate | null;
  pendingFsWrite: FsWriteCandidate | null;
  pendingMemory: MemoryCandidate | null;
  autoRemembered: MemoryCandidate | null;
  memoryBusy: boolean;
  pendingPrdDraft: DeliverableDraftCandidate | null;
  // UI-REVIEW #1/#2: 快照在 Dialog 打开瞬间固定 — 落槽失败后 refreshPrdCard 移除卡片时
  // 编辑内容仍留在 Dialog;候选对象换血也不冲掉进行中的编辑。
  prdDraftSnapshot: DeliverableDraftCandidate | null;
  prdBusy: boolean;
  prdDialogOpen: boolean;
  // Phase 20 (FORK): forkable assistant message ids (backed by events) +
  // provenance badge data for the current session.
  forkableIds: Set<number>;
  parentSessionId: string | null;
  parentTitle: string | null;
  // Phase 21 (TITLE-01): bumped after a title write so session lists silently refresh.
  sessionListVersion: number;

  setInput: (v: string) => void;
  forkFromMessage: (messageId: number) => Promise<void>;
  restore: () => Promise<void>;
  startNewSession: () => { success: boolean; reason?: string };
  switchSession: (sessionId: string) => Promise<{ success: boolean; reason?: string }>;
  submit: (event?: { preventDefault?: () => void }) => Promise<void>;
  confirmKnowledgeWrite: () => Promise<void>;
  rejectKnowledgeWrite: () => Promise<void>;
  confirmDestructiveAction: () => Promise<void>;
  rejectDestructiveAction: () => Promise<void>;
  confirmExec: (allowPermanently: boolean) => Promise<void>;
  rejectExec: () => Promise<void>;
  confirmFsWrite: () => Promise<void>;
  rejectFsWrite: () => Promise<void>;
  confirmMemory: () => Promise<void>;
  rejectMemory: () => Promise<void>;
  rejectDraft: () => Promise<void>;
  commitToSlot: (editedDraft: string) => Promise<void>;
  openPrdDialog: () => void;
  setPrdDialogOpen: (open: boolean) => void;
  dismissAutoRemembered: () => void;
  refreshMemoryCards: () => Promise<void>;
  refreshPrdCard: () => Promise<void>;
  maybeGenerateTitle: (sessionId: string, llm?: Parameters<typeof generateSessionTitle>[0]['llm']) => Promise<void>;
}

export const useChatConsoleStore = create<ChatConsoleState>()((set, get) => {
  const updateTrace = (updater: (items: ToolTraceItem[]) => ToolTraceItem[]) => {
    set((state) => {
      const next = updater(state.streamingTrace);
      streamingTraceRef = next;
      return { streamingTrace: next };
    });
  };

  // Phase 15 (MEM-01/02/03) — refresh memory cards: queue head for the
  // confirmation card, latest user_directed entry for the 已记住 info card.
  const refreshMemoryCards = async () => {
    try {
      const store = getMemoryStore();
      const pending = await store.listPending(get().activeSessionId);
      set({ pendingMemory: pending[0] ?? null });
      const recent = await store.listRecentUserDirected(1);
      const latest = recent[0] ?? null;
      if (latest) {
        set((state) => ({
          autoRemembered:
            latest.candidateToken === state.autoRemembered?.candidateToken
              ? state.autoRemembered
              : latest,
        }));
      }
    } catch (error) {
      console.error('[memory-cards] refresh failed', error);
      emitToast({ type: 'error', title: '检索失败,请稍后重试;若持续失败请重启应用。' });
    }
  };

  // Phase 16 (DELIV-02) — refresh PRD draft card: queue head of pending
  // deliverable_draft candidates (one card at a time, same as memory cards).
  const refreshPrdCard = async () => {
    try {
      const pending = await listPendingDeliverableDrafts(get().activeSessionId);
      set({ pendingPrdDraft: pending[0] ?? null });
    } catch (error) {
      console.error('[prd-card] refresh failed', error);
      emitToast({ type: 'error', title: '检索失败,请稍后重试;若持续失败请重启应用。' });
    }
  };

  // 24-03 carry-in (23-VERIFICATION): re-surface this session's pending
  // exec_approval / fs_write candidates — one card each, latest wins (same
  // semantics as knowledge/destructive cards in switchSession). TTL (24h)
  // filtering lives in listActive. Restored cards render through the same
  // pendingExecApproval / pendingFsWrite branches as live pushes (shape parity).
  const refreshExecFsCards = async (sessionId?: string) => {
    const target = sessionId ?? get().activeSessionId;
    try {
      const [execs, fss] = await Promise.all([
        listPendingExecApprovals(target),
        listPendingFsWrites(target),
      ]);
      const latestExec: ExecApprovalPendingCandidate | null = execs[execs.length - 1] ?? null;
      const latestFs: FsWritePendingCandidate | null = fss[fss.length - 1] ?? null;
      set((current) => ({
        pendingExecApproval: latestExec
          ? {
              confirmationToken: latestExec.confirmationToken,
              command: latestExec.command,
              args: latestExec.args,
              summary: latestExec.summary,
            }
          : current.pendingExecApproval,
        pendingFsWrite: latestFs
          ? {
              confirmationToken: latestFs.confirmationToken,
              operation: latestFs.operation,
              path: latestFs.path,
              content: latestFs.content,
              summary: latestFs.summary,
            }
          : current.pendingFsWrite,
      }));
    } catch (error) {
      console.error('[exec-fs-cards] refresh failed', error);
    }
  };

  // Phase 20 (FORK-01) — eager forkable resolution: mark which assistant
  // messages have a backing assistant_message event (hover toolbar gate).
  const refreshForkable = async () => {
    try {
      const events = await resolveSessionEvents(get().activeSessionId);
      const seqs = resolveMessageSeqs(get().messages, events);
      const forkable = new Set<number>();
      get().messages.forEach((message, index) => {
        if (message.role === 'assistant' && seqs[index] != null) forkable.add(message.id);
      });
      set({ forkableIds: forkable });
    } catch (error) {
      console.error('[fork] forkable resolution failed', error);
      set({ forkableIds: new Set() });
    }
  };

  // Phase 20 (LIST-03 in-console) — provenance badge data for the active session.
  const refreshParentMeta = async () => {
    try {
      const meta = await getSessionRepo().getSession(get().activeSessionId);
      set({
        parentSessionId: meta?.parentSessionId ?? null,
        parentTitle: meta?.parentSessionId ? meta.parentTitle ?? null : null,
      });
    } catch {
      set({ parentSessionId: null, parentTitle: null });
    }
  };

  // Phase 21 (TITLE-01) — first-turn auto-naming. Fire-and-forget: never toasts,
  // never throws. sessionId is the captured parameter — never read from get()
  // after an await, so switching sessions mid-generation cannot cross-write.
  // updateTitle's title IS NULL SQL guard makes this idempotent.
  const maybeGenerateTitle: ChatConsoleState['maybeGenerateTitle'] = async (sessionId, llm) => {
    try {
      const repo = getSessionRepo();
      const meta = await repo.getSession(sessionId);
      if (meta?.title) return;
      const events = (await getEventStore().listEvents(sessionId))
        .filter((e) => e.eventType === 'user_message' || e.eventType === 'assistant_message')
        .sort((a, b) => a.seq - b.seq);
      const firstUserMessage = String(events.find((e) => e.eventType === 'user_message')?.payload.content ?? '');
      const transcript = events
        .map((e) => `${e.eventType === 'user_message' ? 'user' : 'assistant'}: ${String(e.payload.content ?? '')}`)
        .join('\n')
        .slice(0, 4000);
      const ui = useUIStore.getState();
      const { title, source } = await generateSessionTitle({
        firstUserMessage,
        transcript,
        provider: ui.activeAIProvider,
        ollamaModel: ui.ollamaModel,
        llm,
      });
      await repo.updateTitle(sessionId, title, source);
      set((s) => ({ sessionListVersion: s.sessionListVersion + 1 }));
    } catch (error) {
      console.error('[title] maybeGenerateTitle failed', error);
    }
  };

  return {
    activeSessionId: sessionRef.current.sessionId,
    messages: [],
    input: '',
    streamingResponse: '',
    streamingTrace: [],
    loading: false,
    isQueued: false,
    restoreComplete: false,
    pendingConfirmation: null,
    pendingDestructiveAction: null,
    pendingExecApproval: null,
    pendingFsWrite: null,
    pendingMemory: null,
    autoRemembered: null,
    memoryBusy: false,
    pendingPrdDraft: null,
    prdDraftSnapshot: null,
    prdBusy: false,
    prdDialogOpen: false,
    forkableIds: new Set<number>(),
    parentSessionId: null,
    parentTitle: null,
    sessionListVersion: 0,

    setInput: (v) => set({ input: v }),

    // Phase 20 (FORK-02) — reference-style fork from a message: locate the
    // backing assistant_message event, cut at its turn_ended, create the child
    // session row, drop a session_forked marker event (guarantees the child has
    // ≥1 row so restoreSession never treats it as not-found), then jump.
    // Original session is never written to — failure is a toast, never a mutation.
    forkFromMessage: async (messageId) => {
      const state = get();
      if (state.loading) {
        emitToast({ type: 'warning', title: '创建分支失败', description: '当前回复尚未完成，请稍后再试' });
        return;
      }
      try {
        const events = await resolveSessionEvents(state.activeSessionId);
        const seqs = resolveMessageSeqs(state.messages, events);
        const index = state.messages.findIndex((m) => m.id === messageId);
        const assistantSeq = index >= 0 ? seqs[index] : null;
        if (assistantSeq == null) {
          emitToast({ type: 'error', title: '创建分支失败', description: '创建分支时出错，原会话未受影响' });
          return;
        }
        const cutSeq = findForkCutSeq(events, assistantSeq);
        if (cutSeq == null) {
          emitToast({ type: 'warning', title: '创建分支失败', description: '当前回复尚未完成，请稍后再试' });
          return;
        }
        const childId = crypto.randomUUID();
        await getSessionRepo().createForkSession({
          sessionId: childId,
          workspaceId: useWorkspaceStore.getState().activeWorkspaceId,
          parentSessionId: state.activeSessionId,
          forkCutSeq: cutSeq,
          title: null,
        });
        // Marker event: payload counts are parent-space (informational audit).
        await getEventStore().append({
          sessionId: childId,
          eventType: 'session_forked',
          payload: { parentSessionId: state.activeSessionId, parentCutSeq: cutSeq, parentEventCount: cutSeq },
        });
        const switched = await get().switchSession(childId);
        if (!switched.success) {
          emitToast({ type: 'error', title: '创建分支失败', description: '创建分支时出错，原会话未受影响' });
        }
      } catch (error) {
        console.error('[fork] forkFromMessage failed', error);
        emitToast({ type: 'error', title: '创建分支失败', description: '创建分支时出错，原会话未受影响' });
      }
    },

    // SESS-02: app entry lands in a FRESH session (module-level ChatSession
    // created above). No auto-restore of the latest session into the
    // conversation; restoreSession() no-arg remains available in
    // sessionRestore.ts as crash-recovery API. Promise dedupe keeps
    // ChatPanel/AgentWorkspaceView double-mount safe.
    restore: async () => {
      if (restorePromise) return restorePromise;
      restorePromise = (async () => {
        try {
          set({ activeSessionId: sessionRef.current.sessionId, restoreComplete: true });
          // Pending memory/PRD cards still surface cross-session (Phase 15/16).
          void refreshMemoryCards();
          void refreshPrdCard();
          // 24-03 carry-in: exec/fs HITL cards re-surface on app restart too.
          void refreshExecFsCards();
        } catch (error) {
          console.error('[session-restore] failed', error);
          set({ restoreComplete: true });
        }
      })();
      return restorePromise;
    },

    // SESS-02: end the current conversation and enter a brand-new session.
    // Blocked while streaming (store-level bottom line, SESS-04).
    startNewSession: () => {
      if (get().loading) return { success: false, reason: 'streaming' };
      sessionRef.current = new ChatSession({ tokenBudget: 8_000 });
      set({
        activeSessionId: sessionRef.current.sessionId,
        messages: [],
        pendingConfirmation: null,
        pendingDestructiveAction: null,
        pendingExecApproval: null,
        pendingFsWrite: null,
        pendingPrdDraft: null,
        pendingMemory: null,
        forkableIds: new Set<number>(),
        parentSessionId: null,
        parentTitle: null,
      });
      void refreshMemoryCards();
      void refreshPrdCard();
      return { success: true };
    },

    // SESS-03: switch to a persisted session — history restored verbatim via
    // the 19-01 engine. Blocked while streaming (SESS-04).
    switchSession: async (sessionId) => {
      if (get().loading) return { success: false, reason: 'streaming' };
      const restored = await restoreSession(sessionId);
      if (!restored) return { success: false, reason: 'not_found' };
      sessionRef.current = restored.session;
      const history = restored.session
        .getAllMessages()
        .filter((message) => message.role === 'user' || (message.role === 'assistant' && !message.toolCallId))
        .map((message) => ({
          id: nextId++,
          role: message.role as 'user' | 'assistant',
          content: message.content,
        }));
      // SESS-05: sessionRestore lists across all sessions — keep only this session's cards.
      const ownKnowledgeWrites = restored.pendingKnowledgeWrites.filter((c) => c.sessionId === restored.sessionId);
      const ownDestructiveActions = restored.pendingDestructiveActions.filter((c) => c.sessionId === restored.sessionId);
      const latestKnowledgeWrite = ownKnowledgeWrites[ownKnowledgeWrites.length - 1];
      const latestDestructiveAction = ownDestructiveActions[ownDestructiveActions.length - 1];
      set({
        activeSessionId: restored.sessionId,
        messages: history,
        pendingConfirmation: latestKnowledgeWrite ?? null,
        pendingDestructiveAction: latestDestructiveAction ?? null,
        // 24-03 carry-in: clear stale exec/fs cards from the previous session;
        // refreshExecFsCards re-populates from this session's pending candidates.
        pendingExecApproval: null,
        pendingFsWrite: null,
        forkableIds: new Set<number>(),
        parentSessionId: null,
        parentTitle: null,
      });
      void refreshMemoryCards();
      void refreshPrdCard();
      void refreshExecFsCards(restored.sessionId);
      await refreshForkable();
      await refreshParentMeta();
      return { success: true };
    },

    submit: async (event) => {
      event?.preventDefault?.();
      const state = get();
      const trimmed = state.input.trim();
      if (!state.restoreComplete || !trimmed || state.loading) return;
      const provider = useUIStore.getState().activeAIProvider;

      const userMessage: ChatMessage = {
        id: nextId++,
        role: 'user',
        content: trimmed,
      };
      set((current) => ({
        messages: [...current.messages, userMessage],
        input: '',
        loading: true,
        isQueued: false,
        streamingResponse: '',
        streamingTrace: [],
      }));
      streamingResponseRef = '';
      streamingTraceRef = [];

      try {
        // Phase 22 (22-06): the whole agent turn runs in the Rust engine
        // (engine_run + Channel<EngineEvent>). The TS runToolLoop is retired as
        // a runtime caller — its source stays as the porting spec (Phase 25).
        let engineKnowledgeCandidate: KnowledgeWriteCandidate | null = null;
        let engineDestructiveCandidate: DestructiveActionCandidate | null = null;
        let engineExecCandidate: ExecApprovalCandidate | null = null;
        let engineFsCandidate: FsWriteCandidate | null = null;
        const toFsWriteCandidate = (candidate: EnginePendingCandidate): FsWriteCandidate => ({
          confirmationToken: candidate.confirmationToken,
          operation: (['write', 'mkdir', 'delete', 'move'] as const).includes(
            candidate.args?.operation as FsWriteCandidate['operation'],
          )
            ? (candidate.args?.operation as FsWriteCandidate['operation'])
            : 'write',
          path: String(candidate.args?.path ?? candidate.args?.src ?? ''),
          content: typeof candidate.args?.content === 'string' ? candidate.args.content : undefined,
          summary: String(candidate.summary ?? ''),
        });
        // 24-02 tray run-list title: session title when named, else message prefix.
        const sessionId = sessionRef.current.sessionId;
        let sessionTitle: string;
        try {
          sessionTitle = (await getSessionRepo().getSession(sessionId))?.title || trimmed.slice(0, 24);
        } catch {
          sessionTitle = trimmed.slice(0, 24);
        }
        const result = await engineRun({
          runId: crypto.randomUUID(),
          userMessage: trimmed,
          sessionId,
          sessionTitle,
          provider,
          ollamaModel: provider === 'ollama' ? useUIStore.getState().ollamaModel : undefined,
          workspaceId: useWorkspaceStore.getState().activeWorkspaceId,
          workspaceRoot: (() => {
            const ws = useWorkspaceStore.getState();
            return ws.workspaces.find((w) => w.id === ws.activeWorkspaceId)?.folderPath ?? null;
          })(),
          productId: useUIStore.getState().selectedProductId,
          coreContext: buildCoreContext(),
          onEvent: (msg) => {
            // 24-01 scheduler lifecycle: queued → (slot frees) → running.
            if (msg.kind === 'run_status' && msg.data?.status) {
              if (msg.data.status === 'queued') {
                set({ isQueued: true });
              } else if (msg.data.status === 'running') {
                set({ isQueued: false });
              }
              return;
            }
            if (msg.kind === 'token' && msg.data?.text) {
              streamingResponseRef += msg.data.text;
              set((current) => ({ streamingResponse: current.streamingResponse + msg.data!.text }));
              return;
            }
            if (msg.kind === 'tool_start' && msg.data?.name) {
              const name = msg.data.name;
              updateTrace((current) => [
                ...current,
                { id: nextId++, name, status: 'running' },
              ]);
              return;
            }
            if (msg.kind === 'tool_end' && msg.data?.name) {
              const name = msg.data.name;
              const failed = msg.data.ok === false;
              updateTrace((current) => {
                const next = [...current];
                for (let index = next.length - 1; index >= 0; index -= 1) {
                  if (next[index].name === name && next[index].status === 'running') {
                    next[index] = { ...next[index], status: failed ? 'error' : 'ok' };
                    break;
                  }
                }
                return next;
              });
              if (name === 'memory_write') void refreshMemoryCards();
              return;
            }
            if (msg.kind === 'tool_output' && msg.data?.name) {
              // 23-02 exec streaming: append the line to the newest running
              // trace item of this tool (display-only, no persistence).
              const name = msg.data.name;
              const line = { text: msg.data.stream ?? '', isStderr: msg.data.isStderr === true };
              updateTrace((current) => {
                const next = [...current];
                for (let index = next.length - 1; index >= 0; index -= 1) {
                  if (next[index].name === name && next[index].status === 'running') {
                    const outputLines = [...(next[index].outputLines ?? []), line].slice(-50);
                    next[index] = { ...next[index], outputLines };
                    break;
                  }
                }
                return next;
              });
              return;
            }
            if (msg.kind === 'confirmation' && msg.data?.candidate) {
              const candidate = msg.data.candidate;
              if (candidate.kind === 'knowledge_write') {
                engineKnowledgeCandidate = toKnowledgeWriteCandidate(candidate, get().activeSessionId);
              } else if (candidate.kind === 'destructive_action') {
                engineDestructiveCandidate = toDestructiveCandidate(candidate);
              } else if (candidate.kind === 'exec_approval') {
                engineExecCandidate = {
                  confirmationToken: candidate.confirmationToken,
                  command: String(candidate.args?.command ?? ''),
                  args: Array.isArray(candidate.args?.args) ? (candidate.args?.args as string[]) : [],
                  summary: String(candidate.summary ?? ''),
                };
              } else if (candidate.kind === 'fs_write') {
                engineFsCandidate = toFsWriteCandidate(candidate);
              } else if (candidate.kind === 'memory_write') {
                void refreshMemoryCards();
              }
              return;
            }
            if (msg.kind === 'error' && msg.data?.message) {
              console.error('[engine] stream error:', msg.data.message);
            }
          },
        });

        if (result.pendingConfirmation?.kind === 'knowledge_write' && !engineKnowledgeCandidate) {
          engineKnowledgeCandidate = toKnowledgeWriteCandidate(result.pendingConfirmation, get().activeSessionId);
        }
        if (result.pendingConfirmation?.kind === 'exec_approval' && !engineExecCandidate) {
          const pc = result.pendingConfirmation;
          engineExecCandidate = {
            confirmationToken: pc.confirmationToken,
            command: String(pc.args?.command ?? ''),
            args: Array.isArray(pc.args?.args) ? (pc.args?.args as string[]) : [],
            summary: String(pc.summary ?? ''),
          };
        }
        if (result.pendingConfirmation?.kind === 'fs_write' && !engineFsCandidate) {
          engineFsCandidate = toFsWriteCandidate(result.pendingConfirmation);
        }

        const assistantContent = result.content || streamingResponseRef || 'AI 没有返回内容';
        set((current) => ({
          messages: [
            ...current.messages,
            {
              id: nextId++,
              role: 'assistant' as const,
              content: assistantContent,
              toolTrace: streamingTraceRef.length > 0 ? streamingTraceRef : undefined,
            },
          ],
          pendingConfirmation: engineKnowledgeCandidate ?? current.pendingConfirmation,
          pendingDestructiveAction: engineDestructiveCandidate ?? current.pendingDestructiveAction,
          pendingExecApproval: engineExecCandidate ?? current.pendingExecApproval,
          pendingFsWrite: engineFsCandidate ?? current.pendingFsWrite,
        }));

        if (result.truncated) {
          emitToast({
            type: 'warning',
            title: 'AI 工具调用达到上限',
            description: '本轮最多执行 5 次迭代，已返回当前结果。',
          });
        }
      } catch (error) {
        emitToast({
          type: 'error',
          title: 'AI 调用失败',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set({ loading: false, isQueued: false, streamingResponse: '', streamingTrace: [] });
        streamingResponseRef = '';
        streamingTraceRef = [];
        void refreshForkable();
        void get().maybeGenerateTitle(get().activeSessionId);
      }
    },

    confirmDestructiveAction: async () => {
      const { pendingDestructiveAction, loading } = get();
      if (!pendingDestructiveAction || loading) return;
      set({ loading: true });
      try {
        const candidate = pendingDestructiveAction;
        // 22-06 确认接缝:confirm(Rust) → executeTool(TS) → 落库(Rust)
        await engineConfirmCandidate(candidate.confirmationToken);
        const result = await executeTool(candidate.toolName, {
          ...candidate.args,
          confirmed: true,
          confirmationToken: candidate.confirmationToken,
        });
        await engineAppendToolResult({
          sessionId: get().activeSessionId,
          toolCallId: crypto.randomUUID(),
          toolName: candidate.toolName,
          ok: true,
          payloadJson: result ?? {},
          args: { toolName: candidate.toolName, args: candidate.args },
        });
        set((current) => ({
          messages: [...current.messages, {
            id: nextId++,
            role: 'assistant' as const,
            content: `${candidate.toolName} 已确认执行。${(result as { deleted?: boolean }).deleted ? '相关记录已删除。' : ''}`,
          }],
          pendingDestructiveAction: null,
        }));
      } catch (error) {
        emitToast({
          type: 'error',
          title: '操作确认失败',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set({ loading: false });
      }
    },

    rejectDestructiveAction: async () => {
      const { pendingDestructiveAction } = get();
      if (!pendingDestructiveAction) return;
      await engineRejectCandidate(pendingDestructiveAction.confirmationToken);
      set((current) => ({
        pendingDestructiveAction: null,
        messages: [...current.messages, {
          id: nextId++,
          role: 'assistant' as const,
          content: '已取消本次删除操作。',
        }],
      }));
    },

    // 23-02 exec 确认(拒绝/仅本次允许/永久加入白名单):Rust 侧
    // confirm+consume(+可选白名单学习)+ 重执行 + [confirmed rerun] 落库,
    // 前端只收执行结果(payload)。
    confirmExec: async (allowPermanently: boolean) => {
      const { pendingExecApproval, loading } = get();
      if (!pendingExecApproval || loading) return;
      set({ loading: true });
      try {
        const candidate = pendingExecApproval;
        const result = await engineExecConfirmed(
          get().activeSessionId,
          candidate.confirmationToken,
          allowPermanently,
        );
        const ok = result.ok === true;
        const snippet = ok
          ? String(result.stdout ?? '').trim().slice(0, 200)
          : String(result.error ?? '执行失败');
        set((current) => ({
          messages: [...current.messages, {
            id: nextId++,
            role: 'assistant' as const,
            content: `${candidate.summary || candidate.command} 已确认执行。${snippet ? `\n${snippet}` : ''}`,
          }],
          pendingExecApproval: null,
        }));
      } catch (error) {
        emitToast({
          type: 'error',
          title: '命令执行失败',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set({ loading: false });
      }
    },

    rejectExec: async () => {
      const { pendingExecApproval } = get();
      if (!pendingExecApproval) return;
      await engineRejectCandidate(pendingExecApproval.confirmationToken);
      set((current) => ({
        pendingExecApproval: null,
        messages: [...current.messages, {
          id: nextId++,
          role: 'assistant' as const,
          content: '已拒绝本次命令执行。',
        }],
      }));
    },

    // 23-03 fs 写确认(确认/拒绝):Rust 侧 confirm+consume+执行+落库,
    // 前端只收执行结果。无「永久允许」——边界(工作区内)即策略。
    confirmFsWrite: async () => {
      const { pendingFsWrite, loading } = get();
      if (!pendingFsWrite || loading) return;
      set({ loading: true });
      try {
        const candidate = pendingFsWrite;
        const result = await engineFsApply(get().activeSessionId, candidate.confirmationToken);
        const ok = result.error === undefined;
        set((current) => ({
          messages: [...current.messages, {
            id: nextId++,
            role: 'assistant' as const,
            content: ok
              ? `${candidate.summary || candidate.path} 已确认执行。`
              : `执行失败:${String(result.error ?? '')}`,
          }],
          pendingFsWrite: null,
        }));
      } catch (error) {
        emitToast({
          type: 'error',
          title: '文件操作失败',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set({ loading: false });
      }
    },

    rejectFsWrite: async () => {
      const { pendingFsWrite } = get();
      if (!pendingFsWrite) return;
      await engineRejectCandidate(pendingFsWrite.confirmationToken);
      set((current) => ({
        pendingFsWrite: null,
        messages: [...current.messages, {
          id: nextId++,
          role: 'assistant' as const,
          content: '已拒绝本次文件操作。',
        }],
      }));
    },

    confirmKnowledgeWrite: async () => {
      const { pendingConfirmation, loading } = get();
      if (!pendingConfirmation || loading) return;
      set({ loading: true });
      try {
        const candidate = pendingConfirmation;
        // 22-06 确认接缝:confirm(Rust) → executeTool(TS) → 落库(Rust)
        await engineConfirmCandidate(candidate.confirmationToken);
        const result = await executeTool('writeKnowledgeArticle', {
          productId: candidate.productId,
          itemId: candidate.itemId,
          title: candidate.title,
          category: candidate.category,
          tags: candidate.tags,
          content: candidate.content,
          summary: candidate.summary,
          author: candidate.author,
          readTime: candidate.readTime,
          confirmationToken: candidate.confirmationToken,
        });
        await engineAppendToolResult({
          sessionId: get().activeSessionId,
          toolCallId: crypto.randomUUID(),
          toolName: 'knowledge_write',
          ok: true,
          payloadJson: result ?? {},
          args: {
            productId: candidate.productId,
            title: candidate.title,
            category: candidate.category,
            tags: candidate.tags,
            content: candidate.content,
            summary: candidate.summary,
          },
        });
        set((current) => ({
          messages: [...current.messages, {
            id: nextId++,
            role: 'assistant' as const,
            content: `知识条目已${(result as { operation?: string }).operation === 'updated' ? '更新' : '创建'}。`,
          }],
          pendingConfirmation: null,
        }));
      } catch (error) {
        emitToast({
          type: 'error',
          title: '写入知识库失败',
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        set({ loading: false });
      }
    },

    rejectKnowledgeWrite: async () => {
      const { pendingConfirmation } = get();
      if (!pendingConfirmation) return;
      await engineRejectCandidate(pendingConfirmation.confirmationToken);
      set((current) => ({
        pendingConfirmation: null,
        messages: [...current.messages, {
          id: nextId++,
          role: 'assistant' as const,
          content: '已取消本次知识库写入。',
        }],
      }));
    },

    confirmMemory: async () => {
      const { pendingMemory, memoryBusy } = get();
      if (!pendingMemory || memoryBusy) return;
      set({ memoryBusy: true });
      try {
        // 23-05 接缝②:confirm + consume + memories 落库一次 invoke 完成,Rust 唯一写者。
        await engineConsumeMemory(pendingMemory.candidateToken);
        emitToast({ type: 'success', title: '已记住' });
        const pending = await getMemoryStore().listPending(get().activeSessionId);
        set({ pendingMemory: pending[0] ?? null });
      } catch (error) {
        emitToast({
          type: 'error',
          title: '检索失败,请稍后重试;若持续失败请重启应用。',
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        set({ memoryBusy: false });
      }
    },

    rejectMemory: async () => {
      const { pendingMemory, memoryBusy } = get();
      if (!pendingMemory || memoryBusy) return;
      set({ memoryBusy: true });
      try {
        // 23-05 接缝②:reject 同迁 Rust。
        await engineRejectMemory(pendingMemory.candidateToken);
        // Silent by UI spec — rejected candidates never re-render (MEM-02).
        const pending = await getMemoryStore().listPending(get().activeSessionId);
        set({ pendingMemory: pending[0] ?? null });
      } catch (error) {
        emitToast({
          type: 'error',
          title: '检索失败,请稍后重试;若持续失败请重启应用。',
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        set({ memoryBusy: false });
      }
    },

    // Phase 16 (DELIV-02) — silent reject (MEM-02 pattern): card disappears,
    // rejection enters the system-prompt anti-repropose segment.
    rejectDraft: async () => {
      const { pendingPrdDraft, prdBusy } = get();
      if (!pendingPrdDraft || prdBusy) return;
      set({ prdBusy: true });
      try {
        await rejectDeliverableDraft(pendingPrdDraft.confirmationToken);
        await refreshPrdCard();
      } catch (error) {
        console.error('[prd-card] reject failed', error);
      } finally {
        set({ prdBusy: false });
      }
    },

    // Phase 16 (DELIV-02) — 落槽 consumption chain (confirmKnowledgeWrite
    // shape): confirm → executeTool(consume → upsertDoc → slot projection → FTS
    // 查询) → audit event → toast/message/close/refresh.
    commitToSlot: async (editedDraft: string) => {
      const { pendingPrdDraft, prdBusy } = get();
      if (!pendingPrdDraft || prdBusy) return;
      set({ prdBusy: true });
      try {
        await confirmDeliverableDraft(pendingPrdDraft.confirmationToken);
        const result = await executeTool('generateDeliverable', {
          code: pendingPrdDraft.code,
          title: pendingPrdDraft.title,
          draft: editedDraft,
          confirmationToken: pendingPrdDraft.confirmationToken,
        }) as {
          docId: string; version: number; slotCode: string;
          ftsImmediateHit: boolean; ftsHitCount: number;
          aiSource: { sessionId: string; eventId: string; generatedAt: string; docId: string; version: number };
        };
        // DELIV-04 可审计 + 23-04 接缝①:deliverable_committed 事件改走 Rust
        // command(唯一写者);payload 字段逐字保留,由 Rust 组装落库。
        await engineCommitDeliverable({
          sessionId: get().activeSessionId,
          token: pendingPrdDraft.confirmationToken,
          code: pendingPrdDraft.code,
          title: pendingPrdDraft.title,
          editedDraft: editedDraft,
          productId: pendingPrdDraft.productId,
          docId: result.docId,
          version: result.version,
          ftsHitCount: result.ftsHitCount,
          ftsImmediateHit: result.ftsImmediateHit,
        });
        emitToast({ type: 'success', title: 'PRD 已落槽' });
        set((current) => ({
          messages: [...current.messages, {
            id: nextId++,
            role: 'assistant' as const,
            content: 'PRD 已落槽至研发中心,知识库立即可检索。',
          }],
          prdDialogOpen: false,
        }));
        await refreshPrdCard();
      } catch (error) {
        // ponytail: 消费先于写入(Phase 14 不变量:绝不双写)。若消费成功但写入失败,
        // 候选已耗尽 — refreshPrdCard 会移除卡片,Dialog 留开供用户复制编辑稿。
        emitToast({
          type: 'error',
          title: '落槽失败,请稍后重试;草稿仍保留在对话中。',
          description: error instanceof Error ? error.message : undefined,
        });
        await refreshPrdCard();
      } finally {
        set({ prdBusy: false });
      }
    },

    openPrdDialog: () => {
      set((state) => ({ prdDraftSnapshot: state.pendingPrdDraft, prdDialogOpen: true }));
    },

    setPrdDialogOpen: (open) => {
      set((state) => ({
        prdDialogOpen: open,
        // Closing clears the snapshot (原 :591-594 语义).
        prdDraftSnapshot: open ? state.prdDraftSnapshot : null,
      }));
    },

    dismissAutoRemembered: () => set({ autoRemembered: null }),

    refreshMemoryCards,
    refreshPrdCard,
    maybeGenerateTitle,
  };
});

/* === 24-02 (SCHED-02) tray jump: menu run item click → Rust shows the window
 * and emits tray-open-session(sessionId); we switch the tab + session here.
 * Module-level (not a useEffect) — AgentConsole has two hosts, listener must
 * exist exactly once. No-op in browser dev (isTauri false). === */
if (isTauri()) {
  void (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>('tray-open-session', (event) => {
      useUIStore.getState().setActiveTab('agent');
      void useChatConsoleStore.getState().switchSession(event.payload);
    });
  })();
}
