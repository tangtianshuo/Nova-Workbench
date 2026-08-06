import { cn } from '@/src/lib/utils';

type Variant = 'text' | 'circle' | 'card' | 'table-row' | 'rect';

interface SkeletonProps {
  variant?: Variant;
  className?: string;
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ variant = 'text', className, width, height }: SkeletonProps) {
  const base = 'bg-bg-secondary animate-pulse rounded-[var(--radius-sm)]';

  switch (variant) {
    case 'text':
      return (
        <div
          className={cn(base, 'h-4 rounded-[var(--radius-sm)]', className)}
          style={{ width: width || '100%' }}
        />
      );
    case 'circle':
      return (
        <div
          className={cn(base, 'rounded-full', className)}
          style={{ width: width || 40, height: height || width || 40 }}
        />
      );
    case 'card':
      return (
        <div
          className={cn(base, 'rounded-[var(--radius-lg)]', className)}
          style={{ width: width || '100%', height: height || 160 }}
        />
      );
    case 'table-row':
      return (
        <div className={cn('flex items-center gap-3', className)}>
          <div className={cn(base, 'rounded-full shrink-0')} style={{ width: 32, height: 32 }} />
          <div className="flex-1 space-y-2">
            <div className={cn(base, 'h-3.5 w-1/3')} />
            <div className={cn(base, 'h-3 w-2/3')} />
          </div>
        </div>
      );
    case 'rect':
      return (
        <div
          className={cn(base, className)}
          style={{ width: width || '100%', height: height || 48 }}
        />
      );
  }
}
