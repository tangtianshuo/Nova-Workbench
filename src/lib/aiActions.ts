// Phase 17 UX-04 — right-click AI action trigger.
// Every action opens the ChatPanel Drawer over the current view with the
// console input PREFILLED but NOT sent (17-UI-SPEC locked: user reviews,
// then presses Enter). Non-empty text selection is snapshotted as a prefix.
import { useUIStore } from '@/src/stores/uiStore';

export function fireAiAction(instruction: string): void {
  const selection = window.getSelection()?.toString().trim() ?? '';
  const snapshot = selection
    ? `引用选区：「${selection.length > 200 ? selection.slice(0, 200) + '…' : selection}」\n\n`
    : '';
  const s = useUIStore.getState();
  s.setPendingChatPrefill(snapshot + instruction); // overwrite — each click is a fresh intent
  s.setChatPanelOpen(true);                        // Drawer overlays the current view, no tab switch
}
