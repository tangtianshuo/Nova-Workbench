import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
  CreateLink,
  headingsPlugin,
  InsertTable,
  InsertCodeBlock,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  toolbarPlugin,
  UndoRedo,
  type MDXEditorMethods,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { forwardRef, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { cn } from '@/src/lib/utils';

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export type MarkdownEditorHandle = MDXEditorMethods;

const novaEditorTokenStyles = `
  .nova-markdown-editor .mdxeditor {
    --basePageBg: hsl(var(--bg-primary));
    --baseBase: hsl(var(--bg-secondary));
    --baseBgSubtle: hsl(var(--bg-secondary));
    --baseBg: hsl(var(--bg-primary));
    --baseBgHover: hsl(var(--bg-tertiary));
    --baseBgActive: hsl(var(--bg-tertiary));
    --baseLine: hsl(var(--border-secondary));
    --baseBorder: hsl(var(--border-secondary));
    --baseBorderHover: hsl(var(--border-primary));
    --baseText: hsl(var(--text-primary));
    --baseTextContrast: hsl(var(--text-primary));
    --accentBase: hsl(var(--accent-subtle));
    --accentBg: hsl(var(--accent-subtle));
    --accentBgHover: hsl(var(--accent-muted));
    --accentBorder: hsl(var(--accent));
    --accentText: hsl(var(--accent));
    --accentTextContrast: hsl(var(--text-inverted));
  }
`;

export const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditorInner(
    { value, onChange, readOnly = false, placeholder, className, minHeight = '320px' },
    ref,
  ) {
    const editorRef = useRef<MarkdownEditorHandle | null>(null);

    useEffect(() => {
      const editor = editorRef.current;
      if (editor && editor.getMarkdown() !== value) {
        editor.setMarkdown(value);
      }
    }, [value]);

    const plugins = useMemo(
      () => [
        ...(readOnly
          ? []
          : [
              toolbarPlugin({
                toolbarContents: () => (
                  <>
                    <UndoRedo />
                    <BlockTypeSelect />
                    <BoldItalicUnderlineToggles />
                    <ListsToggle />
                    <CreateLink />
                    <InsertTable />
                    <InsertCodeBlock />
                  </>
                ),
              }),
            ]),
        headingsPlugin(),
        listsPlugin(),
        tablePlugin(),
        linkPlugin(),
        quotePlugin(),
        markdownShortcutPlugin(),
        codeBlockPlugin(),
        codeMirrorPlugin({
          codeBlockLanguages: {
            js: 'JavaScript',
            ts: 'TypeScript',
            rust: 'Rust',
            bash: 'Bash',
            text: 'Plain Text',
          },
          // Keep code blocks editable without eagerly loading every language grammar.
          autoLoadLanguageSupport: false,
        }),
      ],
      [readOnly],
    );

    return (
      <div
        className={cn(
          'nova-markdown-editor w-full overflow-hidden border border-border-subtle',
          'rounded-[var(--radius-lg)] bg-bg-primary text-text-primary',
          className,
        )}
        style={{ minHeight } as CSSProperties}
      >
        <style>{novaEditorTokenStyles}</style>
        <MDXEditor
          ref={(instance) => {
            editorRef.current = instance;
            if (typeof ref === 'function') {
              ref(instance);
            } else if (ref) {
              ref.current = instance;
            }
          }}
          markdown={value}
          onChange={onChange}
          readOnly={readOnly}
          placeholder={placeholder}
          contentEditableClassName={cn(
            'min-h-[240px] bg-bg-primary text-text-primary font-sans leading-relaxed',
            'focus:outline-none',
          )}
          plugins={plugins}
          className="mdxeditor-full-height w-full bg-bg-primary text-text-primary"
        />
      </div>
    );
  },
);

MarkdownEditorInner.displayName = 'MarkdownEditorInner';

export default MarkdownEditorInner;
