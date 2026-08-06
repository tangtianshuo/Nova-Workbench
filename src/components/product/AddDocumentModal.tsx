import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { ProductDocument } from '../../data/mockProducts';
import { X, FileText, Plus, Sparkles, Tag, User } from 'lucide-react';

interface Props {
  productId: string;
  onClose: () => void;
}

export function AddDocumentModal({ productId, onClose }: Props) {
  const { addProductDocument } = useApp();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProductDocument['category']>('PRD需求');
  const [version, setVersion] = useState('v1.0.0');
  const [author, setAuthor] = useState('Brandon (PM)');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newDoc: ProductDocument = {
      id: `doc-${Date.now()}`,
      title: title.trim(),
      category,
      version: version.trim() || 'v1.0',
      author: author.trim() || 'Brandon',
      updatedAt: '刚刚',
      wordCount: `${(content.length || 200) * 2} 字`,
      summary: summary.trim() || '该文档记录了最新的业务规格与技术方案。',
      content: content.trim() || `### 1. 文档概述\n${summary || title}\n\n### 2. 详细规范说明\n- 核心逻辑待细化\n- 异常分支待补充`
    };

    addProductDocument(productId, newDoc);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">新建产品文档</h2>
              <p className="text-xs text-slate-400">录入 PRD 需求、技术架构方案、API 协议或用户调研报告</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">文档名称 *</label>
            <input
              type="text"
              required
              placeholder="例如: PRD_核心数据看板与异常预警规格_v2.0.docx"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">文档类别</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="PRD需求">PRD需求</option>
                <option value="架构设计">架构设计</option>
                <option value="API规范">API规范</option>
                <option value="用户调研">用户调研</option>
                <option value="发版规划">发版规划</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">版本号</label>
              <input
                type="text"
                placeholder="v1.0"
                value={version}
                onChange={e => setVersion(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">维护作者</label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">文档摘要概览</label>
            <textarea
              rows={2}
              placeholder="简要概括该文档涉及的核心业务逻辑与影响模块..."
              value={summary}
              onChange={e => setSummary(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Markdown 文档内容</label>
            <textarea
              rows={6}
              placeholder="支持 Markdown 语法，如 ### 1. 背景与目标..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              保存并发布文档
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
