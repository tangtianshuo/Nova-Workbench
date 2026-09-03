// Phase 31 (31-03) — right-edge doc workspace panel shell.
// A plain flex <aside> (NOT a Drawer): persistent, non-modal, coexists with
// the ⌘K left drawer (D-04). Business content (list/editor/confirm card)
// lands in 31-04 via children.
import { useCallback } from 'react';
import { CaretLeft, CaretRight, NotePencil } from '@phosphor-icons/react';
import { cn } from '@/src/lib/utils';
import { Button, Tooltip } from '@/src/components/ui';
import { useUIStore } from '@/src/stores/uiStore';

const MIN_WIDTH = 360;

/** Left-edge drag handle: mousedown → window-level mousemove/mouseup. */
function useResize(onWidth: (w: number) => void, currentWidth: number) {
  return useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = currentWidth;
      const onMove = (ev: MouseEvent) => {
        const max = Math.max(MIN_WIDTH, window.innerWidth * 0.6);
        onWidth(Math.min(Math.max(startWidth - (ev.clientX - startX), MIN_WIDTH), max));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [currentWidth, onWidth]
  );
}

/** Collapsed 28px rail shown at the right edge when the panel is closed. */
function ExpandRail() {
  const toggle = useUIStore((s) => s.toggleDocWorkspace);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="展开文档工作区"
      className={cn(
        'w-7 shrink-0 border-l border-border-subtle bg-bg-primary',
        'flex flex-col items-center gap-2 pt-3 text-text-tertiary hover:text-text-primary'
      )}
    >
      <CaretLeft size={14} />
      <NotePencil size={16} weight="duotone" />
    </button>
  );
}

export function DocWorkspaceShell({ children }: { children?: React.ReactNode }) {
  const open = useUIStore((s) => s.docWorkspaceOpen);
  const width = useUIStore((s) => s.docWorkspaceWidth);
  const setWidth = useUIStore((s) => s.setDocWorkspaceWidth);
  const toggle = useUIStore((s) => s.toggleDocWorkspace);
  const onResize = useResize(setWidth, width);

  if (!open) return <ExpandRail />;

  return (
    <aside
      className="bg-bg-primary border-l border-border-subtle shrink-0 relative flex flex-col"
      style={{ width }}
    >
      {/* Drag-to-resize handle */}
      <div
        onMouseDown={onResize}
        className="w-1 cursor-col-resize hover:bg-accent shrink-0 absolute left-0 top-0 bottom-0 z-10"
      />

      {/* Top toolbar (32px) */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-border-subtle bg-bg-secondary shrink-0">
        <span className="text-md font-semibold text-text-primary">文档工作区</span>
        <Tooltip content="收起文档工作区（右侧按钮展开）">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label="收起文档工作区"
            onClick={toggle}
          >
            <CaretRight size={14} />
          </Button>
        </Tooltip>
      </div>

      {/* Body — filled by 31-04 */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </aside>
  );
}
