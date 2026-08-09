import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/src/lib/utils';
import { Check, CaretRight } from '@phosphor-icons/react';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger;
export const DropdownMenuSubContent = DropdownMenuPrimitive.SubContent;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          // ponytail: z-tooltip — must clear Dialog z-modal (400). See Select.tsx.
          'z-tooltip min-w-[8rem] p-1',
          'bg-bg-primary border border-border-subtle rounded-[var(--radius-md)] shadow-shadow-lg',
          'focus:outline-none',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  inset,
  ...props
}: DropdownMenuPrimitive.DropdownMenuItemProps & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'relative flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-[var(--radius-sm)]',
        'text-text-primary cursor-pointer select-none',
        'focus:bg-bg-secondary focus:outline-none',
        'data-[disabled]:opacity-40 data-[disabled]:pointer-events-none',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: DropdownMenuPrimitive.DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      className={cn(
        'relative flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-[var(--radius-sm)]',
        'text-text-primary cursor-pointer select-none',
        'focus:bg-bg-secondary focus:outline-none',
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        {checked && <Check size={12} weight="bold" />}
      </span>
      <span className="pl-5">{children}</span>
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: DropdownMenuPrimitive.DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        'relative flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-[var(--radius-sm)]',
        'text-text-primary cursor-pointer select-none',
        'focus:bg-bg-secondary focus:outline-none',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <span className="w-2 h-2 rounded-full bg-accent" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <span className="pl-5">{children}</span>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: DropdownMenuPrimitive.DropdownMenuLabelProps & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'px-2.5 py-1.5 text-xs font-medium text-text-tertiary',
        inset && 'pl-8',
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: DropdownMenuPrimitive.DropdownMenuSeparatorProps) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('h-px bg-border-subtle my-1', className)}
      {...props}
    />
  );
}
