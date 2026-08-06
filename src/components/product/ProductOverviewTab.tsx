import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import {
  Target,
  Users,
  Stack,
  Code,
  CheckCircle,
  Clock,
  Warning,
  Sparkle,
  ShieldCheck,
  Lightning,
  FileText,
  ChartLine,
  Robot,
  ArrowRight,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Avatar } from '@/src/components/ui/Avatar';
import { Separator } from '@/src/components/ui/Separator';

interface Props {
  product: Product;
  onNavigateToRnd?: (productId: string) => void;
}

export function ProductOverviewTab({ product, onNavigateToRnd }: Props) {
  const [filterModule, setFilterModule] = useState<string>('all');

  const modules = ['all', ...Array.from(new Set(product.featureMatrix.map(f => f.module)))];

  const filteredFeatures = filterModule === 'all'
    ? product.featureMatrix
    : product.featureMatrix.filter(f => f.module === filterModule);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Bot': return <Robot size={20} weight="duotone" className="text-accent" />;
      case 'FileText': return <FileText size={20} weight="duotone" className="text-accent" />;
      case 'Zap': return <Lightning size={20} weight="duotone" className="text-warning" />;
      case 'LineChart': return <ChartLine size={20} weight="duotone" className="text-success" />;
      default: return <Sparkle size={20} weight="duotone" className="text-accent" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '已上线':
        return (
          <Badge variant="success" className="gap-1.5">
            <CheckCircle size={12} weight="duotone" />
            {status}
          </Badge>
        );
      case '开发中':
        return (
          <Badge variant="accent" className="gap-1.5">
            <Clock size={12} weight="duotone" />
            {status}
          </Badge>
        );
      case '规划中':
        return (
          <Badge variant="neutral" className="gap-1.5">
            <Warning size={12} weight="duotone" />
            {status}
          </Badge>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'P0':
        return <Badge variant="danger">{priority}</Badge>;
      case 'P1':
        return <Badge variant="warning">{priority}</Badge>;
      default:
        return <Badge variant="neutral">{priority}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* R&D Center Linkage Banner */}
      <Card className="p-4 bg-accent-subtle border-accent/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[var(--radius-md)] bg-accent text-white shadow-sm shrink-0">
              <Sparkle size={18} weight="duotone" />
            </div>
            <div>
              <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                <span>【产品研发中心】AI 成果物工坊已就绪</span>
                <Badge variant="accent" className="text-[10px]">
                  18 份交付物 · 原型 · 代码 · 测试
                </Badge>
              </div>
              <p className="text-[11px] text-text-secondary mt-0.5">
                本页面用于总览和管控【{product.name}】；若需 AI 自动化推导与生成 PRD、原型、脚手架或测试集，可直接前往研发中心。
              </p>
            </div>
          </div>

          <Button
            onClick={() => onNavigateToRnd?.(product.id)}
            size="sm"
            className="text-xs font-bold shrink-0 self-start sm:self-auto"
          >
            <span>进入研发中心</span>
            <ArrowRight size={13} weight="duotone" />
          </Button>
        </div>
      </Card>

      {/* Product Positioning & Target Audience */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Positioning */}
        <Card className="lg:col-span-7 p-6 space-y-4">
          <div className="flex items-center gap-2 text-text-primary font-bold text-base">
            <div className="p-2 rounded-[var(--radius-md)] bg-accent-subtle text-accent">
              <Target size={20} weight="duotone" />
            </div>
            <span>产品核心定位与愿景</span>
          </div>
          <p className="text-text-secondary leading-relaxed text-sm bg-bg-secondary/80 p-4 rounded-[var(--radius-md)] border border-border-subtle">
            {product.positioning}
          </p>

          <div className="pt-2">
            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2.5">
              技术架构栈选型
            </div>
            <div className="flex flex-wrap gap-2">
              {product.techStack.map((tech, idx) => (
                <Badge key={idx} variant="neutral" className="px-3 py-1.5 font-medium">
                  <Code size={13} weight="duotone" className="text-text-tertiary" />
                  {tech}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* Target Audience & Team */}
        <Card className="lg:col-span-5 p-6 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-text-primary font-bold text-base mb-3">
              <div className="p-2 rounded-[var(--radius-md)] bg-accent-subtle text-accent">
                <Users size={20} weight="duotone" />
              </div>
              <span>目标用户画像</span>
            </div>
            <div className="space-y-2">
              {product.targetAudience.map((audience, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-text-secondary bg-accent-subtle/40 p-2.5 rounded-[var(--radius-md)] border border-accent/10">
                  <ShieldCheck size={15} weight="duotone" className="text-accent shrink-0 mt-0.5" />
                  <span>{audience}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
              产研负责人团队
            </div>
            <div className="flex items-center gap-3">
              {product.team.map((member, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-bg-secondary px-3 py-1.5 rounded-[var(--radius-md)] border border-border-subtle">
                  <Avatar
                    fallback={member.avatar}
                    size="xs"
                    className={member.color || 'bg-accent text-white'}
                  />
                  <div>
                    <div className="text-xs font-bold text-text-primary">{member.name}</div>
                    <div className="text-[10px] text-text-tertiary">{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Core Value Proposition Cards */}
      <div>
        <div className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
          <Sparkle size={16} weight="duotone" className="text-warning" />
          <span>核心价值主张 (Core Value Propositions)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {product.coreValues.map((val, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, delay: idx * 0.05 }}
            >
              <Card variant="interactive" className="p-5 group">
                <div className="w-10 h-10 rounded-[var(--radius-md)] bg-bg-secondary flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  {getIcon(val.icon)}
                </div>
                <h4 className="text-sm font-bold text-text-primary mb-1.5">{val.title}</h4>
                <p className="text-xs text-text-secondary leading-relaxed">{val.desc}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Feature Matrix */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Stack size={18} weight="duotone" className="text-accent" />
              <span>核心功能特性矩阵 (Feature Matrix)</span>
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">全量模块功能交付状态与优先级追踪</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">模块筛选:</span>
            <div className="flex items-center bg-bg-secondary p-1 rounded-[var(--radius-md)] border border-border-subtle text-xs">
              {modules.map((mod) => (
                <button
                  key={mod}
                  onClick={() => setFilterModule(mod)}
                  className={`px-2.5 py-1 rounded-[var(--radius-sm)] font-medium transition-colors ${
                    filterModule === mod
                      ? 'bg-bg-primary text-accent shadow-[var(--shadow-sm)] font-bold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {mod === 'all' ? '全部模块' : mod}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-text-tertiary font-semibold uppercase tracking-wider">
                <th className="pb-3 pl-2">功能名称</th>
                <th className="pb-3">所属模块</th>
                <th className="pb-3">优先级</th>
                <th className="pb-3">交付状态</th>
                <th className="pb-3 pr-2">功能简述</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredFeatures.map((f, idx) => (
                <tr key={idx} className="hover:bg-bg-secondary/50 transition-colors">
                  <td className="py-3.5 pl-2 font-bold text-text-primary">{f.name}</td>
                  <td className="py-3.5">
                    <Badge variant="neutral">{f.module}</Badge>
                  </td>
                  <td className="py-3.5">
                    {getPriorityBadge(f.priority)}
                  </td>
                  <td className="py-3.5">
                    {getStatusBadge(f.status)}
                  </td>
                  <td className="py-3.5 pr-2 text-text-secondary max-w-md">{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
