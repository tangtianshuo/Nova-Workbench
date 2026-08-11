import { useCallback, useEffect } from 'react';
import { useUIStore } from '@/src/stores/uiStore';

type CmdKUIState = {
  isCmdKOpen?: boolean;
  setCmdKOpen?: (open: boolean) => void;
};

function setCmdKOpen(open: boolean) {
  const state = useUIStore.getState() as CmdKUIState;
  if (state.setCmdKOpen) {
    state.setCmdKOpen(open);
    return;
  }
  // Compatibility until the shared uiStore owner adds the transient field.
  useUIStore.setState({ isCmdKOpen: open } as never);
}

export function useCmdK() {
  const open = useCallback((value: boolean) => setCmdKOpen(value), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        const state = useUIStore.getState() as CmdKUIState;
        open(!state.isCmdKOpen);
      } else if (event.key === 'Escape') {
        open(false);
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);
}
