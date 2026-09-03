/**
 * Phase 31 (31-04) — confirmation card, third host (D-07).
 * Renders chatConsoleStore's pendingConfirmation (KnowledgeWrite candidate)
 * inside the doc workspace; actions call the SAME store actions as
 * AgentConsole — chatConsoleStore is the single source of truth (unchanged).
 */
import { useEffect, useState } from 'react';
import { Card, Button } from '@/src/components/ui';
import { selectPendingCount } from '@/src/ai/pendingCount';
import { useChatConsoleStore } from '@/src/stores/chatConsoleStore';
import { useTabRunStore } from '@/src/stores/tabRunStore';
import { useUIStore } from '@/src/stores/uiStore';

/** Total pending minus the KnowledgeWrite card itself (Sidebar pattern). */
function useOtherPendingCount(hasKnowledgeCard: boolean): number {
  const read = () =>
    selectPendingCount(
      useChatConsoleStore.getState(),
      useTabRunStore.getState().pendingDeliverables,
    ) - (useChatConsoleStore.getState().pendingConfirmation !== null ? 1 : 0);
  const [count, setCount] = useState(read);
  useEffect(() => {
    setCount(read());
    const unsubConsole = useChatConsoleStore.subscribe(() => setCount(read()));
    const unsubTabRun = useTabRunStore.subscribe(() => setCount(read()));
    return () => {
      unsubConsole();
      unsubTabRun();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKnowledgeCard]);
  return count;
}

export function WorkspaceConfirmCard() {
  const candidate = useChatConsoleStore((s) => s.pendingConfirmation);
  const confirmKnowledgeWrite = useChatConsoleStore((s) => s.confirmKnowledgeWrite);
  const rejectKnowledgeWrite = useChatConsoleStore((s) => s.rejectKnowledgeWrite);
  const loading = useChatConsoleStore((s) => s.loading);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  const otherCount = useOtherPendingCount(candidate !== null);
  if (!candidate && otherCount === 0) return null;

  return (
    <div className="px-3 pt-3 shrink-0 space-y-1">
      {candidate && (
        <Card variant="elevated" className="border-l-2 border-l-warning p-3 space-y-1.5">
          <div className="text-sm font-semibold text-text-primary truncate">
            确认 AI 写入：{candidate.title}？
          </div>
          <div className="text-xs text-text-secondary truncate">
            AI 生成了新的文档内容，确认后写入知识库。
          </div>
          <div className="flex gap-2 pt-0.5">
            <Button variant="primary" size="sm" disabled={loading} onClick={() => void confirmKnowledgeWrite()}>
              确认写入
            </Button>
            <Button variant="secondary" size="sm" disabled={loading} onClick={() => void rejectKnowledgeWrite()}>
              拒绝
            </Button>
          </div>
        </Card>
      )}
      {otherCount > 0 && (
        <button
          type="button"
          onClick={() => setActiveTab('agent')}
          className="text-xs text-warning hover:underline"
        >
          另有 {otherCount} 项待确认 — 打开 AI 台
        </button>
      )}
    </div>
  );
}
