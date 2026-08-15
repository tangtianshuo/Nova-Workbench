import { BookOpen, FileText, MagnifyingGlass, CaretRight, Star, Tag } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';
import { MarkdownRenderer } from '@/src/components/ui/MarkdownRenderer';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/src/components/ui/Select';
import { Separator } from '@/src/components/ui/Separator';
import { useToast } from '@/src/components/ui/Toast';
import { cn } from '@/src/lib/utils';
import { getKnowledgeRepo, type KnowledgeHit } from '@/src/ai/knowledgeRepo';
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

  // ── Search + filters (Phase 15 Surface 2, MEM-06/07) ──────────────────────
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [timeRange, setTimeRange] = useState(''); // '' | '7' | '30' (days)
  const [results, setResults] = useState<KnowledgeHit[] | null>(null);

  const searchMode =
    query.trim() !== '' || filterTag !== '' || filterProductId !== '' || timeRange !== '';

  useEffect(() => {
    if (!searchMode) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const since = timeRange
            ? new Date(Date.now() - Number(timeRange) * 24 * 60 * 60 * 1000).toISOString()
            : undefined;
          let hits = await getKnowledgeRepo().search(query.trim(), {
            productId: filterProductId || undefined,
            since,
            limit: 50,
          });
          // 标签 filter shows categories (UI spec); repo's `tag` param matches
          // the tags array instead — filter by category here (Rule 1 fix).
          if (filterTag) hits = hits.filter((h) => h.category === filterTag);
          setResults(hits);
        } catch (error) {
          console.error('[knowledge-search] failed', error);
          setResults([]);
          toast({ type: 'error', title: '检索失败,请稍后重试;若持续失败请重启应用。' });
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [query, filterTag, filterProductId, timeRange, searchMode, toast]);

  const clearFilters = () => {
    setQuery('');
    setFilterTag('');
    setFilterProductId('');
    setTimeRange('');
  };

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
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文档..."
            icon={<MagnifyingGlass size={14} weight="duotone" className="text-text-tertiary" />}
          />
          {/* Filters pass undefined when inactive so the placeholder (全部X) shows —
              清除筛选 is the reset affordance, no per-select "all" item. */}
          <div className="mt-2 flex flex-col gap-2">
            <Select
              value={filterTag || undefined}
              onValueChange={(value) => setFilterTag(value ?? '')}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="全部标签" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterProductId || undefined}
              onValueChange={(value) => setFilterProductId(value ?? '')}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="全部产品" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={timeRange || undefined}
              onValueChange={(value) => setTimeRange(value ?? '')}
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="全部时间" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">最近 7 天</SelectItem>
                <SelectItem value="30">最近 30 天</SelectItem>
              </SelectContent>
            </Select>
          </div>
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

          {searchMode ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="text-xs text-text-tertiary">{results?.length ?? 0} 条结果</span>
                <Button variant="ghost" size="sm" onClick={clearFilters}>清除筛选</Button>
              </div>
              {(results ?? []).length === 0 ? (
                <div className="text-center text-text-tertiary py-8 px-3 leading-relaxed">
                  <p className="text-sm">没有匹配的文档</p>
                  <p className="mt-1 text-xs">换个关键词试试,或清除筛选条件查看全部文档。</p>
                </div>
              ) : (
                (results ?? []).map((hit) => (
                  <button
                    key={hit.docId}
                    onClick={() => setActiveItemId(hit.docId)}
                    className="w-full flex flex-col gap-0.5 px-3 py-2 rounded-[var(--radius-sm)] text-sm text-text-secondary hover:bg-bg-secondary text-left"
                  >
                    <span className="truncate font-medium text-text-primary">{hit.title}</span>
                    <span className="text-xs text-text-tertiary">
                      {productNameFor(hit.productId)} · v{hit.version} · {hit.updatedAt}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : allItems.length === 0 ? (
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
