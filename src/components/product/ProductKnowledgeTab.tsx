/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Product } from '../../data/mockProducts';
import { ProductKnowledgeItem } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import {
  BookOpen as PhBookOpen,
  Sparkle as PhSparkle,
  MagnifyingGlass as PhSearch,
  Plus as PhPlus,
  Tag as PhTag,
  Clock as PhClock,
  PencilSimple as PhEdit3,
  Trash as PhTrash2,
  Copy as PhCopy,
  Check as PhCheck,
  MagicWand as PhWand2,
  CheckCircle as PhCheckCircle2,
  SealQuestion as PhHelpCircle,
  BookBookmark as PhBookMarked,
  Stack as PhLayers,
  X as PhX,
  FileText as PhFileText,
} from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Input } from '@/src/components/ui/Input';
import { MarkdownRenderer } from '@/src/components/ui';
import { MarkdownEditor } from '@/src/components/ui/MarkdownEditor';
import { Separator } from '@/src/components/ui/Separator';
import { executeTool } from '@/src/ai';
import {
  confirmKnowledgeWrite,
  rejectKnowledgeWrite,
  ConfirmationRequiredError,
  type KnowledgeWriteCandidate,
} from '@/src/ai/confirmations';

interface Props {
  product: Product;
}

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 25 };

export function ProductKnowledgeTab({ product }: Props) {
  const {
    getKnowledgeForProduct,
    addKnowledgeItem,
    updateKnowledgeItem,
    deleteKnowledgeItem,
  } = useApp();

  const items = getKnowledgeForProduct(product.id);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(items[0]?.id || null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<any>('业务规则');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [pendingPolishCandidate, setPendingPolishCandidate] = useState<KnowledgeWriteCandidate | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredItems = items.filter(item => {
    const matchCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchQuery = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchQuery;
  });

  const selectedItem = items.find(i => i.id === selectedItemId) || items[0];

  const handleStartEdit = (item: ProductKnowledgeItem) => {
    setEditTitle(item.title);
    setEditCategory(item.category);
    setEditContent(item.content);
    setEditTags(item.tags.join(', '));
    setIsEditing(true);
  };

  const handleConfirmPolish = async () => {
    if (!pendingPolishCandidate) return;
    try {
      const candidate = await confirmKnowledgeWrite(pendingPolishCandidate.confirmationToken);
      await executeTool('writeKnowledgeArticle', {
        productId: candidate.productId,
        itemId: candidate.itemId,
        title: candidate.title,
        category: candidate.category,
        tags: candidate.tags,
        content: candidate.content,
        summary: candidate.summary,
        author: candidate.author,
        readTime: candidate.readTime,
        confirmationToken: candidate.confirmationToken,
      });
      setPendingPolishCandidate(null);
      setIsEditing(false);
      showToast('知识库候选稿已确认写入');
    } catch {
      showToast('候选稿写入失败，请重新生成');
    }
  };

  const handleCancelEdit = async () => {
    if (pendingPolishCandidate) {
      await rejectKnowledgeWrite(pendingPolishCandidate.confirmationToken);
      setPendingPolishCandidate(null);
    }
    if (selectedItem) {
      setEditTitle(selectedItem.title);
      setEditContent(selectedItem.content);
      setEditTags(selectedItem.tags.join(', '));
    }
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (pendingPolishCandidate) {
      void handleConfirmPolish();
      return;
    }
    if (!selectedItem) return;
    updateKnowledgeItem(product.id, selectedItem.id, {
      title: editTitle,
      category: editCategory,
      content: editContent,
      tags: editTags.split(',').map(t => t.trim()).filter(Boolean)
    });
    setIsEditing(false);
    showToast('💾 知识库文档更新成功');
  };

  const handleCreateNew = () => {
    if (!editTitle.trim()) return;
    addKnowledgeItem(product.id, {
      title: editTitle,
      category: editCategory,
      summary: editContent ? editContent.slice(0, 100) : editTitle,
      content: editContent || '# ' + editTitle + '\n\n输入知识沉淀内容...',
      readTime: '3 分钟',
      tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
      author: product.owner
    });
    setIsCreatingNew(false);
    setEditTitle('');
    setEditContent('');
    setEditTags('');
    showToast('✨ 知识词条已创建并收录');
  };

  const handleAIPolish = async (action: string) => {
    if (!selectedItem) return;
    setIsPolishing(true);
    try {
      const readResult = await executeTool('readKnowledgeArticle', {
        productId: product.id,
        itemId: selectedItem.id,
      }) as { article?: ProductKnowledgeItem };
      if (!readResult.article) throw new Error('知识条目不存在');
      const article = readResult.article;
      const polished = `${article.content}\n\n### 📌 AI 自动补充与沉淀 (${action})`;
      try {
        await executeTool('writeKnowledgeArticle', {
          productId: product.id,
          itemId: article.id,
          title: article.title,
          category: article.category,
          tags: article.tags,
          content: polished,
          summary: article.summary,
          author: article.author,
          readTime: article.readTime,
        });
      } catch (error) {
        if (!(error instanceof ConfirmationRequiredError)) throw error;
        setPendingPolishCandidate(error.candidate);
        setEditTitle(article.title);
        setEditCategory(article.category);
        setEditContent(error.candidate.content);
        setEditTags(article.tags.join(', '));
        setIsEditing(true);
        showToast(`已生成【${action}】候选稿，请确认写入`);
      }
    } catch (e) {
      showToast('❌ 润色失败');
    } finally {
      setIsPolishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            className="fixed bottom-6 right-6 z-50 bg-bg-primary text-text-primary text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-border-subtle flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={springTransition}
          >
            <PhSparkle size={16} weight="duotone" className="text-accent" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Banner */}
      <Card variant="dark" className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-accent/20 text-accent rounded-xl border border-accent/30">
                <PhBookOpen size={20} weight="duotone" />
              </div>
              <h3 className="text-lg font-bold">产品领域知识库与沉淀中枢</h3>
            </div>
            <p className="text-xs text-text-tertiary">
              收录【{product.name}】的业务逻辑公理、领域模型字典、安全合规红线与架构准则，支持 AI 辅助润色扩充。
            </p>
          </div>

          <Button
            variant="primary"
            onClick={() => {
              setEditTitle('');
              setEditContent('');
              setEditTags('核心, 业务');
              setEditCategory('业务规则');
              setIsCreatingNew(true);
            }}
            className="bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent border-0 shrink-0"
          >
            <PhPlus size={14} weight="duotone" />
            <span>新建知识词条</span>
          </Button>
        </div>
      </Card>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: List & Categories */}
        <div className="lg:col-span-4 space-y-4">
          {/* Search and Category Filter */}
          <Card className="p-4 space-y-3">
            <div className="relative">
              <PhSearch size={14} weight="duotone" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索知识库..."
                className="w-full bg-bg-secondary text-xs text-text-primary placeholder:text-text-placeholder pl-9 pr-3 py-2 rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {['all', '业务规则', '领域字典', '架构约束', '踩坑指南'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    activeCategory === cat
                      ? 'bg-accent text-white'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                  }`}
                >
                  {cat === 'all' ? '全部' : cat}
                </button>
              ))}
            </div>
          </Card>

          {/* List of Items */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {filteredItems.map((item) => (
              <motion.div
                key={item.id}
                layout
                onClick={() => {
                  setSelectedItemId(item.id);
                  setIsEditing(false);
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                  selectedItemId === item.id
                    ? 'bg-accent-subtle/40 border-accent/30 shadow-sm'
                    : 'bg-bg-primary border-border-subtle hover:border-border shadow-sm'
                }`}
                initial={false}
                animate={{ scale: selectedItemId === item.id ? 1 : 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <div className="flex items-center justify-between">
                  <Badge variant="neutral" className="text-[10px] font-bold bg-accent-subtle text-accent">
                    {item.category}
                  </Badge>
                  <span className="text-[10px] text-text-tertiary">{item.updatedAt}</span>
                </div>

                <h4 className="font-bold text-xs text-text-primary line-clamp-1">{item.title}</h4>
                <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">
                  {item.content.replace(/[#*`]/g, '').slice(0, 80)}...
                </p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {item.tags.map((t, idx) => (
                    <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-secondary font-mono">
                      #{t}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right Column: Article Reader / Editor */}
        <Card className="lg:col-span-8 p-6 md:p-8 space-y-6">
          {selectedItem ? (
            <>
              {/* Reader Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="text-xs font-bold bg-accent-subtle text-accent border border-accent/20 px-2.5 py-0.5 rounded-lg">
                      {selectedItem.category}
                    </Badge>
                    <h3 className="font-bold text-base text-text-primary">{selectedItem.title}</h3>
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">
                    维护人: {selectedItem.author} · 最后更新: {selectedItem.updatedAt}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* AI Polish Dropdown / Trigger */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAIPolish('结构化排版与要点提炼')}
                      disabled={isPolishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-subtle hover:bg-accent-muted text-accent text-xs font-bold rounded-xl border border-accent/20 transition-colors disabled:opacity-50"
                    >
                      <PhWand2 size={13} weight="duotone" className={isPolishing ? 'animate-spin' : ''} />
                      <span>AI 排版润色</span>
                    </button>
                    <button
                      onClick={() => handleAIPolish('补充异常边界与规约')}
                      disabled={isPolishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-subtle hover:bg-accent-muted text-accent text-xs font-bold rounded-xl border border-accent/20 transition-colors disabled:opacity-50"
                    >
                      <PhSparkle size={13} weight="duotone" />
                      <span>AI 扩充边界</span>
                    </button>
                  </div>

                  {!isEditing ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label="编辑知识条目"
                      onClick={() => handleStartEdit(selectedItem)}
                    >
                      <PhEdit3 size={14} weight="duotone" />
                    </Button>
                  ) : (
                     <Button variant="primary" size="sm" onClick={handleSaveEdit} className="bg-success hover:bg-success/90">
                       {pendingPolishCandidate ? '确认写入' : '保存更新'}
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label="删除知识条目"
                    onClick={() => deleteKnowledgeItem(product.id, selectedItem.id)}
                    className="text-danger border-danger/20 bg-danger-subtle hover:bg-danger-subtle/80"
                  >
                    <PhTrash2 size={14} weight="duotone" />
                  </Button>
                </div>
              </div>

              {/* Editor / Markdown Body */}
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="词条标题..."
                      className="text-xs font-bold"
                    />
                    <Input
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="标签（以逗号分隔，如：RBAC, 架构, 性能）"
                      className="text-xs"
                    />
                  </div>

                  <MarkdownEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="知识正文..."
                    className="min-h-[320px]"
                  />

                  <div className="flex justify-end gap-2">
                     <Button variant="secondary" size="md" onClick={() => void handleCancelEdit()}>
                       取消
                     </Button>
                    <Button variant="primary" size="md" onClick={handleSaveEdit}>
                       {pendingPolishCandidate ? '确认写入候选稿' : '保存词条'}
                     </Button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-slate prose-sm max-w-none text-text-primary font-sans leading-relaxed">
                  <MarkdownRenderer>{selectedItem.content}</MarkdownRenderer>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 text-text-tertiary text-xs">
              暂无知识库词条，点击右上角新建词条。
            </div>
          )}
        </Card>
      </div>

      {/* Create New Item Modal */}
      <AnimatePresence>
        {isCreatingNew && (
          <motion.div
            className="fixed inset-0 z-50 bg-bg-overlay backdrop-blur-sm flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="bg-bg-primary rounded-3xl w-full max-w-2xl p-6 shadow-2xl border border-border-subtle space-y-4"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={springTransition}
            >
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <h3 className="font-bold text-text-primary text-base flex items-center gap-2">
                  <PhBookMarked size={20} weight="duotone" className="text-accent" />
                  <span>新建知识库沉淀词条</span>
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setIsCreatingNew(false)}>
                  <PhX size={18} weight="duotone" />
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">词条标题</label>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="例如：多租户权限校验与RBAC角色矩阵规约"
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-1">所属分类</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as any)}
                      className="w-full bg-bg-secondary text-xs p-3 rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-accent/20"
                    >
                      <option value="业务规则">业务规则</option>
                      <option value="领域字典">领域字典</option>
                      <option value="架构约束">架构约束</option>
                      <option value="踩坑指南">踩坑指南</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-1">标签</label>
                    <Input
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="以逗号分隔，如：RBAC, 架构"
                      className="text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">知识正文 (支持 Markdown)</label>
                  <MarkdownEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="# 业务背景与规则规范..."
                    className="min-h-[200px]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                <Button variant="secondary" size="md" onClick={() => setIsCreatingNew(false)}>
                  取消
                </Button>
                <Button variant="primary" size="md" onClick={handleCreateNew}>
                  立即收录
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
