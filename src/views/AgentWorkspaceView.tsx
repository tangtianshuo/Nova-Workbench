import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Clock,
  CaretRight,
  Plus,
  Folder,
  Cpu,
  CaretDown,
  GitBranch,
} from '@phosphor-icons/react';
import { Card, CardHover, Button, Badge, Separator, SegmentedControl } from '@/src/components/ui';
import { AddWorkspaceModal } from '@/src/components/AddWorkspaceModal';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useChatConsoleStore } from '@/src/stores/chatConsoleStore';
import { getSessionRepo, type SessionMeta } from '@/src/ai/sessionRepo';
import { formatRelativeTime, cn } from '@/src/lib/utils';
import type { Provider } from '@/src/lib/api';
import { AgentConsole } from '@/src/components/AgentConsole';
import { MorningReport } from '@/src/components/MorningReport';

const PROVIDER_LABELS: Record<Provider, string> = {
  deepseek: 'DeepSeek Chat',
  openai: 'OpenAI GPT',
  anthropic: 'Claude',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

type RecentSession = SessionMeta & { messageCount: number };

export function AgentWorkspaceView() {
  const [activeTab, setActiveTab] = useState('recent');
  const [showAddWorkspace, setShowAddWorkspace] = useState(false);
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useChatConsoleStore((s) => s.activeSessionId);
  const sessionListVersion = useChatConsoleStore((s) => s.sessionListVersion);
  const loading = useChatConsoleStore((s) => s.loading);
  const switchSession = useChatConsoleStore((s) => s.switchSession);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const repo = getSessionRepo();
      const metas = await repo.listSessionsByWorkspace(activeWorkspaceId);
      const counts = await repo.countMessagesBySession(metas.map((m) => m.sessionId));
      if (cancelled) return;
      setSessions(
        metas
          .map((m) => ({ ...m, messageCount: counts.get(m.sessionId) ?? 0 }))
          .slice(0, 10),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, sessionListVersion, activeSessionId]);

  const provider = useUIStore((s) => s.activeAIProvider);
  const ollamaModel = useUIStore((s) => s.ollamaModel);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  const modelLabel = provider === 'ollama' ? `Ollama · ${ollamaModel}` : PROVIDER_LABELS[provider];

  return (
    <div className="flex gap-4 h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)]">
      {/* Left: Chat Area */}
      <Card variant="glass" className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-border-subtle bg-bg-primary/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="xs" className="gap-1">
              <Folder size={12} weight="duotone" className="text-accent" />
              <span className="max-w-[160px] truncate">{activeWorkspace?.name ?? '当前工作区'}</span>
              <CaretDown size={10} />
            </Button>
            <Button variant="secondary" size="xs" className="gap-1">
              <Cpu size={12} weight="duotone" className="text-accent" />
              <span className="max-w-[160px] truncate">{modelLabel}</span>
              <CaretDown size={10} />
            </Button>
          </div>
        </div>
        <AgentConsole layout="page" />
      </Card>

      {/* Right: Workspace Sidebar */}
      <div className="w-[380px] shrink-0 flex flex-col gap-4 overflow-y-auto">
        <MorningReport />

        {/* Recent Tasks */}
        <Card variant="default" className="p-5">
          <SegmentedControl
            segments={[
              { id: 'recent', label: '最近任务' },
              { id: 'scheduled', label: '定时任务' },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            size="sm"
            className="mb-4"
          />

          <div className="space-y-1">
            {activeTab === 'recent' && sessions.length === 0 && (
              <div className="text-center text-sm text-text-tertiary py-6">
                还没有对话，在左侧开始第一句吧
              </div>
            )}
            {activeTab === 'recent' && sessions.map((session, idx) => {
              const isActive = session.sessionId === activeSessionId;
              const disabledByStreaming = loading && !isActive;
              return (
                <motion.div
                  key={session.sessionId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={isActive ? undefined : () => { void switchSession(session.sessionId); }}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 -mx-2 rounded-[var(--radius-md)] hover:bg-bg-secondary transition-colors cursor-pointer group',
                    isActive && 'bg-accent-subtle/50',
                    disabledByStreaming && 'opacity-50 pointer-events-none',
                  )}
                >
                  <Clock size={12} className="text-text-tertiary shrink-0" />
                  <span className="text-[11px] text-text-tertiary w-16 shrink-0">
                    {formatRelativeTime(session.lastActiveAt)}
                  </span>
                  {session.parentSessionId && (
                    <span
                      className="shrink-0"
                      title={`分支自: ${session.parentTitle ?? '未知会话'}`}
                    >
                      <GitBranch size={12} weight="duotone" className="text-accent" />
                    </span>
                  )}
                  <span className="text-sm text-text-primary truncate flex-1 font-medium">
                    {session.title ?? '新对话'}
                  </span>
                  <Badge variant="neutral" className="text-[10px] px-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {session.messageCount} 条
                  </Badge>
                </motion.div>
              );
            })}
            {activeTab === 'scheduled' && (
              <div className="text-center text-sm text-text-tertiary py-6">
                暂无定时任务
              </div>
            )}
          </div>

          {(activeTab !== 'recent' || sessions.length > 0) && (
            <>
              <Separator className="my-3" />
              <Button variant="ghost" size="sm" className="w-full justify-between">
                查看全部
                <CaretRight size={14} />
              </Button>
            </>
          )}
        </Card>

        {/* Agent Workspace Grid */}
        <Card variant="default" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Agent 工作区
            </h3>
            <Button variant="primary" size="xs" onClick={() => setShowAddWorkspace(true)}>
              <Plus size={12} weight="bold" />
              添加
            </Button>
          </div>

          {workspaces.length === 0 ? (
            <div className="text-center text-sm text-text-tertiary py-8">
              暂无工作区,点击「添加」创建
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {workspaces.map((ws, idx) => (
                <motion.div
                  key={ws.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <CardHover variant="interactive" className="p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 bg-accent-subtle text-accent">
                        <Folder size={16} weight="duotone" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {ws.name}
                        </div>
                        <div className="text-[11px] text-text-tertiary truncate mt-0.5 font-mono">
                          {ws.folderPath}
                        </div>
                      </div>
                    </div>
                  </CardHover>
                </motion.div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {showAddWorkspace && (
        <AddWorkspaceModal
          onClose={() => setShowAddWorkspace(false)}
          onSuccess={() => setShowAddWorkspace(false)}
        />
      )}
    </div>
  );
}
