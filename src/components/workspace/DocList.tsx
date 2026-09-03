/**
 * Phase 31 (31-04) — doc workspace list: three-filter SegmentedControl
 * (AI 产出 / 笔记 / 最近), grouped by product, per UI-SPEC §2.
 */
import { useMemo, useState } from 'react';
import { NotePencil, Plus } from '@phosphor-icons/react';
import { cn } from '@/src/lib/utils';
import { Badge, Button, SegmentedControl } from '@/src/components/ui';
import { useDocWorkspaceStore, GLOBAL_OWNER } from '@/src/stores/docWorkspaceStore';
import { useProductStore } from '@/src/stores/productStore';
import type { KnowledgeDoc } from '@/src/ai/knowledgeRepo';

type Filter = 'ai' | 'note' | 'recent';

const FILTERS = [
  { id: 'ai', label: 'AI 产出' },
  { id: 'note', label: '笔记' },
  { id: 'recent', label: '最近' },
] as const;

const EMPTY_COPY: Record<Filter, string> = {
  ai: '还没有 AI 产出文档。在研发中心生成后，可在这里打开修改。',
  note: '还没有笔记。点击「新建笔记」，随手记录想法。',
  recent: '暂无最近打开的文档',
};

/** Non-markdown sources (e.g. ingested .docx/.pdf) — listed but not editable in v1. */
const NON_MD_EXT = /\.(docx?|pdf|pptx?|xlsx?)$/i;
const isMarkdownDoc = (doc: KnowledgeDoc) => !NON_MD_EXT.test(doc.title);

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function DocRow({
  doc,
  active,
  onClick,
}: {
  doc: KnowledgeDoc;
  active: boolean;
  onClick: () => void;
}) {
  const editable = isMarkdownDoc(doc);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable}
      title={editable ? doc.title : '预览能力开发中，v1 支持 markdown 文档'}
      className={cn(
        'w-full flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-left',
        'hover:bg-bg-tertiary transition-colors duration-fast',
        active && 'bg-accent/10',
        !editable && 'opacity-50 cursor-not-allowed hover:bg-transparent'
      )}
    >
      <span className={cn('text-sm truncate flex-1', active ? 'text-accent' : 'text-text-primary')}>
        {doc.title}
      </span>
      {doc.docKind === 'note' && (
        <Badge variant="neutral" className="gap-0.5 px-1.5 py-0 text-[11px] shrink-0">
          <NotePencil size={12} />
          笔记
        </Badge>
      )}
      <span className="text-xs text-text-tertiary shrink-0">{formatTime(doc.updatedAt)}</span>
    </button>
  );
}

export function DocList() {
  const [filter, setFilter] = useState<Filter>('ai');
  const docs = useDocWorkspaceStore((s) => s.docs);
  const currentDocId = useDocWorkspaceStore((s) => s.currentDocId);
  const openDoc = useDocWorkspaceStore((s) => s.openDoc);
  const createNote = useDocWorkspaceStore((s) => s.createNote);
  const products = useProductStore((s) => s.products); // Product.id / Product.name

  const productName = useMemo(() => {
    const map = new Map<string, string>(products.map((p) => [p.id, p.name]));
    map.set(GLOBAL_OWNER, '全局');
    return (id: string) => map.get(id) ?? id;
  }, [products]);

  const filtered = useMemo(() => {
    if (filter === 'recent') return [...docs].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 20);
    const kind = filter === 'note' ? 'note' : 'document';
    return docs.filter((d) => d.docKind === kind);
  }, [docs, filter]);

  const groups = useMemo(() => {
    const byProduct = new Map<string, KnowledgeDoc[]>();
    for (const doc of filtered) {
      const key = doc.docKind === 'note' ? GLOBAL_OWNER : doc.productId;
      const list = byProduct.get(key) ?? [];
      list.push(doc);
      byProduct.set(key, list);
    }
    return [...byProduct.entries()];
  }, [filtered]);

  const handleNewNote = () => void createNote('无标题笔记');

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl size="sm" segments={[...FILTERS]} value={filter} onChange={(id) => setFilter(id as Filter)} />
        <Button variant="primary" size="sm" className="h-7" onClick={handleNewNote}>
          <Plus size={14} />
          新建笔记
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="px-3 py-4 text-sm text-text-tertiary">{EMPTY_COPY[filter]}</p>
      ) : (
        <div className="flex flex-col gap-1">
          {groups.map(([productId, groupDocs]) => (
            <div key={productId}>
              <div className="px-3 py-1 text-xs text-text-tertiary">
                {productName(productId)} · {groupDocs.length}
              </div>
              {groupDocs.map((doc) => (
                <DocRow
                  key={doc.docId}
                  doc={doc}
                  active={doc.docId === currentDocId}
                  onClick={() => openDoc(doc.docId)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
