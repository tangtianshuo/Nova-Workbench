import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
import {
  Card,
  CardHover,
  Button,
  Badge,
  Separator,
  SegmentedControl,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  Input,
  useToast,
} from '@/src/components/ui';
import { AddWorkspaceModal } from '@/src/components/AddWorkspaceModal';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useChatConsoleStore } from '@/src/stores/chatConsoleStore';
import { getSessionRepo, type SessionMeta } from '@/src/ai/sessionRepo';
import { formatRelativeTime, cn } from '@/src/lib/utils';
import type { Provider } from '@/src/lib/api';
import { AgentConsole } from '@/src/components/AgentConsole';
import { MorningReport } from '@/src/components/MorningReport';
import { FileTree, type FileTreeMenu, type FileTreeDnd } from '@/src/components/FileTree';
import { buildFileTree } from '@/src/lib/fileTree';
import { isValidFsName } from '@/src/lib/fsName';
import { isTauri } from '@/src/lib/api';

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
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId);
  const scanWorkspaceFiles = useWorkspaceStore((s) => s.scanWorkspaceFiles);
  const { toast } = useToast();

  const handleSelectWorkspace = (id: string) => {
    const result = setActiveWorkspaceId(id);
    if (!result.success && result.reason === 'streaming') {
      toast({ type: 'error', title: '无法切换工作区', description: '请等待当前回复完成' });
    }
  };

  const handleSelectSession = (session: RecentSession, isActive: boolean) => {
    if (isActive) return;
    if (session.workspaceId !== activeWorkspaceId) {
      toast({
        type: 'info',
        title: session.workspaceId === null ? '全局会话' : '其他工作区会话',
        description: '该会话不属于当前工作区，仍可继续查看',
      });
    }
    void switchSession(session.sessionId);
  };

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
  }, [activeWorkspaceId, sessionListVersion]);

  const provider = useUIStore((s) => s.activeAIProvider);
  const ollamaModel = useUIStore((s) => s.ollamaModel);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  const modelLabel = provider === 'ollama' ? `Ollama · ${ollamaModel}` : PROVIDER_LABELS[provider];

  // workspace files tab: scan on activation / workspace switch (store no-ops on web dev)
  const scannedFor = useRef<string | null>(null);
  useEffect(() => {
    if (activeTab !== 'files' || !activeWorkspaceId) return;
    if (scannedFor.current === activeWorkspaceId) return;
    scannedFor.current = activeWorkspaceId;
    void scanWorkspaceFiles(activeWorkspaceId);
  }, [activeTab, activeWorkspaceId, scanWorkspaceFiles]);

  const fileTree = useMemo(
    () => buildFileTree(activeWorkspace?.files.map((f) => f.path) ?? [], activeWorkspace?.folderPath),
    [activeWorkspace],
  );
  const truncated = (activeWorkspace?.files.length ?? 0) >= 1000;

  // === File tree context menu (Tauri only) ===
  type NameDialog = {
    kind: 'newDir' | 'newFile' | 'rename';
    parentRel: string;
    rel?: string;
    currentName?: string;
  };
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [nameInput, setNameInput] = useState('');

  const folderPath = activeWorkspace?.folderPath ?? '';
  const toAbs = (rel: string) =>
    rel ? `${folderPath.replace(/[\\/]+$/, '')}${folderPath.includes('\\') ? '\\' : '/'}${rel}` : folderPath;

  const handleReveal = async (rel: string) => {
    try {
      await invoke('reveal_in_explorer', { path: toAbs(rel) });
    } catch (e) {
      toast({ type: 'error', title: '打开失败', description: String(e) });
    }
  };

  const refreshTree = () => {
    if (activeWorkspaceId) void scanWorkspaceFiles(activeWorkspaceId);
  };

  const submitNameDialog = async () => {
    if (!nameDialog || !activeWorkspace) return;
    const name = nameInput.trim();
    if (!isValidFsName(name)) {
      toast({ type: 'error', title: '名称包含非法字符', description: '不能包含 / \\ : * ? " < > | 或 ..' });
      return;
    }
    try {
      if (nameDialog.kind === 'rename') {
        await invoke('fs_rename', { root: folderPath, rel: nameDialog.rel, newName: name });
        toast({ type: 'success', title: '已重命名', description: name });
      } else {
        await invoke(nameDialog.kind === 'newDir' ? 'fs_create_dir' : 'fs_create_file', {
          root: folderPath,
          parentRel: nameDialog.parentRel,
          name,
        });
        toast({ type: 'success', title: nameDialog.kind === 'newDir' ? '文件夹已创建' : '文件已创建', description: name });
      }
      setNameDialog(null);
      refreshTree();
    } catch (e) {
      toast({ type: 'error', title: '操作失败', description: String(e) });
    }
  };

  const fileTreeMenu: FileTreeMenu | undefined =
    isTauri() && folderPath
      ? {
          onReveal: (rel) => void handleReveal(rel),
          onCreate: (kind, parentRel) => {
            setNameInput('');
            setNameDialog({ kind: kind === 'dir' ? 'newDir' : 'newFile', parentRel });
          },
          onRename: (rel, _kind, currentName) => {
            setNameInput(currentName);
            setNameDialog({ kind: 'rename', parentRel: '', rel, currentName });
          },
        }
      : undefined;

  const handleMove = async (srcRel: string, destDirRel: string) => {
    try {
      await invoke('fs_move', { root: folderPath, srcRel, destDirRel });
      toast({ type: 'success', title: '已移动', description: srcRel });
      refreshTree();
    } catch (e) {
      toast({ type: 'error', title: '移动失败', description: String(e) });
    }
  };

  const fileTreeDnd: FileTreeDnd | undefined =
    isTauri() && folderPath
      ? { onMove: (srcRel, destDirRel) => void handleMove(srcRel, destDirRel) }
      : undefined;

  return (
    <div className="flex gap-4 h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)]">
      {/* Left: Chat Area */}
      <Card variant="glass" className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-border-subtle bg-bg-primary/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="xs" className="gap-1">
                  <Folder size={12} weight="duotone" className="text-accent" />
                  <span className="max-w-[160px] truncate">{activeWorkspace?.name ?? '当前工作区'}</span>
                  <CaretDown size={10} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {workspaces.map((ws) => (
                  <DropdownMenuItem key={ws.id} onSelect={() => handleSelectWorkspace(ws.id)}>
                    <Folder size={12} weight="duotone" className={ws.id === activeWorkspaceId ? 'text-accent' : 'text-text-tertiary'} />
                    <span className={cn('truncate', ws.id === activeWorkspaceId && 'text-accent font-medium')}>
                      {ws.name}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
              { id: 'files', label: '工作区文件' },
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
                  role="button"
                  tabIndex={isActive || disabledByStreaming ? -1 : 0}
                  aria-disabled={disabledByStreaming || undefined}
                  aria-current={isActive || undefined}
                  onClick={isActive ? undefined : () => handleSelectSession(session, isActive)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isActive && !disabledByStreaming) {
                      handleSelectSession(session, isActive);
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2 -mx-2 rounded-[var(--radius-md)] hover:bg-bg-secondary focus-visible:bg-bg-secondary outline-none transition-colors cursor-pointer group',
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
            {activeTab === 'files' && (
              <>
                <FileTree nodes={fileTree} emptyText="当前工作区暂无文件" menu={fileTreeMenu} dnd={fileTreeDnd} />
                {truncated && (
                  <div className="text-[11px] text-text-tertiary text-center mt-2">
                    已截断：仅显示前 1000 个文件
                  </div>
                )}
                {!truncated && fileTree.length > 0 && (
                  <div className="text-[10px] text-text-placeholder text-center mt-2">
                    文件较多时可能被截断
                  </div>
                )}
              </>
            )}
          </div>

          {activeTab !== 'files' && (activeTab !== 'recent' || sessions.length > 0) && (
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
                  role="button"
                  tabIndex={ws.id === activeWorkspaceId ? -1 : 0}
                  aria-current={ws.id === activeWorkspaceId || undefined}
                  onClick={() => ws.id !== activeWorkspaceId && handleSelectWorkspace(ws.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && ws.id !== activeWorkspaceId) {
                      handleSelectWorkspace(ws.id);
                    }
                  }}
                  className="cursor-pointer outline-none focus-visible:bg-bg-secondary rounded-[var(--radius-lg)]"
                >
                  <CardHover
                    variant="interactive"
                    className={cn(
                      'p-3',
                      ws.id === activeWorkspaceId && 'border-accent/60 bg-accent-subtle/40',
                    )}
                  >
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

      <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && setNameDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader
            title={nameDialog?.kind === 'rename' ? '重命名' : nameDialog?.kind === 'newDir' ? '新建文件夹' : '新建文件'}
            description={nameDialog?.kind === 'rename' ? nameDialog.currentName : nameDialog?.parentRel || '工作区根目录'}
          />
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="输入名称"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void submitNameDialog()}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNameDialog(null)}>取消</Button>
            <Button variant="primary" onClick={() => void submitNameDialog()}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
