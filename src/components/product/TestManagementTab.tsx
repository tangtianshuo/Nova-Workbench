/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { TestCaseItem } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Sparkles, 
  Play, 
  Plus, 
  RefreshCw, 
  Filter, 
  Search, 
  ShieldCheck, 
  Activity, 
  CheckSquare, 
  AlertTriangle,
  Zap,
  Trash2,
  Sliders
} from 'lucide-react';

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
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Control Deck */}
      <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-slate-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-teal-500/20 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-400/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black">AI 全自动测试管理与质量准入中枢</h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              基于【{product.name}】PRD 与接口协议，全自动推导正向业务流、高并发性能压测、边界异常及安全渗透测试用例。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-teal-600/25 transition-all disabled:opacity-50"
            >
              {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>AI 推导测试用例</span>
            </button>

            <button
              onClick={handleRunAll}
              disabled={isRunningAll}
              className="flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
            >
              {isRunningAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
              <span>执行全量自动化测试</span>
            </button>
          </div>
        </div>

        {/* Quality Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">用例总规模</div>
            <div className="text-2xl font-black text-white">{totalCount} <span className="text-xs text-slate-400 font-normal">条</span></div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">自动化率</div>
            <div className="text-2xl font-black text-teal-400">{autoRate}%</div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">验证通过率</div>
            <div className="text-2xl font-black text-emerald-400">{passRate}%</div>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">缺陷拦截数</div>
            <div className="text-2xl font-black text-amber-400">{failedCount} <span className="text-xs text-slate-400 font-normal">个阻断</span></div>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {['all', '功能测试', '性能压测', '边界条件', '安全渗透'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === type ? 'bg-teal-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {type === 'all' ? '全部类型' : type}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索用例编号/名称..."
            className="w-full bg-slate-50 text-xs text-slate-800 placeholder:text-slate-400 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
      </div>

      {/* Test Case Cards List */}
      <div className="space-y-3">
        {filteredCases.map((tc) => (
          <div
            key={tc.id}
            className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-teal-200 transition-all space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-700">
                  {tc.id}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-700 border border-teal-100">
                  {tc.module}
                </span>
                <span className="text-xs font-bold text-slate-800">{tc.title}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  tc.priority === 'P0' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                  tc.priority === 'P1' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-slate-50 text-slate-700 border border-slate-200'
                }`}>
                  {tc.priority}
                </span>

                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
                  tc.status === 'passed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  tc.status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                  'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {tc.status === 'passed' && <CheckCircle2 size={12} />}
                  {tc.status === 'failed' && <XCircle size={12} />}
                  {tc.status === 'pending' && <Clock size={12} />}
                  <span>{tc.status === 'passed' ? '通过' : tc.status === 'failed' ? '未通过' : '待执行'}</span>
                </span>

                <button
                  onClick={() => runTestCase(product.id, tc.id)}
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-600 hover:text-teal-700 border border-slate-200 transition-colors"
                  title="单独执行该用例"
                >
                  <Play size={12} className="fill-current" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="font-bold text-slate-700">执行测试步骤：</div>
                <div className="space-y-0.5 text-slate-600">
                  {tc.steps.map((step, idx) => (
                    <div key={idx}>{step}</div>
                  ))}
                </div>
              </div>

              <div className="space-y-1 bg-teal-50/50 p-3 rounded-xl border border-teal-100">
                <div className="font-bold text-teal-900">预期业务响应：</div>
                <div className="text-teal-800 leading-relaxed">{tc.expectedResult}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
