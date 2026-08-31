/**
 * Phase 26 (26-03) — shared per-tab run panel (26-UI-SPEC §Component Contracts 1).
 * Renders the tab's latest tabRunStore record: status badge + step one-liner +
 * elapsed, collapsible event list, cancel, global-confirmation-queue link, retry.
 * Visual/copy contract: .planning/phases/26-mock-tab/26-UI-SPEC.md (locked).
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CaretDown, CheckCircle, CircleNotch } from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Tooltip } from '@/src/components/ui/Tooltip';
import { cn } from '@/src/lib/utils';
import { useTabRunStore, ACTIVE, type TabRunRecord } from '@/src/stores/tabRunStore';
import { useUIStore } from '@/src/stores/uiStore';

interface Props {
  tabId: string;
  className?: string;
}

const SPRING = { type: 'spring' as const, stiffness: 350, damping: 30 };

function formatElapsed(from: number): string {
  const s = Math.max(0, Math.floor((Date.now() - from) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

function summaryCopy(run: TabRunRecord): string {
  switch (run.status) {
    case 'queued':
      return '排队中…';
    case 'running':
      return `正在生成… ${run.currentStep}`;
    case 'waiting-for-confirmation':
      return '等待确认 — 产物待你确认后落槽';
    case 'done':
      return `生成完成 — ${run.candidateCount} 份候选已提交确认`;
    case 'cancelled':
      return '已取消 — 已确认落槽的产物保留，未确认候选已作废';
    case 'error':
      return `生成失败：${(run.error ?? '未知错误').slice(0, 80)}。可重试；若持续失败请检查引擎日志后重试。`;
  }
}

function StatusBadge({ run }: { run: TabRunRecord }) {
  switch (run.status) {
    case 'waiting-for-confirmation':
      return <Badge variant="warning">等待确认</Badge>;
    case 'done':
      return (
        <span className="flex items-center gap-1.5">
          <CheckCircle size={14} weight="duotone" className="text-success" />
          <Badge variant="success">完成</Badge>
        </span>
      );
    case 'error':
      return <Badge variant="danger">失败</Badge>;
    case 'cancelled':
      return <Badge variant="neutral">已取消</Badge>;
    case 'queued':
    case 'running':
    default:
      return (
        <span className="flex items-center gap-1.5">
          <CircleNotch
            size={12}
            weight="bold"
            className={cn('animate-spin', run.status === 'queued' ? 'text-text-tertiary' : 'text-accent')}
          />
          <Badge variant={run.status === 'queued' ? 'neutral' : 'accent'}>
            {run.status === 'queued' ? '排队中' : '运行中'}
          </Badge>
        </span>
      );
  }
}

export function TabRunPanel({ tabId, className }: Props) {
  const runId = useTabRunStore((s) => s.runsByTab[tabId]);
  const runs = useTabRunStore((s) => s.runs);
  const cancelTabRun = useTabRunStore((s) => s.cancelTabRun);
  const startTabRun = useTabRunStore((s) => s.startTabRun);

  // runsByTab drops the entry when the run settles; fall back to the latest
  // record for this tab so the collapsed summary row survives until cleared.
  const run =
    (runId ? runs[runId] : undefined) ??
    Object.values(runs)
      .filter((r) => r.tabId === tabId)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ??
    null;

  const isActive = !!run && ACTIVE.includes(run.status);
  const [expanded, setExpanded] = useState(true);
  const [, forceTick] = useState(0);

  // Per-second elapsed refresh while a run is active.
  useEffect(() => {
    if (!isActive) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isActive, run?.runId]);

  // Auto-expand on run start; auto-collapse ~2s after done/error.
  useEffect(() => {
    if (!run) return;
    if (ACTIVE.includes(run.status)) {
      setExpanded(true);
      return;
    }
    const t = setTimeout(() => setExpanded(false), 2000);
    return () => clearTimeout(t);
  }, [run?.status, run?.runId]);

  if (!run) return null;

  const handleRetry = () => {
    startTabRun({
      tabId: run.tabId,
      kind: run.kind,
      productId: run.productId,
      userMessage: run.userMessage,
      coreContext: run.coreContext,
    });
  };

  return (
    <Card
      variant="default"
      className={cn('p-4 rounded-[var(--radius-lg)] shadow-sm space-y-2', className)}
    >
      {/* Summary row */}
      <div className="flex items-center gap-2 min-w-0">
        <StatusBadge run={run} />
        <span
          className={cn(
            'flex-1 min-w-0 truncate text-sm',
            run.status === 'error' ? 'text-danger' : 'text-text-secondary',
          )}
          title={summaryCopy(run)}
        >
          {summaryCopy(run)}
        </span>
        {isActive && (
          <span className="text-xs text-text-tertiary tabular-nums shrink-0">
            {formatElapsed(run.startedAt)}
          </span>
        )}
        {run.status === 'error' && (
          <Button variant="primary" size="sm" onClick={handleRetry} className="shrink-0">
            重试
          </Button>
        )}
        {isActive && (
          <Tooltip content="已确认落槽的产物会保留">
            <Button
              variant="danger"
              size="sm"
              className="shrink-0"
              onClick={() => void cancelTabRun(run.runId)}
            >
              取消生成
            </Button>
          </Tooltip>
        )}
        {run.status === 'waiting-for-confirmation' && (
          <Button
            variant="link"
            size="sm"
            className="shrink-0"
            onClick={() => useUIStore.getState().setActiveTab('agent')}
          >
            打开确认队列
          </Button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 p-1 text-text-tertiary hover:text-text-secondary transition-transform"
          aria-label={expanded ? '收起事件列表' : '展开事件列表'}
        >
          <CaretDown
            size={14}
            weight="duotone"
            className={cn('transition-transform', expanded && 'rotate-180')}
          />
        </button>
      </div>

      {/* Indeterminate progress while running */}
      {run.status === 'running' && <ProgressBar value={0} indeterminate variant="accent" />}

      {/* Event list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <div className="max-h-48 overflow-y-auto rounded-[var(--radius-sm)] border border-border-subtle">
              {run.events.length === 0 ? (
                <div className="px-3 py-2 text-sm text-text-tertiary bg-bg-secondary">暂无事件</div>
              ) : (
                run.events.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1 bg-bg-tertiary/50 border-b border-border-subtle last:border-b-0"
                  >
                    <span className="text-xs font-mono text-text-tertiary shrink-0 tabular-nums">
                      {new Date(ev.ts).toLocaleTimeString('zh-CN', { hour12: false })}
                    </span>
                    <span className="text-sm text-text-secondary shrink-0">{ev.kind}</span>
                    {ev.name && <span className="text-sm text-text-primary truncate">{ev.name}</span>}
                    {ev.summary && (
                      <span className="text-sm text-text-tertiary truncate flex-1">{ev.summary}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
