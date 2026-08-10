/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import {
  ShieldCheck,
  Warning,
  CheckCircle,
  Clock,
  ArrowRight,
  Lock,
  Cpu,
  Sparkle,
  Users,
  Pulse,
  Sliders,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { ProgressBar } from '@/src/components/ui/ProgressBar';

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

  const deliverablePercent = Math.round((readyCount / (deliverables.length || 18)) * 100);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 z-50 bg-bg-primary text-text-primary text-xs px-4 py-2.5 rounded-[var(--radius-xl)] shadow-[var(--shadow-xl)] border border-border-subtle flex items-center gap-2"
        >
          <Sparkle size={16} weight="duotone" className="text-accent" />
          <span>{toastMessage}</span>
        </motion.div>
      )}

      {/* Top Banner: Governance Control Deck */}
      <Card
        variant="dark"
        className="p-6 md:p-8 space-y-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-bg-secondary text-text-primary rounded-[var(--radius-md)] border border-border-subtle">
                <ShieldCheck size={24} weight="duotone" />
              </div>
              <h3 className="text-xl font-black text-text-primary">产品全生命周期阶段管控与质量准入</h3>
            </div>
            <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
              管控【{product.name}】的阶段流转、门禁准入条件、风险阻断项审核与发布决策。成果物具体内容请在【产品研发中心】进行 AI 自动化生产。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => onNavigateToRnd?.(product.id)}
              size="lg"
              className="bg-gradient-to-r from-success to-teal-600 hover:from-success/90 hover:to-teal-500 shadow-[var(--shadow-lg)] shadow-success/25 h-auto py-3 px-5 text-xs font-bold rounded-[var(--radius-lg)]"
            >
              <Cpu size={16} weight="duotone" />
              <span>进入产品研发中心生成成果物</span>
            </Button>
          </div>
        </div>

        {/* Governance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-border-subtle">
          <div className="bg-bg-secondary p-4 rounded-[var(--radius-lg)] border border-border-subtle space-y-1">
            <div className="text-[11px] text-text-secondary">生命周期状态</div>
            <div className="text-base font-black text-text-primary font-mono">{product.stage}</div>
          </div>

          <div className="bg-bg-secondary p-4 rounded-[var(--radius-lg)] border border-border-subtle space-y-1">
            <div className="text-[11px] text-text-secondary">健康度诊断</div>
            <div className="text-base font-black font-mono">
              {product.health === 'healthy' ? (
                <span className="text-success">● 正常推进</span>
              ) : (
                <span className="text-warning">▲ 风险预警 ({product.status})</span>
              )}
            </div>
          </div>

          <div className="bg-bg-secondary p-4 rounded-[var(--radius-lg)] border border-border-subtle space-y-1">
            <div className="text-[11px] text-text-secondary">成果物就绪率</div>
            <div className="text-base font-black text-text-primary font-mono">
              {readyCount} / {deliverables.length || 18} 份
            </div>
          </div>

          <div className="bg-bg-secondary p-4 rounded-[var(--radius-lg)] border border-border-subtle space-y-1">
            <div className="text-[11px] text-text-secondary">准入安全分</div>
            <div className="text-base font-black text-text-primary font-mono">96 / 100</div>
          </div>
        </div>
      </Card>

      {/* Stage Flow Stepper & Action Controls */}
      <Card className="p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-border-subtle pb-4">
          <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
            <Sliders size={16} weight="duotone" className="text-accent" />
            <span>生命周期阶段流转与门禁管控</span>
          </h4>
          <span className="text-xs text-text-tertiary">点击阶段即可直接调整或推进产品流转状态</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {stagesList.map((st, idx) => {
            const isCurrent = product.stage === st.key;
            const isPassed = currentStageIndex > idx;
            return (
              <motion.div
                key={st.key}
                onClick={() => handleStageChange(st.key)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={`p-4 rounded-[var(--radius-lg)] border transition-all cursor-pointer space-y-2 flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-accent-subtle border-accent shadow-[var(--shadow-sm)]'
                    : isPassed
                    ? 'bg-bg-secondary/60 border-border hover:bg-bg-secondary'
                    : 'bg-bg-primary border-border-subtle hover:border-border opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    {isPassed ? (
                      <Badge variant="success">已通过</Badge>
                    ) : isCurrent ? (
                      <Badge variant="accent">当前阶段</Badge>
                    ) : (
                      <Badge variant="neutral">后续阶段</Badge>
                    )}
                    {isPassed && <CheckCircle size={14} weight="duotone" className="text-success" />}
                  </div>
                  <div className="font-bold text-xs text-text-primary">{st.label}</div>
                  <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">{st.desc}</p>
                </div>

                <div className={`pt-2 text-[10px] font-bold ${isCurrent ? 'text-accent' : 'text-text-tertiary'}`}>
                  {isCurrent ? '● 正在管控中' : '点击切换至此阶段'}
                </div>
              </motion.div>
            );
          })}
        </div>
      </Card>

      {/* Risk and Audit Governance Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Health & Risk Control */}
        <Card className="p-6 space-y-4">
          <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
            <Warning size={16} weight="duotone" className="text-warning" />
            <span>产品风险阻断项与健康状态调控</span>
          </h4>

          <div className="space-y-3">
            <div className="p-4 rounded-[var(--radius-lg)] bg-bg-secondary border border-border-subtle flex items-center justify-between">
              <div>
                <div className="font-bold text-xs text-text-primary">当前健康状态</div>
                <div className="text-[11px] text-text-secondary mt-0.5">
                  {product.health === 'healthy' ? '所有关键指标正常，无阻塞性卡点' : '存在未决技术架构或资源风险'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleHealthToggle('healthy')}
                  variant={product.health === 'healthy' ? 'primary' : 'secondary'}
                  size="xs"
                  className="rounded-[var(--radius-md)] text-xs font-bold"
                >
                  健康
                </Button>
                <Button
                  onClick={() => handleHealthToggle('warning')}
                  variant={product.health !== 'healthy' ? 'primary' : 'secondary'}
                  size="xs"
                  className={`rounded-[var(--radius-md)] text-xs font-bold ${
                    product.health !== 'healthy' ? 'bg-warning hover:bg-warning/90' : ''
                  }`}
                >
                  风险预警
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-[var(--radius-lg)] bg-accent-subtle/50 border border-accent/20 space-y-2">
              <div className="font-bold text-xs text-text-primary">产品管控核心合规清单：</div>
              <ul className="text-xs text-text-secondary space-y-1 list-disc list-inside">
                <li>数据安全合规性审查 (通过)</li>
                <li>高并发容量规划与降级熔断方案 (已就绪)</li>
                <li>全生命周期 18 份成果物在【产品研发中心】归档完整度达到 95%+</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Right: R&D Center Integration Linkage */}
        <Card className="p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
              <Cpu size={16} weight="duotone" className="text-accent" />
              <span>与【产品研发中心】的成果物关联关系</span>
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              【产品管理】专注于本产品的宏观总览、阶段流转、合规与健康度管控；而具体的 <strong>AI 需求设计、UI 原型、架构代码与测试用例</strong> 等工程成果物均在【产品研发中心】进行自动化生成与生产。
            </p>

            <div className="p-4 rounded-[var(--radius-lg)] bg-accent-subtle/40 border border-accent/15 space-y-2 text-xs">
              <div className="font-bold text-text-primary flex items-center justify-between">
                <span>当前关联研发成果物状态：</span>
                <span className="text-success font-mono font-bold">18/18 份已推导</span>
              </div>
              <div className="text-text-secondary text-[11px] leading-relaxed">
                随时可前往产品研发中心更新 PRD、重构代码脚手架或批量执行自动化测试流水线。
              </div>
            </div>
          </div>

          <Button
            onClick={() => onNavigateToRnd?.(product.id)}
            className="w-full py-3 bg-gradient-to-r from-accent to-blue-600 hover:from-accent-hover hover:to-blue-500 text-white text-xs font-bold rounded-[var(--radius-lg)] shadow-[var(--shadow-md)]"
          >
            <span>一键前往【产品研发中心】查看与生成成果物</span>
            <ArrowRight size={14} weight="duotone" />
          </Button>
        </Card>
      </div>
    </div>
  );
}
