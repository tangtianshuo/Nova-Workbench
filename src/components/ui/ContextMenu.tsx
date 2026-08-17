import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/src/lib/utils';

// Phase 17 UX-04 — Radix ContextMenu styled as a DropdownMenu clone
// (17-UI-SPEC Surface 4: class strings verbatim, pixel-identical system read).
export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;

export function ContextMenuContent({
  className,
  ...props
}: ContextMenuPrimitive.ContextMenuContentProps) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(
          // ponytail: z-tooltip — must clear Dialog z-modal (400). See Select.tsx.
          'z-tooltip min-w-[8rem] p-1',
          'bg-bg-primary border border-border-subtle rounded-[var(--radius-md)] shadow-shadow-lg',
          'focus:outline-none',
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: ContextMenuPrimitive.ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-text-primary',
        'focus:bg-bg-secondary focus:outline-none',
        'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
        className
      )}
      {...props}
    />
  );
}

export function ContextMenuLabel({
  className,
  ...props
}: ContextMenuPrimitive.ContextMenuLabelProps) {
  return (
    <ContextMenuPrimitive.Label
      className={cn('px-2.5 py-1.5 text-xs font-medium text-text-tertiary', className)}
      {...props}
    />
  );
}

/* === AI action menu wrapper (Phase 17 UX-04) === */

interface AiContextMenuProps {
  children: ReactElement;
  items: Array<{ icon: ReactNode; label: string; onSelect: () => void }>;
}

// Belt-and-braces contenteditable guard. Primary guard is structural: the
// MDXEditor pane is never wrapped (17-UI-SPEC locked). If a contenteditable
// ever ends up inside a wrapped region anyway, this capture-phase
// stopPropagation stops Radix's trigger handler before it runs — without
// preventDefault, so the native editor menu still opens. (Plain
// onContextMenu setOpen(false) cannot work: Radix re-opens after our
// handler; preventDefault would kill the native menu too.)
export function AiContextMenu({ children, items }: AiContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenuCapture={(event) => {
          if ((event.target as HTMLElement).closest('[contenteditable="true"]')) {
            event.stopPropagation();
          }
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>AI 动作</ContextMenuLabel>
        {items.map((item) => (
          <ContextMenuItem key={item.label} onSelect={item.onSelect}>
            {item.icon}
            {item.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
