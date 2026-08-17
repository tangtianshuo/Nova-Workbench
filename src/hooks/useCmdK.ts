import { useEffect } from 'react';
import { useUIStore } from '@/src/stores/uiStore';
import { refreshAgentCarry } from '@/src/ai/context';

// ponytail: global keyboard shortcuts. Tauri webview has no URL bar, so bare
// Ctrl/Cmd+K is safe there (Phase 17 UX-02); Shift+K stays as the web-dev fallback.
// Both open paths refresh the view-context carry first.
// Ctrl/Cmd+K → AI 助手 ChatPanel slide-out (with carried context).
// Ctrl/Cmd+Shift+K → same panel, web fallback binding.
// Ctrl/Cmd+Shift+F → Search Dialog.
// Ctrl/Cmd+Shift+P → CmdKPalette (command + AI 对话 modes, Raycast-style).
// Esc → close any open modal/panel.
export function useCmdK() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (meta && !event.shiftKey && key === 'k') {
        event.preventDefault();
        event.stopPropagation();
        refreshAgentCarry();
        const s = useUIStore.getState();
        s.setChatPanelOpen(!s.isChatPanelOpen);
      } else if (meta && event.shiftKey && key === 'k') {
        event.preventDefault();
        event.stopPropagation();
        refreshAgentCarry();
        const s = useUIStore.getState();
        s.setChatPanelOpen(!s.isChatPanelOpen);
      } else if (meta && event.shiftKey && key === 'f') {
        event.preventDefault();
        event.stopPropagation();
        useUIStore.getState().setSearchOpen(true);
      } else if (meta && event.shiftKey && key === 'p') {
        event.preventDefault();
        event.stopPropagation();
        const s = useUIStore.getState();
        s.setCmdKOpen(!s.isCmdKOpen);
      } else if (event.key === 'Escape') {
        const s = useUIStore.getState();
        if (s.isChatPanelOpen) s.setChatPanelOpen(false);
        if (s.isSearchOpen) s.setSearchOpen(false);
        if (s.isCmdKOpen) s.setCmdKOpen(false);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
