import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { X } from '@phosphor-icons/react';
import { Button } from './Button';

/* === Root === */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

/* === Overlay === */
export function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-modal bg-bg-overlay backdrop-blur-sm',
        className
      )}
      {...props}
    />
  );
}

/* === Content === */
export function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPortal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-modal bg-bg-overlay backdrop-blur-sm" />
      <DialogPrimitive.Content asChild {...props}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-modal',
            'w-[calc(100%-2rem)] max-w-lg',
            'bg-bg-primary rounded-[var(--radius-xl)] shadow-shadow-lg',
            'border border-border-subtle',
            'focus:outline-none',
            className
          )}
        >
          {children}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/* === Header === */
export function DialogHeader({
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
    <div className={cn('px-5 pt-5 pb-0', className)} {...props}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {title && (
            <DialogPrimitive.Title className="text-lg font-semibold text-text-primary">
              {title}
            </DialogPrimitive.Title>
          )}
          {description && (
            <DialogPrimitive.Description className="mt-1 text-sm text-text-secondary">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="关闭"
            className="h-7 w-7 p-0 -mr-1 -mt-1"
          >
            <X size={16} />
          </Button>
        </DialogClose>
      </div>
      {children}
    </div>
  );
}

/* === Footer === */
export function DialogFooter({
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

/* === Body === */
export function DialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4 space-y-4', className)} {...props} />;
}

/* === Animated Wrapper (for use without Radix portal) === */
export function DialogAnimated({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && children}
    </AnimatePresence>
  );
}
