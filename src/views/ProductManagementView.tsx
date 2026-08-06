import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Stack,
  MagnifyingGlass,
  Plus,
  ArrowLeft,
  CaretRight,
  FileText,
  Lightning,
  ChartLine,
  Flag,
  Target,
  CheckCircle,
  Warning,
  Users,
  Sparkle,
  ShieldCheck,
  Cpu,
  ArrowSquareOut,
  Pulse,
  Robot,
} from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { Card, CardHover } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge, DotBadge } from '@/src/components/ui/Badge';
import { Avatar } from '@/src/components/ui/Avatar';
import { Input } from '@/src/components/ui/Input';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Separator } from '@/src/components/ui/Separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
} from '@/src/components/ui/Dialog';
import { cn } from '@/src/lib/utils';

import { ProductOverviewTab } from '../components/product/ProductOverviewTab';
import { ProductGovernanceTab } from '../components/product/ProductGovernanceTab';
import { ProductDocsTab } from '../components/product/ProductDocsTab';
import { ProductAnalyticsTab } from '../components/product/ProductAnalyticsTab';
import { ProductSkillsTab } from '../components/product/ProductSkillsTab';
import { ProductMilestonesTab } from '../components/product/ProductMilestonesTab';
import { CreateProductModal } from '../components/product/CreateProductModal';
import { AddDocumentModal } from '../components/product/AddDocumentModal';
import { AddSkillModal } from '../components/product/AddSkillModal';

export type ProductManageTabKey = 'overview' | 'governance' | 'docs' | 'analytics' | 'skills' | 'milestones';

interface Props {
  onNavigateToRnd?: (productId: string) => void;
}

const STAGE_BADGE: Record<string, 'accent' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  '商业化运营': 'success',
  '已发布': 'accent',
  '公测灰度': 'accent',
  '研发中': 'warning',
  '规划中': 'neutral',
};

const DETAIL_TABS: { id: ProductManageTabKey; label: string; icon: typeof Target; countKey?: string }[] = [
  { id: 'overview', label: '产品画像与愿景', icon: Target },
  { id: 'governance', label: '阶段管控与准入', icon: ShieldCheck },
  { id: 'docs', label: '产品文档中心', icon: FileText, countKey: 'documents' },
  { id: 'analytics', label: '数据指标分析', icon: ChartLine },
  { id: 'skills', label: '关联 Skill 矩阵', icon: Lightning, countKey: 'associatedSkills' },
  { id: 'milestones', label: '进度里程碑管控', icon: Flag },
];

export function ProductManagementView({ onNavigateToRnd }: Props) {
  const { products, selectedProductId, setSelectedProductId, addProductMilestone, getDeliverablesForProduct } = useApp();

  const [activeDetailTab, setActiveDetailTab] = useState<ProductManageTabKey>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>('all');

  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [showAddMilestoneModal, setShowAddMilestoneModal] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('2025-07-30');

  const stages = ['all', '规划中', '研发中', '公测灰度', '商业化运营', '已发布'];

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tagline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStage = selectedStage === 'all' || p.stage === selectedStage;
    return matchesSearch && matchesStage;
  });

  const currentProduct = products.find(p => p.id === selectedProductId) || null;
  const totalProducts = products.length;
  const inDevCount = products.filter(p => p.stage === '研发中' || p.stage === '公测灰度').length;
  const inOpsCount = products.filter(p => p.stage === '商业化运营' || p.stage === '已发布').length;
  const healthyCount = products.filter(p => p.health === 'healthy').length;

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
      description: '新创建的里程碑推进节点。',
    });
    setNewMilestoneTitle('');
    setShowAddMilestoneModal(false);
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Modals */}
      {showCreateProductModal && <CreateProductModal onClose={() => setShowCreateProductModal(false)} />}
      {showAddDocModal && currentProduct && <AddDocumentModal productId={currentProduct.id} onClose={() => setShowAddDocModal(false)} />}
      {showAddSkillModal && currentProduct && <AddSkillModal productId={currentProduct.id} onClose={() => setShowAddSkillModal(false)} />}

      <Dialog open={showAddMilestoneModal} onOpenChange={setShowAddMilestoneModal}>
        <DialogContent>
          <DialogHeader title="添加产品里程碑" description={`为【${currentProduct?.name}】设定关键推进节点`} />
          <form onSubmit={handleCreateMilestone} className="space-y-4">
            <Input
              label="里程碑名称 *"
              required
              placeholder="例如: 核心功能封闭验收与灰度放量"
              value={newMilestoneTitle}
              onChange={e => setNewMilestoneTitle(e.target.value)}
            />
            <Input
              label="计划交付日期"
              type="date"
              value={newMilestoneDate}
              onChange={e => setNewMilestoneDate(e.target.value)}
            />
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={() => setShowAddMilestoneModal(false)}>取消</Button>
              <Button variant="primary" type="submit">确认添加</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========== ALL PRODUCTS OVERVIEW ========== */}
      {!selectedProductId || !currentProduct ? (
        <div className="space-y-5">
          {/* Top Banner */}
          <Card
            className="p-6 border-0 text-white overflow-hidden"
            style={{ background: 'linear-gradient(135deg, hsl(220 30% 12%), hsl(220 40% 20%), hsl(220 30% 14%))' }}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-white/10 rounded-[var(--radius-md)] border border-white/10 shrink-0">
                  <Stack size={22} weight="duotone" className="text-accent" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">产品全生命周期总览与管控中枢</h2>
                  <p className="text-xs text-white/60 max-w-2xl leading-relaxed mt-1">
                    总览企业产品战略画像、管控生命周期阶段推进与指标看板。AI 成果物生成请联动【产品研发中心】。
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="lg"
                className="shrink-0 bg-white/10 border-white/15 text-white hover:bg-white/15"
                onClick={() => onNavigateToRnd?.(products[0]?.id || '')}
              >
                <Cpu size={15} weight="duotone" />
                前往【产品研发中心】
              </Button>
            </div>

            <Separator className="bg-white/10 my-4" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <BannerStat label="管控产品总数" value={`${totalProducts} 款`} />
              <BannerStat label="商业化 / 已发布" value={`${inOpsCount} 款`} valueColor="text-success" />
              <BannerStat label="研发中 / 灰度放量" value={`${inDevCount} 款`} valueColor="text-accent" />
              <BannerStat label="健康度达标率" value={`${Math.round((healthyCount / totalProducts) * 100)}%`} valueColor="text-success" />
            </div>
          </Card>

          {/* Filter & Search */}
          <Card className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-[var(--radius-md)]">
              {stages.map(st => (
                <button
                  key={st}
                  onClick={() => setSelectedStage(st)}
                  className={cn(
                    'px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium transition-colors',
                    selectedStage === st
                      ? 'bg-bg-primary text-accent font-semibold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  )}
                >
                  {st === 'all' ? '全部阶段' : st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Input
                placeholder="搜索产品名称、定位..."
                icon={<MagnifyingGlass size={14} weight="duotone" className="text-text-tertiary" />}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-56"
              />
              <Button variant="primary" onClick={() => setShowCreateProductModal(true)}>
                <Plus size={14} weight="bold" />
                新建产品
              </Button>
            </div>
          </Card>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredProducts.map((prod, idx) => {
              const deliverables = getDeliverablesForProduct(prod.id);
              const readyCount = deliverables.filter(d => d.status === 'ready').length;

              return (
                <motion.div
                  key={prod.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05, type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <CardHover variant="interactive" className="p-5 flex flex-col justify-between h-full">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={STAGE_BADGE[prod.stage] || 'neutral'}>{prod.stage}</Badge>
                          <Badge variant="neutral" className="text-[10px]">{prod.category}</Badge>
                          <span className="text-xs font-mono font-semibold text-text-tertiary">{prod.version}</span>
                        </div>
                        <DotBadge color={prod.health === 'healthy' ? 'success' : 'warning'}>
                          {prod.status}
                        </DotBadge>
                      </div>

                      <h3
                        onClick={() => { setSelectedProductId(prod.id); setActiveDetailTab('overview'); }}
                        className="text-base font-bold text-text-primary hover:text-accent cursor-pointer transition-colors mb-1"
                      >
                        {prod.name}
                      </h3>
                      <p className="text-xs font-medium text-text-secondary mb-2">{prod.tagline}</p>
                      <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed mb-4">{prod.description}</p>

                      <div className="bg-bg-secondary/80 p-3 rounded-[var(--radius-md)] border border-border-subtle mb-3">
                        <div className="flex justify-between items-center text-xs mb-2">
                          <span className="text-text-tertiary">生命周期管控进度</span>
                          <div className="flex items-center gap-2">
                            <span className="text-text-tertiary text-[10px]">目标: {prod.deadline || '2025-06-30'}</span>
                            <span className="font-bold text-accent font-mono">{prod.progress}%</span>
                          </div>
                        </div>
                        <ProgressBar value={prod.progress} />
                      </div>

                      {/* R&D Linkage */}
                      <div className="bg-accent-subtle/50 rounded-[var(--radius-md)] p-3 border border-accent/10 mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-semibold text-text-primary flex items-center gap-1.5">
                            <Cpu size={13} weight="duotone" className="text-accent" />
                            产品研发中心成果物
                          </div>
                          <div className="text-[11px] text-text-secondary mt-0.5">
                            已就绪 <strong className="font-mono">{readyCount}/18</strong> 份 AI 交付物
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={() => onNavigateToRnd?.(prod.id)}
                        >
                          <Sparkle size={12} weight="duotone" />
                          进入研发中心
                        </Button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          {prod.team.slice(0, 3).map((m, i) => (
                            <Avatar key={i} size="xs" name={m.avatar} className="ring-2 ring-bg-primary" />
                          ))}
                        </div>
                        <span className="text-[11px] text-text-tertiary">{prod.owner.split(' ')[0]} 负责</span>
                      </div>
                      <button
                        onClick={() => { setSelectedProductId(prod.id); setActiveDetailTab('overview'); }}
                        className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
                      >
                        产品总览与管控
                        <CaretRight size={14} weight="bold" />
                      </button>
                    </div>
                  </CardHover>
                </motion.div>
              );
            })}

            {/* Create New */}
            <button
              onClick={() => setShowCreateProductModal(true)}
              className="border-2 border-dashed border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center text-text-tertiary hover:text-accent hover:border-accent/30 hover:bg-accent/5 cursor-pointer transition-all min-h-[300px] group"
            >
              <div className="w-12 h-12 rounded-[var(--radius-md)] bg-bg-primary border border-border-subtle flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 group-hover:border-accent/30 transition-all">
                <Plus size={22} weight="bold" />
              </div>
              <span className="text-sm font-semibold">新建产品 / 项目</span>
              <p className="text-xs text-text-tertiary text-center max-w-xs mt-1">
                建立全新的产品总览与管控档案，并可联动【产品研发中心】进行 AI 成果物生成
              </p>
            </button>
          </div>
        </div>
      ) : (
        /* ========== SINGLE PRODUCT GOVERNANCE ========== */
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" onClick={() => setSelectedProductId(null)}>
                  <ArrowLeft size={14} weight="bold" />
                  返回产品总览
                </Button>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-xs text-text-tertiary">切换产品:</span>
                <select
                  value={currentProduct.id}
                  onChange={e => setSelectedProductId(e.target.value)}
                  className="bg-bg-input border border-border rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.stage})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={() => onNavigateToRnd?.(currentProduct.id)}>
                  <Cpu size={14} weight="duotone" />
                  进入【产品研发中心】
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowAddDocModal(true)}>
                  <FileText size={14} weight="duotone" className="text-accent" />
                  新建文档
                </Button>
                <Button variant="primary" size="sm" onClick={() => setShowAddMilestoneModal(true)}>
                  <Plus size={14} weight="bold" />
                  添加里程碑
                </Button>
              </div>
            </div>

            {/* Product Identity */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                  <h1 className="text-xl font-bold text-text-primary tracking-tight">{currentProduct.name}</h1>
                  <Badge variant={STAGE_BADGE[currentProduct.stage] || 'neutral'}>{currentProduct.stage}</Badge>
                  <span className="text-xs font-mono font-bold text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded">{currentProduct.version}</span>
                </div>
                <p className="text-xs text-text-secondary">
                  {currentProduct.tagline} · 由 <span className="text-text-primary font-semibold">{currentProduct.owner}</span> 主导全生命周期管控
                </p>
              </div>

              <div className="flex items-center gap-4 bg-bg-secondary p-3 rounded-[var(--radius-md)] border border-border-subtle">
                <div className="text-right">
                  <div className="text-[10px] text-text-tertiary">管控推进度</div>
                  <div className="text-lg font-bold text-accent font-mono">{currentProduct.progress}%</div>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div>
                  <div className="text-[10px] text-text-tertiary">健康度诊断</div>
                  <DotBadge color={currentProduct.health === 'healthy' ? 'success' : 'warning'}>
                    {currentProduct.health === 'healthy' ? '状态健康' : '需关注风险'}
                  </DotBadge>
                </div>
              </div>
            </div>

            {/* Governance Tabs */}
            <Separator />
            <div className="flex items-center gap-1 overflow-x-auto">
              {DETAIL_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeDetailTab === tab.id;
                const count = tab.countKey
                  ? (currentProduct as any)[tab.countKey]?.length
                  : undefined;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailTab(tab.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-all whitespace-nowrap',
                      isActive
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                    )}
                  >
                    <Icon size={14} weight={isActive ? 'fill' : 'duotone'} />
                    <span>{tab.label}</span>
                    {count !== undefined && (
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full',
                        isActive ? 'bg-white/20' : 'bg-bg-secondary'
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Tab Content */}
          {activeDetailTab === 'overview' && <ProductOverviewTab product={currentProduct} onNavigateToRnd={onNavigateToRnd} />}
          {activeDetailTab === 'governance' && <ProductGovernanceTab product={currentProduct} onNavigateToRnd={onNavigateToRnd} />}
          {activeDetailTab === 'docs' && <ProductDocsTab product={currentProduct} onAddDocument={() => setShowAddDocModal(true)} />}
          {activeDetailTab === 'analytics' && <ProductAnalyticsTab product={currentProduct} />}
          {activeDetailTab === 'skills' && <ProductSkillsTab product={currentProduct} onAddSkill={() => setShowAddSkillModal(true)} />}
          {activeDetailTab === 'milestones' && <ProductMilestonesTab product={currentProduct} onAddMilestone={() => setShowAddMilestoneModal(true)} />}
        </div>
      )}
    </div>
  );
}

function BannerStat({ label, value, valueColor = 'text-white' }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="bg-white/5 p-3 rounded-[var(--radius-md)] border border-white/8">
      <div className="text-[10px] text-white/40">{label}</div>
      <div className={cn('text-xl font-bold font-mono mt-0.5', valueColor)}>{value}</div>
    </div>
  );
}
