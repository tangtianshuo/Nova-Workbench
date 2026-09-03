/**
 * Deliverable doc card — dual-source projection (quick-260903-gh0):
 * 1. Slot flow: committed catalog slot (rndStore.deliverables, generate_deliverable) — takes priority.
 * 2. Knowledge fallback: when the slot is empty and knowledgeCategory is given,
 *    the latest knowledge_write archive of that category (rndStore.knowledgeBase).
 * Renders nothing when both are empty.
 * ponytail: card semantics = "latest artifact for this tab"; ProductKnowledgeTab keeps the full list.
 */
import { FileText } from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { MarkdownRenderer } from '@/src/components/ui';
import { getLatestKnowledgeByCategory, useRndStore } from '@/src/stores/rndStore';
import type { ProductKnowledgeItem } from '@/src/data/mockRndData';

interface Props {
  productId: string;
  code: string;
  title: string;
  knowledgeCategory?: ProductKnowledgeItem['category'];
}

export function DeliverableDocCard({ productId, code, title, knowledgeCategory }: Props) {
  const slot = useRndStore((s) => (s.deliverables[productId] ?? []).find((d) => d.code === code));
  const kbItem = useRndStore((s) =>
    !slot?.content && knowledgeCategory
      ? getLatestKnowledgeByCategory(s.knowledgeBase[productId] ?? [], knowledgeCategory)
      : undefined,
  );

  if (slot?.content) {
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

  if (kbItem) {
    return (
      <Card className="p-7 space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <div className="flex items-center gap-2">
            <FileText size={16} weight="duotone" className="text-accent" />
            <h4 className="font-bold text-text-primary text-base">{kbItem.title}</h4>
          </div>
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-bg-secondary text-text-tertiary border border-border-subtle">
            {kbItem.category}
          </span>
        </div>
        <div className="prose prose-slate prose-sm max-w-none text-text-secondary leading-relaxed font-sans">
          <MarkdownRenderer>{kbItem.content}</MarkdownRenderer>
        </div>
      </Card>
    );
  }

  return null;
}
