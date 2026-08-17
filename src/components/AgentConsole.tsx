// Phase 17 (UX-01) — dual-host conversation console.
// Extracted verbatim from ChatPanel.tsx:509-659 (zero visual change).
// Hosts: ChatPanel Drawer (layout="drawer") + AgentWorkspaceView (layout="page").
import { useEffect, useRef, type KeyboardEvent } from 'react';
import {
  Check,
  Hourglass,
  PaperPlaneTilt,
  Sparkle,
  Warning,
  X,
} from '@phosphor-icons/react';
import { Button } from '@/src/components/ui/Button';
import { useToast } from '@/src/components/ui/Toast';
import { useUIStore } from '@/src/stores/uiStore';
import { useProductStore } from '@/src/stores/productStore';
import {
  bindToast,
  useChatConsoleStore,
  formatMemoryTime,
  type ToolTraceItem,
  type ToolTraceStatus,
} from '@/src/stores/chatConsoleStore';
import { PrdDraftDialog } from '@/src/components/PrdDraftDialog';
import { cn } from '@/src/lib/utils';

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

export function AgentConsole({ layout = 'drawer' }: { layout?: 'drawer' | 'page' }) {
  const { toast } = useToast();
  const products = useProductStore((s) => s.products);
  const isChatPanelOpen = useUIStore((s) => s.isChatPanelOpen);
  // Phase 17 UX-02: carried view context chips (transient, removable).
  const carry = useUIStore((s) => s.agentContextCarry);
  const removeCarriedItem = useUIStore((s) => s.removeCarriedItem);
  const {
    messages,
    input,
    streamingResponse,
    streamingTrace,
    loading,
    restoreComplete,
    pendingConfirmation,
    pendingDestructiveAction,
    pendingMemory,
    autoRemembered,
    memoryBusy,
    pendingPrdDraft,
    prdDraftSnapshot,
    prdBusy,
    prdDialogOpen,
    setInput,
    restore,
    submit,
    confirmKnowledgeWrite,
    rejectKnowledgeWrite,
    confirmDestructiveAction,
    rejectDestructiveAction,
    confirmMemory,
    rejectMemory,
    rejectDraft,
    commitToSlot,
    openPrdDialog,
    setPrdDialogOpen,
    dismissAutoRemembered,
  } = useChatConsoleStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bindToast(toast);
    void restore();
    textareaRef.current?.focus();
  }, [toast, restore]);

  // Drawer host: focus the textarea whenever the Drawer opens.
  useEffect(() => {
    if (isChatPanelOpen) textareaRef.current?.focus();
  }, [isChatPanelOpen]);

  // Phase 17 UX-04: consume right-click prefill (consume-on-read) — set the
  // input (overwrite, each menu click is a fresh intent), focus, clear the
  // slot. Never auto-sends — the user reviews then presses Enter.
  const pendingPrefill = useUIStore((s) => s.pendingChatPrefill);
  useEffect(() => {
    if (pendingPrefill == null) return;
    setInput(pendingPrefill);
    useUIStore.getState().setPendingChatPrefill(null);
    textareaRef.current?.focus();
  }, [pendingPrefill]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, streamingResponse, streamingTrace, pendingMemory, autoRemembered, pendingPrdDraft]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && restoreComplete) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-console-layout={layout}>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
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
              <Button type="button" variant="primary" size="sm" onClick={() => void confirmKnowledgeWrite()} disabled={loading}>
                确认写入
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void rejectKnowledgeWrite()} disabled={loading}>
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
              <Button type="button" variant="primary" size="sm" onClick={() => void confirmDestructiveAction()} disabled={loading}>
                确认删除
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void rejectDestructiveAction()} disabled={loading}>
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
              <Button type="button" variant="primary" size="sm" onClick={openPrdDialog} disabled={prdBusy}>确认并编辑</Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void rejectDraft()} disabled={prdBusy}>忽略</Button>
            </div>
          </div>
        )}
        {prdDraftSnapshot && (
          <PrdDraftDialog
            open={prdDialogOpen}
            onOpenChange={setPrdDialogOpen}
            title={prdDraftSnapshot.title || 'PRD 草稿'}
            description={`${products.find((p) => p.id === prdDraftSnapshot.productId)?.name ?? ''} · 编辑后落槽至研发中心,并同步知识库索引`}
            initialDraft={prdDraftSnapshot.draft}
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
              <Button type="button" variant="ghost" size="sm" onClick={dismissAutoRemembered}>知道了</Button>
            </div>
          </div>
        )}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      <div className="border-t border-border-subtle px-5 py-4">
        {carry.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-tertiary">已携带:</span>
            {carry.map((item) => (
              <span key={`${item.kind}-${item.id ?? 'default'}`}
                className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent-subtle px-2 py-0.5 text-xs text-accent">
                {item.kind === 'schedule' ? `今日日程 (${item.count})` : item.label}
                <button type="button" onClick={() => removeCarriedItem(item.kind, item.id)}
                  aria-label={`移除 ${item.label}`} className="shrink-0 hover:text-accent-hover">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={(event) => void submit(event)} className="flex items-end gap-2">
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
      </div>
    </div>
  );
}
