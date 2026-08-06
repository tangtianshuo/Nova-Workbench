import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Slot } from '@radix-ui/react-slot';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'xs' | 'sm' | 'md' | 'lg';

type MotionConflict = 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onAnimationStart' | 'onAnimationEnd';
interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, MotionConflict> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover active:bg-accent-active shadow-sm',
  secondary:
    'bg-bg-secondary text-text-primary border border-border hover:bg-bg-tertiary active:bg-bg-secondary',
  ghost:
    'text-text-secondary hover:bg-bg-secondary hover:text-text-primary active:bg-bg-tertiary',
  danger:
    'bg-danger text-white hover:opacity-90 active:opacity-80 shadow-sm',
  link:
    'text-accent hover:underline p-0 h-auto',
};

const sizeStyles: Record<Size, string> = {
  xs: 'h-6 px-2 text-xs gap-1 rounded-[var(--radius-sm)]',
  sm: 'h-7 px-2.5 text-sm gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-8 px-3.5 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-10 px-5 text-md gap-2 rounded-[var(--radius-md)]',
};

const MotionButton = motion.button;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : MotionButton;

    return (
      <Comp
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium',
          'transition-colors duration-fast cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1',
          'disabled:opacity-40 disabled:pointer-events-none',
          'select-none whitespace-nowrap',
          variantStyles[variant],
          variant !== 'link' && sizeStyles[size],
          className
        )}
        whileTap={variant !== 'link' ? { scale: 0.97 } : undefined}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';
