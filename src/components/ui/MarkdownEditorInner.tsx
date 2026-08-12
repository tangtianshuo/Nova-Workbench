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
  /* ponytail: same prose-token remap as MarkdownRenderer. Selector MUST cover
   * .prose itself, not just .mdxeditor — typography sets the prose CSS vars on
   * the contentEditable element (it carries the prose class), overriding
   * anything inherited from .mdxeditor. Without the .prose target, headings
   * stay slate-900 even in dark mode. */
  .nova-markdown-editor .mdxeditor,
  .nova-markdown-editor .mdxeditor .prose {
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
  /* ponytail: CodeMirror 6 ships its own light theme (white bg + dark text)
   * baked into a generated class (ͼ1) via EditorView.theme. It ignores Nova
   * tokens, so it stays white-on-dark in dark mode. Override within the editor
   * scope so it follows .dark via hsl(var(--*)). No syntax highlighting is
   * attached by default, so only base chrome needs overriding. */
  .nova-markdown-editor .cm-editor {
    background: hsl(var(--bg-secondary));
    color: hsl(var(--text-primary));
    border: 1px solid hsl(var(--border-secondary));
    border-radius: var(--radius-md);
  }
  .nova-markdown-editor .cm-gutters {
    background: hsl(var(--bg-secondary));
    border-right: 1px solid hsl(var(--border-secondary));
    color: hsl(var(--text-tertiary));
  }
  .nova-markdown-editor .cm-activeLine,
  .nova-markdown-editor .cm-activeLineGutter {
    background-color: hsl(var(--bg-tertiary) / 0.5);
  }
  .nova-markdown-editor .cm-cursor {
    border-left-color: hsl(var(--accent));
  }
  .nova-markdown-editor .cm-selectionBackground {
    background-color: hsl(var(--accent) / 0.25);
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
        // ponytail: markdownShortcutPlugin MUST be registered AFTER headings/lists/
        // quote/link/codeblock — its init reads activePlugins$ to decide which
        // transformers to wire up, and plugins init in array order. Putting it
        // before codeBlockPlugin leaves "codeblock" absent from activePlugins$
        // at init time, so the ``` shortcut transformer is silently skipped.
        headingsPlugin(),
        listsPlugin(),
        tablePlugin(),
        linkPlugin(),
        quotePlugin(),
        codeBlockPlugin(),
        codeMirrorPlugin({
          codeBlockLanguages: {
            js: 'JavaScript',
            ts: 'TypeScript',
            rust: 'Rust',
            bash: 'Bash',
            text: 'Plain Text',
          },
          // ponytail: lazy-load CodeMirror grammar per language via @codemirror/language-data.
          // Vite code-splits each @codemirror/lang-* into its own chunk; Tauri bundles them
          // all into dist/ so this stays offline-capable. Adding bundle-time grammar for
          // every language upfront would bloat the editor chunk for a feature most docs
          // never touch.
          autoLoadLanguageSupport: true,
        }),
        markdownShortcutPlugin(),
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
            'prose prose-sm max-w-none min-h-[240px] bg-bg-primary text-text-primary font-sans leading-relaxed',
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
