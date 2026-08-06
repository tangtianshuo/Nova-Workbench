/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  FileCheck, 
  Lock, 
  Cpu, 
  Sparkles, 
  Users, 
  Activity,
  Sliders
} from 'lucide-react';

interface Props {
  product: Product;
  onNavigateToRnd?: (productId: string) => void;
}

export function ProductGovernanceTab({ product, onNavigateToRnd }: Props) {
  const { getDeliverablesForProduct, updateProduct } = useApp();
  const deliverables = getDeliverablesForProduct(product.id);
  const readyCount = deliverables.filter(d => d.status === 'ready').length;

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const stagesList: Array<{
    key: Product['stage'];
    label: string;
    desc: string;
  }> = [
    { key: '规划中', label: '1. 概念与商业规划', desc: '商业愿景确认、竞品分析、可行性论证' },
    { key: '研发中', label: '2. 深度研发与交付', desc: 'PRD交付、UI原型、架构代码、单元测试' },
    { key: '公测灰度', label: '3. 灰度内测与验收', desc: '质量准入通过、灰度放量、用户体验反馈' },
    { key: '商业化运营', label: '4. 商业化与规模运营', desc: '全量上线、商业计费、DAU/ROI监控' },
    { key: '已发布', label: '5. 稳定发布与迭代', desc: '长效运维、知识沉淀、版本演进' }
  ];

  const currentStageIndex = stagesList.findIndex(s => s.key === product.stage);

  const handleStageChange = (newStage: Product['stage']) => {
    updateProduct(product.id, { stage: newStage });
    showToast(`✅ 已将【${product.name}】推进至【${newStage}】阶段！`);
  };

  const handleHealthToggle = (newHealth: 'healthy' | 'warning' | 'critical') => {
    const newStatus: Product['status'] = newHealth === 'healthy' ? '按期推进' : '注意风险';
    updateProduct(product.id, { 
      health: newHealth,
      status: newStatus
    });
    showToast(`🔄 产品健康度已更新为：${newHealth === 'healthy' ? '健康' : '风险预警'}`);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner: Governance Control Deck */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-blue-500/20 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-400/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black">产品全生命周期阶段管控与质量准入</h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              管控【{product.name}】的阶段流转、门禁准入条件、风险阻断项审核与发布决策。成果物具体内容请在【产品研发中心】进行 AI 自动化生产。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateToRnd?.(product.id)}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-emerald-600/25 transition-all"
            >
              <Cpu className="w-4 h-4" />
              <span>进入产品研发中心生成成果物</span>
            </button>
          </div>
        </div>

        {/* Governance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-800">
          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">生命周期状态</div>
            <div className="text-base font-black text-blue-400 font-mono">{product.stage}</div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">健康度诊断</div>
            <div className="text-base font-black font-mono">
              {product.health === 'healthy' ? (
                <span className="text-emerald-400">● 正常推进</span>
              ) : (
                <span className="text-amber-400">▲ 风险预警 ({product.status})</span>
              )}
            </div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">成果物就绪率</div>
            <div className="text-base font-black text-indigo-400 font-mono">
              {readyCount} / {deliverables.length || 18} 份
            </div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">准入安全分</div>
            <div className="text-base font-black text-teal-400 font-mono">96 / 100</div>
          </div>
        </div>
      </div>

      {/* Stage Flow Stepper & Action Controls */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            <span>生命周期阶段流转与门禁管控</span>
          </h4>
          <span className="text-xs text-slate-400">点击阶段即可直接调整或推进产品流转状态</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {stagesList.map((st, idx) => {
            const isCurrent = product.stage === st.key;
            const isPassed = currentStageIndex > idx;
            return (
              <div
                key={st.key}
                onClick={() => handleStageChange(st.key)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-blue-50/80 border-blue-400 shadow-sm'
                    : isPassed
                    ? 'bg-slate-50/60 border-slate-200 hover:bg-slate-100'
                    : 'bg-white border-slate-100 hover:border-slate-200 opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      isCurrent ? 'bg-blue-600 text-white' : isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isPassed ? '已通过' : isCurrent ? '当前阶段' : '后续阶段'}
                    </span>
                    {isPassed && <CheckCircle2 size={14} className="text-emerald-600" />}
                  </div>
                  <div className="font-bold text-xs text-slate-800">{st.label}</div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{st.desc}</p>
                </div>

                <div className="pt-2 text-[10px] text-blue-600 font-bold">
                  {isCurrent ? '● 正在管控中' : '点击切换至此阶段'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Risk and Audit Governance Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Health & Risk Control */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>产品风险阻断项与健康状态调控</span>
          </h4>

          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <div className="font-bold text-xs text-slate-800">当前健康状态</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {product.health === 'healthy' ? '所有关键指标正常，无阻塞性卡点' : '存在未决技术架构或资源风险'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleHealthToggle('healthy')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    product.health === 'healthy'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  健康
                </button>
                <button
                  onClick={() => handleHealthToggle('warning')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    product.health !== 'healthy'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  风险预警
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2">
              <div className="font-bold text-xs text-blue-900">产品管控核心合规清单：</div>
              <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                <li>数据安全合规性审查 (通过)</li>
                <li>高并发容量规划与降级熔断方案 (已就绪)</li>
                <li>全生命周期 18 份成果物在【产品研发中心】归档完整度达到 95%+</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right: R&D Center Integration Linkage */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <span>与【产品研发中心】的成果物关联关系</span>
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              【产品管理】专注于本产品的宏观总览、阶段流转、合规与健康度管控；而具体的 <strong>AI 需求设计、UI 原型、架构代码与测试用例</strong> 等工程成果物均在【产品研发中心】进行自动化生成与生产。
            </p>

            <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2 text-xs">
              <div className="font-bold text-indigo-950 flex items-center justify-between">
                <span>当前关联研发成果物状态：</span>
                <span className="text-emerald-600 font-mono font-bold">18/18 份已推导</span>
              </div>
              <div className="text-indigo-800 text-[11px] leading-relaxed">
                随时可前往产品研发中心更新 PRD、重构代码脚手架或批量执行自动化测试流水线。
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateToRnd?.(product.id)}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>一键前往【产品研发中心】查看与生成成果物</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
