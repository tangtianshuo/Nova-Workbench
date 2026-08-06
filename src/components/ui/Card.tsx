import { forwardRef, type HTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

type Variant = 'default' | 'elevated' | 'glass' | 'interactive' | 'dark';

type MotionConflict = 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd';
interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, MotionConflict> {
  variant?: Variant;
}

const variantStyles: Record<Variant, string> = {
  default:
    'bg-bg-primary border border-border-subtle shadow-shadow-sm',
  elevated:
    'bg-bg-primary border border-border-subtle shadow-shadow-md',
  glass:
    'glass border border-white/20 shadow-shadow-glass',
  interactive:
    'bg-bg-primary border border-border-subtle shadow-shadow-sm hover:shadow-shadow-md hover:border-border transition-all duration-normal cursor-pointer',
  dark:
    'bg-gradient-to-r from-slate-950 via-indigo-950/90 to-slate-900 text-white border border-indigo-500/20 shadow-shadow-lg',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--radius-lg)] overflow-hidden',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';

/* Card with subtle hover animation */
export const CardHover = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn(
        'rounded-[var(--radius-lg)] overflow-hidden',
        variantStyles[variant],
        className
      )}
      whileHover={variant === 'interactive' ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      {...props}
    >
      {children}
    </motion.div>
  )
);
CardHover.displayName = 'CardHover';

/* Card section helpers */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 py-4 border-b border-border-subtle', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2', className)}
      {...props}
    />
  );
}
