import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/src/lib/utils';
import { type ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', align = 'center', className }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            'z-tooltip px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-sm)]',
            'bg-text-primary text-bg-primary shadow-shadow-md',
            'animate-in fade-in-0 zoom-in-95',
            'select-none',
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-text-primary" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
