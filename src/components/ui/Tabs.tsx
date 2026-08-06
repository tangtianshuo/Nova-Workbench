import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/src/lib/utils';

/* Root */
export const Tabs = TabsPrimitive.Root;

/* List */
type Variant = 'underline' | 'pills';

interface TabsListProps extends TabsPrimitive.TabsListProps {
  variant?: Variant;
}

export function TabsList({
  className,
  variant = 'underline',
  ...props
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex items-center gap-1',
        variant === 'pills' && 'bg-bg-secondary p-1 rounded-[var(--radius-md)]',
        variant === 'underline' && 'border-b border-border-subtle',
        className
      )}
      {...props}
    />
  );
}

/* Trigger */
interface TabsTriggerProps extends TabsPrimitive.TabsTriggerProps {
  variant?: Variant;
}

export function TabsTrigger({
  className,
  variant = 'underline',
  ...props
}: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'text-sm font-medium transition-colors duration-fast cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
        'disabled:opacity-40 disabled:pointer-events-none',

        variant === 'underline' && [
          'px-3 py-2 -mb-px border-b-2 border-transparent',
          'text-text-secondary hover:text-text-primary',
          'data-[state=active]:border-accent data-[state=active]:text-accent',
        ],

        variant === 'pills' && [
          'px-3 py-1.5 rounded-[var(--radius-sm)] relative',
          'text-text-secondary hover:text-text-primary',
          'data-[state=active]:bg-bg-primary data-[state=active]:text-text-primary data-[state=active]:shadow-shadow-xs',
        ],

        className
      )}
      {...props}
    />
  );
}

/* Content */
export function TabsContent({
  className,
  ...props
}: TabsPrimitive.TabsContentProps) {
  return (
    <TabsPrimitive.Content
      className={cn('focus:outline-none', className)}
      {...props}
    />
  );
}
