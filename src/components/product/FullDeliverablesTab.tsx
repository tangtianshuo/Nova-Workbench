/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { FullLifecycleDeliverable } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import {
  Sparkle,
  FileText,
  CheckCircle,
  Clock,
  ArrowClockwise,
  Download,
  Copy,
  Check,
  MagnifyingGlass,
  FolderPlus,
  Lightning,
  Eye,
  X,
  Tag,
  Trophy,
  Stack,
  Code,
  Cpu,
  CaretRight,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { MarkdownRenderer } from '@/src/components/ui';
import { Badge } from '@/src/components/ui/Badge';
import { Tooltip } from '@/src/components/ui/Tooltip';
import { Input } from '@/src/components/ui/Input';
import { ProgressBar } from '@/src/components/ui/ProgressBar';

interface Props {
  product: Product;
}

function formatAiSourceTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FullDeliverablesTab({ product }: Props) {
  const {
    getDeliverablesForProduct,
    generateDeliverableAI,
    generateAllDeliverablesBatchAI,
    syncDeliverableToDocs,
  } = useApp();

  const deliverables = getDeliverablesForProduct(product.id);

  const [activePhase, setActivePhase] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeliverable, setSelectedDeliverable] = useState<FullLifecycleDeliverable | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchCurrentTitle, setBatchCurrentTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const previewDeliverable = selectedDeliverable
    ? deliverables.find((item) => item.id === selectedDeliverable.id) ?? selectedDeliverable
    : null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredDeliverables = deliverables.filter(d => {
    const matchPhase = activePhase === 'all' || d.phase === activePhase;
    const matchQuery = !searchQuery ||
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchPhase && matchQuery;
  });

  const readyCount = deliverables.filter(d => d.status === 'ready').length;
  const totalCount = deliverables.length;
  const readyPercent = Math.round((readyCount / totalCount) * 100);

  const handleGenerateSingle = async (code: string) => {
    try {
      await generateDeliverableAI(product.id, code);
      showToast('✨ 成果物推导完成并已更新！');
    } catch (e) {
      showToast('❌ 生成失败');
    }
  };

  const handleBatchGenerateAll = async () => {
    setIsBatchGenerating(true);
    setBatchProgress(0);
    try {
      await generateAllDeliverablesBatchAI(product.id, (percent, title) => {
        setBatchProgress(percent);
        setBatchCurrentTitle(title);
      });
      showToast('🎉 全套产研生命周期成果物 (18 份) 已全部一键推导就绪！');
    } catch (e) {
      showToast('❌ 批量生成中断');
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('📋 内容已复制到剪贴板');
  };

  const handleDownload = (d: FullLifecycleDeliverable) => {
    const ext = d.format === 'markdown' ? 'md' : d.format === 'json' ? 'json' : d.format === 'sql' ? 'sql' : 'txt';
    const blob = new Blob([d.content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${d.code}_${d.title.replace(/\s+/g, '_')}.${ext}`;
    link.click();
    showToast(`📥 已导出 ${d.title}`);
  };

  const handleSyncToDocs = (d: FullLifecycleDeliverable) => {
    syncDeliverableToDocs(product.id, d.id);
    showToast(`📁 已将【${d.title}】归档至【产品文档】中心`);
  };

  const phaseButtons: Array<{ key: string; label: string }> = [
    { key: 'all', label: `全部阶段 (${deliverables.length})` },
    { key: 'requirement', label: '1. 需求与规划' },
    { key: 'design', label: '2. 交互与系统架构' },
    { key: 'dev', label: '3. 工程实现与代码' },
    { key: 'qa', label: '4. 质量保障与测试' },
    { key: 'release', label: '5. 发布运营与商业化' },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge variant="success">已就绪</Badge>;
      case 'generating':
        return <Badge variant="accent">生成中...</Badge>;
      default:
        return <Badge variant="neutral">待生成</Badge>;
    }
  };

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
          <Sparkle size={16} weight="duotone" className="text-success" />
          <span>{toastMessage}</span>
        </motion.div>
      )}

      {/* Hero Overview & Batch Trigger */}
      <Card
        variant="dark"
        className="p-6 md:p-8 space-y-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-bg-secondary text-text-primary rounded-[var(--radius-md)] border border-border-subtle">
                <Cpu size={24} weight="duotone" />
              </div>
              <h3 className="text-xl font-black tracking-tight text-text-primary">产品产研全生命周期成果物工厂</h3>
              <Badge className="bg-success/20 text-success border border-success/30">
                18 份工业级交付物
              </Badge>
            </div>
            <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
              围绕【{product.name}】全生命周期，支持秒级一键推导从需求 PRD、架构拓扑、OpenAPI 协议、建表 SQL、测试用例到发版公告的所有核心成果物。
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="bg-bg-secondary p-3 rounded-[var(--radius-lg)] border border-border-subtle flex items-center gap-4 px-4">
              <div>
                <div className="text-[11px] text-text-secondary">已就绪资产</div>
                <div className="text-lg font-black text-text-primary">{readyCount} / {totalCount}</div>
              </div>
              <ProgressBar value={readyPercent} variant="success" className="w-16" />
            </div>

            <Button
              onClick={handleBatchGenerateAll}
              disabled={isBatchGenerating}
              size="lg"
              className="bg-gradient-to-r from-success to-teal-600 hover:from-success/90 hover:to-teal-500 shadow-[var(--shadow-lg)] shadow-success/25 h-auto py-3.5 px-6 text-xs font-bold rounded-[var(--radius-lg)]"
            >
              {isBatchGenerating ? (
                <>
                  <ArrowClockwise size={16} weight="duotone" className="animate-spin" />
                  <span>AI 批量推导中 ({batchProgress}%)...</span>
                </>
              ) : (
                <>
                  <Lightning size={16} weight="duotone" />
                  <span>一键生成全流程所有成果物</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Progress Bar when batch generating */}
        {isBatchGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="p-4 bg-bg-secondary rounded-[var(--radius-lg)] border border-border-subtle space-y-2"
          >
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span className="flex items-center gap-2">
                <ArrowClockwise size={14} weight="duotone" className="animate-spin text-success" />
                正在推导: <strong className="text-text-primary">{batchCurrentTitle || '初始化产研流水线...'}</strong>
              </span>
              <span className="font-mono font-bold text-success">{batchProgress}%</span>
            </div>
            <ProgressBar value={batchProgress} variant="success" />
          </motion.div>
        )}
      </Card>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Phase Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {phaseButtons.map(pb => (
              <Button
                key={pb.key}
                onClick={() => setActivePhase(pb.key)}
                variant={activePhase === pb.key ? 'primary' : 'secondary'}
                size="xs"
                className="rounded-[var(--radius-md)] font-bold"
              >
                {pb.label}
              </Button>
            ))}
          </div>

          {/* Search */}
          <Input
            icon={<MagnifyingGlass size={14} weight="duotone" />}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索成果物名称/编号..."
            className="w-full md:w-64 h-8 text-xs"
          />
        </div>
      </Card>

      {/* Deliverables Grid Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredDeliverables.map((d, idx) => (
          <motion.div
            key={d.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: idx * 0.03 }}
          >
            <Card variant="interactive" className="p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="font-mono font-bold">
                      {d.code}
                    </Badge>
                    <Badge variant="accent">{d.phaseName}</Badge>
                    {d.aiSource && (
                      <Tooltip content={`AI 生成 · ${formatAiSourceTime(d.aiSource.generatedAt)} · 会话 ${d.aiSource.sessionId.slice(0, 8)}`}>
                        <Badge variant="accent">
                          <Sparkle size={12} weight="fill" />
                          AI
                        </Badge>
                      </Tooltip>
                    )}
                  </div>
                  {getStatusBadge(d.status)}
                </div>

                <h4 className="font-bold text-text-primary text-sm leading-snug">{d.title}</h4>
                <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{d.summary}</p>
              </div>

              <div className="space-y-3 pt-3 border-t border-border-subtle">
                <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                  <span>格式: <strong className="text-text-secondary font-mono">{d.format.toUpperCase()}</strong></span>
                  <span>字数: <strong className="text-text-secondary">{d.wordCount || '约3,000字'}</strong></span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button
                    onClick={() => setSelectedDeliverable(d)}
                    variant="secondary"
                    size="sm"
                    className="flex-1 text-xs font-bold"
                  >
                    <Eye size={13} weight="duotone" />
                    <span>查看/编辑</span>
                  </Button>

                  <Button
                    onClick={() => handleGenerateSingle(d.code)}
                    title="重新由 AI 推导"
                    variant="ghost"
                    size="sm"
                  >
                    <ArrowClockwise size={13} weight="duotone" />
                  </Button>

                  <Button
                    onClick={() => handleSyncToDocs(d)}
                    title="归档至产品文档"
                    variant="ghost"
                    size="sm"
                  >
                    <FolderPlus size={13} weight="duotone" />
                  </Button>

                  <Button
                    onClick={() => handleDownload(d)}
                    title="下载文件"
                    variant="ghost"
                    size="sm"
                  >
                    <Download size={13} weight="duotone" />
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Deliverable Full-Screen Preview & Edit Modal */}
      {previewDeliverable && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-bg-overlay backdrop-blur-sm flex items-center justify-center p-4 md:p-8"
          onClick={() => setSelectedDeliverable(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="bg-bg-primary rounded-[var(--radius-xl)] w-full max-w-4xl max-h-[90vh] shadow-[var(--shadow-xl)] border border-border-subtle flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-accent/20 via-accent-hover/10 to-bg-tertiary text-text-primary flex items-center justify-between border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-[var(--radius-md)] bg-bg-secondary text-text-primary font-mono font-bold text-xs border border-border-subtle">
                  {previewDeliverable.code}
                </div>
                <div>
                  <h3 className="font-bold text-base text-text-primary">{previewDeliverable.title}</h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    所属阶段: {previewDeliverable.phaseName} · 格式: {previewDeliverable.format.toUpperCase()} · 字数: {previewDeliverable.wordCount}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleCopy(previewDeliverable.id, previewDeliverable.content)}
                  variant="ghost"
                  size="sm"
                  className="text-text-secondary hover:text-text-primary hover:bg-bg-secondary border border-border-subtle"
                >
                  {copiedId === previewDeliverable.id ? <Check size={13} weight="duotone" className="text-success" /> : <Copy size={13} weight="duotone" />}
                  <span>{copiedId === previewDeliverable.id ? '已复制' : '复制全文'}</span>
                </Button>

                <Button
                  onClick={() => handleDownload(previewDeliverable)}
                  variant="ghost"
                  size="sm"
                  className="text-text-secondary hover:text-text-primary hover:bg-bg-secondary border border-border-subtle"
                >
                  <Download size={13} weight="duotone" />
                  <span>导出文件</span>
                </Button>

                <Button
                  onClick={() => setSelectedDeliverable(null)}
                  variant="ghost"
                  size="sm"
                  className="text-text-tertiary hover:text-text-primary hover:bg-bg-secondary"
                >
                  <X size={18} weight="duotone" />
                </Button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 md:p-8 overflow-y-auto flex-1 bg-bg-secondary space-y-6">
              <Card className="p-6">
                <div className="prose prose-sm max-w-none text-text-primary font-sans leading-relaxed">
                  <MarkdownRenderer>{previewDeliverable.content}</MarkdownRenderer>
                </div>
              </Card>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-bg-primary border-t border-border-subtle flex items-center justify-between">
              <div className="text-xs text-text-tertiary">
                可一键归档至【产品文档】或同步至本地工作区目录。
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleSyncToDocs(previewDeliverable)}
                  size="sm"
                  className="text-xs font-bold"
                >
                  <FolderPlus size={14} weight="duotone" />
                  <span>归档至产品文档中心</span>
                </Button>
                <Button
                  onClick={() => setSelectedDeliverable(null)}
                  variant="secondary"
                  size="sm"
                  className="text-xs font-semibold"
                >
                  关闭
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
