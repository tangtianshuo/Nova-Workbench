/**
 * Phase 31 (31-04, slimmed 31-06 D-10) — doc workspace body: confirm card
 * (top) + Milkdown editor with 800ms debounced autosave (UI-SPEC §3). No doc
 * list inside the panel — main-workspace entries (knowledge view / product
 * knowledge tab) own discovery; the panel is preview + edit only.
 */
import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { cn } from '@/src/lib/utils';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';
import { WorkspaceConfirmCard } from './WorkspaceConfirmCard';
import { useDocWorkspaceStore } from '@/src/stores/docWorkspaceStore';
import { useUIStore } from '@/src/stores/uiStore';

const SAVE_DEBOUNCE_MS = 800;

export function DocWorkspaceContent() {
  const docs = useDocWorkspaceStore((s) => s.docs);
  const openDocIds = useDocWorkspaceStore((s) => s.openDocIds);
  const activeDocId = useDocWorkspaceStore((s) => s.activeDocId);
  const setActiveDoc = useDocWorkspaceStore((s) => s.setActiveDoc);
  const closeDoc = useDocWorkspaceStore((s) => s.closeDoc);
  const zen = useUIStore((s) => s.docZenMode);
  const saveStatus = useDocWorkspaceStore((s) => s.saveStatus);
  const lastError = useDocWorkspaceStore((s) => s.lastError);
  const loadDocs = useDocWorkspaceStore((s) => s.loadDocs);
  const saveDoc = useDocWorkspaceStore((s) => s.saveDoc);
  const setSaveStatus = useDocWorkspaceStore((s) => s.setSaveStatus);

  const [content, setContent] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sync mirrors (assigned in render) so imperative paths read latest values.
  const saveStatusRef = useRef(saveStatus);
  saveStatusRef.current = saveStatus;
  const contentRef = useRef(content);
  contentRef.current = content;

  const currentDoc = docs.find((d) => d.docId === activeDocId) ?? null;

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // Adopt store content when doc changes OR when a not-yet-adopted version
  // arrives (first-open race: loadDocs() async, docs=[] at first click — D-14).
  // Skip while editing: a save round-trip bumps version; adopting would clobber.
  useEffect(() => {
    if (saveStatusRef.current === 'editing') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setContent(currentDoc?.content ?? '');
  }, [activeDocId, currentDoc?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // "已保存" fades back to idle after 2s.
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = setTimeout(() => setSaveStatus('idle'), 2000);
    return () => clearTimeout(t);
  }, [saveStatus, setSaveStatus]);

  // Explicit docId: flush needs to save the OLD tab, not the (new) active one.
  const doSave = (docId: string, value: string) => {
    if (!docId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    void saveDoc(docId, value);
  };

  const handleChange = (value: string) => {
    setContent(value);
    setSaveStatus('editing');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (activeDocId) timerRef.current = setTimeout(() => doSave(activeDocId, value), SAVE_DEBOUNCE_MS);
  };

  // D-16: flush a pending debounced edit immediately (tab switch/close must not
  // lose the last ≤800ms of typing). Call BEFORE changing activeDocId.
  const flushPendingSave = () => {
    const s = useDocWorkspaceStore.getState();
    if (s.saveStatus === 'editing' && s.activeDocId) {
      if (timerRef.current) clearTimeout(timerRef.current);
      void saveDoc(s.activeDocId, contentRef.current);
    }
  };

  // Blur-to-save (window blur covers editor blur in the panel).
  useEffect(() => {
    const onBlur = () => {
      const s = useDocWorkspaceStore.getState();
      if (s.saveStatus === 'editing' && s.activeDocId) doSave(s.activeDocId, contentRef.current);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WorkspaceConfirmCard />

      {/* Tab bar (D-15): hidden in zen mode and for a single open doc. */}
      {openDocIds.length > 1 && !zen && (
        <div className="flex items-center gap-0.5 px-2 h-8 shrink-0 overflow-x-auto border-b border-border-subtle bg-bg-secondary">
          {openDocIds.map((id) => {
            const title = docs.find((d) => d.docId === id)?.title ?? id;
            const isActive = id === activeDocId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  flushPendingSave();
                  setActiveDoc(id);
                }}
                className={cn(
                  'flex items-center gap-1 max-w-[160px] px-2 h-full shrink-0 text-xs truncate',
                  isActive
                    ? 'text-text-primary border-b-2 border-accent'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <span className="truncate">{title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={'关闭 ' + title}
                  onClick={(e) => {
                    e.stopPropagation();
                    flushPendingSave();
                    closeDoc(id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      flushPendingSave();
                      closeDoc(id);
                    }
                  }}
                  className="flex items-center text-text-tertiary hover:text-danger shrink-0"
                >
                  <X size={12} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Editor (flex-1) + save status in toolbar row */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-end px-3 h-6 shrink-0">
          {activeDocId && (
            <SaveStatusIndicator
              status={saveStatus}
              error={lastError}
              onRetry={() => doSave(activeDocId, contentRef.current)}
            />
          )}
        </div>
        {activeDocId ? (
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <MarkdownEditor
              value={content}
              onChange={handleChange}
              placeholder="开始书写…"
              minHeight="100%"
              className="min-h-full"
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-sm text-text-tertiary text-center">
              在主工作区点击文档打开，或在知识库新建笔记
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveStatusIndicator({
  status,
  error,
  onRetry,
}: {
  status: ReturnType<typeof useDocWorkspaceStore.getState>['saveStatus'];
  error: string | null;
  onRetry: () => void;
}) {
  if (status === 'error') {
    return (
      <span className="text-xs text-danger flex items-center gap-1">
        保存失败:{error ?? '未知错误'}。内容仍在编辑器中,可重试;若持续失败请重启应用后重试。
        <button type="button" onClick={onRetry} className="text-danger hover:underline">
          重试
        </button>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'text-xs text-text-tertiary transition-opacity duration-fast',
        status === 'saved' && 'text-success'
      )}
    >
      {status === 'editing' ? '编辑中…' : status === 'saving' ? '保存中…' : status === 'saved' ? '已保存' : ''}
    </span>
  );
}
