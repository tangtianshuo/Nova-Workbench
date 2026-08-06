import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/src/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
  label?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, error, label, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-9 px-3 text-sm rounded-[var(--radius-md)]',
              'bg-bg-input border text-text-primary',
              'placeholder:text-text-placeholder',
              'transition-colors duration-fast',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              icon && 'pl-9',
              error
                ? 'border-danger focus:ring-danger/20 focus:border-danger'
                : 'border-border hover:border-text-tertiary/30',
              className
            )}
            {...props}
          />
        </div>
        {(helperText || error) && (
          <p className={cn('text-xs', error ? 'text-danger' : 'text-text-tertiary')}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

/* Textarea variant */
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            'w-full min-h-[80px] px-3 py-2 text-sm rounded-[var(--radius-md)] resize-y',
            'bg-bg-input border text-text-primary',
            'placeholder:text-text-placeholder',
            'transition-colors duration-fast',
            'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-danger focus:ring-danger/20 focus:border-danger'
              : 'border-border hover:border-text-tertiary/30',
            className
          )}
          {...props}
        />
        {(helperText || error) && (
          <p className={cn('text-xs', error ? 'text-danger' : 'text-text-tertiary')}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
