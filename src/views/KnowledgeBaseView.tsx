import { BookOpen, FileText, MagnifyingGlass, CaretRight, Star, Tag } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';
import { MarkdownRenderer } from '@/src/components/ui/MarkdownRenderer';
import { Separator } from '@/src/components/ui/Separator';
import { cn } from '@/src/lib/utils';
import { useRndStore } from '@/src/stores/rndStore';
import { useProductStore } from '@/src/stores/productStore';
import type { ProductKnowledgeItem } from '@/src/data/mockRndData';

// ponytail: aggregated view over rndStore.knowledgeBase (all productIds).
// Sidebar groups by `category` field (the only native grouping on the data).

export function KnowledgeBaseView() {
  // ── Store subscriptions ───────────────────────────────────────────────────
  const knowledgeBase = useRndStore((s) => s.knowledgeBase);
  const updateKnowledgeItem = useRndStore((s) => s.updateKnowledgeItem);
  const products = useProductStore((s) => s.products);

  // ── Derived aggregated data ───────────────────────────────────────────────
  // Flatten all productId buckets; tag each item with its source productId so
  // saveEditing can route back through updateKnowledgeItem(productId, itemId, …).
  // ponytail: items already carry productId, so we can flatten without re-tagging.
  const allItems = useMemo<ProductKnowledgeItem[]>(
    () => Object.values(knowledgeBase).flat(),
    [knowledgeBase]
  );

  const categories = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.category).filter(Boolean))),
    [allItems]
  );

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(categories)
  );

  // First render with no selection → pick first item once data is available.
  useEffect(() => {
    if (activeItemId === null && allItems.length > 0) {
      setActiveItemId(allItems[0].id);
    }
  }, [activeItemId, allItems]);

  // Keep expanded set in sync when categories change (new articles add groups).
  useEffect(() => {
    setExpandedFolders((prev) => new Set([...prev, ...categories]));
  }, [categories]);

  const currentItem = useMemo<ProductKnowledgeItem | null>(() => {
    if (!activeItemId) return allItems[0] ?? null;
    return allItems.find((i) => i.id === activeItemId) ?? allItems[0] ?? null;
  }, [activeItemId, allItems]);

  // Reset edit state when switching articles.
  useEffect(() => {
    setIsEditing(false);
    setEditContent(currentItem?.content ?? '');
  }, [activeItemId, currentItem?.content]);

  const startEditing = () => {
    setEditContent(currentItem?.content ?? '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditContent(currentItem?.content ?? '');
    setIsEditing(false);
  };

  const saveEditing = () => {
    if (!currentItem) return;
    // Route through store action — persists via Zustand persist layer (F5 safe).
    updateKnowledgeItem(currentItem.productId, currentItem.id, { content: editContent });
    setIsEditing(false);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const productNameFor = (productId: string) =>
    products.find((p) => p.id === productId)?.name ?? '未知产品';

  return (
    <Card className="flex overflow-hidden h-[calc(100vh-140px)] min-h-[600px]">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r border-border-subtle bg-bg-secondary/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-border-subtle">
          <Input
            placeholder="搜索文档..."
            icon={<MagnifyingGlass size={14} weight="duotone" className="text-text-tertiary" />}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] font-bold text-text-tertiary px-3 mb-1.5 mt-1 uppercase tracking-widest">快速访问</div>
          <button className="w-full flex items-center gap-2.5 px-3 py-2 text-text-secondary hover:bg-bg-secondary hover:text-text-primary rounded-[var(--radius-sm)] text-sm font-medium transition-colors">
            <Star size={16} weight="duotone" className="text-warning" />
            我的收藏
          </button>
          <button className="w-full flex items-center gap-2.5 px-3 py-2 text-text-secondary hover:bg-bg-secondary hover:text-text-primary rounded-[var(--radius-sm)] text-sm font-medium transition-colors">
            <BookOpen size={16} weight="duotone" className="text-accent" />
            所有文档
          </button>

          <Separator className="my-3" />
          <div className="text-[10px] font-bold text-text-tertiary px-3 mb-1.5 uppercase tracking-widest">知识库目录</div>

          {allItems.length === 0 ? (
            <div className="text-center text-text-tertiary text-xs py-8 leading-relaxed">
              暂无知识库文章<br />请在产品管理的知识库 tab 中创建
            </div>
          ) : (
            categories.map((category) => {
              const itemsInCategory = allItems.filter((i) => i.category === category);
              return (
                <div key={category}>
                  <button
                    onClick={() => toggleFolder(category)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-text-secondary hover:bg-bg-secondary rounded-[var(--radius-sm)] transition-colors"
                  >
                    <CaretRight
                      size={14}
                      weight="bold"
                      className={cn(
                        'text-text-tertiary transition-transform',
                        expandedFolders.has(category) && 'rotate-90'
                      )}
                    />
                    <Tag size={16} weight="duotone" className="text-accent" />
                    <span className="text-sm font-medium">{category}</span>
                    <span className="ml-auto text-[10px] text-text-tertiary">{itemsInCategory.length}</span>
                  </button>

                  {expandedFolders.has(category) && (
                    <div className="pl-5 space-y-0.5">
                      {itemsInCategory.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setActiveItemId(item.id)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors',
                            currentItem?.id === item.id
                              ? 'bg-accent/10 text-accent font-semibold'
                              : 'text-text-secondary hover:bg-bg-secondary'
                          )}
                        >
                          <FileText
                            size={14}
                            weight="duotone"
                            className={currentItem?.id === item.id ? 'text-accent' : 'text-text-tertiary'}
                          />
                          <span className="truncate">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Document Viewer */}
      <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
        <div className="h-12 border-b border-border-subtle flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-text-tertiary">
            <span>知识库</span>
            <CaretRight size={12} weight="bold" />
            <span>{currentItem?.category ?? ''}</span>
            <CaretRight size={12} weight="bold" />
            <span className="text-text-primary font-medium">{currentItem?.title ?? ''}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button variant="ghost" size="sm" onClick={startEditing} disabled={!currentItem}>
                编辑
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  取消
                </Button>
                <Button variant="primary" size="sm" onClick={saveEditing}>
                  保存
                </Button>
              </>
            )}
            <Button variant="primary" size="sm">
              分享
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10">
          {currentItem ? (
            <div className="max-w-2xl mx-auto">
              <h1 className="text-3xl font-bold text-text-primary mb-2 tracking-tight">
                {currentItem.title}
              </h1>
              <p className="text-xs text-text-tertiary mb-6">
                维护人: {currentItem.author} · 最后更新: {currentItem.updatedAt} · 来源产品:{' '}
                {productNameFor(currentItem.productId)}
              </p>
              {isEditing ? (
                <MarkdownEditor
                  value={editContent}
                  onChange={setEditContent}
                  placeholder="输入 Markdown 内容..."
                  minHeight="480px"
                />
              ) : (
                <MarkdownRenderer className="prose prose-sm max-w-none text-text-primary font-sans leading-relaxed">
                  {currentItem.content}
                </MarkdownRenderer>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              请选择或创建一篇文章
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
