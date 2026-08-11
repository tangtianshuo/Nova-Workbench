import { forwardRef, lazy, Suspense } from 'react';
import { cn } from '@/src/lib/utils';
import { Skeleton } from './Skeleton';
import type { MarkdownEditorHandle, MarkdownEditorProps } from './MarkdownEditorInner';

const MarkdownEditorInner = lazy(() => import('./MarkdownEditorInner'));

export type { MarkdownEditorHandle, MarkdownEditorProps } from './MarkdownEditorInner';

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    { value, onChange, readOnly = false, placeholder, className, minHeight = '320px' },
    ref,
  ) {
    return (
      <Suspense
        fallback={
          <Skeleton
            variant="rect"
            className={cn(
              'w-full border border-border-subtle rounded-[var(--radius-lg)]',
              className,
            )}
            height={minHeight}
          />
        }
      >
        <MarkdownEditorInner
          ref={ref}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          placeholder={placeholder}
          className={className}
          minHeight={minHeight}
        />
      </Suspense>
    );
  },
);

MarkdownEditor.displayName = 'MarkdownEditor';
