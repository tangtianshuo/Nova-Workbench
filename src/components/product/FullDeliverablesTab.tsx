/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { FullLifecycleDeliverable } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import { 
  Sparkles, 
  Bot, 
  FileText, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Download, 
  Copy, 
  Check, 
  Search, 
  Filter, 
  ExternalLink, 
  FolderPlus, 
  Zap, 
  Eye, 
  X, 
  Share2, 
  Tag, 
  Award,
  Layers,
  Code2,
  Table,
  Cpu,
  ChevronRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Props {
  product: Product;
}

export function FullDeliverablesTab({ product }: Props) {
  const { 
    getDeliverablesForProduct, 
    generateDeliverableAI, 
    generateAllDeliverablesBatchAI, 
    syncDeliverableToDocs 
  } = useApp();

  const deliverables = getDeliverablesForProduct(product.id);

  const [activePhase, setActivePhase] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeliverable, setSelectedDeliverable] = useState<FullLifecycleDeliverable | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchCurrentTitle, setBatchCurrentTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredDeliverables = deliverables.filter(d => {
    const matchPhase = activePhase === 'all' || d.phase === activePhase;
    const matchQuery = !searchQuery || 
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchPhase && matchQuery;
  });

  const readyCount = deliverables.filter(d => d.status === 'ready').length;
  const totalCount = deliverables.length;
  const readyPercent = Math.round((readyCount / totalCount) * 100);

  const handleGenerateSingle = async (code: string) => {
    try {
      await generateDeliverableAI(product.id, code);
      showToast('✨ 成果物推导完成并已更新！');
    } catch (e) {
      showToast('❌ 生成失败');
    }
  };

  const handleBatchGenerateAll = async () => {
    setIsBatchGenerating(true);
    setBatchProgress(0);
    try {
      await generateAllDeliverablesBatchAI(product.id, (percent, title) => {
        setBatchProgress(percent);
        setBatchCurrentTitle(title);
      });
      showToast('🎉 全套产研生命周期成果物 (18 份) 已全部一键推导就绪！');
    } catch (e) {
      showToast('❌ 批量生成中断');
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('📋 内容已复制到剪贴板');
  };

  const handleDownload = (d: FullLifecycleDeliverable) => {
    const ext = d.format === 'markdown' ? 'md' : d.format === 'json' ? 'json' : d.format === 'sql' ? 'sql' : 'txt';
    const blob = new Blob([d.content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${d.code}_${d.title.replace(/\s+/g, '_')}.${ext}`;
    link.click();
    showToast(`📥 已导出 ${d.title}`);
  };

  const handleSyncToDocs = (d: FullLifecycleDeliverable) => {
    syncDeliverableToDocs(product.id, d.id);
    showToast(`📁 已将【${d.title}】归档至【产品文档】中心`);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Overview & Batch Trigger */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-blue-500/20 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black tracking-tight">产品产研全生命周期成果物工厂</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                18 份工业级交付物
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              围绕【{product.name}】全生命周期，支持秒级一键推导从需求 PRD、架构拓扑、OpenAPI 协议、建表 SQL、测试用例到发版公告的所有核心成果物。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/80 flex items-center gap-4 px-4">
              <div>
                <div className="text-[11px] text-slate-400">已就绪资产</div>
                <div className="text-lg font-black text-white">{readyCount} / {totalCount}</div>
              </div>
              <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${readyPercent}%` }} 
                />
              </div>
            </div>

            <button
              onClick={handleBatchGenerateAll}
              disabled={isBatchGenerating}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50"
            >
              {isBatchGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>AI 批量推导中 ({batchProgress}%)...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>一键生成全流程所有成果物</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress Bar when batch generating */}
        {isBatchGenerating && (
          <div className="p-4 bg-slate-800/90 rounded-2xl border border-slate-700/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                正在推导: <strong className="text-white">{batchCurrentTitle || '初始化产研流水线...'}</strong>
              </span>
              <span className="font-mono font-bold text-emerald-400">{batchProgress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300"
                style={{ width: `${batchProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        {/* Phase Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActivePhase('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePhase === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            全部阶段 ({deliverables.length})
          </button>
          <button
            onClick={() => setActivePhase('requirement')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePhase === 'requirement' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            1. 需求与规划
          </button>
          <button
            onClick={() => setActivePhase('design')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePhase === 'design' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            2. 交互与系统架构
          </button>
          <button
            onClick={() => setActivePhase('dev')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePhase === 'dev' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            3. 工程实现与代码
          </button>
          <button
            onClick={() => setActivePhase('qa')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePhase === 'qa' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            4. 质量保障与测试
          </button>
          <button
            onClick={() => setActivePhase('release')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activePhase === 'release' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            5. 发布运营与商业化
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成果物名称/编号..."
            className="w-full bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {/* Deliverables Grid Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDeliverables.map((d) => (
          <div
            key={d.id}
            className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-700">
                    {d.code}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                    {d.phaseName}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  d.status === 'ready' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  d.status === 'generating' ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' :
                  'bg-slate-50 text-slate-600 border border-slate-200'
                }`}>
                  {d.status === 'ready' ? '已就绪' : d.status === 'generating' ? '生成中...' : '待生成'}
                </span>
              </div>

              <h4 className="font-bold text-slate-800 text-sm leading-snug">{d.title}</h4>
              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{d.summary}</p>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>格式: <strong className="text-slate-700 font-mono">{d.format.toUpperCase()}</strong></span>
                <span>字数: <strong className="text-slate-700">{d.wordCount || '约3,000字'}</strong></span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  onClick={() => setSelectedDeliverable(d)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors"
                >
                  <Eye size={13} />
                  <span>查看/编辑</span>
                </button>

                <button
                  onClick={() => handleGenerateSingle(d.code)}
                  title="重新由 AI 推导"
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
                >
                  <RefreshCw size={13} />
                </button>

                <button
                  onClick={() => handleSyncToDocs(d)}
                  title="归档至产品文档"
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
                >
                  <FolderPlus size={13} />
                </button>

                <button
                  onClick={() => handleDownload(d)}
                  title="下载文件"
                  className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
                >
                  <Download size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Deliverable Full-Screen Preview & Edit Modal */}
      {selectedDeliverable && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 font-mono font-bold text-xs border border-blue-500/30">
                  {selectedDeliverable.code}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">{selectedDeliverable.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    所属阶段: {selectedDeliverable.phaseName} · 格式: {selectedDeliverable.format.toUpperCase()} · 字数: {selectedDeliverable.wordCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(selectedDeliverable.id, selectedDeliverable.content)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
                >
                  {copiedId === selectedDeliverable.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedId === selectedDeliverable.id ? '已复制' : '复制全文'}</span>
                </button>

                <button
                  onClick={() => handleDownload(selectedDeliverable)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
                >
                  <Download size={13} />
                  <span>导出文件</span>
                </button>

                <button
                  onClick={() => setSelectedDeliverable(null)}
                  className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-slate-50 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="prose prose-slate prose-sm max-w-none text-slate-800 font-sans leading-relaxed">
                  <ReactMarkdown>{selectedDeliverable.content}</ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                可一键归档至【产品文档】或同步至本地工作区目录。
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSyncToDocs(selectedDeliverable)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  <FolderPlus size={14} />
                  <span>归档至产品文档中心</span>
                </button>
                <button
                  onClick={() => setSelectedDeliverable(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
