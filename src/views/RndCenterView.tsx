import { useState } from 'react';
import {
  Sparkle,
  Stack,
  Cpu,
  Robot,
  SquaresFour,
  Code,
  ShieldCheck,
  Target,
  BookOpen,
  CaretRight,
  CaretLeft,
  CheckCircle,
  Cube,
  Fire,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Separator } from '@/src/components/ui/Separator';
import { Avatar } from '@/src/components/ui/Avatar';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/src/components/ui/Select';
import { useApp } from '../store/AppContext';
import { cn } from '@/src/lib/utils';

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

const TABS: { id: RndTabKey; label: string; icon: typeof Sparkle }[] = [
  { id: 'deliverables', label: '全套成果物工坊 (18)', icon: Sparkle },
  { id: 'requirements', label: 'AI 需求设计 (PRD)', icon: Robot },
  { id: 'prototypes', label: 'AI 交互原型', icon: SquaresFour },
  { id: 'code', label: '代码架构脚手架', icon: Code },
  { id: 'testing', label: '测试与质量准入', icon: ShieldCheck },
  { id: 'competitors', label: '竞品雷达与破局', icon: Target },
  { id: 'knowledge', label: '产品领域知识库', icon: BookOpen },
];

export function RndCenterView({ onNavigateTab }: Props) {
  const { products, selectedProductId, setSelectedProductId, getDeliverablesForProduct } = useApp();
  const [activeRndTab, setActiveRndTab] = useState<RndTabKey>('deliverables');

  const currentProduct = products.find(p => p.id === selectedProductId) || products[0];
  const deliverables = currentProduct ? getDeliverablesForProduct(currentProduct.id) : [];
  const readyDeliverablesCount = deliverables.filter(d => d.status === 'ready').length;

  if (!currentProduct) {
    return (
      <Card className="flex flex-col items-center justify-center py-20 px-8">
        <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-bg-secondary flex items-center justify-center mb-4">
          <Cpu size={28} weight="duotone" className="text-text-tertiary" />
        </div>
        <h3 className="text-base font-bold text-text-primary">暂无关联产品</h3>
        <p className="text-sm text-text-tertiary mt-1 text-center max-w-sm">
          请先在【产品管理】中创建产品后再进入研发中心生成成果物
        </p>
        <Button variant="primary" className="mt-5" onClick={() => onNavigateTab?.('product-management')}>
          前往产品管理
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <Card
        className="p-6 border-0 text-text-primary overflow-hidden relative bg-gradient-to-r from-accent/20 via-accent-hover/10 to-bg-tertiary border border-accent/20"
      >
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-bg-secondary rounded-[var(--radius-md)] border border-border-subtle shrink-0">
              <Cpu size={24} weight="duotone" className="text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-xl font-bold tracking-tight">产品研发中心</h1>
                <Badge className="bg-bg-secondary text-text-secondary border border-border-subtle text-[10px]">
                  <Sparkle size={10} weight="fill" className="text-warning" />
                  AI 成果物生成中枢
                </Badge>
              </div>
              <p className="text-xs text-text-secondary max-w-xl leading-relaxed">
                通过 AI 大模型全自动推导和生成当前关联产品的 18 份全生命周期交付物、需求规范、高保真原型、全栈代码脚手架与自动化测试集。
              </p>
            </div>
          </div>

          {/* Product Selector */}
          <div className="flex items-center gap-3 bg-bg-secondary/50 p-3 rounded-[var(--radius-md)] border border-border-subtle shrink-0 self-end lg:self-auto">
            <div>
              <div className="text-[10px] text-text-tertiary font-medium mb-1">当前关联产品</div>
              <Select value={currentProduct.id} onValueChange={(v) => setSelectedProductId(v)}>
                <SelectTrigger className="bg-bg-secondary border-border-subtle text-text-primary text-xs font-semibold w-44 h-8 [&_svg]:text-text-tertiary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.stage})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="bg-accent/80 border-accent/30 text-white hover:bg-accent self-end h-8 text-xs"
              onClick={() => onNavigateTab?.('product-management')}
            >
              <Stack size={13} weight="duotone" />
              产品管控看板
            </Button>
          </div>
        </div>

        {/* Stats Strip */}
        <Separator className="bg-border-subtle my-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="已就绪成果物" value={`${readyDeliverablesCount}/${deliverables.length || 18} 份`} icon={CheckCircle} iconColor="text-success" />
          <StatCard label="当前研发阶段" value={currentProduct.stage} icon={Cube} iconColor="text-accent" />
          <StatCard label="版本定义" value={currentProduct.version} icon={Stack} iconColor="text-text-tertiary" />
          <StatCard label="产品负责人" value={currentProduct.owner} icon={Fire} iconColor="text-warning" />
        </div>
      </Card>

      {/* Tab Navigation */}
      <Card className="p-2 flex items-center gap-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeRndTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveRndTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-all whitespace-nowrap',
                isActive
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
              )}
            >
              <Icon size={14} weight={isActive ? 'fill' : 'duotone'} className={isActive ? 'text-white' : ''} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </Card>

      {/* Tab Content */}
      <motion.div
        key={activeRndTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {activeRndTab === 'deliverables' && <FullDeliverablesTab product={currentProduct} />}
        {activeRndTab === 'requirements' && <AIRequirementsTab product={currentProduct} />}
        {activeRndTab === 'prototypes' && <UIPrototypeTab product={currentProduct} />}
        {activeRndTab === 'code' && <CodeManagementTab product={currentProduct} />}
        {activeRndTab === 'testing' && <TestManagementTab product={currentProduct} />}
        {activeRndTab === 'competitors' && <CompetitorAnalysisTab product={currentProduct} />}
        {activeRndTab === 'knowledge' && <ProductKnowledgeTab product={currentProduct} />}
      </motion.div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, iconColor }: { label: string; value: string; icon: typeof CheckCircle; iconColor: string }) {
  return (
    <div className="bg-bg-secondary/50 p-3 rounded-[var(--radius-md)] border border-border-subtle flex items-center justify-between">
      <div>
        <div className="text-[10px] text-text-tertiary">{label}</div>
        <div className="text-sm font-bold text-text-primary font-mono mt-0.5">{value}</div>
      </div>
      <div className="p-1.5 rounded-[var(--radius-sm)] bg-bg-secondary">
        <Icon size={16} weight="duotone" className={iconColor} />
      </div>
    </div>
  );
}
