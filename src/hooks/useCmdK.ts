import { useEffect } from 'react';
import { useUIStore } from '@/src/stores/uiStore';

// ponytail: global keyboard shortcuts. All use Ctrl/Cmd+Shift+<key> to avoid
// browser/OS conflicts (Ctrl+K overrides URL bar focus in some browsers,
// Ctrl+P is print, Ctrl+F is page search).
// Ctrl/Cmd+Shift+K → AI 助手 ChatPanel slide-out.
// Ctrl/Cmd+Shift+F → Search Dialog.
// Ctrl/Cmd+Shift+P → CmdKPalette (command + AI 对话 modes, Raycast-style).
// Esc → close any open modal/panel.
export function useCmdK() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (meta && event.shiftKey && key === 'k') {
        event.preventDefault();
        event.stopPropagation();
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
