/**
 * Deliverable doc card: projects a committed catalog slot (rndStore.deliverables)
 * as a markdown doc card. Purely additive — renders nothing until the slot has content.
 * Refreshed automatically by hydrateDeliverableSlots (boot + tab-run confirm).
 */
import { FileText } from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { MarkdownRenderer } from '@/src/components/ui';
import { useRndStore } from '@/src/stores/rndStore';

interface Props {
  productId: string;
  code: string;
  title: string;
}

export function DeliverableDocCard({ productId, code, title }: Props) {
  const slot = useRndStore((s) => (s.deliverables[productId] ?? []).find((d) => d.code === code));
  if (!slot?.content) return null;

  return (
    <Card className="p-7 space-y-4">
      <div className="flex items-center justify-between border-b border-border-subtle pb-4">
        <div className="flex items-center gap-2">
          <FileText size={16} weight="duotone" className="text-accent" />
          <h4 className="font-bold text-text-primary text-base">{slot.title || title}</h4>
        </div>
        <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-bg-secondary text-text-tertiary border border-border-subtle">
          {slot.code}
        </span>
      </div>
      <div className="prose prose-slate prose-sm max-w-none text-text-secondary leading-relaxed font-sans">
        <MarkdownRenderer>{slot.content}</MarkdownRenderer>
      </div>
    </Card>
  );
}
