// Phase 31 (31-06, D-11/D-12) — right-edge doc workspace panel as an overlay.
// Absolutely positioned inside the content-area wrapper (App.tsx): the main
// workspace keeps its width (no flex squeeze), no backdrop — clicks on the
// main workspace pass through and never collapse or steal focus. Zen mode
// (D-12) spans the panel across the whole content area; the sidebar nav stays.
import { useCallback } from 'react';
import { motion } from 'motion/react';
import {
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  CaretLeft,
  CaretRight,
  NotePencil,
} from '@phosphor-icons/react';
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

/** Collapsed 28px rail overlaid at the content-area right edge when closed. */
function ExpandRail() {
  const toggle = useUIStore((s) => s.toggleDocWorkspace);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="展开文档工作区"
      className={cn(
        'absolute inset-y-0 right-0 z-30 w-7 border-l border-border-subtle bg-bg-primary',
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
  const zen = useUIStore((s) => s.docZenMode);
  const setWidth = useUIStore((s) => s.setDocWorkspaceWidth);
  const toggle = useUIStore((s) => s.toggleDocWorkspace);
  const toggleZen = useUIStore((s) => s.toggleDocZenMode);
  const onResize = useResize(setWidth, width);

  if (!open) return <ExpandRail />;

  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      className={cn(
        // Overlay, z-30: above main content, below global Dialogs (z-50).
        'absolute inset-y-0 right-0 z-30 flex flex-col bg-bg-primary',
        'border-l border-border-subtle shadow-2xl',
        zen && 'left-0 border-l-0'
      )}
      style={zen ? undefined : { width }}
    >
      {/* Drag-to-resize handle (hidden in zen — panel already spans full width) */}
      {!zen && (
        <div
          onMouseDown={onResize}
          className="w-1 cursor-col-resize hover:bg-accent shrink-0 absolute left-0 top-0 bottom-0 z-10"
        />
      )}

      {/* Top toolbar (32px) */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-border-subtle bg-bg-secondary shrink-0">
        <span className="text-md font-semibold text-text-primary">文档工作区</span>
        <div className="flex items-center gap-0.5">
          <Tooltip content={zen ? '退出禅模式' : '禅模式（编辑区占满主工作区）'}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label={zen ? '退出禅模式' : '禅模式'}
              onClick={toggleZen}
            >
              {zen ? <ArrowsInLineHorizontal size={14} /> : <ArrowsOutLineHorizontal size={14} />}
            </Button>
          </Tooltip>
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
      </div>

      {/* Body (31-04) */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </motion.aside>
  );
}
