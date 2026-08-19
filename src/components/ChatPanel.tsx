// Phase 17 (UX-01) — ChatPanel is now a thin Drawer shell around AgentConsole.
// All conversation state lives in useChatConsoleStore (shared with the agent tab).
// Phase 21 (QUICK-01/02/03) — scoped mode (Ctrl+Shift+K) renders a workspace +
// session Select row; pure mode (Ctrl+K) adds zero DOM.
import { useEffect, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader } from '@/src/components/ui/Drawer';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectSeparator,
} from '@/src/components/ui/Select';
import { AgentConsole } from '@/src/components/AgentConsole';
import { useUIStore } from '@/src/stores/uiStore';
import { useChatConsoleStore, PROVIDER_LABELS } from '@/src/stores/chatConsoleStore';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { getSessionRepo, type SessionMeta } from '@/src/ai/sessionRepo';
import { formatRelativeTime } from '@/src/lib/utils';
import { Plus } from '@phosphor-icons/react';

const NEW_SESSION_VALUE = '__new__';

function ScopedSelectorRow() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useChatConsoleStore((s) => s.activeSessionId);
  const sessionListVersion = useChatConsoleStore((s) => s.sessionListVersion);
  const loading = useChatConsoleStore((s) => s.loading);
  const isChatPanelOpen = useUIStore((s) => s.isChatPanelOpen);
  const chatPanelMode = useUIStore((s) => s.chatPanelMode);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const metas = await getSessionRepo().listSessionsByWorkspace(activeWorkspaceId);
      if (!cancelled) setSessions(metas);
    })();
    return () => {
      cancelled = true;
    };
  }, [isChatPanelOpen, chatPanelMode, activeWorkspaceId, sessionListVersion]);

  return (
    <div className="flex gap-2 px-4 py-2 border-b border-border-subtle">
      <Select
        value={activeWorkspaceId ?? undefined}
        onValueChange={(id) => {
          if (id !== activeWorkspaceId) {
            void useWorkspaceStore.getState().setActiveWorkspaceId(id);
          }
        }}
      >
        <SelectTrigger className="flex-1 min-w-0" disabled={loading}>
          <span className="min-w-0 truncate">
            <SelectValue placeholder="工作区" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {workspaces.map((ws) => (
            <SelectItem key={ws.id} value={ws.id}>
              {ws.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activeSessionId}
        onValueChange={(v) => {
          if (v === NEW_SESSION_VALUE) void useChatConsoleStore.getState().startNewSession();
          else void useChatConsoleStore.getState().switchSession(v);
        }}
      >
        <SelectTrigger className="flex-[1.4] min-w-0" disabled={loading}>
          <span className="min-w-0 truncate">
            <SelectValue placeholder="会话" />
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NEW_SESSION_VALUE}>
            <span className="flex items-center gap-1">
              <Plus size={12} weight="duotone" className="text-accent" />+ 新对话
            </span>
          </SelectItem>
          <SelectSeparator />
          {sessions.length === 0 ? (
            <SelectItem value="empty-placeholder" disabled>
              该工作区暂无会话
            </SelectItem>
          ) : (
            sessions.map((s) => (
              <SelectItem key={s.sessionId} value={s.sessionId}>
                {s.title ?? '新对话'} · {formatRelativeTime(s.lastActiveAt)}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ChatPanel() {
  const isOpen = useUIStore((state) => state.isChatPanelOpen);
  const setOpen = useUIStore((state) => state.setChatPanelOpen);
  const chatPanelMode = useUIStore((state) => state.chatPanelMode);
  const provider = useUIStore((state) => state.activeAIProvider);
  const textareaFocus = (event: Event) => {
    // AgentConsole's textarea is focused by its own isChatPanelOpen effect;
    // keep preventDefault so Radix doesn't steal focus to the panel itself.
    event.preventDefault();
  };
  return (
    <Drawer open={isOpen} onOpenChange={setOpen}>
      <DrawerContent width={480} className="max-w-[100vw]" onOpenAutoFocus={textareaFocus}>
        <DrawerHeader title="AI 助手" description={`当前 provider：${PROVIDER_LABELS[provider]}`} />
        {chatPanelMode === 'scoped' && <ScopedSelectorRow />}
        <AgentConsole />
      </DrawerContent>
    </Drawer>
  );
}
