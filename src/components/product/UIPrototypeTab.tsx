/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import {
  Sparkle as PhSparkle,
  Monitor as PhMonitor,
  DeviceTablet as PhTablet,
  DeviceMobile as PhSmartphone,
  Palette as PhPalette,
  Code as PhCode,
  Eye as PhEye,
  Copy as PhCopy,
  Check as PhCheck,
  Download as PhDownload,
  ArrowClockwise as PhRefreshCw,
  Lightning as PhZap,
  Stack as PhLayers,
  Layout as PhLayout,
  ArrowSquareOut as PhExternalLink,
  CaretRight as PhChevronRight,
  ChartLineUp as PhTrendingUp,
  Pulse as PhActivity,
  Sliders as PhSliders,
  CheckCircle as PhCheckCircle2,
} from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';

interface Props {
  product: Product;
}

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 25 };

export function UIPrototypeTab({ product }: Props) {
  const { getPrototypeForProduct, updatePrototype, generatePrototypeAI } = useApp();
  const protoData = getPrototypeForProduct(product.id);

  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>(protoData.device || 'desktop');
  const [theme, setTheme] = useState<'indigo' | 'dark' | 'mint' | 'sunset'>(protoData.theme || 'indigo');
  const [viewMode, setViewMode] = useState<'preview' | 'code' | 'tokens'>('preview');
  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Interactive mockup state
  const [activeInteractiveTab, setActiveInteractiveTab] = useState<'overview' | 'analytics' | 'settings'>('overview');
  const [mockCounter, setMockCounter] = useState(148);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generatePrototypeAI(product.id, promptInput, device, theme);
      showToast('🎨 AI 交互原型与界面代码已自动生成并完成渲染！');
    } catch (e) {
      showToast('❌ 生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(protoData.reactCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('📋 原型 React 组件源码已复制');
  };

  const themeColors = {
    indigo: {
      bg: 'from-slate-900 to-indigo-950',
      accent: 'bg-indigo-600',
      accentText: 'text-indigo-600',
      border: 'border-indigo-500/30',
      pill: 'bg-indigo-50 text-indigo-700'
    },
    dark: {
      bg: 'from-slate-950 to-slate-900',
      accent: 'bg-sky-500',
      accentText: 'text-sky-400',
      border: 'border-sky-500/30',
      pill: 'bg-sky-950/60 text-sky-400'
    },
    mint: {
      bg: 'from-slate-900 to-emerald-950',
      accent: 'bg-emerald-600',
      accentText: 'text-emerald-600',
      border: 'border-emerald-500/30',
      pill: 'bg-emerald-50 text-emerald-700'
    },
    sunset: {
      bg: 'from-slate-900 to-orange-950',
      accent: 'bg-orange-600',
      accentText: 'text-orange-600',
      border: 'border-orange-500/30',
      pill: 'bg-orange-50 text-orange-700'
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <motion.div
          className="fixed bottom-6 right-6 z-50 bg-bg-primary text-text-primary text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-border-subtle flex items-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <PhSparkle size={16} weight="duotone" className="text-success" />
          <span>{toastMessage}</span>
        </motion.div>
      )}

      {/* AI UI Prompt Box */}
      <Card variant="dark" className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent/20 text-accent rounded-2xl border border-accent/30">
              <PhLayout size={24} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-text-primary">AI 界面设计与交互原型沙箱</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-accent/20 text-accent border border-accent/30">
                  UI Code Engine
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5">
                基于【{product.name}】产品属性，输入交互指令即可实时生成高保真交互视图与生产级 React/Tailwind 代码。
              </p>
            </div>
          </div>

          {/* Quick theme selector */}
          <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle">
            <span className="text-[11px] text-text-tertiary px-2">配色风格:</span>
            <button
              onClick={() => setTheme('indigo')}
              className={`w-6 h-6 rounded-full bg-indigo-600 transition-all ${theme === 'indigo' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`}
              title="Indigo Tech"
            />
            <button
              onClick={() => setTheme('dark')}
              className={`w-6 h-6 rounded-full bg-slate-800 border border-slate-500 transition-all ${theme === 'dark' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`}
              title="Dark Titanium"
            />
            <button
              onClick={() => setTheme('mint')}
              className={`w-6 h-6 rounded-full bg-emerald-600 transition-all ${theme === 'mint' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`}
              title="Mint Emerald"
            />
            <button
              onClick={() => setTheme('sunset')}
              className={`w-6 h-6 rounded-full bg-orange-600 transition-all ${theme === 'sunset' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`}
              title="Sunset Orange"
            />
          </div>
        </div>

        {/* Prompt Input */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="例如：设计包含实时监控仪表盘、Agent 协同看板和交互对话流的现代 SaaS 主界面..."
            className="flex-1 bg-bg-secondary text-xs text-text-primary placeholder:text-text-placeholder rounded-xl px-4 py-3 border border-border-subtle focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white text-xs font-bold rounded-xl shadow-lg shadow-accent/25 transition-all disabled:opacity-50 shrink-0"
          >
            {isGenerating ? <PhRefreshCw size={16} weight="duotone" className="animate-spin" /> : <PhSparkle size={16} weight="duotone" />}
            <span>AI 生成高保真界面</span>
          </button>
        </div>
      </Card>

      {/* View Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springTransition}
      >
        <Card className="p-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Device Switcher */}
            <div className="flex items-center gap-1.5 bg-bg-secondary p-1 rounded-xl">
              <button
                onClick={() => setDevice('desktop')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  device === 'desktop' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <PhMonitor size={14} weight="duotone" />
                <span>桌面端 (1280px)</span>
              </button>
              <button
                onClick={() => setDevice('tablet')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  device === 'tablet' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <PhTablet size={14} weight="duotone" />
                <span>平板端 (768px)</span>
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  device === 'mobile' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <PhSmartphone size={14} weight="duotone" />
                <span>移动端 (375px)</span>
              </button>
            </div>

            {/* View Mode */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-bg-secondary p-1 rounded-xl">
                <button
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'preview' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <PhEye size={13} weight="duotone" />
                  <span>实时交互渲染</span>
                </button>
                <button
                  onClick={() => setViewMode('code')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'code' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <PhCode size={13} weight="duotone" />
                  <span>React 源码</span>
                </button>
                <button
                  onClick={() => setViewMode('tokens')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'tokens' ? 'bg-bg-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <PhSliders size={13} weight="duotone" />
                  <span>Design Tokens</span>
                </button>
              </div>

              <Button variant="secondary" size="sm" onClick={handleCopyCode}>
                {copied ? <PhCheck size={13} weight="duotone" className="text-success" /> : <PhCopy size={13} weight="duotone" />}
                <span>复制代码</span>
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Main Canvas Area */}
      {viewMode === 'preview' && (
        <motion.div
          className="flex justify-center bg-bg-secondary/80 p-6 md:p-10 rounded-3xl border border-border-subtle overflow-x-auto min-h-[560px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <div
            className={`transition-all duration-300 bg-bg-primary rounded-3xl shadow-2xl border border-border overflow-hidden flex flex-col ${
              device === 'mobile' ? 'w-[375px]' :
              device === 'tablet' ? 'w-[768px]' :
              'w-full max-w-5xl'
            }`}
          >
            {/* Browser / Device Chrome Header */}
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 select-none">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-danger"></div>
                  <div className="w-3 h-3 rounded-full bg-warning"></div>
                  <div className="w-3 h-3 rounded-full bg-success"></div>
                </div>
                <div className="hidden sm:block text-xs font-mono text-text-tertiary bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 ml-2">
                  https://app.product.ai/{product.name.toLowerCase().replace(/\s+/g, '-')}/dashboard
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
                <span>Live Interactive Sandbox</span>
              </div>
            </div>

            {/* Prototype Inner Screen */}
            <div className="p-6 space-y-6 bg-bg-secondary min-h-[480px]">
              {/* Product Header in Prototype */}
              <Card className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-text-primary">{product.name}</h2>
                      <Badge variant="accent">{product.stage}</Badge>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">{protoData.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="primary" size="sm" onClick={() => setMockCounter(c => c + 1)}>
                      <PhZap size={13} weight="duotone" />
                      <span>交互触发 ({mockCounter})</span>
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Stats Cards Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>系统吞吐能力</span>
                    <PhTrendingUp size={14} weight="duotone" className="text-accent" />
                  </div>
                  <div className="text-2xl font-black text-text-primary">98.9%</div>
                  <div className="text-[11px] text-success font-medium">↑ +14.2% 同比上周提升</div>
                </Card>

                <Card className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>端到端延迟 (SLA)</span>
                    <PhActivity size={14} weight="duotone" className="text-success" />
                  </div>
                  <div className="text-2xl font-black text-text-primary">128 ms</div>
                  <div className="text-[11px] text-success font-medium">极速响应 无感知等待</div>
                </Card>

                <Card className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>AI 成果物完备度</span>
                    <PhCheckCircle2 size={14} weight="duotone" className="text-accent" />
                  </div>
                  <div className="text-2xl font-black text-text-primary">100%</div>
                  <div className="text-[11px] text-accent font-medium">18 份标准文档就绪</div>
                </Card>
              </div>

              {/* Interactive Tabs within Prototype */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
                  <button
                    onClick={() => setActiveInteractiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeInteractiveTab === 'overview' ? 'bg-accent-subtle text-accent' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    业务流转看板
                  </button>
                  <button
                    onClick={() => setActiveInteractiveTab('analytics')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeInteractiveTab === 'analytics' ? 'bg-accent-subtle text-accent' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    多 Agent 协同状态
                  </button>
                  <button
                    onClick={() => setActiveInteractiveTab('settings')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeInteractiveTab === 'settings' ? 'bg-accent-subtle text-accent' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    安全与权限策略
                  </button>
                </div>

                {activeInteractiveTab === 'overview' && (
                  <div className="space-y-3">
                    <div className="text-xs text-text-secondary">核心功能矩阵 (Live Feature Kanban):</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {product.featureMatrix?.slice(0, 4).map((f, i) => (
                        <div key={i} className="p-3 rounded-xl bg-bg-secondary border border-border-subtle flex items-center justify-between">
                          <div>
                            <div className="font-bold text-xs text-text-primary">{f.name}</div>
                            <div className="text-[11px] text-text-tertiary">{f.desc}</div>
                          </div>
                          <Badge variant="success" className="text-[10px] font-bold">
                            {f.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeInteractiveTab === 'analytics' && (
                  <div className="p-4 bg-bg-secondary text-text-primary rounded-xl text-xs space-y-2 font-mono border border-border-subtle">
                    <div className="text-success">● [Agent #1] 需求工程推导引擎 (Running - 0.2s)</div>
                    <div className="text-accent">● [Agent #2] 架构代码脚手架生成 (Idle)</div>
                    <div className="text-text-tertiary">● [Agent #3] 自动化测试用例推导 (Ready)</div>
                  </div>
                )}

                {activeInteractiveTab === 'settings' && (
                  <div className="text-xs text-text-secondary space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary">
                      <span>开启数据加密与合规审查</span>
                      <span className="font-bold text-success">已开启</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary">
                      <span>多租户隔离 (RBAC)</span>
                      <span className="font-bold text-accent">企业级</span>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </motion.div>
      )}

      {/* Code Mode */}
      {viewMode === 'code' && (
        <motion.div
          className="bg-slate-950 text-slate-100 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PhCode size={16} weight="duotone" className="text-purple-400" />
              <span className="text-xs font-mono font-bold text-slate-300">GeneratedPrototype.tsx</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-xs text-text-tertiary hover:text-white transition-colors"
            >
              {copied ? <PhCheck size={13} weight="duotone" className="text-success" /> : <PhCopy size={13} weight="duotone" />}
              <span>{copied ? '已复制' : '复制代码'}</span>
            </button>
          </div>

          <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-4 bg-slate-900/90 rounded-2xl leading-relaxed border border-slate-800">
            {protoData.reactCode}
          </pre>
        </motion.div>
      )}

      {/* Design Tokens Mode */}
      {viewMode === 'tokens' && (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          <Card className="p-7 space-y-4">
            <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
              <PhPalette size={16} weight="duotone" className="text-accent" />
              <span>Design Tokens 规范矩阵</span>
            </h4>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-bg-secondary rounded-xl border border-border-subtle flex items-center justify-between">
                <span className="text-text-secondary">主品牌色 (Primary Token):</span>
                <span className="font-mono font-bold text-text-primary">{protoData.designTokens?.primaryColor}</span>
              </div>
              <div className="p-3 bg-bg-secondary rounded-xl border border-border-subtle flex items-center justify-between">
                <span className="text-text-secondary">字体栈 (Font Family):</span>
                <span className="font-mono font-bold text-text-primary">{protoData.designTokens?.fontFamily}</span>
              </div>
              <div className="p-3 bg-bg-secondary rounded-xl border border-border-subtle flex items-center justify-between">
                <span className="text-text-secondary">圆角半径 (Border Radius):</span>
                <span className="font-mono font-bold text-text-primary">{protoData.designTokens?.borderRadius}</span>
              </div>
              <div className="p-3 bg-bg-secondary rounded-xl border border-border-subtle flex items-center justify-between">
                <span className="text-text-secondary">间距阶梯 (Spacing Scale):</span>
                <span className="font-mono font-bold text-text-primary">{protoData.designTokens?.spacingScale}</span>
              </div>
            </div>
          </Card>

          <Card className="p-7 space-y-4">
            <h4 className="font-bold text-text-primary text-sm flex items-center gap-2">
              <PhLayers size={16} weight="duotone" className="text-accent" />
              <span>响应式断点规则</span>
            </h4>
            <div className="space-y-2 text-xs text-text-secondary bg-bg-secondary p-4 rounded-2xl border border-border-subtle">
              <div>• <strong>sm: 640px</strong> (移动端流式布局，隐藏次要指标栏)</div>
              <div>• <strong>md: 768px</strong> (平板双列栅格，支持分栏操作)</div>
              <div>• <strong>lg: 1024px</strong> (桌面全景视图，展开多 Agent 交互控制台)</div>
              <div>• <strong>xl: 1280px+</strong> (高分辨率大屏，自适应数据图谱)</div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
