/**
 * Phase 31 (31-04, slimmed 31-06 D-10) — doc workspace body: confirm card
 * (top) + Milkdown editor with 800ms debounced autosave (UI-SPEC §3). No doc
 * list inside the panel — main-workspace entries (knowledge view / product
 * knowledge tab) own discovery; the panel is preview + edit only.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/src/lib/utils';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';
import { WorkspaceConfirmCard } from './WorkspaceConfirmCard';
import { useDocWorkspaceStore } from '@/src/stores/docWorkspaceStore';

const SAVE_DEBOUNCE_MS = 800;

export function DocWorkspaceContent() {
  const docs = useDocWorkspaceStore((s) => s.docs);
  const currentDocId = useDocWorkspaceStore((s) => s.currentDocId);
  const saveStatus = useDocWorkspaceStore((s) => s.saveStatus);
  const lastError = useDocWorkspaceStore((s) => s.lastError);
  const loadDocs = useDocWorkspaceStore((s) => s.loadDocs);
  const saveDoc = useDocWorkspaceStore((s) => s.saveDoc);
  const setSaveStatus = useDocWorkspaceStore((s) => s.setSaveStatus);

  const [content, setContent] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentDoc = docs.find((d) => d.docId === currentDocId) ?? null;

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // Switching docs: adopt store content, cancel any pending debounce.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setContent(currentDoc?.content ?? '');
  }, [currentDocId]); // eslint-disable-line react-hooks/exhaustive-deps

  // "已保存" fades back to idle after 2s.
  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const t = setTimeout(() => setSaveStatus('idle'), 2000);
    return () => clearTimeout(t);
  }, [saveStatus, setSaveStatus]);

  const doSave = (value: string) => {
    if (!currentDocId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    void saveDoc(currentDocId, value);
  };

  const handleChange = (value: string) => {
    setContent(value);
    setSaveStatus('editing');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSave(value), SAVE_DEBOUNCE_MS);
  };

  // Blur-to-save (window blur covers editor blur in the panel).
  useEffect(() => {
    const onBlur = () => {
      const s = useDocWorkspaceStore.getState();
      if (s.saveStatus === 'editing' && s.currentDocId) doSave(content);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <WorkspaceConfirmCard />

      {/* Editor (flex-1) + save status in toolbar row */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-end px-3 h-6 shrink-0">
          {currentDocId && (
            <SaveStatusIndicator
              status={saveStatus}
              error={lastError}
              onRetry={() => doSave(content)}
            />
          )}
        </div>
        {currentDocId ? (
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
