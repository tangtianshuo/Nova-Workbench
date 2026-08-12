import { useEffect, useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Command,
  MagnifyingGlass,
  Sparkle,
  Warning,
  X,
} from '@phosphor-icons/react';
import { runToolLoop } from '@/src/ai/toolLoop';
import { executeTool, listToolNames, toolRegistry } from '@/src/ai';
import { useUIStore } from '@/src/stores/uiStore';
import { Button } from '@/src/components/ui/Button';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { useToast } from '@/src/components/ui/Toast';
import { cn } from '@/src/lib/utils';

type TraceItem = {
  id: number;
  name: string;
  status: 'running' | 'ok' | 'error';
};

function toolDescription(name: string): string {
  const entry = toolRegistry.get(name) as { tool?: { description?: string } } | undefined;
  return entry?.tool?.description ?? 'Run this workspace action';
}

export function CmdKPalette() {
  const isOpen = useUIStore((state) => state.isCmdKOpen);
  const setCmdKOpen = useUIStore((state) => state.setCmdKOpen);
  const provider = useUIStore((state) => state.activeAIProvider);
  const { toast } = useToast();
  const [mode, setMode] = useState<'command' | 'chat'>('command');
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [trace, setTrace] = useState<TraceItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const toolNames = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return listToolNames().filter((name) => name.toLowerCase().includes(normalized));
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResponse('');
      setTrace([]);
      setSelectedIndex(0);
      setMode('command');
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(0, toolNames.length - 1)));
  }, [toolNames.length]);

  const handleChat = async () => {
    const message = query.trim();
    if (!message || loading) return;
    setLoading(true);
    setResponse('');
    setTrace([]);
    try {
      const result = await runToolLoop({
        userMessage: message,
        provider,
        callbacks: {
          onToken: (token) => setResponse((current) => current + token),
          onToolStart: (name) => setTrace((items) => [
            ...items,
            { id: Date.now() + items.length, name, status: 'running' },
          ]),
          onToolEnd: (name, _result, error) => setTrace((items) => {
            const next = [...items];
            let index = -1;
            for (let cursor = next.length - 1; cursor >= 0; cursor -= 1) {
              if (next[cursor].name === name && next[cursor].status === 'running') {
                index = cursor;
                break;
              }
            }
            if (index >= 0) next[index] = { ...next[index], status: error ? 'error' : 'ok' };
            return next;
          }),
        },
      });
      if (!response && result.content) setResponse(result.content);
      if (result.truncated) {
        toast({ type: 'warning', title: 'AI 提示', description: 'Tool loop 已达到 5 次上限' });
      }
    } catch (error) {
      toast({
        type: 'error',
        title: 'AI 调用失败',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCommand = async (name: string) => {
    const rawArgs = window.prompt(`Args for ${name} (JSON):`, '{}');
    if (rawArgs === null) return;
    try {
      await executeTool(name, JSON.parse(rawArgs));
      toast({ type: 'success', title: `${name} executed` });
      setCmdKOpen(false);
    } catch (error) {
      toast({
        type: 'error',
        title: `${name} failed`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && mode === 'command') {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, Math.max(0, toolNames.length - 1)));
    } else if (event.key === 'ArrowUp' && mode === 'command') {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (mode === 'chat') {
        void handleChat();
      } else if (event.shiftKey) {
        setMode('chat');
        void handleChat();
      } else if (toolNames[selectedIndex]) {
        void handleCommand(toolNames[selectedIndex]);
      }
    }
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setCmdKOpen}>
      <AnimatePresence>
        {isOpen && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-modal bg-bg-overlay/70 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="fixed left-1/2 top-[15vh] z-modal w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-xl)] border border-border-subtle bg-bg-primary shadow-shadow-xl focus:outline-none"
              >
                <DialogPrimitive.Title className="sr-only">Nova command palette</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Search workspace commands or ask the AI assistant to act.
                </DialogPrimitive.Description>
                <div className="flex items-center justify-between border-b border-border-subtle px-3 pt-3">
                  <SegmentedControl
                    size="sm"
                    value={mode}
                    onChange={(value) => setMode(value as 'command' | 'chat')}
                    segments={[
                      { id: 'command', label: '命令', icon: <Command size={14} /> },
                      { id: 'chat', label: 'AI 对话', icon: <Sparkle size={14} /> },
                    ]}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="关闭命令面板"
                    className="h-7 w-7 p-0"
                    onClick={() => setCmdKOpen(false)}
                  >
                    <X size={16} />
                  </Button>
                </div>
                <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                  {mode === 'command' ? (
                    <MagnifyingGlass size={18} className="shrink-0 text-text-tertiary" />
                  ) : (
                    <Sparkle size={18} className="shrink-0 text-accent" />
                  )}
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSelectedIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={mode === 'command' ? '搜索工作区命令...' : '问 Nova 做什么...'}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-placeholder"
                  />
                  <kbd className="rounded-[var(--radius-sm)] border border-border-subtle bg-bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-text-tertiary">
                    esc
                  </kbd>
                </div>
                <div className="max-h-[52vh] overflow-y-auto p-2">
                  {mode === 'command' && (
                    <div className="space-y-1">
                      {toolNames.length === 0 && (
                        <p className="px-3 py-8 text-center text-sm text-text-tertiary">没有匹配的命令</p>
                      )}
                      {toolNames.map((name, index) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => void handleCommand(name)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-colors',
                            index === selectedIndex ? 'bg-accent-subtle' : 'hover:bg-bg-secondary',
                          )}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-bg-secondary text-accent">
                            <Command size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-text-primary">{name}</span>
                            <span className="block truncate text-xs text-text-tertiary">{toolDescription(name)}</span>
                          </span>
                          <span className="text-xs text-text-tertiary">Enter</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {mode === 'chat' && (
                    <div className="space-y-3 p-3">
                      {trace.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-xs text-text-secondary">
                          {item.status === 'running' && <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
                          {item.status === 'ok' && <Check size={14} className="text-success" weight="bold" />}
                          {item.status === 'error' && <Warning size={14} className="text-danger" weight="bold" />}
                          <span>执行 {item.name}</span>
                        </div>
                      ))}
                      {response && <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{response}</div>}
                      {loading && !response && <div className="text-sm text-text-tertiary">AI 思考中...</div>}
                      {!loading && !response && <div className="py-8 text-center text-sm text-text-tertiary">输入问题后按 Enter 开始</div>}
                    </div>
                  )}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
