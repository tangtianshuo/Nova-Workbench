/**
 * Phase 27 (27-03) — global queue slim entry card (D-09): the queue stays the
 * HITL visibility home, but the batch is confirmed inside FileArchiveView's
 * aggregate view. Clicking navigates there and expands it.
 */
import { motion, AnimatePresence } from 'motion/react';
import { Stack } from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { useIngestionStore } from '@/src/stores/ingestionStore';
import { useUIStore } from '@/src/stores/uiStore';

export function IngestionBatchCard() {
  const batchCandidate = useIngestionStore((s) => s.batchCandidate);
  const count = useIngestionStore((s) => s.batchItems.length);
  const setAggregateExpanded = useIngestionStore((s) => s.setAggregateExpanded);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  return (
    <AnimatePresence>
      {batchCandidate && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-6 right-6 z-40"
        >
          <Card
            variant="elevated"
            className="px-4 py-2.5 cursor-pointer shadow-lg flex items-center gap-2.5 hover:border-accent/40 transition-colors"
            onClick={() => {
              setActiveTab('files');
              setAggregateExpanded(true);
            }}
          >
            <Stack size={16} weight="duotone" className="text-accent shrink-0" />
            <span className="text-xs font-medium text-text-primary">摄取批次待确认（{count} 项）</span>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
