import { useState } from 'react';
import { motion } from 'motion/react';
import { Product, ProductSkill } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import {
  Lightning,
  Play,
  CheckCircle,
  Plus,
  Cpu,
  Clock,
  Sparkle,
  ArrowClockwise,
  X
} from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';

interface Props {
  product: Product;
  onAddSkill: () => void;
}

export function ProductSkillsTab({ product, onAddSkill }: Props) {
  const { toggleSkillStatus, runProductSkill } = useApp();
  const [runningSkillId, setRunningSkillId] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<{
    skillName: string;
    title: string;
    time: string;
    summary: string;
    details: string[];
  } | null>(null);

  const handleRunSkill = async (skill: ProductSkill) => {
    setRunningSkillId(skill.id);
    try {
      await runProductSkill(product.id, skill.id);
      if (skill.sampleResult) {
        setSelectedResult({
          skillName: skill.name,
          ...skill.sampleResult
        });
      } else {
        setSelectedResult({
          skillName: skill.name,
          title: `${skill.name} 执行完成`,
          time: new Date().toLocaleTimeString(),
          summary: `已成功对【${product.name}】全量工作区资产完成自动化分析与扫描。`,
          details: [
            '已扫描产品 PRD 需求文档与接口定义',
            '合规度与完整性评估得分 98.2 分',
            '自动化建议与优化报告已同步至本地工作区'
          ]
        });
      }
    } finally {
      setRunningSkillId(null);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case '需求分析': return 'accent';
      case '代码审查': return 'accent';
      case '质量测试': return 'success';
      case '竞品监控': return 'warning';
      case '用户运营': return 'danger';
      default: return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <Card variant="dark" className="bg-gradient-to-r from-blue-500/20 via-indigo-500/10 to-bg-tertiary border-blue-500/20 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-lg bg-bg-secondary/50 backdrop-blur-sm">
              <Lightning size={16} weight="duotone" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-100">
              AI Skill & Multi-Agent 赋能矩阵
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            当前产品已挂载 {product.associatedSkills.length} 项专属智能 Agent 技能
          </h2>
          <p className="text-xs text-text-secondary mt-1 max-w-2xl">
            智能 Skill 能够深度联动当前产品下的 PRD 文档、接口规范、本地代码工程与历史指标，实现需求自检、用例自动生成与质量巡检。
          </p>
        </div>

        <Button
          onClick={onAddSkill}
          variant="secondary"
          className="!bg-bg-primary !text-accent !border-0 shadow-sm shrink-0 self-start md:self-auto"
        >
          <Plus size={16} weight="duotone" />
          <span>关联新 Skill</span>
        </Button>
      </Card>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {product.associatedSkills.map((skill, idx) => {
          const isRunning = runningSkillId === skill.id || skill.status === 'running';

          return (
            <motion.div
              key={skill.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, delay: idx * 0.05 }}
            >
              <Card variant="interactive" className="p-5 flex flex-col justify-between group">
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-subtle text-accent flex items-center justify-center font-bold">
                        <Lightning size={20} weight="duotone" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-text-primary">{skill.name}</h4>
                          <Badge variant={getCategoryColor(skill.category)}>
                            {skill.category}
                          </Badge>
                        </div>
                        <span className="text-[11px] font-mono text-text-tertiary font-medium">
                          {skill.code}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={skill.status === 'active' ? 'success' : isRunning ? 'accent' : 'neutral'}
                        className="gap-1.5"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          skill.status === 'active' ? 'bg-success' : isRunning ? 'bg-accent animate-pulse' : 'bg-text-tertiary'
                        }`} />
                        {isRunning ? '正在运行' : skill.status === 'active' ? '已就绪' : '已暂停'}
                      </Badge>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-text-secondary leading-relaxed mb-4">
                    {skill.description}
                  </p>

                  {/* Meta details */}
                  <div className="grid grid-cols-3 gap-2 bg-bg-secondary p-3 rounded-xl border border-border-subtle mb-4 text-center">
                    <div>
                      <div className="text-[10px] text-text-tertiary">调用总数</div>
                      <div className="text-xs font-bold text-text-primary font-mono mt-0.5">{skill.invocations} 次</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-tertiary">成功率</div>
                      <div className="text-xs font-bold text-success font-mono mt-0.5">{skill.successRate}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-tertiary">平均耗时</div>
                      <div className="text-xs font-bold text-text-primary font-mono mt-0.5">{skill.avgRuntime}</div>
                    </div>
                  </div>

                  {/* Model & Config Pill */}
                  <div className="flex items-center justify-between text-[11px] text-text-tertiary px-1 mb-4">
                    <span className="flex items-center gap-1">
                      <Cpu size={12} className="text-accent" weight="duotone" />
                      底座模型: <span className="font-semibold text-text-primary">{skill.config.model}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} weight="duotone" />
                      最近调用: {skill.lastInvoked}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => toggleSkillStatus(product.id, skill.id)}
                  >
                    {skill.status === 'active' ? '暂停技能' : '恢复启用'}
                  </Button>

                  <div className="flex items-center gap-2">
                    {skill.sampleResult && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setSelectedResult({ skillName: skill.name, ...skill.sampleResult! })}
                        className="!text-accent"
                      >
                        查看报告
                      </Button>
                    )}

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRunSkill(skill)}
                      disabled={isRunning}
                    >
                      {isRunning ? (
                        <>
                          <ArrowClockwise size={14} className="animate-spin" weight="duotone" />
                          <span>正在执行...</span>
                        </>
                      ) : (
                        <>
                          <Play size={14} weight="duotone" />
                          <span>立即执行</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Output / Diagnostic Result Modal */}
      {selectedResult && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedResult(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-bg-primary rounded-3xl max-w-2xl w-full p-6 shadow-shadow-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-accent-subtle text-accent">
                  <Sparkle size={18} weight="duotone" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">{selectedResult.title}</h3>
                  <p className="text-xs text-text-tertiary">由 【{selectedResult.skillName}】 生成 · {selectedResult.time}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedResult(null)}
                className="p-2 rounded-full hover:bg-bg-secondary text-text-tertiary hover:text-text-primary transition-colors"
              >
                <X size={18} weight="duotone" />
              </button>
            </div>

            <div className="py-5 space-y-4 text-xs text-text-secondary">
              <div className="p-3.5 bg-accent-subtle/60 rounded-xl border border-accent-subtle text-text-primary leading-relaxed font-medium">
                {selectedResult.summary}
              </div>

              <div>
                <div className="font-bold text-text-primary text-xs mb-2">执行诊断细节与建议清单：</div>
                <div className="space-y-2">
                  {selectedResult.details.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2.5 rounded-xl bg-bg-secondary border border-border-subtle text-xs text-text-secondary">
                      <CheckCircle size={14} className="text-success shrink-0 mt-0.5" weight="duotone" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border-subtle flex justify-end gap-2">
              <Button variant="primary" onClick={() => setSelectedResult(null)}>
                确认并关闭
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
