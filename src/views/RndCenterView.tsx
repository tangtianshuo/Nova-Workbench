/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { 
  Sparkles, 
  Layers, 
  Cpu, 
  Bot, 
  Layout, 
  Code2, 
  ShieldCheck, 
  Crosshair, 
  BookOpen, 
  ArrowLeft, 
  ExternalLink,
  ChevronRight,
  RefreshCw,
  FolderGit2,
  Box,
  CheckCircle2,
  SlidersHorizontal,
  Flame
} from 'lucide-react';

import { FullDeliverablesTab } from '../components/product/FullDeliverablesTab';
import { AIRequirementsTab } from '../components/product/AIRequirementsTab';
import { UIPrototypeTab } from '../components/product/UIPrototypeTab';
import { ProductKnowledgeTab } from '../components/product/ProductKnowledgeTab';
import { CodeManagementTab } from '../components/product/CodeManagementTab';
import { TestManagementTab } from '../components/product/TestManagementTab';
import { CompetitorAnalysisTab } from '../components/product/CompetitorAnalysisTab';

export type RndTabKey = 
  | 'deliverables' 
  | 'requirements' 
  | 'prototypes' 
  | 'code' 
  | 'testing' 
  | 'competitors' 
  | 'knowledge';

interface Props {
  onNavigateTab?: (tabId: string) => void;
}

export function RndCenterView({ onNavigateTab }: Props) {
  const { products, selectedProductId, setSelectedProductId, getDeliverablesForProduct } = useApp();

  const [activeRndTab, setActiveRndTab] = useState<RndTabKey>('deliverables');

  // Ensure an active product is selected
  const currentProduct = products.find(p => p.id === selectedProductId) || products[0];
  const deliverables = currentProduct ? getDeliverablesForProduct(currentProduct.id) : [];
  const readyDeliverablesCount = deliverables.filter(d => d.status === 'ready').length;

  if (!currentProduct) {
    return (
      <div className="text-center py-20 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-700">暂无关联产品</h3>
        <p className="text-xs text-slate-400 mt-1">请先在【产品管理】中创建产品后再进入研发中心生成成果物</p>
        <button
          onClick={() => onNavigateTab?.('product-management')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700"
        >
          前往产品管理
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: R&D Center Purpose and Associated Product Switcher */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-indigo-500/20 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-400/30 shadow-inner">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight">产品研发中心</h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1">
                    <Sparkles size={11} className="text-amber-400" />
                    <span>AI 成果物生成中枢</span>
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5 max-w-2xl leading-relaxed">
                  通过 AI 大模型全自动推导和生成当前关联产品的 18 份全生命周期交付物、需求规范、高保真原型、全栈代码脚手架与自动化测试集。
                </p>
              </div>
            </div>
          </div>

          {/* Associated Product Selector & Management Switcher */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-900/90 p-3 rounded-2xl border border-indigo-500/30">
            <div className="space-y-1">
              <div className="text-[10px] text-slate-400 font-medium">当前研发关联产品：</div>
              <select
                value={currentProduct.id}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl border border-indigo-400/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    📦 {p.name} ({p.stage})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => onNavigateTab?.('product-management')}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl transition-all border border-indigo-400/30 shadow-sm shrink-0 self-end"
              title="前往产品管理总览和管控该产品"
            >
              <Layers size={13} />
              <span>产品管控看板</span>
            </button>
          </div>
        </div>

        {/* Current Product R&D Status Snapshot Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">已就绪成果物</div>
              <div className="text-lg font-black text-emerald-400 font-mono">
                {readyDeliverablesCount} / {deliverables.length || 18} <span className="text-xs text-slate-400 font-normal">份</span>
              </div>
            </div>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">当前研发阶段</div>
              <div className="text-base font-bold text-indigo-300 font-mono">{currentProduct.stage}</div>
            </div>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Box size={18} />
            </div>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">版本定义</div>
              <div className="text-base font-bold text-slate-200 font-mono">{currentProduct.version}</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
              <FolderGit2 size={18} />
            </div>
          </div>

          <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">产品负责人</div>
              <div className="text-base font-bold text-slate-200">{currentProduct.owner}</div>
            </div>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Flame size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* R&D Center Workspace Tabs Navigation */}
      <div className="flex items-center gap-2 bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto custom-scrollbar">
        {/* Deliverables Factory */}
        <button
          onClick={() => setActiveRndTab('deliverables')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeRndTab === 'deliverables'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Sparkles size={14} className={activeRndTab === 'deliverables' ? 'text-white' : 'text-emerald-600'} />
          <span>全套成果物工坊 (18)</span>
        </button>

        {/* AI Requirements */}
        <button
          onClick={() => setActiveRndTab('requirements')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeRndTab === 'requirements'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Bot size={14} className={activeRndTab === 'requirements' ? 'text-white' : 'text-indigo-600'} />
          <span>AI 需求设计 (PRD)</span>
        </button>

        {/* UI Prototype */}
        <button
          onClick={() => setActiveRndTab('prototypes')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeRndTab === 'prototypes'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Layout size={14} className={activeRndTab === 'prototypes' ? 'text-white' : 'text-purple-600'} />
          <span>AI 交互原型</span>
        </button>

        {/* Code Scaffolds */}
        <button
          onClick={() => setActiveRndTab('code')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeRndTab === 'code'
              ? 'bg-slate-900 text-white shadow-md shadow-slate-900/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Code2 size={14} className={activeRndTab === 'code' ? 'text-white' : 'text-slate-700'} />
          <span>代码架构脚手架</span>
        </button>

        {/* Test Management */}
        <button
          onClick={() => setActiveRndTab('testing')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeRndTab === 'testing'
              ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <ShieldCheck size={14} className={activeRndTab === 'testing' ? 'text-white' : 'text-teal-600'} />
          <span>测试与质量准入</span>
        </button>

        {/* Competitors */}
        <button
          onClick={() => setActiveRndTab('competitors')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeRndTab === 'competitors'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <Crosshair size={14} className={activeRndTab === 'competitors' ? 'text-white' : 'text-amber-600'} />
          <span>竞品雷达与破局</span>
        </button>

        {/* Knowledge Base */}
        <button
          onClick={() => setActiveRndTab('knowledge')}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeRndTab === 'knowledge'
              ? 'bg-purple-700 text-white shadow-md shadow-purple-700/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <BookOpen size={14} className={activeRndTab === 'knowledge' ? 'text-white' : 'text-purple-700'} />
          <span>产品领域知识库</span>
        </button>
      </div>

      {/* Main R&D Workspace Content */}
      <div className="transition-all">
        {activeRndTab === 'deliverables' && (
          <FullDeliverablesTab product={currentProduct} />
        )}

        {activeRndTab === 'requirements' && (
          <AIRequirementsTab product={currentProduct} />
        )}

        {activeRndTab === 'prototypes' && (
          <UIPrototypeTab product={currentProduct} />
        )}

        {activeRndTab === 'code' && (
          <CodeManagementTab product={currentProduct} />
        )}

        {activeRndTab === 'testing' && (
          <TestManagementTab product={currentProduct} />
        )}

        {activeRndTab === 'competitors' && (
          <CompetitorAnalysisTab product={currentProduct} />
        )}

        {activeRndTab === 'knowledge' && (
          <ProductKnowledgeTab product={currentProduct} />
        )}
      </div>
    </div>
  );
}
