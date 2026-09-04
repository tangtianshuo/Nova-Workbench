/**
 * Phase 32 (32-04, CODE-02) — diff approval card, fourth confirmation host.
 * Renders the head of chatConsoleStore's pendingCodeEdits queue with a
 * lazy-loaded react-diff-view body (297KB chunk lesson); tail counts into the
 * 「另有 N 张待审」 badge (MP-1). Actions call the SAME store actions as
 * AgentConsole — chatConsoleStore is the single source of truth.
 */
import { useState } from 'react';
import React from 'react';
import { Bookmarks } from '@phosphor-icons/react';
import { Badge, Button, Card, Skeleton } from '@/src/components/ui';
import { useChatConsoleStore, type CodeEditCardProps } from '@/src/stores/chatConsoleStore';
import { cn } from '@/src/lib/utils';

// Lazy-only consumption (acceptance: no direct UI import of DiffBody).
const DiffBody = React.lazy(() => import('./DiffBody'));

export function CodeEditConfirmCard({ candidate, queueCount }: CodeEditCardProps) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');
  const busy = useChatConsoleStore((s) => s.codeEditBusy);
  const loading = useChatConsoleStore((s) => s.loading);
  const confirmCodeEdit = useChatConsoleStore((s) => s.confirmCodeEdit);
  const rejectCodeEdit = useChatConsoleStore((s) => s.rejectCodeEdit);
  const depositCodeEditSummary = useChatConsoleStore((s) => s.depositCodeEditSummary);
  const disabled = busy || loading;

  return (
    <Card variant="elevated" className="space-y-2 border-l-2 border-l-warning p-3">
      <div className="flex items-center gap-2">
        <Badge variant="warning">代码修改</Badge>
        <span className="truncate font-mono text-xs text-text-secondary" title={candidate.path}>
          {candidate.path}
        </span>
      </div>
      <React.Suspense fallback={<Skeleton variant="rect" height={64} />}>
        {candidate.diffText ? (
          <DiffBody unifiedText={candidate.diffText} />
        ) : (
          // CP-2: diff text is a live-only display field — restored rows fall
          // back to old/new excerpts.
          <div className="space-y-1 font-mono text-xs leading-relaxed">
            {candidate.oldString && (
              <pre className={cn('overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-danger/10 px-2 py-1 text-text-primary')}>
                {candidate.oldString.slice(0, 1500)}
              </pre>
            )}
            {candidate.newString && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-success/10 px-2 py-1 text-text-primary">
                {candidate.newString.slice(0, 1500)}
              </pre>
            )}
          </div>
        )}
      </React.Suspense>
      {showReason && (
        <div className="space-y-1.5">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="告诉 agent 怎么改（可选）"
            rows={2}
            aria-label="拒绝原因"
            className={cn(
              'w-full resize-none px-3 py-2 text-sm leading-5',
              'rounded-[var(--radius-md)] border border-border bg-bg-input text-text-primary',
              'placeholder:text-text-placeholder outline-none transition-colors',
              'focus:border-accent focus:ring-2 focus:ring-accent/20',
            )}
          />
          <p className="text-xs text-text-tertiary">该文件不会落盘，agent 会根据原因调整重试。</p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={disabled} onClick={() => { void rejectCodeEdit(reason); }}>
              拒绝并说明
            </Button>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => { void rejectCodeEdit(); }}>
              直接拒绝
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={disabled} onClick={() => void confirmCodeEdit()}>
          应用改动
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setShowReason(true)}>
          拒绝
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => void depositCodeEditSummary()}
          title="作为知识候选存入第二大脑（仍需确认）"
        >
          <Bookmarks size={16} weight="duotone" />
          沉淀改动摘要
        </Button>
        {queueCount > 0 && (
          <Badge variant="warning">另有 {queueCount} 张待审</Badge>
        )}
      </div>
    </Card>
  );
}
