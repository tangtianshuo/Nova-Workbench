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
import type { DestructiveActionCandidate, KnowledgeWriteCandidate } from '@/src/ai/confirmations';
import { ChatSession } from '@/src/ai/chatSession';
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(new ChatSession({ tokenBudget: 8_000 }));
  const nextIdRef = useRef(0);
  const streamingResponseRef = useRef('');
  const streamingTraceRef = useRef<ToolTraceItem[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, streamingResponse, streamingTrace]);

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
    if (!trimmed || loading) return;

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

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
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
              disabled={!input.trim()}
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
