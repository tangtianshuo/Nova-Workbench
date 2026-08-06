import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '@/src/lib/utils';
import { CaretDown, CaretUp, Check } from '@phosphor-icons/react';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex items-center justify-between h-9 px-3 text-sm rounded-[var(--radius-md)]',
        'bg-bg-input border border-border text-text-primary',
        'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'cursor-pointer transition-colors duration-fast',
        'hover:border-text-tertiary/30',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <CaretDown size={14} className="text-text-tertiary ml-2" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: SelectPrimitive.SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-dropdown min-w-[8rem] p-1',
          'bg-bg-primary border border-border-subtle rounded-[var(--radius-md)] shadow-shadow-lg',
          'focus:outline-none',
          className
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex items-center justify-center h-6 cursor-default">
          <CaretUp size={14} />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex items-center justify-center h-6 cursor-default">
          <CaretDown size={14} />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.SelectItemProps) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-[var(--radius-sm)]',
        'text-text-primary cursor-pointer select-none',
        'focus:bg-bg-secondary focus:outline-none',
        'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={12} weight="bold" className="text-accent" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText className="pl-5">{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.SelectSeparatorProps) {
  return (
    <SelectPrimitive.Separator
      className={cn('h-px bg-border-subtle my-1', className)}
      {...props}
    />
  );
}

export function SelectLabel({
  className,
  ...props
}: SelectPrimitive.SelectLabelProps) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2.5 py-1.5 text-xs font-medium text-text-tertiary', className)}
      {...props}
    />
  );
}
