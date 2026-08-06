import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/src/lib/utils';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: Size;
}

const sizeStyles: Record<Size, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-md',
  xl: 'w-16 h-16 text-xl',
};

/* Generate a consistent color from a string */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 55%, 55%)`;
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = 'md', ...props }, ref) => {
    const initials = fallback
      ? fallback.slice(0, 2).toUpperCase()
      : alt?.slice(0, 1).toUpperCase() || '?';

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center',
          'rounded-full overflow-hidden shrink-0',
          'font-semibold select-none',
          sizeStyles[size],
          !src && 'bg-bg-tertiary text-text-secondary',
          className
        )}
        style={!src ? { backgroundColor: stringToColor(fallback || alt || '') + '20', color: stringToColor(fallback || alt || '') } : undefined}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt={alt || ''}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';

/* Avatar group */
interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  max?: number;
}

export function AvatarGroup({
  className,
  children,
  max = 4,
  ...props
}: AvatarGroupProps) {
  const childArray = Array.isArray(children) ? children : [children];
  const visible = childArray.slice(0, max);
  const remaining = childArray.length - max;

  return (
    <div className={cn('flex items-center -space-x-2', className)} {...props}>
      {visible}
      {remaining > 0 && (
        <div className="w-7 h-7 rounded-full bg-bg-secondary border border-border-subtle flex items-center justify-center text-xs text-text-tertiary font-medium">
          +{remaining}
        </div>
      )}
    </div>
  );
}
