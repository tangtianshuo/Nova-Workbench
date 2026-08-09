import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/src/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: PopoverPrimitive.PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // ponytail: z-tooltip — must clear Dialog z-modal (400). See Select.tsx.
          'z-tooltip w-72 p-3',
          'bg-bg-primary border border-border-subtle rounded-[var(--radius-lg)] shadow-shadow-lg',
          'focus:outline-none',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
