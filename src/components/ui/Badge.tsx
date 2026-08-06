import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/src/lib/utils';

type Variant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

const variantStyles: Record<Variant, string> = {
  default: 'bg-accent-subtle text-accent',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  neutral: 'bg-bg-secondary text-text-secondary',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1',
        'px-2 py-0.5 text-xs font-medium',
        'rounded-[var(--radius-sm)]',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';

/* Dot badge - small colored circle indicator */
interface DotBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
}

const dotColors = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-tertiary',
};

export const DotBadge = forwardRef<HTMLSpanElement, DotBadgeProps>(
  ({ className, color = 'neutral', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5',
        'text-xs text-text-secondary',
        className
      )}
      {...props}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dotColors[color])} />
      {props.children}
    </span>
  )
);
DotBadge.displayName = 'DotBadge';
