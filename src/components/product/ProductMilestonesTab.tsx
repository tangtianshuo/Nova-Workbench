import { useState } from 'react';
import { motion } from 'motion/react';
import { Product, ProductMilestone, ProductRisk } from '../../data/mockProducts';
import type { FullLifecycleDeliverable } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import {
  Flag,
  CheckCircle,
  Clock,
  Circle,
  Warning,
  ShieldCheck,
  FileText,
  Plus,
  ArrowRight
} from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { ProgressBar } from '@/src/components/ui/ProgressBar';

interface Props {
  product: Product;
  onAddMilestone: () => void;
}

interface MilestoneDeliverableReference {
  reference: string;
  deliverable?: FullLifecycleDeliverable;
}

export function ProductMilestonesTab({ product, onAddMilestone }: Props) {
  const { updateMilestoneStatus, getProjectTaskCount, getDeliverablesForProduct } = useApp();
  const [activeStageFilter, setActiveStageFilter] = useState<string>('all');

  const taskCount = getProjectTaskCount(product.id);
  const deliverables = getDeliverablesForProduct(product.id);
  const completedCount = product.milestones.filter(m => m.status === 'completed').length;
  const totalMilestones = product.milestones.length;

  const getMilestoneDeliverables = (milestone: ProductMilestone): MilestoneDeliverableReference[] => {
    const codes = milestone.deliverableCodes?.filter(Boolean);
    if (codes && codes.length > 0) {
      return codes.map((code) => ({
        reference: code,
        deliverable: deliverables.find((item) => item.code === code),
      }));
    }

    return (milestone.deliverables || []).filter(Boolean).map((legacyTitle) => ({
      reference: legacyTitle,
      deliverable: deliverables.find(
        (item) => item.title.includes(legacyTitle) || legacyTitle.includes(item.title),
      ),
    }));
  };

  const renderDeliverableStatus = (milestone: ProductMilestone) => {
    const references = getMilestoneDeliverables(milestone);
    if (references.length === 0) return null;

    return (
      <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-2 border-t border-border-subtle">
        <span className="text-[10px] text-text-tertiary mr-1 flex items-center gap-1">
          <FileText size={11} weight="duotone" /> 交付物状态:
        </span>
        {references.map(({ reference, deliverable }) => {
          const status = deliverable?.status;
          const statusLabel = status === 'ready' ? '就绪' : status === 'generating' ? '生成中' : '草稿';
          const statusIcon = status === 'ready'
            ? <CheckCircle size={10} weight="fill" />
            : status === 'generating'
            ? <Clock size={10} />
            : <Circle size={10} />;

          return deliverable ? (
            <Badge
              key={`${reference}-${deliverable.code}`}
              variant={status === 'ready' ? 'success' : status === 'generating' ? 'warning' : 'neutral'}
              className="text-[10px]"
              title={`${deliverable.code} · ${deliverable.title}`}
            >
              {statusIcon}
              <span>{deliverable.title.length > 16 ? `${deliverable.title.slice(0, 16)}...` : deliverable.title}</span>
              <span>{statusLabel}</span>
            </Badge>
          ) : (
            <Badge key={`${reference}-unlinked`} variant="neutral" className="text-[10px] text-text-tertiary" title={reference}>
              <Circle size={10} />
              <span>未关联 · {reference.length > 16 ? `${reference.slice(0, 16)}...` : reference}</span>
            </Badge>
          );
        })}
      </div>
    );
  };

  const handleToggleStatus = (m: ProductMilestone, idx: number) => {
    const mId = m.id || `m-${idx}`;
    const nextStatus = m.status === 'completed' ? 'in-progress' : m.status === 'in-progress' ? 'pending' : 'completed';
    updateMilestoneStatus(product.id, mId, nextStatus);
  };

  return (
    <div className="space-y-6">
      {/* Top Lifecycle Progress Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary">产品全生命周期推进大盘</h3>
                <Badge variant={product.status === '按期推进' ? 'success' : 'accent'}>
                  {product.status}
                </Badge>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5">
                目标发版时间: <span className="font-mono text-text-primary font-bold">{product.deadline || '2025-06-30'}</span> · 当前已完成 {completedCount}/{totalMilestones} 个核心里程碑
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-text-tertiary">总体推进度</div>
                <div className="text-2xl font-black text-accent font-mono">{product.progress}%</div>
              </div>
              <Button variant="primary" size="sm" onClick={onAddMilestone}>
                <Plus size={14} weight="duotone" />
                <span>新建里程碑</span>
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          <ProgressBar value={product.progress} variant="accent" size="md" />

          {/* Milestone Steps Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-border-subtle text-xs">
            {product.milestones.map((m, idx) => {
              const isDone = m.status === 'completed';
              const isCurrent = m.status === 'in-progress';

              return (
                <motion.div
                  key={idx}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleToggleStatus(m, idx)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isDone
                      ? 'bg-success-subtle/50 border-success-subtle/60'
                      : isCurrent
                      ? 'bg-accent-subtle/50 border-accent shadow-sm ring-1 ring-accent/20'
                      : 'bg-bg-secondary border-border-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono text-text-tertiary font-medium">{m.date}</span>
                    {isDone && <CheckCircle size={14} className="text-success" weight="duotone" />}
                    {isCurrent && <Clock size={14} className="text-accent animate-pulse" weight="duotone" />}
                    {!isDone && !isCurrent && <Circle size={14} className="text-text-tertiary" weight="duotone" />}
                  </div>
                  <div className="font-bold text-text-primary line-clamp-1">{m.title}</div>
                  <div className="text-[11px] text-text-tertiary mt-1 flex items-center justify-between">
                    <span>{m.stage || '推进中'}</span>
                    <span className="font-medium text-text-secondary">{m.owner || product.owner.split(' ')[0]}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Main Grid: Milestones Detail Timeline & Risk Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Detailed Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.05 }}
          className="lg:col-span-7"
        >
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Flag size={18} className="text-accent" weight="duotone" />
                <span>关键交付里程碑时间轴</span>
              </h3>
              <span className="text-xs text-text-tertiary">点击卡片可快速变更推进状态</span>
            </div>

            <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border-subtle">
              {product.milestones.map((m, idx) => {
                const isDone = m.status === 'completed';
                const isCurrent = m.status === 'in-progress';

                return (
                  <div key={idx} className="relative group">
                    {/* Timeline dot */}
                    <div className={`absolute -left-[27px] top-1.5 w-4 h-4 rounded-full border-2 border-bg-primary flex items-center justify-center transition-all ${
                      isDone
                        ? 'bg-success ring-4 ring-success-subtle'
                        : isCurrent
                        ? 'bg-accent ring-4 ring-accent-subtle'
                        : 'bg-text-tertiary'
                    }`} />

                    <div className="bg-bg-secondary/70 hover:bg-bg-secondary p-4 rounded-2xl border border-border-subtle transition-all">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div>
                          <span className="text-[11px] font-mono text-accent font-bold mr-2">{m.date}</span>
                          <span className="text-xs font-bold text-text-primary">{m.title}</span>
                        </div>
                        <Badge variant={
                          isDone ? 'success' : isCurrent ? 'accent' : 'neutral'
                        }>
                          {isDone ? '已完成' : isCurrent ? '进行中' : '未开始'}
                        </Badge>
                      </div>

                      {m.description && (
                        <p className="text-xs text-text-secondary mb-3 leading-relaxed">{m.description}</p>
                      )}

                      {m.deliverables && m.deliverables.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border-subtle">
                          <span className="text-[10px] text-text-tertiary mr-1 flex items-center gap-1">
                            <FileText size={11} weight="duotone" /> 交付物:
                          </span>
                          {m.deliverables.map((d, dIdx) => (
                            <span key={dIdx} className="px-2 py-0.5 bg-bg-primary border border-border-subtle rounded text-[11px] text-text-primary font-medium">
                              {d}
                            </span>
                          ))}
                        </div>
                      )}

                      {renderDeliverableStatus(m)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Right: Risks & Blockers + Task Kanban Summary */}
        <div className="lg:col-span-5 space-y-6">
          {/* Risks & Blockers */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }}
          >
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <Warning size={18} className="text-warning" weight="duotone" />
                  <span>风险预警与阻塞项治理</span>
                </h3>
                <span className="text-xs font-bold text-text-tertiary">
                  {product.risksAndBlockers.length} 项记录
                </span>
              </div>

              {product.risksAndBlockers.length === 0 ? (
                <div className="text-center py-8 text-text-tertiary text-xs">
                  <ShieldCheck size={32} className="text-success mx-auto mb-2" weight="duotone" />
                  <p className="font-medium text-text-secondary">当前暂无高危风险与阻塞项</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {product.risksAndBlockers.map((risk) => (
                    <div key={risk.id} className="p-3.5 rounded-xl border border-border-subtle bg-bg-secondary/60 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant={
                          risk.level === 'high'
                            ? 'danger'
                            : risk.level === 'medium'
                            ? 'warning'
                            : 'accent'
                        }>
                          {risk.level === 'high' ? '高风险' : risk.level === 'medium' ? '中等风险' : '低风险'}
                        </Badge>
                        <span className={`text-[10px] font-bold ${risk.status === 'resolved' ? 'text-success' : 'text-warning'}`}>
                          {risk.status === 'resolved' ? '已化解' : '跟进中'}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-text-primary">{risk.title}</div>

                      <div className="text-[11px] text-text-secondary leading-relaxed">
                        <span className="font-bold text-text-primary">影响分析：</span>{risk.impact}
                      </div>

                      <div className="text-[11px] text-success bg-success-subtle/60 p-2 rounded-lg border border-success-subtle">
                        <span className="font-bold">应对措施：</span>{risk.mitigation}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>

          {/* Task Linkage Card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.15 }}
          >
            <Card variant="dark" className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-text-tertiary uppercase tracking-wider">关联任务矩阵</span>
                  <Badge variant="accent">
                    {taskCount} 项任务
                  </Badge>
                </div>
                <h4 className="text-base font-bold text-text-primary mb-2">
                  需求与研发任务实时双向同步
                </h4>
                <p className="text-xs text-text-secondary leading-relaxed">
                  当前产品下的所有 Milestone 节点均已自动映射到任务看板与日历，支持团队成员按优先级敏捷认领与状态推进。
                </p>
              </div>

              <div className="pt-4 mt-4 border-t border-border-subtle/60 flex items-center justify-between">
                <span className="text-xs text-text-tertiary">已关联到全局任务中心</span>
                <div className="flex items-center gap-1 text-xs text-accent font-bold">
                  <span>看板流转中</span>
                  <ArrowRight size={14} weight="duotone" />
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
