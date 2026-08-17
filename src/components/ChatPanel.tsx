// Phase 17 (UX-01) — ChatPanel is now a thin Drawer shell around AgentConsole.
// All conversation state lives in useChatConsoleStore (shared with the agent tab).
import { Drawer, DrawerContent, DrawerHeader } from '@/src/components/ui/Drawer';
import { AgentConsole } from '@/src/components/AgentConsole';
import { useUIStore } from '@/src/stores/uiStore';
import { PROVIDER_LABELS } from '@/src/stores/chatConsoleStore';

export function ChatPanel() {
  const isOpen = useUIStore((state) => state.isChatPanelOpen);
  const setOpen = useUIStore((state) => state.setChatPanelOpen);
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
        <AgentConsole />
      </DrawerContent>
    </Drawer>
  );
}
