import { useState } from 'react';
import { Product, ProductDocument } from '../../data/mockProducts';
import { 
  FileText, 
  Search, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  BookOpen, 
  Calendar, 
  User, 
  Tag, 
  Eye, 
  X,
  FileCode,
  Layers,
  Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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
      case 'PRD需求': return 'bg-blue-50 text-blue-700 border-blue-200';
      case '架构设计': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'API规范': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '用户调研': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Actions Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {cat === 'all' ? '全部文档' : cat}
              {cat === 'all' 
                ? ` (${product.documents.length})` 
                : ` (${product.documents.filter(d => d.category === cat).length})`
              }
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索文档名称、关键词..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-1.5 bg-slate-50 text-xs text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-56"
            />
          </div>

          <button
            onClick={onAddDocument}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm shrink-0"
          >
            <Plus size={14} />
            <span>新建文档</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Documents List */}
        <div className="lg:col-span-5 space-y-3">
          {filteredDocs.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100">
              <FileText size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">未找到符合条件的文档</p>
              <p className="text-xs text-slate-400 mt-1">您可以尝试更换搜索关键词或新建文档</p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const isSelected = activeDoc?.id === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={() => setActiveDoc(doc)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer text-left relative ${
                    isSelected
                      ? 'bg-blue-50/50 border-blue-500/40 shadow-sm ring-1 ring-blue-500/20'
                      : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${getCategoryBadge(doc.category)}`}>
                      {doc.category}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono font-medium">
                      {doc.version}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-800 line-clamp-1 mb-1.5">
                    {doc.title}
                  </h4>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">
                    {doc.summary}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100/80">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <User size={12} /> {doc.author}
                      </span>
                      <span>•</span>
                      <span>{doc.wordCount}</span>
                    </div>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {doc.updatedAt}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Active Document Reader */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col min-h-[500px]">
          {activeDoc ? (
            <div className="flex flex-col h-full">
              {/* Reader Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryBadge(activeDoc.category)}`}>
                      {activeDoc.category}
                    </span>
                    <span className="text-xs font-mono text-slate-500 font-bold">{activeDoc.version}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-400">由 {activeDoc.author} 维护</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-800 truncate">
                    {activeDoc.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyContent(activeDoc.content)}
                    className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors text-xs font-medium flex items-center gap-1 border border-slate-200"
                    title="复制全文"
                  >
                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copied ? '已复制' : '复制'}</span>
                  </button>

                  <button
                    onClick={() => setIsReaderModalOpen(true)}
                    className="p-2 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors text-xs font-medium flex items-center gap-1 border border-blue-200"
                    title="全屏深度阅读"
                  >
                    <Eye size={14} />
                    <span>全屏预览</span>
                  </button>
                </div>
              </div>

              {/* Reader Body / Markdown */}
              <div className="p-6 flex-1 overflow-y-auto max-h-[600px] text-xs text-slate-700 leading-relaxed custom-scrollbar">
                <div className="mb-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                  <div className="text-[11px] font-bold text-blue-700 mb-1 flex items-center gap-1">
                    <Sparkles size={12} /> 文档摘要概览
                  </div>
                  <p className="text-xs text-slate-600">{activeDoc.summary}</p>
                </div>

                <div className="markdown-body prose prose-sm max-w-none text-slate-700 space-y-3">
                  <ReactMarkdown>{activeDoc.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
              <BookOpen size={40} className="text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">请选择要查阅的产品文档</p>
              <p className="text-xs text-slate-400">点击左侧列表中的任意文档即可快速在线预览</p>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal Reader */}
      {isReaderModalOpen && activeDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getCategoryBadge(activeDoc.category)}`}>
                    {activeDoc.category}
                  </span>
                  <span className="text-xs text-slate-400">更新于 {activeDoc.updatedAt}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-800">{activeDoc.title}</h2>
              </div>
              <button
                onClick={() => setIsReaderModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 space-y-4 text-sm text-slate-700 leading-relaxed">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600">
                <span className="font-bold text-slate-800">文档摘要：</span>{activeDoc.summary}
              </div>

              <div className="markdown-body text-slate-800">
                <ReactMarkdown>{activeDoc.content}</ReactMarkdown>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setIsReaderModalOpen(false)}
                className="px-5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition-colors"
              >
                关闭阅读器
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
