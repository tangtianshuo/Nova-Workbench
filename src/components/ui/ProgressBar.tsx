import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
  indeterminate?: boolean;
}

const variantColors = {
  default: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
};

export function ProgressBar({
  value,
  max = 100,
  variant = 'default',
  size = 'sm',
  showLabel = false,
  className,
  indeterminate = false,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('flex items-center gap-2', showLabel && 'min-w-[120px]', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-full bg-bg-secondary',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
          'flex-1'
        )}
      >
        {indeterminate ? (
          <motion.div
            className={cn('absolute inset-y-0 w-1/3 rounded-full', variantColors[variant])}
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.5, ease: 'easeInOut', repeat: Infinity }}
          />
        ) : (
          <motion.div
            className={cn('h-full rounded-full', variantColors[variant])}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
        )}
      </div>
      {showLabel && (
        <span className="text-xs text-text-tertiary tabular-nums w-8 text-right">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
