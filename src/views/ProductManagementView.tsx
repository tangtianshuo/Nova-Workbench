/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Product } from '../data/mockProducts';
import { 
  Layers, 
  Search, 
  Plus, 
  ArrowLeft, 
  ChevronRight, 
  FileText, 
  Zap, 
  LineChart, 
  Flag, 
  Target, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Users, 
  Calendar,
  Sparkles,
  ExternalLink,
  ChevronDown,
  Activity,
  BarChart3,
  Bot,
  ShieldCheck,
  Cpu,
  ArrowUpRight,
  Sliders,
  FolderGit2
} from 'lucide-react';

import { ProductOverviewTab } from '../components/product/ProductOverviewTab';
import { ProductGovernanceTab } from '../components/product/ProductGovernanceTab';
import { ProductDocsTab } from '../components/product/ProductDocsTab';
import { ProductAnalyticsTab } from '../components/product/ProductAnalyticsTab';
import { ProductSkillsTab } from '../components/product/ProductSkillsTab';
import { ProductMilestonesTab } from '../components/product/ProductMilestonesTab';
import { CreateProductModal } from '../components/product/CreateProductModal';
import { AddDocumentModal } from '../components/product/AddDocumentModal';
import { AddSkillModal } from '../components/product/AddSkillModal';

export type ProductManageTabKey = 
  | 'overview' 
  | 'governance'
  | 'docs' 
  | 'analytics' 
  | 'skills' 
  | 'milestones';

interface Props {
  onNavigateToRnd?: (productId: string) => void;
}

export function ProductManagementView({ onNavigateToRnd }: Props) {
  const { products, selectedProductId, setSelectedProductId, addProductMilestone, getDeliverablesForProduct } = useApp();
  
  const [activeDetailTab, setActiveDetailTab] = useState<ProductManageTabKey>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modals
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [showAddMilestoneModal, setShowAddMilestoneModal] = useState(false);

  // Quick milestone creation state
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('2025-07-30');

  const stages = ['all', '规划中', '研发中', '公测灰度', '商业化运营', '已发布'];
  const categories = ['all', 'AI 协同 / SaaS', '移动端应用', '品牌数字资产', '数据中台'];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStage = selectedStage === 'all' || p.stage === selectedStage;
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesStage && matchesCat;
  });

  const currentProduct = products.find(p => p.id === selectedProductId) || null;

  // Stats calculation
  const totalProducts = products.length;
  const inDevCount = products.filter(p => p.stage === '研发中' || p.stage === '公测灰度').length;
  const inOpsCount = products.filter(p => p.stage === '商业化运营' || p.stage === '已发布').length;
  const healthyCount = products.filter(p => p.health === 'healthy').length;

  const getStageBadgeColor = (stage: string) => {
    switch (stage) {
      case '商业化运营': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '已发布': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case '公测灰度': return 'bg-blue-50 text-blue-700 border-blue-200';
      case '研发中': return 'bg-purple-50 text-purple-700 border-purple-200';
      case '规划中': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const handleCreateMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProduct || !newMilestoneTitle.trim()) return;

    addProductMilestone(currentProduct.id, {
      id: `m-${Date.now()}`,
      title: newMilestoneTitle.trim(),
      date: newMilestoneDate,
      stage: '研发阶段',
      status: 'pending',
      owner: currentProduct.owner.split(' ')[0],
      deliverables: ['交付物文档待补齐'],
      description: '新创建的里程碑推进节点。'
    });

    setNewMilestoneTitle('');
    setShowAddMilestoneModal(false);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Modals */}
      {showCreateProductModal && (
        <CreateProductModal onClose={() => setShowCreateProductModal(false)} />
      )}
      {showAddDocModal && currentProduct && (
        <AddDocumentModal productId={currentProduct.id} onClose={() => setShowAddDocModal(false)} />
      )}
      {showAddSkillModal && currentProduct && (
        <AddSkillModal productId={currentProduct.id} onClose={() => setShowAddSkillModal(false)} />
      )}
      {showAddMilestoneModal && currentProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-base font-bold text-slate-800 mb-2">添加产品里程碑</h3>
            <p className="text-xs text-slate-400 mb-4">为【{currentProduct.name}】设定关键推进节点</p>
            <form onSubmit={handleCreateMilestone} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">里程碑名称 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 核心功能封闭验收与灰度放量"
                  value={newMilestoneTitle}
                  onChange={e => setNewMilestoneTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">计划交付日期</label>
                <input
                  type="date"
                  value={newMilestoneDate}
                  onChange={e => setNewMilestoneDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddMilestoneModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700"
                >
                  确认添加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW MODE 1: ALL PRODUCTS OVERVIEW (总览和管控所有产品) */}
      {!selectedProductId || !currentProduct ? (
        <div className="space-y-6">
          {/* Top Control Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-blue-500/20 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-400/30">
                    <Layers size={22} />
                  </div>
                  <h2 className="text-xl font-black">产品全生命周期总览与管控中枢</h2>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  总览企业产品战略画像、管控生命周期阶段推进与指标看板。AI 成果物生成请联动【产品研发中心】。
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => onNavigateToRnd?.(products[0]?.id || '')}
                  className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-600/25 transition-all"
                >
                  <Cpu size={15} />
                  <span>前往【产品研发中心】</span>
                </button>
              </div>
            </div>

            {/* Top Statistics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-800">
              <div className="bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">管控产品总数</div>
                <div className="text-2xl font-black text-white font-mono">{totalProducts} <span className="text-xs text-slate-400 font-normal">款</span></div>
              </div>

              <div className="bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">商业化 / 已发布</div>
                <div className="text-2xl font-black text-emerald-400 font-mono">{inOpsCount} <span className="text-xs text-slate-400 font-normal">款</span></div>
              </div>

              <div className="bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">研发中 / 灰度放量</div>
                <div className="text-2xl font-black text-indigo-400 font-mono">{inDevCount} <span className="text-xs text-slate-400 font-normal">款</span></div>
              </div>

              <div className="bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">健康度达标率</div>
                <div className="text-2xl font-black text-teal-400 font-mono">
                  {Math.round((healthyCount / totalProducts) * 100)}%
                </div>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                {stages.map((st) => (
                  <button
                    key={st}
                    onClick={() => setSelectedStage(st)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                      selectedStage === st
                        ? 'bg-white text-blue-600 shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {st === 'all' ? '全部阶段' : st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索产品名称、定位..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-slate-50 text-xs text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-60"
                />
              </div>

              <button
                onClick={() => setShowCreateProductModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm shrink-0"
              >
                <Plus size={14} />
                <span>新建产品</span>
              </button>
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredProducts.map((prod) => {
              const deliverables = getDeliverablesForProduct(prod.id);
              const readyCount = deliverables.filter(d => d.status === 'ready').length;

              return (
                <div
                  key={prod.id}
                  className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group flex flex-col justify-between"
                >
                  <div>
                    {/* Top Tags */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getStageBadgeColor(prod.stage)}`}>
                          {prod.stage}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                          {prod.category}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-400">
                          {prod.version}
                        </span>
                      </div>

                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                        prod.health === 'healthy' ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${prod.health === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {prod.status}
                      </span>
                    </div>

                    {/* Title & Tagline */}
                    <h3 
                      onClick={() => {
                        setSelectedProductId(prod.id);
                        setActiveDetailTab('overview');
                      }}
                      className="text-lg font-bold text-slate-800 hover:text-blue-600 cursor-pointer transition-colors mb-1"
                    >
                      {prod.name}
                    </h3>
                    <p className="text-xs font-medium text-slate-500 mb-3">
                      {prod.tagline}
                    </p>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-4">
                      {prod.description}
                    </p>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 mb-4 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100/80">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">生命周期管控进度</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px]">目标: {prod.deadline || '2025-06-30'}</span>
                          <span className="font-bold text-blue-600 font-mono">{prod.progress}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all"
                          style={{ width: `${prod.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* R&D Linkage Card */}
                    <div className="bg-indigo-50/70 rounded-2xl p-3.5 border border-indigo-100 mb-4 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-[11px] font-bold text-indigo-950 flex items-center gap-1.5">
                          <Cpu size={13} className="text-indigo-600" />
                          <span>产品研发中心成果物</span>
                        </div>
                        <div className="text-[11px] text-indigo-700">
                          已就绪 <strong className="font-mono">{readyCount}/18</strong> 份 AI 交付物、原型与代码
                        </div>
                      </div>

                      <button
                        onClick={() => onNavigateToRnd?.(prod.id)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-sm shrink-0"
                      >
                        <Sparkles size={12} />
                        <span>进入研发中心</span>
                      </button>
                    </div>
                  </div>

                  {/* Footer / Team & Navigation */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {prod.team.map((m, idx) => (
                          <div
                            key={idx}
                            className={`w-7 h-7 rounded-full text-white text-[10px] flex items-center justify-center font-bold ring-2 ring-white ${m.color || 'bg-blue-600'}`}
                            title={`${m.name} (${m.role})`}
                          >
                            {m.avatar}
                          </div>
                        ))}
                      </div>
                      <span className="text-xs text-slate-400 ml-1">{prod.owner.split(' ')[0]} 负责</span>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedProductId(prod.id);
                        setActiveDetailTab('overview');
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                    >
                      <span>产品总览与管控</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Create New Product Card */}
            <div
              onClick={() => setShowCreateProductModal(true)}
              className="bg-slate-50/60 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center p-8 text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/40 cursor-pointer transition-all min-h-[300px] group"
            >
              <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all">
                <Plus size={24} />
              </div>
              <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600">新建产品 / 项目</span>
              <p className="text-xs text-slate-400 text-center max-w-xs mt-1">
                建立全新的产品总览与管控档案，并可随时联动【产品研发中心】进行 AI 成果物生成
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW MODE 2: SINGLE PRODUCT GOVERNANCE & OVERVIEW (单品总览与管控详情) */
        <div className="space-y-6">
          {/* Top Breadcrumb & Switcher Header */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedProductId(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200"
                >
                  <ArrowLeft size={14} />
                  <span>返回产品总览</span>
                </button>

                <div className="h-4 w-px bg-slate-200" />

                {/* Product Switcher Dropdown */}
                <div className="relative flex items-center gap-2">
                  <span className="text-xs text-slate-400">切换产品:</span>
                  <select
                    value={currentProduct.id}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.stage})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Actions & R&D Linkage */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigateToRnd?.(currentProduct.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-xs font-bold hover:from-indigo-500 hover:to-blue-500 shadow-sm transition-all"
                >
                  <Cpu size={14} />
                  <span>进入【产品研发中心】生成成果物</span>
                </button>
                <button
                  onClick={() => setShowAddDocModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-100 border border-slate-200 transition-colors"
                >
                  <FileText size={14} className="text-indigo-600" />
                  <span>新建文档</span>
                </button>
                <button
                  onClick={() => setShowAddMilestoneModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Plus size={14} />
                  <span>添加里程碑</span>
                </button>
              </div>
            </div>

            {/* Product Identity Banner */}
            <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    {currentProduct.name}
                  </h1>
                  <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${getStageBadgeColor(currentProduct.stage)}`}>
                    {currentProduct.stage}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-100 text-slate-600">
                    {currentProduct.version}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {currentProduct.tagline} · 由 <span className="text-slate-700 font-bold">{currentProduct.owner}</span> 主导全生命周期管控
                </p>
              </div>

              {/* Progress and Health Snapshot */}
              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">管控推进度</div>
                  <div className="text-lg font-black text-blue-600 font-mono">{currentProduct.progress}%</div>
                </div>
                <div className="w-px h-8 bg-slate-200" />
                <div>
                  <div className="text-[11px] text-slate-400">健康度诊断</div>
                  <div className={`text-xs font-bold ${currentProduct.health === 'healthy' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {currentProduct.health === 'healthy' ? '● 状态健康' : '▲ 需关注风险'}
                  </div>
                </div>
              </div>
            </div>

            {/* Product Management Governance Navigation Tabs */}
            <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 overflow-x-auto custom-scrollbar">
              {/* Overview */}
              <button
                onClick={() => setActiveDetailTab('overview')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeDetailTab === 'overview'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Target size={14} />
                <span>产品画像与愿景</span>
              </button>

              {/* Governance */}
              <button
                onClick={() => setActiveDetailTab('governance')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeDetailTab === 'governance'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <ShieldCheck size={14} />
                <span>阶段管控与准入</span>
              </button>

              {/* Documents */}
              <button
                onClick={() => setActiveDetailTab('docs')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeDetailTab === 'docs'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <FileText size={14} />
                <span>产品文档中心 ({currentProduct.documents.length})</span>
              </button>

              {/* Analytics */}
              <button
                onClick={() => setActiveDetailTab('analytics')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeDetailTab === 'analytics'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <LineChart size={14} />
                <span>数据指标分析</span>
              </button>

              {/* Skills */}
              <button
                onClick={() => setActiveDetailTab('skills')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeDetailTab === 'skills'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Zap size={14} />
                <span>关联 Skill 矩阵 ({currentProduct.associatedSkills.length})</span>
              </button>

              {/* Milestones */}
              <button
                onClick={() => setActiveDetailTab('milestones')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  activeDetailTab === 'milestones'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Flag size={14} />
                <span>进度里程碑管控</span>
              </button>
            </div>
          </div>

          {/* Active Tab Content */}
          {activeDetailTab === 'overview' && (
            <ProductOverviewTab product={currentProduct} onNavigateToRnd={onNavigateToRnd} />
          )}

          {activeDetailTab === 'governance' && (
            <ProductGovernanceTab product={currentProduct} onNavigateToRnd={onNavigateToRnd} />
          )}

          {activeDetailTab === 'docs' && (
            <ProductDocsTab
              product={currentProduct}
              onAddDocument={() => setShowAddDocModal(true)}
            />
          )}

          {activeDetailTab === 'analytics' && (
            <ProductAnalyticsTab product={currentProduct} />
          )}

          {activeDetailTab === 'skills' && (
            <ProductSkillsTab
              product={currentProduct}
              onAddSkill={() => setShowAddSkillModal(true)}
            />
          )}

          {activeDetailTab === 'milestones' && (
            <ProductMilestonesTab
              product={currentProduct}
              onAddMilestone={() => setShowAddMilestoneModal(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
