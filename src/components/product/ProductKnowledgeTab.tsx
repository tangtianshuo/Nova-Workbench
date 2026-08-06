/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { ProductKnowledgeItem } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import { 
  BookOpen, 
  Sparkles, 
  Search, 
  Plus, 
  Tag, 
  Clock, 
  Edit3, 
  Trash2, 
  Copy, 
  Check, 
  Wand2, 
  CheckCircle2, 
  HelpCircle, 
  BookMarked,
  Layers,
  X,
  FileText
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Props {
  product: Product;
}

export function ProductKnowledgeTab({ product }: Props) {
  const { 
    getKnowledgeForProduct, 
    addKnowledgeItem, 
    updateKnowledgeItem, 
    deleteKnowledgeItem, 
    polishKnowledgeArticleAI 
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

  const handleSaveEdit = () => {
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
      const polished = await polishKnowledgeArticleAI(product.id, selectedItem.id, action);
      if (isEditing) {
        setEditContent(polished);
      }
      showToast(`🪄 AI 知识库润色【${action}】完成`);
    } catch (e) {
      showToast('❌ 润色失败');
    } finally {
      setIsPolishing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold">产品领域知识库与沉淀中枢</h3>
          </div>
          <p className="text-xs text-slate-300">
            收录【{product.name}】的业务逻辑公理、领域模型字典、安全合规红线与架构准则，支持 AI 辅助润色扩充。
          </p>
        </div>

        <button
          onClick={() => {
            setEditTitle('');
            setEditContent('');
            setEditTags('核心, 业务');
            setEditCategory('业务规则');
            setIsCreatingNew(true);
          }}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all shrink-0"
        >
          <Plus size={14} />
          <span>新建知识词条</span>
        </button>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: List & Categories */}
        <div className="lg:col-span-4 space-y-4">
          {/* Search and Category Filter */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索知识库..."
                className="w-full bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {['all', '业务规则', '领域字典', '架构约束', '踩坑指南'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    activeCategory === cat
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat === 'all' ? '全部' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* List of Items */}
          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedItemId(item.id);
                  setIsEditing(false);
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                  selectedItemId === item.id
                    ? 'bg-purple-50/70 border-purple-200 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                    {item.category}
                  </span>
                  <span className="text-[10px] text-slate-400">{item.updatedAt}</span>
                </div>

                <h4 className="font-bold text-xs text-slate-800 line-clamp-1">{item.title}</h4>
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                  {item.content.replace(/[#*`]/g, '').slice(0, 80)}...
                </p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {item.tags.map((t, idx) => (
                    <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Article Reader / Editor */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
          {selectedItem ? (
            <>
              {/* Reader Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                      {selectedItem.category}
                    </span>
                    <h3 className="font-bold text-base text-slate-900">{selectedItem.title}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    维护人: {selectedItem.author} · 最后更新: {selectedItem.updatedAt}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* AI Polish Dropdown / Trigger */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAIPolish('结构化排版与要点提炼')}
                      disabled={isPolishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl border border-purple-200 transition-colors disabled:opacity-50"
                    >
                      <Wand2 size={13} className={isPolishing ? 'animate-spin' : ''} />
                      <span>AI 排版润色</span>
                    </button>
                    <button
                      onClick={() => handleAIPolish('补充异常边界与规约')}
                      disabled={isPolishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-colors disabled:opacity-50"
                    >
                      <Sparkles size={13} />
                      <span>AI 扩充边界</span>
                    </button>
                  </div>

                  {!isEditing ? (
                    <button
                      onClick={() => handleStartEdit(selectedItem)}
                      className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
                      title="编辑知识内容"
                    >
                      <Edit3 size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveEdit}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors"
                    >
                      保存更新
                    </button>
                  )}

                  <button
                    onClick={() => deleteKnowledgeItem(product.id, selectedItem.id)}
                    className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors"
                    title="删除词条"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Editor / Markdown Body */}
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="词条标题..."
                      className="w-full text-xs font-bold bg-slate-50 p-2.5 rounded-xl border border-slate-200 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="标签（以逗号分隔，如：RBAC, 架构, 性能）"
                      className="w-full text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 focus:outline-none"
                    />
                  </div>

                  <textarea
                    rows={16}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 p-4 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/30 leading-relaxed resize-none"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl shadow-sm"
                    >
                      保存词条
                    </button>
                  </div>
                </div>
              ) : (
                <div className="prose prose-slate prose-sm max-w-none text-slate-800 font-sans leading-relaxed">
                  <ReactMarkdown>{selectedItem.content}</ReactMarkdown>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 text-slate-400 text-xs">
              暂无知识库词条，点击右上角新建词条。
            </div>
          )}
        </div>
      </div>

      {/* Create New Item Modal */}
      {isCreatingNew && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-purple-600" />
                <span>新建知识库沉淀词条</span>
              </h3>
              <button onClick={() => setIsCreatingNew(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">词条标题</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="例如：多租户权限校验与RBAC角色矩阵规约"
                  className="w-full bg-slate-50 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">所属分类</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as any)}
                    className="w-full bg-slate-50 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none"
                  >
                    <option value="业务规则">业务规则</option>
                    <option value="领域字典">领域字典</option>
                    <option value="架构约束">架构约束</option>
                    <option value="踩坑指南">踩坑指南</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">标签</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="以逗号分隔，如：RBAC, 架构"
                    className="w-full bg-slate-50 text-xs p-3 rounded-xl border border-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">知识正文 (支持 Markdown)</label>
                <textarea
                  rows={8}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="# 业务背景与规则规范..."
                  className="w-full bg-slate-50 text-xs font-mono p-3 rounded-xl border border-slate-200 focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setIsCreatingNew(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl"
              >
                取消
              </button>
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm"
              >
                立即收录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
