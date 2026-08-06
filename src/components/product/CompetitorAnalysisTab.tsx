/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import { 
  Target, 
  Sparkles, 
  RefreshCw, 
  Download, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  Crosshair, 
  BarChart3, 
  Layers, 
  ExternalLink,
  ChevronRight,
  Zap,
  ArrowUpRight
} from 'lucide-react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer, 
  Legend, 
  Tooltip 
} from 'recharts';
import ReactMarkdown from 'react-markdown';

interface Props {
  product: Product;
}

export function CompetitorAnalysisTab({ product }: Props) {
  const { getCompetitorDataForProduct, generateCompetitorAnalysisAI } = useApp();
  const compData = getCompetitorDataForProduct(product.id);

  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'radar' | 'competitors' | 'swot' | 'strategy'>('radar');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generateCompetitorAnalysisAI(product.id, promptInput);
      showToast('✨ AI 竞品深度分析与破局策略矩阵已更新！');
    } catch (e) {
      showToast('❌ 生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-amber-500/20 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-400/30">
                <Crosshair className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black">AI 竞品深度分析与商业破局中枢</h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              围绕【{product.name}】自动推导多维雷达对比、竞品商业定价策略、SWOT 矩阵与差异化破局打法。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>AI 推导竞品破局分析</span>
            </button>
          </div>
        </div>

        {/* Prompt Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="自定义分析侧重点（如：针对国内大模型产研团队的协同提效痛点强化差异化战略...）"
            className="w-full bg-slate-900/80 text-xs text-slate-200 placeholder:text-slate-500 rounded-xl px-4 py-2.5 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </div>
      </div>

      {/* Sub View Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
        <button
          onClick={() => setActiveSubView('radar')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubView === 'radar' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 size={14} />
          <span>多维能力对比雷达</span>
        </button>

        <button
          onClick={() => setActiveSubView('competitors')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubView === 'competitors' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Target size={14} />
          <span>核心竞品档案 ({compData.competitors?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveSubView('swot')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubView === 'swot' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Layers size={14} />
          <span>SWOT 战略态势矩阵</span>
        </button>

        <button
          onClick={() => setActiveSubView('strategy')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubView === 'strategy' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Zap size={14} />
          <span>差异化破局策略</span>
        </button>
      </div>

      {/* Radar View */}
      {activeSubView === 'radar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center justify-between">
              <span>核心竞争维度多方雷达图谱</span>
              <span className="text-xs text-amber-600 font-normal">本品 (蓝线) 处于领先区间</span>
            </h4>

            <div className="w-full h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={compData.radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="dimension" tick={{ fill: '#475569', fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Radar name={product.name} dataKey="ourProduct" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                  <Radar name="竞品 A (Linear/Notion)" dataKey="compA" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} />
                  <Radar name="竞品 B (Jira/Confluence)" dataKey="compB" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', color: '#fff', fontSize: '11px' }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>关键优势与护城河 (Moat)</span>
              </h4>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                  <strong className="text-emerald-900 block mb-1">1. 全生命周期成果物一键闭环</strong>
                  从 PRD、UI 原型、架构代码到测试用例 18 份交付物矩阵，直接节省 60%+ 产研周期。
                </div>
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                  <strong className="text-blue-900 block mb-1">2. 本地资产与工作区深度挂载</strong>
                  本地文件索引与项目无缝绑定，实现代码与文档双向活态更新。
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Competitors Profile List */}
      {activeSubView === 'competitors' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {compData.competitors?.map((c, idx) => (
            <div key={idx} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{c.name}</h4>
                    <span className="text-[11px] text-slate-400">市场份额: {c.marketShare}</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    {c.tag || '重点竞品'}
                  </span>
                </div>

                <div className="text-xs text-slate-500">
                  商业模式: <strong className="text-slate-700 font-medium">{c.pricing}</strong>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 space-y-1">
                    <span className="font-bold text-slate-700">核心优势 (Pros):</span>
                    <ul className="text-slate-600 space-y-0.5 list-disc list-inside">
                      {c.pros.map((p, pIdx) => (
                        <li key={pIdx}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-50/50 space-y-1">
                    <span className="font-bold text-amber-900">核心短板 (Cons):</span>
                    <ul className="text-amber-800 space-y-0.5 list-disc list-inside">
                      {c.cons.map((p, pIdx) => (
                        <li key={pIdx}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SWOT Matrix */}
      {activeSubView === 'swot' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-emerald-50/40 rounded-3xl p-6 border border-emerald-200 space-y-3">
            <h4 className="font-bold text-emerald-900 text-sm flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>优势 (Strengths)</span>
            </h4>
            <div className="space-y-2 text-xs text-emerald-800">
              {compData.swot?.strengths.map((s, i) => (
                <div key={i} className="bg-white/80 p-3 rounded-xl border border-emerald-100 leading-relaxed">
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50/40 rounded-3xl p-6 border border-amber-200 space-y-3">
            <h4 className="font-bold text-amber-900 text-sm flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-600" />
              <span>劣势 (Weaknesses)</span>
            </h4>
            <div className="space-y-2 text-xs text-amber-800">
              {compData.swot?.weaknesses.map((w, i) => (
                <div key={i} className="bg-white/80 p-3 rounded-xl border border-amber-100 leading-relaxed">
                  {w}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-50/40 rounded-3xl p-6 border border-blue-200 space-y-3">
            <h4 className="font-bold text-blue-900 text-sm flex items-center gap-2">
              <Sparkles size={16} className="text-blue-600" />
              <span>机会 (Opportunities)</span>
            </h4>
            <div className="space-y-2 text-xs text-blue-800">
              {compData.swot?.opportunities.map((o, i) => (
                <div key={i} className="bg-white/80 p-3 rounded-xl border border-blue-100 leading-relaxed">
                  {o}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-rose-50/40 rounded-3xl p-6 border border-rose-200 space-y-3">
            <h4 className="font-bold text-rose-900 text-sm flex items-center gap-2">
              <Target size={16} className="text-rose-600" />
              <span>威胁 (Threats)</span>
            </h4>
            <div className="space-y-2 text-xs text-rose-800">
              {compData.swot?.threats.map((t, i) => (
                <div key={i} className="bg-white/80 p-3 rounded-xl border border-rose-100 leading-relaxed">
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Differentiation Strategy View */}
      {activeSubView === 'strategy' && (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              <span>【{product.name}】差异化竞争策略与产品破局打法</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1">由 AI 竞争战略大模型根据当前市场态势推导生成</p>
          </div>

          <div className="prose prose-slate prose-sm max-w-none text-slate-800 leading-relaxed">
            <ReactMarkdown>{compData.differentiationStrategy}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
