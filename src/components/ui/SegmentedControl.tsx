import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface Segment {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps {
  segments: Segment[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Apple-style segmented control with spring-animated sliding indicator.
 * Uses motion layoutId for buttery smooth transitions.
 */
export function SegmentedControl({
  segments,
  value,
  onChange,
  className,
  size = 'md',
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center bg-bg-secondary rounded-[var(--radius-md)] relative',
        size === 'sm' ? 'p-0.5 gap-0' : 'p-1 gap-0.5',
        className
      )}
    >
      {segments.map((segment) => {
        const isActive = segment.id === value;
        return (
          <button
            key={segment.id}
            onClick={() => onChange(segment.id)}
            className={cn(
              'relative z-10 flex items-center justify-center gap-1.5 cursor-pointer',
              'text-sm font-medium whitespace-nowrap transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 rounded-[var(--radius-sm)]',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5',
              isActive ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
            )}
          >
            {segment.icon}
            <span>{segment.label}</span>
            {isActive && (
              <motion.div
                layoutId="segmented-indicator"
                className="absolute inset-0 bg-bg-primary rounded-[var(--radius-sm)] shadow-shadow-xs"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{ zIndex: -1 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
