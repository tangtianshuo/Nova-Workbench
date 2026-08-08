/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Product } from '../../data/mockProducts';
import { TestCaseItem } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import {
  CheckCircle,
  XCircle,
  Clock,
  Sparkle,
  Play,
  ArrowClockwise,
  MagnifyingGlass,
  ShieldCheck
} from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';

interface Props {
  product: Product;
}

export function TestManagementTab({ product }: Props) {
  const {
    getTestCasesForProduct,
    generateTestCasesAI,
    runTestCase,
    runAllTestCases,
    addTestCase,
    deleteTestCase
  } = useApp();

  const testCases = getTestCasesForProduct(product.id);

  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const filteredCases = testCases.filter(t => {
    const matchType = filterType === 'all' || t.type === filterType;
    const matchPriority = filterPriority === 'all' || t.priority === filterPriority;
    const matchQuery = !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.module.toLowerCase().includes(searchQuery.toLowerCase());
    return matchType && matchPriority && matchQuery;
  });

  const totalCount = testCases.length;
  const passedCount = testCases.filter(t => t.status === 'passed').length;
  const failedCount = testCases.filter(t => t.status === 'failed').length;
  const automatedCount = testCases.filter(t => t.automated).length;
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 100;
  const autoRate = totalCount > 0 ? Math.round((automatedCount / totalCount) * 100) : 100;

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    try {
      await generateTestCasesAI(product.id);
      showToast('✨ AI 测试工程引擎已自动推导并生成全量测试用例集！');
    } catch (e) {
      showToast('❌ 生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRunAll = async () => {
    setIsRunningAll(true);
    try {
      await runAllTestCases(product.id);
      showToast('🎉 全量测试用例自动化流水线执行完毕，全部通过！');
    } catch (e) {
      showToast('❌ 执行异常');
    } finally {
      setIsRunningAll(false);
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
          <Sparkle className="w-4 h-4 text-success" weight="duotone" />
          <span>{toastMessage}</span>
        </motion.div>
      )}

      {/* Top Banner & Control Deck */}
      <Card variant="dark" className="bg-gradient-to-r from-teal-500/20 via-teal-500/10 to-bg-tertiary border-teal-500/20 p-6 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-400/30">
                <ShieldCheck className="w-6 h-6" weight="duotone" />
              </div>
              <h3 className="text-xl font-black">AI 全自动测试管理与质量准入中枢</h3>
            </div>
            <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
              基于【{product.name}】PRD 与接口协议，全自动推导正向业务流、高并发性能压测、边界异常及安全渗透测试用例。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="!px-5 !py-3 !rounded-xl !text-xs !font-bold shadow-lg shadow-teal-600/25"
            >
              {isGenerating ? <ArrowClockwise className="w-4 h-4 animate-spin" weight="duotone" /> : <Sparkle className="w-4 h-4" weight="duotone" />}
              <span>AI 推导测试用例</span>
            </Button>

            <Button
              onClick={handleRunAll}
              disabled={isRunningAll}
              className="!px-5 !py-3 !rounded-xl !text-xs !font-bold shadow-lg shadow-accent/25"
            >
              {isRunningAll ? <ArrowClockwise className="w-4 h-4 animate-spin" weight="duotone" /> : <Play className="w-4 h-4" weight="duotone" />}
              <span>执行全量自动化测试</span>
            </Button>
          </div>
        </div>

        {/* Quality Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-text-tertiary">用例总规模</div>
            <div className="text-2xl font-black text-text-primary">{totalCount} <span className="text-xs text-text-tertiary font-normal">条</span></div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-text-tertiary">自动化率</div>
            <div className="text-2xl font-black text-teal-400">{autoRate}%</div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-text-tertiary">验证通过率</div>
            <div className="text-2xl font-black text-success">{passRate}%</div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-text-tertiary">缺陷拦截数</div>
            <div className="text-2xl font-black text-warning">{failedCount} <span className="text-xs text-text-tertiary font-normal">个阻断</span></div>
          </div>
        </div>
      </Card>

      {/* Filter and Search */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      >
        <Card className="p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {['all', '功能测试', '性能压测', '边界条件', '安全渗透'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    filterType === type ? 'bg-accent text-white shadow-sm' : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                  }`}
                >
                  {type === 'all' ? '全部类型' : type}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <MagnifyingGlass className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" weight="duotone" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索用例编号/名称..."
                className="w-full bg-bg-secondary text-xs text-text-primary placeholder:text-text-placeholder pl-9 pr-3 py-2 rounded-xl border border-border-subtle focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Test Case Cards List */}
      <div className="space-y-3">
        {filteredCases.map((tc, idx) => (
          <motion.div
            key={tc.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25, delay: idx * 0.03 }}
          >
            <Card variant="interactive" className="p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-bg-secondary text-text-primary">
                    {tc.id}
                  </span>
                  <Badge variant="accent">
                    {tc.module}
                  </Badge>
                  <span className="text-xs font-bold text-text-primary">{tc.title}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={
                    tc.priority === 'P0' ? 'danger' :
                    tc.priority === 'P1' ? 'warning' :
                    'neutral'
                  }>
                    {tc.priority}
                  </Badge>

                  <Badge variant={
                    tc.status === 'passed' ? 'success' :
                    tc.status === 'failed' ? 'danger' :
                    'warning'
                  }>
                    {tc.status === 'passed' && <CheckCircle size={12} weight="duotone" />}
                    {tc.status === 'failed' && <XCircle size={12} weight="duotone" />}
                    {tc.status === 'pending' && <Clock size={12} weight="duotone" />}
                    <span>{tc.status === 'passed' ? '通过' : tc.status === 'failed' ? '未通过' : '待执行'}</span>
                  </Badge>

                  <button
                    onClick={() => runTestCase(product.id, tc.id)}
                    className="p-1.5 rounded-lg bg-bg-secondary hover:bg-accent-subtle text-text-secondary hover:text-accent border border-border-subtle transition-colors"
                    title="单独执行该用例"
                  >
                    <Play size={12} weight="duotone" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1 bg-bg-secondary p-3 rounded-xl border border-border-subtle">
                  <div className="font-bold text-text-primary">执行测试步骤：</div>
                  <div className="space-y-0.5 text-text-secondary">
                    {tc.steps.map((step, idx) => (
                      <div key={idx}>{step}</div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 bg-accent-subtle/50 p-3 rounded-xl border border-accent-subtle">
                  <div className="font-bold text-accent">预期业务响应：</div>
                  <div className="text-text-secondary leading-relaxed">{tc.expectedResult}</div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
