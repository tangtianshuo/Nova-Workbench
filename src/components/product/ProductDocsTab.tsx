import { useState } from 'react';
import { Product, ProductDocument } from '../../data/mockProducts';
import {
  FileText,
  MagnifyingGlass,
  Plus,
  ArrowSquareOut,
  Copy,
  Check,
  BookOpenUser,
  Calendar,
  User,
  Tag,
  Eye,
  X,
  FileCode,
  Stack,
  Sparkle,
} from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Input } from '@/src/components/ui/Input';
import { Separator } from '@/src/components/ui/Separator';

interface Props {
  product: Product;
  onAddDocument: () => void;
}

export function ProductDocsTab({ product, onAddDocument }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDoc, setActiveDoc] = useState<ProductDocument | null>(product.documents[0] || null);
  const [copied, setCopied] = useState(false);
  const [isReaderModalOpen, setIsReaderModalOpen] = useState(false);

  const categories = ['all', 'PRD需求', '架构设计', 'API规范', '用户调研', '发版规划'];

  const filteredDocs = product.documents.filter(doc => {
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          doc.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCopyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'PRD需求': return <Badge variant="accent">{cat}</Badge>;
      case '架构设计': return <Badge variant="neutral" className="text-purple-500 bg-purple-500/10">{cat}</Badge>;
      case 'API规范': return <Badge variant="success">{cat}</Badge>;
      case '用户调研': return <Badge variant="warning">{cat}</Badge>;
      default: return <Badge variant="neutral">{cat}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Actions Header */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((cat) => (
              <Button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                variant={selectedCategory === cat ? 'primary' : 'secondary'}
                size="xs"
                className="rounded-[var(--radius-md)] text-xs font-semibold"
              >
                {cat === 'all' ? '全部文档' : cat}
                {cat === 'all'
                  ? ` (${product.documents.length})`
                  : ` (${product.documents.filter(d => d.category === cat).length})`
                }
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Input
              icon={<MagnifyingGlass size={14} weight="duotone" />}
              type="text"
              placeholder="搜索文档名称、关键词..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56 h-8 text-xs"
            />

            <Button
              onClick={onAddDocument}
              size="sm"
              className="text-xs font-bold shrink-0"
            >
              <Plus size={14} weight="duotone" />
              <span>新建文档</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Content Area: Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Documents List */}
        <div className="lg:col-span-5 space-y-3">
          {filteredDocs.length === 0 ? (
            <Card className="p-10 text-center">
              <FileText size={36} weight="duotone" className="text-text-tertiary mx-auto mb-3" />
              <p className="text-sm font-semibold text-text-primary">未找到符合条件的文档</p>
              <p className="text-xs text-text-tertiary mt-1">您可以尝试更换搜索关键词或新建文档</p>
            </Card>
          ) : (
            filteredDocs.map((doc, idx) => {
              const isSelected = activeDoc?.id === doc.id;
              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25, delay: idx * 0.03 }}
                >
                  <Card
                    variant="interactive"
                    onClick={() => setActiveDoc(doc)}
                    className={`p-4 cursor-pointer text-left ${
                      isSelected
                        ? 'bg-accent-subtle/50 border-accent/40 ring-1 ring-accent/20'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      {getCategoryBadge(doc.category)}
                      <span className="text-[11px] text-text-tertiary font-mono font-medium">
                        {doc.version}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-text-primary line-clamp-1 mb-1.5">
                      {doc.title}
                    </h4>

                    <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed mb-3">
                      {doc.summary}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-text-tertiary pt-2 border-t border-border-subtle">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <User size={12} weight="duotone" /> {doc.author}
                        </span>
                        <span>•</span>
                        <span>{doc.wordCount}</span>
                      </div>
                      <span className="flex items-center gap-1">
                        <Calendar size={12} weight="duotone" /> {doc.updatedAt}
                      </span>
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Right Column: Active Document Reader */}
        <Card className="lg:col-span-7 flex flex-col min-h-[500px]">
          {activeDoc ? (
            <div className="flex flex-col h-full">
              {/* Reader Header */}
              <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    {getCategoryBadge(activeDoc.category)}
                    <span className="text-xs font-mono text-text-secondary font-bold">{activeDoc.version}</span>
                    <span className="text-xs text-text-tertiary">·</span>
                    <span className="text-xs text-text-tertiary">由 {activeDoc.author} 维护</span>
                  </div>
                  <h3 className="text-base font-bold text-text-primary truncate">
                    {activeDoc.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => handleCopyContent(activeDoc.content)}
                    variant="ghost"
                    size="sm"
                    className="text-xs font-medium"
                    title="复制全文"
                  >
                    {copied ? <Check size={14} weight="duotone" className="text-success" /> : <Copy size={14} weight="duotone" />}
                    <span>{copied ? '已复制' : '复制'}</span>
                  </Button>

                  <Button
                    onClick={() => setIsReaderModalOpen(true)}
                    variant="secondary"
                    size="sm"
                    className="text-xs font-medium text-accent border-accent/20"
                    title="全屏深度阅读"
                  >
                    <Eye size={14} weight="duotone" />
                    <span>全屏预览</span>
                  </Button>
                </div>
              </div>

              {/* Reader Body / Markdown */}
              <div className="p-6 flex-1 overflow-y-auto max-h-[600px] text-xs text-text-secondary leading-relaxed custom-scrollbar">
                <div className="mb-4 p-3 bg-accent-subtle/50 rounded-[var(--radius-md)] border border-accent/15">
                  <div className="text-[11px] font-bold text-accent mb-1 flex items-center gap-1">
                    <Sparkle size={12} weight="duotone" /> 文档摘要概览
                  </div>
                  <p className="text-xs text-text-secondary">{activeDoc.summary}</p>
                </div>

                <div className="markdown-body prose prose-sm max-w-none text-text-secondary space-y-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeDoc.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <BookOpenUser size={40} weight="duotone" className="text-text-tertiary mb-2" />
              <p className="text-sm font-bold text-text-primary">请选择要查阅的产品文档</p>
              <p className="text-xs text-text-tertiary">点击左侧列表中的任意文档即可快速在线预览</p>
            </div>
          )}
        </Card>
      </div>

      {/* Fullscreen Modal Reader */}
      <AnimatePresence>
        {isReaderModalOpen && activeDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-bg-overlay backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
            onClick={() => setIsReaderModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="bg-bg-primary rounded-[var(--radius-xl)] max-w-4xl w-full max-h-[90vh] flex flex-col shadow-[var(--shadow-xl)] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-bg-secondary/50">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {getCategoryBadge(activeDoc.category)}
                    <span className="text-xs text-text-tertiary">更新于 {activeDoc.updatedAt}</span>
                  </div>
                  <h2 className="text-lg font-bold text-text-primary">{activeDoc.title}</h2>
                </div>
                <Button
                  onClick={() => setIsReaderModalOpen(false)}
                  variant="ghost"
                  size="sm"
                  className="text-text-tertiary hover:text-text-primary"
                >
                  <X size={20} weight="duotone" />
                </Button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 space-y-4 text-sm text-text-secondary leading-relaxed">
                <div className="p-4 bg-bg-secondary rounded-[var(--radius-lg)] border border-border-subtle text-xs text-text-secondary">
                  <span className="font-bold text-text-primary">文档摘要：</span>{activeDoc.summary}
                </div>

                <div className="markdown-body text-text-primary">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeDoc.content}</ReactMarkdown>
                </div>
              </div>

              <div className="p-4 border-t border-border-subtle bg-bg-secondary/50 flex justify-end">
                <Button
                  onClick={() => setIsReaderModalOpen(false)}
                  variant="primary"
                  className="text-xs font-bold"
                >
                  关闭阅读器
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
