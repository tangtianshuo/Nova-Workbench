import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  Check,
  Hourglass,
  PaperPlaneTilt,
  Sparkle,
  Warning,
} from '@phosphor-icons/react';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from '@/src/components/ui/Drawer';
import { Button } from '@/src/components/ui/Button';
import { useToast } from '@/src/components/ui/Toast';
import { useUIStore } from '@/src/stores/uiStore';
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
import { PrdDraftDialog } from '@/src/components/PrdDraftDialog';
import { useProductStore } from '@/src/stores/productStore';
import type { Provider } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';

type ToolTraceStatus = 'running' | 'ok' | 'error';

interface ToolTraceItem {
  id: number;
  name: string;
  status: ToolTraceStatus;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: ToolTraceItem[];
}

const PROVIDER_LABELS: Record<Provider, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

function formatMemoryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function TraceIcon({ status }: { status: ToolTraceStatus }) {
  if (status === 'ok') return <Check size={13} weight="bold" className="text-success" />;
  if (status === 'error') return <Warning size={13} weight="bold" className="text-danger" />;
  return <Hourglass size={13} className="animate-pulse text-accent" />;
}

function ToolTrace({ items }: { items: ToolTraceItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mb-2.5 space-y-1 border-b border-border-subtle/70 pb-2.5">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
          <TraceIcon status={item.status} />
          <span className="truncate">{item.name}</span>
          <span className="text-text-tertiary">
            {item.status === 'running' ? '执行中' : item.status === 'ok' ? '已完成' : '失败'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChatPanel() {
  const isOpen = useUIStore((state) => state.isChatPanelOpen);
  const setOpen = useUIStore((state) => state.setChatPanelOpen);
  const provider = useUIStore((state) => state.activeAIProvider);
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [streamingTrace, setStreamingTrace] = useState<ToolTraceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<KnowledgeWriteCandidate | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<DestructiveActionCandidate | null>(null);
  const [restoreComplete, setRestoreComplete] = useState(false);
  const [pendingMemory, setPendingMemory] = useState<MemoryCandidate | null>(null);
  const [autoRemembered, setAutoRemembered] = useState<MemoryCandidate | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [pendingPrdDraft, setPendingPrdDraft] = useState<DeliverableDraftCandidate | null>(null);
  const [prdBusy, setPrdBusy] = useState(false);
  const [prdDialogOpen, setPrdDialogOpen] = useState(false);
  const products = useProductStore((s) => s.products);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(new ChatSession({ tokenBudget: 8_000 }));
  const nextIdRef = useRef(0);
  const streamingResponseRef = useRef('');
  const streamingTraceRef = useRef<ToolTraceItem[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, streamingResponse, streamingTrace, pendingMemory, autoRemembered, pendingPrdDraft]);

  // Phase 15 (MEM-01/02/03) — refresh memory cards: queue head for the
  // confirmation card, latest user_directed entry for the 已记住 info card.
  const refreshMemoryCards = async () => {
    try {
      const store = getMemoryStore();
      const pending = await store.listPending();
      setPendingMemory(pending[0] ?? null);
      const recent = await store.listRecentUserDirected(1);
      const latest = recent[0] ?? null;
      if (latest) {
        setAutoRemembered((current) =>
          latest.candidateToken === current?.candidateToken ? current : latest,
        );
      }
    } catch (error) {
      console.error('[memory-cards] refresh failed', error);
      toast({ type: 'error', title: '检索失败,请稍后重试;若持续失败请重启应用。' });
    }
  };

  // Phase 16 (DELIV-02) — refresh PRD draft card: queue head of pending
  // deliverable_draft candidates (one card at a time, same as memory cards).
  const refreshPrdCard = async () => {
    try {
      const pending = await listPendingDeliverableDrafts();
      setPendingPrdDraft(pending[0] ?? null);
    } catch (error) {
      console.error('[prd-card] refresh failed', error);
      toast({ type: 'error', title: '检索失败,请稍后重试;若持续失败请重启应用。' });
    }
  };

  // EVT-04: restore the most recent session once per app start. Explicit async entry —
  // the ChatSession constructor above stays side-effect-free (evaluated every render).
  // restoreComplete flips on EVERY terminal path (restored / nothing to restore / error)
  // so the submit gate below can never wedge the panel permanently.
  useEffect(() => {
    let cancelled = false;
    restoreLatestSession()
      .then((restored) => {
        if (cancelled) return;
        if (restored) {
          sessionRef.current = restored.session;
          const history = restored.session
            .getAllMessages()
            .filter((message) => message.role === 'user' || (message.role === 'assistant' && !message.toolCallId))
            .map((message) => ({
              id: nextIdRef.current++,
              role: message.role as 'user' | 'assistant',
              content: message.content,
            }));
          setMessages(history);
          const latestKnowledgeWrite = restored.pendingKnowledgeWrites[restored.pendingKnowledgeWrites.length - 1];
          setPendingConfirmation(latestKnowledgeWrite ?? null);
          const latestDestructiveAction = restored.pendingDestructiveActions[restored.pendingDestructiveActions.length - 1];
          setPendingDestructiveAction(latestDestructiveAction ?? null);
        }
        // Pending memory candidates re-appear after restore (same behavior as
        // pendingKnowledgeWrites above).
        void refreshMemoryCards();
        // Pending PRD draft candidates re-appear after restore (Phase 16).
        void refreshPrdCard();
        setRestoreComplete(true);
      })
      .catch((error) => {
        console.error('[session-restore] failed', error);
        if (!cancelled) setRestoreComplete(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateTrace = (updater: (items: ToolTraceItem[]) => ToolTraceItem[]) => {
    setStreamingTrace((current) => {
      const next = updater(current);
      streamingTraceRef.current = next;
      return next;
    });
  };

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!restoreComplete || !trimmed || loading) return;

    const userMessage: ChatMessage = {
      id: nextIdRef.current++,
      role: 'user',
      content: trimmed,
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setLoading(true);
    setStreamingResponse('');
    setStreamingTrace([]);
    streamingResponseRef.current = '';
    streamingTraceRef.current = [];

    try {
      const result = await runToolLoop({
        userMessage: trimmed,
        provider,
        session: sessionRef.current,
        callbacks: {
          onToken: (token) => {
            streamingResponseRef.current += token;
            setStreamingResponse((current) => current + token);
          },
          onToolStart: (name) => {
            updateTrace((current) => [
              ...current,
              { id: nextIdRef.current++, name, status: 'running' },
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
          onDestructiveConfirmationRequired: setPendingDestructiveAction,
        },
      });

      const assistantContent = result.content || streamingResponseRef.current || 'AI 没有返回内容';
      setMessages((current) => [
        ...current,
        {
          id: nextIdRef.current++,
          role: 'assistant',
          content: assistantContent,
          toolTrace: streamingTraceRef.current.length > 0
            ? streamingTraceRef.current
            : undefined,
        },
      ]);
      if (result.pendingConfirmation) {
        setPendingConfirmation(result.pendingConfirmation);
      }
      if (result.pendingDestructiveConfirmation) {
        setPendingDestructiveAction(result.pendingDestructiveConfirmation);
      }

      if (result.truncated) {
        toast({
          type: 'warning',
          title: 'AI 工具调用达到上限',
          description: '本轮最多执行 5 次迭代，已返回当前结果。',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        title: 'AI 调用失败',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
      setStreamingResponse('');
      setStreamingTrace([]);
      streamingResponseRef.current = '';
      streamingTraceRef.current = [];
    }
  };

  const handleConfirmDestructiveAction = async () => {
    if (!pendingDestructiveAction || loading) return;
    setLoading(true);
    try {
      const candidate = await confirmDestructiveAction(pendingDestructiveAction.confirmationToken);
      const result = await executeTool(candidate.toolName, {
        ...candidate.args,
        confirmed: true,
        confirmationToken: candidate.confirmationToken,
      });
      setMessages((current) => [...current, {
        id: nextIdRef.current++,
        role: 'assistant',
        content: `${candidate.toolName} 已确认执行。${(result as { deleted?: boolean }).deleted ? '相关记录已删除。' : ''}`,
      }]);
      setPendingDestructiveAction(null);
    } catch (error) {
      toast({
        type: 'error',
        title: '操作确认失败',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectDestructiveAction = async () => {
    if (!pendingDestructiveAction) return;
    await rejectDestructiveAction(pendingDestructiveAction.confirmationToken);
    setPendingDestructiveAction(null);
    setMessages((current) => [...current, {
      id: nextIdRef.current++,
      role: 'assistant',
      content: '已取消本次删除操作。',
    }]);
  };

  const handleConfirmKnowledgeWrite = async () => {
    if (!pendingConfirmation || loading) return;
    setLoading(true);
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
      setMessages((current) => [...current, {
        id: nextIdRef.current++,
        role: 'assistant',
        content: `知识条目已${(result as { operation?: string }).operation === 'updated' ? '更新' : '创建'}。`,
      }]);
      setPendingConfirmation(null);
    } catch (error) {
      toast({
        type: 'error',
        title: '写入知识库失败',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectKnowledgeWrite = async () => {
    if (!pendingConfirmation) return;
    await rejectKnowledgeWrite(pendingConfirmation.confirmationToken);
    setPendingConfirmation(null);
    setMessages((current) => [...current, {
      id: nextIdRef.current++,
      role: 'assistant',
      content: '已取消本次知识库写入。',
    }]);
  };

  const confirmMemory = async () => {
    if (!pendingMemory || memoryBusy) return;
    setMemoryBusy(true);
    try {
      const store = getMemoryStore();
      await store.confirm(pendingMemory.candidateToken);
      await store.consumeIntoMemories(pendingMemory.candidateToken);
      toast({ type: 'success', title: '已记住' });
      const pending = await store.listPending();
      setPendingMemory(pending[0] ?? null);
    } catch (error) {
      toast({
        type: 'error',
        title: '检索失败,请稍后重试;若持续失败请重启应用。',
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setMemoryBusy(false);
    }
  };

  const rejectMemory = async () => {
    if (!pendingMemory || memoryBusy) return;
    setMemoryBusy(true);
    try {
      await getMemoryStore().reject(pendingMemory.candidateToken);
      // Silent by UI spec — rejected candidates never re-render (MEM-02).
      const pending = await getMemoryStore().listPending();
      setPendingMemory(pending[0] ?? null);
    } catch (error) {
      toast({
        type: 'error',
        title: '检索失败,请稍后重试;若持续失败请重启应用。',
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setMemoryBusy(false);
    }
  };

  // Phase 16 (DELIV-02) — silent reject (MEM-02 pattern): card disappears,
  // rejection enters the system-prompt anti-repropose segment.
  const rejectDraft = async () => {
    if (!pendingPrdDraft || prdBusy) return;
    setPrdBusy(true);
    try {
      await rejectDeliverableDraft(pendingPrdDraft.confirmationToken);
      await refreshPrdCard();
    } catch (error) {
      console.error('[prd-card] reject failed', error);
    } finally {
      setPrdBusy(false);
    }
  };

  // Phase 16 (DELIV-02) — 落槽 consumption chain (handleConfirmKnowledgeWrite
  // shape): confirm → executeTool(consume → upsertDoc → slot projection → FTS
  // 查询) → audit event → toast/message/close/refresh.
  const commitToSlot = async (editedDraft: string) => {
    if (!pendingPrdDraft || prdBusy) return;
    setPrdBusy(true);
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
      toast({ type: 'success', title: 'PRD 已落槽' });
      setMessages((current) => [...current, {
        id: nextIdRef.current++,
        role: 'assistant',
        content: 'PRD 已落槽至研发中心,知识库立即可检索。',
      }]);
      setPrdDialogOpen(false);
      await refreshPrdCard();
    } catch (error) {
      // ponytail: 消费先于写入(Phase 14 不变量:绝不双写)。若消费成功但写入失败,
      // 候选已耗尽 — refreshPrdCard 会移除卡片,Dialog 留开供用户复制编辑稿。
      toast({
        type: 'error',
        title: '落槽失败,请稍后重试;草稿仍保留在对话中。',
        description: error instanceof Error ? error.message : undefined,
      });
      await refreshPrdCard();
    } finally {
      setPrdBusy(false);
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && restoreComplete) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={setOpen}>
      <DrawerContent
        width={480}
        className="max-w-[100vw]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          textareaRef.current?.focus();
        }}
      >
        <DrawerHeader
          title="AI 助手"
          description={`当前 provider：${PROVIDER_LABELS[provider]}`}
        />

        <DrawerBody className="space-y-4">
          {messages.length === 0 && !streamingResponse && streamingTrace.length === 0 && (
            <div className="py-12 text-center text-text-tertiary">
              <Sparkle size={32} weight="duotone" className="mx-auto mb-3 text-accent/70" />
              <p className="text-sm">今天需要处理什么？</p>
              <p className="mt-1 text-xs">可以询问任务、产品、日程或工作区信息。</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[88%] px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap',
                  'rounded-[var(--radius-lg)]',
                  message.role === 'user'
                    ? 'bg-accent text-white'
                    : 'border border-border-subtle bg-bg-secondary text-text-primary',
                )}
              >
                {message.toolTrace && <ToolTrace items={message.toolTrace} />}
                {message.content}
              </div>
            </div>
          ))}

          {(loading || streamingResponse || streamingTrace.length > 0) && (
            <div className="flex justify-start">
              <div className="max-w-[88%] rounded-[var(--radius-lg)] border border-border-subtle bg-bg-secondary px-3.5 py-2.5 text-sm leading-6 text-text-primary">
                <ToolTrace items={streamingTrace} />
                <span className="whitespace-pre-wrap">
                  {streamingResponse || 'AI 思考中...'}
                </span>
              </div>
            </div>
          )}
          {pendingConfirmation && (
            <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent-subtle px-3.5 py-3 text-sm text-text-primary">
              <div className="font-medium">待确认的知识库写入</div>
              <div className="mt-1 text-xs text-text-secondary">{pendingConfirmation.title}</div>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="primary" size="sm" onClick={() => void handleConfirmKnowledgeWrite()} disabled={loading}>
                  确认写入
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleRejectKnowledgeWrite()} disabled={loading}>
                  取消
                </Button>
              </div>
            </div>
          )}
          {pendingDestructiveAction && (
            <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-subtle px-3.5 py-3 text-sm text-text-primary">
              <div className="font-medium">需要确认的删除操作</div>
              <div className="mt-1 text-xs text-text-secondary">{pendingDestructiveAction.summary}</div>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="primary" size="sm" onClick={() => void handleConfirmDestructiveAction()} disabled={loading}>
                  确认删除
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleRejectDestructiveAction()} disabled={loading}>
                  取消
                </Button>
              </div>
            </div>
          )}
          {pendingPrdDraft && (
            <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent-subtle px-3.5 py-3 text-sm text-text-primary">
              <div className="font-medium">待确认的 PRD 草稿</div>
              <div className="mt-1 text-xs text-text-secondary">产品: {products.find((p) => p.id === pendingPrdDraft.productId)?.name ?? pendingPrdDraft.productId}</div>
              <div className="mt-1 text-xs text-text-secondary line-clamp-3 whitespace-pre-wrap">{pendingPrdDraft.draft}</div>
              <div className="mt-1 text-xs text-text-tertiary">来源: 本次对话 · {formatMemoryTime(pendingPrdDraft.createdAt)}</div>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="primary" size="sm" onClick={() => setPrdDialogOpen(true)} disabled={prdBusy}>确认并编辑</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void rejectDraft()} disabled={prdBusy}>忽略</Button>
              </div>
            </div>
          )}
          {pendingPrdDraft && (
            <PrdDraftDialog
              open={prdDialogOpen}
              onOpenChange={setPrdDialogOpen}
              title={pendingPrdDraft.title || 'PRD 草稿'}
              description={`${products.find((p) => p.id === pendingPrdDraft.productId)?.name ?? ''} · 编辑后落槽至研发中心,并同步知识库索引`}
              initialDraft={pendingPrdDraft.draft}
              busy={prdBusy}
              onCommit={(draft) => void commitToSlot(draft)}
            />
          )}
          {pendingMemory && (
            <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent-subtle px-3.5 py-3 text-sm text-text-primary">
              <div className="font-medium">待确认的记忆</div>
              <div className="mt-1 text-xs text-text-secondary">{pendingMemory.content}</div>
              <div className="mt-1 text-xs text-text-tertiary">来源: 本次对话 · {formatMemoryTime(pendingMemory.createdAt)}</div>
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="primary" size="sm" onClick={() => void confirmMemory()} disabled={memoryBusy}>记住</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void rejectMemory()} disabled={memoryBusy}>忽略</Button>
              </div>
            </div>
          )}
          {autoRemembered && (
            <div className="rounded-[var(--radius-lg)] border border-accent/30 bg-accent-subtle px-3.5 py-3 text-sm text-text-primary">
              <div className="font-medium">已记住</div>
              <div className="mt-1 text-xs text-text-secondary">{autoRemembered.content}</div>
              <div className="mt-1 text-xs text-text-tertiary">来源: 你的指令 · {formatMemoryTime(autoRemembered.createdAt)}</div>
              <div className="mt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAutoRemembered(null)}>知道了</Button>
              </div>
            </div>
          )}
          <div ref={bottomRef} aria-hidden="true" />
        </DrawerBody>

        <DrawerFooter className="block">
          <form onSubmit={(event) => void handleSubmit(event)} className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="问 AI..."
              aria-label="输入 AI 问题"
              disabled={loading}
              rows={2}
              className={cn(
                'min-h-16 flex-1 resize-none px-3 py-2 text-sm leading-5',
                'rounded-[var(--radius-md)] border border-border bg-bg-input text-text-primary',
                'placeholder:text-text-placeholder outline-none transition-colors',
                'focus:border-accent focus:ring-2 focus:ring-accent/20',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={loading}
              disabled={!restoreComplete || !input.trim()}
              aria-label="发送消息"
              className="shrink-0"
            >
              {!loading && <PaperPlaneTilt size={15} weight="bold" />}
              <span>发送</span>
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-text-tertiary">Enter 发送，Shift + Enter 换行</p>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
