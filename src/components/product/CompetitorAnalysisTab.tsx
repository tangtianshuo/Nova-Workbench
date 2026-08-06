/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import {
  Target,
  Sparkle,
  ArrowClockwise,
  ChartLineUp,
  ShieldWarning,
  CheckCircle,
  Crosshair,
  ChartBar,
  Stack,
  Lightning
} from '@phosphor-icons/react';
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
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';

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
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 z-50 bg-bg-primary text-text-primary text-xs px-4 py-2.5 rounded-xl shadow-shadow-lg border border-border-subtle flex items-center gap-2"
        >
          <Sparkle className="w-4 h-4 text-warning" weight="duotone" />
          <span>{toastMessage}</span>
        </motion.div>
      )}

      {/* Top Banner */}
      <Card variant="dark" className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-950 border-amber-500/20 p-6 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-400/30">
                <Crosshair className="w-6 h-6" weight="duotone" />
              </div>
              <h3 className="text-xl font-black">AI 竞品深度分析与商业破局中枢</h3>
            </div>
            <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
              围绕【{product.name}】自动推导多维雷达对比、竞品商业定价策略、SWOT 矩阵与差异化破局打法。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="!px-6 !py-3.5 !rounded-xl !text-xs !font-bold shadow-lg shadow-amber-500/25"
            >
              {isGenerating ? <ArrowClockwise className="w-4 h-4 animate-spin" weight="duotone" /> : <Sparkle className="w-4 h-4" weight="duotone" />}
              <span>AI 推导竞品破局分析</span>
            </Button>
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
      </Card>

      {/* Sub View Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <Card className="p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: 'radar' as const, icon: ChartBar, label: '多维能力对比雷达' },
              { key: 'competitors' as const, icon: Target, label: `核心竞品档案 (${compData.competitors?.length || 0})` },
              { key: 'swot' as const, icon: Stack, label: 'SWOT 战略态势矩阵' },
              { key: 'strategy' as const, icon: Lightning, label: '差异化破局策略' },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveSubView(key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeSubView === key ? 'bg-accent text-white shadow-sm' : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                }`}
              >
                <Icon size={14} weight="duotone" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Radar View */}
      {activeSubView === 'radar' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          <Card className="lg:col-span-8 p-6 md:p-8 space-y-4">
            <h4 className="font-bold text-text-primary text-sm flex items-center justify-between">
              <span>核心竞争维度多方雷达图谱</span>
              <span className="text-xs text-warning font-normal">本品 (蓝线) 处于领先区间</span>
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
          </Card>

          <div className="lg:col-span-4 space-y-4">
            <Card className="p-6 space-y-4">
              <h4 className="font-bold text-text-primary text-xs flex items-center gap-1.5">
                <ChartLineUp className="w-4 h-4 text-success" weight="duotone" />
                <span>关键优势与护城河 (Moat)</span>
              </h4>

              <div className="space-y-3 text-xs text-text-secondary">
                <div className="p-3 bg-success-subtle/60 rounded-xl border border-success-subtle">
                  <strong className="text-success block mb-1">1. 全生命周期成果物一键闭环</strong>
                  从 PRD、UI 原型、架构代码到测试用例 18 份交付物矩阵，直接节省 60%+ 产研周期。
                </div>
                <div className="p-3 bg-accent-subtle/60 rounded-xl border border-accent-subtle">
                  <strong className="text-accent block mb-1">2. 本地资产与工作区深度挂载</strong>
                  本地文件索引与项目无缝绑定，实现代码与文档双向活态更新。
                </div>
              </div>
            </Card>
          </div>
        </motion.div>
      )}

      {/* Competitors Profile List */}
      {activeSubView === 'competitors' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {compData.competitors?.map((c, idx) => (
            <Card key={idx} variant="interactive" className="p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                  <div>
                    <h4 className="font-bold text-text-primary text-sm">{c.name}</h4>
                    <span className="text-[11px] text-text-tertiary">市场份额: {c.marketShare}</span>
                  </div>
                  <Badge variant="warning">
                    {c.tag || '重点竞品'}
                  </Badge>
                </div>

                <div className="text-xs text-text-secondary">
                  商业模式: <strong className="text-text-primary font-medium">{c.pricing}</strong>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-bg-secondary space-y-1">
                    <span className="font-bold text-text-primary">核心优势 (Pros):</span>
                    <ul className="text-text-secondary space-y-0.5 list-disc list-inside">
                      {c.pros.map((p, pIdx) => (
                        <li key={pIdx}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-warning-subtle/50 space-y-1">
                    <span className="font-bold text-warning">核心短板 (Cons):</span>
                    <ul className="text-warning space-y-0.5 list-disc list-inside">
                      {c.cons.map((p, pIdx) => (
                        <li key={pIdx}>{p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </motion.div>
      )}

      {/* SWOT Matrix */}
      {activeSubView === 'swot' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="bg-success-subtle/40 rounded-3xl p-6 border border-success-subtle space-y-3">
            <h4 className="font-bold text-success text-sm flex items-center gap-2">
              <CheckCircle size={16} className="text-success" weight="duotone" />
              <span>优势 (Strengths)</span>
            </h4>
            <div className="space-y-2 text-xs text-success">
              {compData.swot?.strengths.map((s, i) => (
                <div key={i} className="bg-bg-primary/80 p-3 rounded-xl border border-success-subtle leading-relaxed">
                  {s}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-warning-subtle/40 rounded-3xl p-6 border border-warning-subtle space-y-3">
            <h4 className="font-bold text-warning text-sm flex items-center gap-2">
              <ShieldWarning size={16} className="text-warning" weight="duotone" />
              <span>劣势 (Weaknesses)</span>
            </h4>
            <div className="space-y-2 text-xs text-warning">
              {compData.swot?.weaknesses.map((w, i) => (
                <div key={i} className="bg-bg-primary/80 p-3 rounded-xl border border-warning-subtle leading-relaxed">
                  {w}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-accent-subtle/40 rounded-3xl p-6 border border-accent-subtle space-y-3">
            <h4 className="font-bold text-accent text-sm flex items-center gap-2">
              <Sparkle size={16} className="text-accent" weight="duotone" />
              <span>机会 (Opportunities)</span>
            </h4>
            <div className="space-y-2 text-xs text-accent">
              {compData.swot?.opportunities.map((o, i) => (
                <div key={i} className="bg-bg-primary/80 p-3 rounded-xl border border-accent-subtle leading-relaxed">
                  {o}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-danger-subtle/40 rounded-3xl p-6 border border-danger-subtle space-y-3">
            <h4 className="font-bold text-danger text-sm flex items-center gap-2">
              <Target size={16} className="text-danger" weight="duotone" />
              <span>威胁 (Threats)</span>
            </h4>
            <div className="space-y-2 text-xs text-danger">
              {compData.swot?.threats.map((t, i) => (
                <div key={i} className="bg-bg-primary/80 p-3 rounded-xl border border-danger-subtle leading-relaxed">
                  {t}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Differentiation Strategy View */}
      {activeSubView === 'strategy' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <Card className="p-8 space-y-6">
            <div className="border-b border-border-subtle pb-4">
              <h4 className="font-bold text-text-primary text-base flex items-center gap-2">
                <Lightning className="w-5 h-5 text-warning" weight="duotone" />
                <span>【{product.name}】差异化竞争策略与产品破局打法</span>
              </h4>
              <p className="text-xs text-text-tertiary mt-1">由 AI 竞争战略大模型根据当前市场态势推导生成</p>
            </div>

            <div className="prose prose-slate prose-sm max-w-none text-text-primary leading-relaxed">
              <ReactMarkdown>{compData.differentiationStrategy}</ReactMarkdown>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
