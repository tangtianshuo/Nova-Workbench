/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import { 
  Sparkles, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Palette, 
  Code2, 
  Eye, 
  Copy, 
  Check, 
  Download, 
  RefreshCw, 
  Zap, 
  Layers,
  Layout,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Activity,
  Sliders,
  CheckCircle2
} from 'lucide-react';

interface Props {
  product: Product;
}

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
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* AI UI Prompt Box */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-500/20 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-600/30 text-purple-400 rounded-2xl border border-purple-500/30">
              <Layout className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">AI 界面设计与交互原型沙箱</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-400/30">
                  UI Code Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                基于【{product.name}】产品属性，输入交互指令即可实时生成高保真交互视图与生产级 React/Tailwind 代码。
              </p>
            </div>
          </div>

          {/* Quick theme selector */}
          <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700">
            <span className="text-[11px] text-slate-400 px-2">配色风格:</span>
            <button
              onClick={() => setTheme('indigo')}
              className={`w-6 h-6 rounded-full bg-indigo-600 transition-all ${theme === 'indigo' ? 'ring-2 ring-white scale-110' : 'opacity-60'}`}
              title="Indigo Tech"
            />
            <button
              onClick={() => setTheme('dark')}
              className={`w-6 h-6 rounded-full bg-slate-800 border border-slate-500 transition-all ${theme === 'dark' ? 'ring-2 ring-white scale-110' : 'opacity-60'}`}
              title="Dark Titanium"
            />
            <button
              onClick={() => setTheme('mint')}
              className={`w-6 h-6 rounded-full bg-emerald-600 transition-all ${theme === 'mint' ? 'ring-2 ring-white scale-110' : 'opacity-60'}`}
              title="Mint Emerald"
            />
            <button
              onClick={() => setTheme('sunset')}
              className={`w-6 h-6 rounded-full bg-orange-600 transition-all ${theme === 'sunset' ? 'ring-2 ring-white scale-110' : 'opacity-60'}`}
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
            className="flex-1 bg-slate-800/90 text-xs text-slate-100 placeholder:text-slate-500 rounded-xl px-4 py-3 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/25 transition-all disabled:opacity-50 shrink-0"
          >
            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>AI 生成高保真界面</span>
          </button>
        </div>
      </div>

      {/* View Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
        {/* Device Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setDevice('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              device === 'desktop' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Monitor size={14} />
            <span>桌面端 (1280px)</span>
          </button>
          <button
            onClick={() => setDevice('tablet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              device === 'tablet' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Tablet size={14} />
            <span>平板端 (768px)</span>
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              device === 'mobile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone size={14} />
            <span>移动端 (375px)</span>
          </button>
        </div>

        {/* View Mode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Eye size={13} />
              <span>实时交互渲染</span>
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'code' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Code2 size={13} />
              <span>React 源码</span>
            </button>
            <button
              onClick={() => setViewMode('tokens')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'tokens' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sliders size={13} />
              <span>Design Tokens</span>
            </button>
          </div>

          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span>复制代码</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      {viewMode === 'preview' && (
        <div className="flex justify-center bg-slate-100/80 p-6 md:p-10 rounded-3xl border border-slate-200/80 overflow-x-auto min-h-[560px]">
          <div
            className={`transition-all duration-300 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col ${
              device === 'mobile' ? 'w-[375px]' :
              device === 'tablet' ? 'w-[768px]' :
              'w-full max-w-5xl'
            }`}
          >
            {/* Browser / Device Chrome Header */}
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 select-none">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                </div>
                <div className="hidden sm:block text-xs font-mono text-slate-400 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 ml-2">
                  https://app.product.ai/{product.name.toLowerCase().replace(/\s+/g, '-')}/dashboard
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Live Interactive Sandbox</span>
              </div>
            </div>

            {/* Prototype Inner Screen */}
            <div className="p-6 space-y-6 bg-slate-50 min-h-[480px]">
              {/* Product Header in Prototype */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{product.name}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {product.stage}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{protoData.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMockCounter(c => c + 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
                  >
                    <Zap size={13} />
                    <span>交互触发 ({mockCounter})</span>
                  </button>
                </div>
              </div>

              {/* Stats Cards Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>系统吞吐能力</span>
                    <TrendingUp size={14} className="text-indigo-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900">98.9%</div>
                  <div className="text-[11px] text-emerald-600 font-medium">↑ +14.2% 同比上周提升</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>端到端延迟 (SLA)</span>
                    <Activity size={14} className="text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900">128 ms</div>
                  <div className="text-[11px] text-emerald-600 font-medium">极速响应 无感知等待</div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>AI 成果物完备度</span>
                    <CheckCircle2 size={14} className="text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-slate-900">100%</div>
                  <div className="text-[11px] text-blue-600 font-medium">18 份标准文档就绪</div>
                </div>
              </div>

              {/* Interactive Tabs within Prototype */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <button
                    onClick={() => setActiveInteractiveTab('overview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeInteractiveTab === 'overview' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    业务流转看板
                  </button>
                  <button
                    onClick={() => setActiveInteractiveTab('analytics')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeInteractiveTab === 'analytics' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    多 Agent 协同状态
                  </button>
                  <button
                    onClick={() => setActiveInteractiveTab('settings')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeInteractiveTab === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    安全与权限策略
                  </button>
                </div>

                {activeInteractiveTab === 'overview' && (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500">核心功能矩阵 (Live Feature Kanban):</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {product.featureMatrix?.slice(0, 4).map((f, i) => (
                        <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                          <div>
                            <div className="font-bold text-xs text-slate-800">{f.name}</div>
                            <div className="text-[11px] text-slate-400">{f.desc}</div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">
                            {f.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeInteractiveTab === 'analytics' && (
                  <div className="p-4 bg-slate-900 text-white rounded-xl text-xs space-y-2 font-mono">
                    <div className="text-emerald-400">● [Agent #1] 需求工程推导引擎 (Running - 0.2s)</div>
                    <div className="text-indigo-400">● [Agent #2] 架构代码脚手架生成 (Idle)</div>
                    <div className="text-purple-400">● [Agent #3] 自动化测试用例推导 (Ready)</div>
                  </div>
                )}

                {activeInteractiveTab === 'settings' && (
                  <div className="text-xs text-slate-600 space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                      <span>开启数据加密与合规审查</span>
                      <span className="font-bold text-emerald-600">已开启</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                      <span>多租户隔离 (RBAC)</span>
                      <span className="font-bold text-indigo-600">企业级</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Code Mode */}
      {viewMode === 'code' && (
        <div className="bg-slate-950 text-slate-100 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-mono font-bold text-slate-300">GeneratedPrototype.tsx</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? '已复制' : '复制代码'}</span>
            </button>
          </div>

          <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-4 bg-slate-900/90 rounded-2xl leading-relaxed border border-slate-800">
            {protoData.reactCode}
          </pre>
        </div>
      )}

      {/* Design Tokens Mode */}
      {viewMode === 'tokens' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white rounded-3xl p-7 border border-slate-100 shadow-sm">
          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-purple-600" />
              <span>Design Tokens 规范矩阵</span>
            </h4>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">主品牌色 (Primary Token):</span>
                <span className="font-mono font-bold text-slate-900">{protoData.designTokens?.primaryColor}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">字体栈 (Font Family):</span>
                <span className="font-mono font-bold text-slate-900">{protoData.designTokens?.fontFamily}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">圆角半径 (Border Radius):</span>
                <span className="font-mono font-bold text-slate-900">{protoData.designTokens?.borderRadius}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-slate-500">间距阶梯 (Spacing Scale):</span>
                <span className="font-mono font-bold text-slate-900">{protoData.designTokens?.spacingScale}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>响应式断点规则</span>
            </h4>
            <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div>• <strong>sm: 640px</strong> (移动端流式布局，隐藏次要指标栏)</div>
              <div>• <strong>md: 768px</strong> (平板双列栅格，支持分栏操作)</div>
              <div>• <strong>lg: 1024px</strong> (桌面全景视图，展开多 Agent 交互控制台)</div>
              <div>• <strong>xl: 1280px+</strong> (高分辨率大屏，自适应数据图谱)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
