// Milkdown headless editor (Phase 31, D-01/D-03).
// Contract-compatible with the retired MDXEditor implementation:
// value/onChange/readOnly/placeholder/className/minHeight — the 3 call sites
// (KnowledgeBaseView / ProductKnowledgeTab / PrdDraftDialog) need zero changes.
// Structural ProseMirror base styles only — all chrome is Nova tokens (see
// `.milkdown-editor` in src/index.css). No external theme CSS.
import '@milkdown/kit/prose/view/style/prosemirror.css';
import '@milkdown/kit/prose/gapcursor/style/gapcursor.css';
import '@milkdown/kit/prose/tables/style/tables.css';
import { Editor, rootCtx, editorViewOptionsCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { $prose, replaceAll, getMarkdown } from '@milkdown/kit/utils';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
import { Plugin } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type RefObject,
} from 'react';
import { cn } from '@/src/lib/utils';
import { MarkdownToolbar } from './MarkdownToolbar';

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export interface MarkdownEditorHandle {
  getMarkdown: () => string;
}

/* --- placeholder (empty-doc widget decoration, simplest approach) --- */
function placeholderPlugin(text: string) {
  return $prose(
    () =>
      new Plugin({
        props: {
          decorations(state) {
            const { doc } = state;
            if (doc.childCount > 1 || (doc.firstChild && doc.firstChild.content.size > 0)) {
              return undefined;
            }
            const span = document.createElement('span');
            span.classList.add('milkdown-placeholder');
            span.textContent = text;
            return DecorationSet.create(doc, [
              Decoration.widget(1, span, { side: -1, marks: null }),
            ]);
          },
        },
      }),
  );
}

/* --- editor core (must be inside MilkdownProvider) --- */
interface EditorCoreProps extends MarkdownEditorProps {
  handleRef: RefObject<MarkdownEditorHandle | null>;
}

function EditorCore({ value, onChange, readOnly = false, placeholder, handleRef }: EditorCoreProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = useRef(value);

  const { get } = useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => !readOnly,
            attributes: { class: 'milkdown-doc', spellcheck: 'false' },
          }));
          ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
            lastEmitted.current = markdown;
            onChangeRef.current(markdown);
          });
        })
        .use(placeholder ? placeholderPlugin(placeholder) : [])
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard),
    // ponytail: rebuild only on readOnly/placeholder toggle; onChange rides a ref
    // (research Pattern 1: useEditor deps change = destroy + recreate editor).
    [readOnly, placeholder],
  );

  // External doc swap only (lastEmitted dirty-check prevents onChange->replaceAll loop).
  useEffect(() => {
    if (value !== lastEmitted.current) {
      // flush:true wipes the undo stack — undo must not resurrect the previous doc.
      get()?.action(replaceAll(value, true));
      lastEmitted.current = value;
    }
  }, [value, get]);

  const [, getInstance] = useInstance();
  useImperativeHandle(
    handleRef,
    () => ({
      getMarkdown: () => getInstance()?.action(getMarkdown()) ?? '',
    }),
    [getInstance],
  );

  return <Milkdown />;
}

export const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditorInner(
    { value, onChange, readOnly = false, placeholder, className, minHeight = '320px' },
    ref,
  ) {
    const handleRef = useRef<MarkdownEditorHandle | null>(null);
    useEffect(() => {
      if (typeof ref === 'function') ref(handleRef.current);
      else if (ref) ref.current = handleRef.current;
    }, [ref]);

    return (
      <div
        className={cn(
          'milkdown-editor flex w-full flex-col overflow-hidden border border-border-subtle',
          'rounded-[var(--radius-lg)] bg-bg-primary text-text-primary',
          className,
        )}
        style={{ minHeight } as CSSProperties}
      >
        <MilkdownProvider>
          {!readOnly && <MarkdownToolbar />}
          <div className="milkdown-scroll flex-1 overflow-y-auto px-4 py-3">
            <EditorCore
              handleRef={handleRef}
              value={value}
              onChange={onChange}
              readOnly={readOnly}
              placeholder={placeholder}
            />
          </div>
        </MilkdownProvider>
      </div>
    );
  },
);

MarkdownEditorInner.displayName = 'MarkdownEditorInner';

export default MarkdownEditorInner;
