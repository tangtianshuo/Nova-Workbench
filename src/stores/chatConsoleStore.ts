// Phase 17 (UX-01) — conversation state single ownership.
// Extracted verbatim from ChatPanel.tsx component state/handlers so the
// Drawer host and the agent-tab page host share ONE conversation.
// Transient store (never written to disk — same class as uiStore modal flags).
import { create } from 'zustand';
import {
  confirmDestructiveAction,
  confirmKnowledgeWrite,
  executeTool,
  rejectDestructiveAction,
  rejectKnowledgeWrite,
  runToolLoop,
} from '@/src/ai';
import {
  confirmDeliverableDraft,
  listPendingDeliverableDrafts,
  rejectDeliverableDraft,
  type DestructiveActionCandidate,
  type KnowledgeWriteCandidate,
  type DeliverableDraftCandidate,
} from '@/src/ai/confirmations';
import { getMemoryStore, type MemoryCandidate } from '@/src/ai/memoryStore';
import { ChatSession } from '@/src/ai/chatSession';
import { restoreLatestSession } from '@/src/ai/sessionRestore';
import { useUIStore } from '@/src/stores/uiStore';
import type { Provider } from '@/src/lib/api';

export type ToolTraceStatus = 'running' | 'ok' | 'error';

export interface ToolTraceItem {
  id: number;
  name: string;
  status: ToolTraceStatus;
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

/* === Store === */

interface ChatConsoleState {
  messages: ChatMessage[];
  input: string;
  streamingResponse: string;
  streamingTrace: ToolTraceItem[];
  loading: boolean;
  restoreComplete: boolean;
  pendingConfirmation: KnowledgeWriteCandidate | null;
  pendingDestructiveAction: DestructiveActionCandidate | null;
  pendingMemory: MemoryCandidate | null;
  autoRemembered: MemoryCandidate | null;
  memoryBusy: boolean;
  pendingPrdDraft: DeliverableDraftCandidate | null;
  // UI-REVIEW #1/#2: 快照在 Dialog 打开瞬间固定 — 落槽失败后 refreshPrdCard 移除卡片时
  // 编辑内容仍留在 Dialog;候选对象换血也不冲掉进行中的编辑。
  prdDraftSnapshot: DeliverableDraftCandidate | null;
  prdBusy: boolean;
  prdDialogOpen: boolean;

  setInput: (v: string) => void;
  restore: () => Promise<void>;
  submit: (event?: { preventDefault?: () => void }) => Promise<void>;
  confirmKnowledgeWrite: () => Promise<void>;
  rejectKnowledgeWrite: () => Promise<void>;
  confirmDestructiveAction: () => Promise<void>;
  rejectDestructiveAction: () => Promise<void>;
  confirmMemory: () => Promise<void>;
  rejectMemory: () => Promise<void>;
  rejectDraft: () => Promise<void>;
  commitToSlot: (editedDraft: string) => Promise<void>;
  openPrdDialog: () => void;
  setPrdDialogOpen: (open: boolean) => void;
  dismissAutoRemembered: () => void;
  refreshMemoryCards: () => Promise<void>;
  refreshPrdCard: () => Promise<void>;
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
      const pending = await store.listPending();
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
      const pending = await listPendingDeliverableDrafts();
      set({ pendingPrdDraft: pending[0] ?? null });
    } catch (error) {
      console.error('[prd-card] refresh failed', error);
      emitToast({ type: 'error', title: '检索失败,请稍后重试;若持续失败请重启应用。' });
    }
  };

  return {
    messages: [],
    input: '',
    streamingResponse: '',
    streamingTrace: [],
    loading: false,
    restoreComplete: false,
    pendingConfirmation: null,
    pendingDestructiveAction: null,
    pendingMemory: null,
    autoRemembered: null,
    memoryBusy: false,
    pendingPrdDraft: null,
    prdDraftSnapshot: null,
    prdBusy: false,
    prdDialogOpen: false,

    setInput: (v) => set({ input: v }),

    // EVT-04: restore the most recent session once per app start. Idempotent —
    // module-level promise cache makes ChatPanel/AgentWorkspaceView double-mount
    // safe (restoreLatestSession itself also dedupes, Phase 14).
    restore: async () => {
      if (restorePromise) return restorePromise;
      restorePromise = (async () => {
        try {
          const restored = await restoreLatestSession();
          if (restored) {
            sessionRef.current = restored.session;
            const history = restored.session
              .getAllMessages()
              .filter((message) => message.role === 'user' || (message.role === 'assistant' && !message.toolCallId))
              .map((message) => ({
                id: nextId++,
                role: message.role as 'user' | 'assistant',
                content: message.content,
              }));
            const latestKnowledgeWrite = restored.pendingKnowledgeWrites[restored.pendingKnowledgeWrites.length - 1];
            const latestDestructiveAction = restored.pendingDestructiveActions[restored.pendingDestructiveActions.length - 1];
            set({
              messages: history,
              pendingConfirmation: latestKnowledgeWrite ?? null,
              pendingDestructiveAction: latestDestructiveAction ?? null,
            });
          }
          // Pending memory candidates re-appear after restore (same behavior as
          // pendingKnowledgeWrites above).
          void refreshMemoryCards();
          // Pending PRD draft candidates re-appear after restore (Phase 16).
          void refreshPrdCard();
          set({ restoreComplete: true });
        } catch (error) {
          console.error('[session-restore] failed', error);
          set({ restoreComplete: true });
        }
      })();
      return restorePromise;
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
        streamingResponse: '',
        streamingTrace: [],
      }));
      streamingResponseRef = '';
      streamingTraceRef = [];

      try {
        const result = await runToolLoop({
          userMessage: trimmed,
          provider,
          session: sessionRef.current,
          callbacks: {
            onToken: (token) => {
              streamingResponseRef += token;
              set((current) => ({ streamingResponse: current.streamingResponse + token }));
            },
            onToolStart: (name) => {
              updateTrace((current) => [
                ...current,
                { id: nextId++, name, status: 'running' },
              ]);
            },
            onToolEnd: (name, _result, error) => {
              updateTrace((current) => {
                const next = [...current];
                for (let index = next.length - 1; index >= 0; index -= 1) {
                  if (next[index].name === name && next[index].status === 'running') {
                    next[index] = { ...next[index], status: error ? 'error' : 'ok' };
                    break;
                  }
                }
                return next;
              });
              if (name === 'proposeMemory') void refreshMemoryCards();
              if (name === 'generateDeliverable') void refreshPrdCard();
            },
            onDestructiveConfirmationRequired: (candidate) =>
              set({ pendingDestructiveAction: candidate }),
          },
        });

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
          pendingConfirmation: result.pendingConfirmation ?? current.pendingConfirmation,
          pendingDestructiveAction: result.pendingDestructiveConfirmation ?? current.pendingDestructiveAction,
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
        set({ loading: false, streamingResponse: '', streamingTrace: [] });
        streamingResponseRef = '';
        streamingTraceRef = [];
      }
    },

    confirmDestructiveAction: async () => {
      const { pendingDestructiveAction, loading } = get();
      if (!pendingDestructiveAction || loading) return;
      set({ loading: true });
      try {
        const candidate = await confirmDestructiveAction(pendingDestructiveAction.confirmationToken);
        const result = await executeTool(candidate.toolName, {
          ...candidate.args,
          confirmed: true,
          confirmationToken: candidate.confirmationToken,
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
      await rejectDestructiveAction(pendingDestructiveAction.confirmationToken);
      set((current) => ({
        pendingDestructiveAction: null,
        messages: [...current.messages, {
          id: nextId++,
          role: 'assistant' as const,
          content: '已取消本次删除操作。',
        }],
      }));
    },

    confirmKnowledgeWrite: async () => {
      const { pendingConfirmation, loading } = get();
      if (!pendingConfirmation || loading) return;
      set({ loading: true });
      try {
        const candidate = await confirmKnowledgeWrite(pendingConfirmation.confirmationToken);
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
      await rejectKnowledgeWrite(pendingConfirmation.confirmationToken);
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
        const store = getMemoryStore();
        await store.confirm(pendingMemory.candidateToken);
        await store.consumeIntoMemories(pendingMemory.candidateToken);
        emitToast({ type: 'success', title: '已记住' });
        const pending = await store.listPending();
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
        await getMemoryStore().reject(pendingMemory.candidateToken);
        // Silent by UI spec — rejected candidates never re-render (MEM-02).
        const pending = await getMemoryStore().listPending();
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
        // DELIV-04 可审计:落槽事件 payload 记录 FTS 命中数(CONTEXT 锁定)。
        sessionRef.current.appendAuxEvent('deliverable_committed', {
          docId: result.docId, version: result.version, slotCode: result.slotCode, code: 'prd',
          ftsImmediateHit: result.ftsImmediateHit, ftsHitCount: result.ftsHitCount,
          sessionId: result.aiSource.sessionId, eventId: result.aiSource.eventId,
        });
        await sessionRef.current.flushEvents();
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
  };
});
