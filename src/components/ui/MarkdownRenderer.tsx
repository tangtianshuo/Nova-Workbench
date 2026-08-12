import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { cn } from '@/src/lib/utils';

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

// ponytail: remap Tailwind typography's hard-coded slate palette to Nova tokens.
// Typography ships --tw-prose-headings: colors.slate[900] etc. — fixed grayscale
// that doesn't follow .dark. Variables resolve through hsl(var(--text-*)) so they
// flip automatically with theme. github.css (hljs) is also light-only; override
// its colors under .dark to match. Scoped under .markdown-body so non-markdown
// uses of .prose elsewhere stay untouched.
const novaMarkdownTokenStyles = `
  .markdown-body {
    --tw-prose-body: hsl(var(--text-secondary));
    --tw-prose-headings: hsl(var(--text-primary));
    --tw-prose-lead: hsl(var(--text-tertiary));
    --tw-prose-links: hsl(var(--accent));
    --tw-prose-bold: hsl(var(--text-primary));
    --tw-prose-counters: hsl(var(--text-tertiary));
    --tw-prose-bullets: hsl(var(--text-tertiary));
    --tw-prose-hr: hsl(var(--border-secondary));
    --tw-prose-quotes: hsl(var(--text-secondary));
    --tw-prose-quote-borders: hsl(var(--border-secondary));
    --tw-prose-captions: hsl(var(--text-tertiary));
    --tw-prose-kbd: hsl(var(--text-primary));
    --tw-prose-code: hsl(var(--text-primary));
    --tw-prose-pre-code: hsl(var(--text-secondary));
    --tw-prose-pre-bg: hsl(var(--bg-secondary));
    --tw-prose-th-borders: hsl(var(--border-primary));
    --tw-prose-td-borders: hsl(var(--border-secondary));
  }
  .markdown-body pre {
    background: hsl(var(--bg-secondary));
    border: 1px solid hsl(var(--border-secondary));
    border-radius: var(--radius-md);
  }
  .markdown-body pre code.hljs {
    background: transparent;
    padding: 0;
  }
  .dark .markdown-body .hljs { color: #c9d1d9; background: transparent; }
  .dark .markdown-body .hljs-doctag,
  .dark .markdown-body .hljs-keyword,
  .dark .markdown-body .hljs-meta .hljs-keyword,
  .dark .markdown-body .hljs-template-tag,
  .dark .markdown-body .hljs-template-variable,
  .dark .markdown-body .hljs-type,
  .dark .markdown-body .hljs-variable.language_ { color: #ff7b72; }
  .dark .markdown-body .hljs-title,
  .dark .markdown-body .hljs-title.class_,
  .dark .markdown-body .hljs-title.class_.inverted__,
  .dark .markdown-body .hljs-title.function_ { color: #d2a8ff; }
  .dark .markdown-body .hljs-attr,
  .dark .markdown-body .hljs-attribute,
  .dark .markdown-body .hljs-literal,
  .dark .markdown-body .hljs-meta,
  .dark .markdown-body .hljs-number,
  .dark .markdown-body .hljs-operator,
  .dark .markdown-body .hljs-variable,
  .dark .markdown-body .hljs-selector-attr,
  .dark .markdown-body .hljs-selector-class,
  .dark .markdown-body .hljs-selector-id { color: #79c0ff; }
  .dark .markdown-body .hljs-regexp,
  .dark .markdown-body .hljs-string,
  .dark .markdown-body .hljs-meta .hljs-string { color: #a5d6ff; }
  .dark .markdown-body .hljs-built_in,
  .dark .markdown-body .hljs-symbol { color: #ffa657; }
  .dark .markdown-body .hljs-comment,
  .dark .markdown-body .hljs-code,
  .dark .markdown-body .hljs-formula { color: #8b949e; }
`;

// ponytail: single source for read-only markdown rendering. Adds GFM (tables,
// task lists, strikethrough) and rehype-highlight (code syntax colors) so every
// preview surface — KnowledgeBaseView, ProductKnowledgeTab, modals — renders
// identically. Previously each call site imported react-markdown separately
// and forgot either remark-gfm or syntax highlighting.
export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  return (
    <div className={cn('markdown-body prose prose-sm max-w-none', className)}>
      <style>{novaMarkdownTokenStyles}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
