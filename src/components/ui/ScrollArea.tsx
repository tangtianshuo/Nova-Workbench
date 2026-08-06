import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/src/lib/utils';

export function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Scrollbar orientation="horizontal" className="h-2 flex flex-col touch-none select-none p-px">
        <ScrollAreaPrimitive.Thumb className="flex-1 bg-border rounded-full" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner className="bg-border" />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.ScrollAreaScrollbarProps) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        'flex touch-none select-none p-px transition-colors',
        orientation === 'vertical' && 'w-2 h-full border-l border-l-transparent',
        orientation === 'horizontal' && 'h-2 w-full border-t border-t-transparent',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb className="flex-1 bg-border rounded-full hover:bg-text-tertiary/40 transition-colors" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
