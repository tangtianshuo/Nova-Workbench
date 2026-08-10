import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { X } from '@phosphor-icons/react';
import { Button } from './Button';

/* === Root (alias of Radix Dialog Root) === */
export const Drawer = DialogPrimitive.Root;

/* === Content (right-anchored slide-in) === */
export function DrawerContent({
  className,
  children,
  width = 360,
  ...props
}: DialogPrimitive.DialogContentProps & { width?: number }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-modal bg-bg-overlay backdrop-blur-sm"
        asChild
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      </DialogPrimitive.Overlay>
      <DialogPrimitive.Content asChild {...props}>
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 350, damping: 34 }}
          style={{ width: `${width}px` }}
          className={cn(
            'fixed top-0 bottom-0 right-0 z-modal',
            'bg-bg-primary border-l border-border-subtle shadow-shadow-lg',
            'flex flex-col',
            'focus:outline-none',
            className
          )}
        >
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* === Header === */
export function DrawerHeader({
  className,
  title,
  description,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
}) {
  return (
    <div className={cn('px-5 pt-5 pb-3', className)} {...props}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {title && (
            <DialogPrimitive.Title className="text-lg font-semibold text-text-primary truncate">
              {title}
            </DialogPrimitive.Title>
          )}
          {description && (
            <DialogPrimitive.Description className="mt-1 text-sm text-text-secondary">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="关闭"
            className="h-7 w-7 p-0 -mr-1 -mt-1 shrink-0"
          >
            <X size={16} />
          </Button>
        </DialogPrimitive.Close>
      </div>
      {children}
    </div>
  );
}

/* === Body (scrollable) === */
export function DrawerBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pb-4 flex-1 overflow-y-auto', className)} {...props} />
  );
}

/* === Footer (sticky bottom) === */
export function DrawerFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'px-5 py-4 border-t border-border-subtle',
        'flex items-center justify-end gap-2',
        className
      )}
      {...props}
    />
  );
}
