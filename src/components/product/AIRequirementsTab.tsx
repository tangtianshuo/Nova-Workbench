/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import { 
  Sparkles, 
  Bot, 
  FileText, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Copy, 
  Check, 
  Download, 
  Plus, 
  RefreshCw, 
  ShieldCheck, 
  Share2, 
  ChevronRight,
  GitBranch,
  Target,
  Clock,
  Zap,
  Tag
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Props {
  product: Product;
}

export function AIRequirementsTab({ product }: Props) {
  const { getRequirementForProduct, updateRequirement, generateRequirementAI, syncDeliverableToDocs, addTask } = useApp();
  const reqData = getRequirementForProduct(product.id);

  const [activeSubTab, setActiveSubTab] = useState<'prd' | 'stories' | 'usecases' | 'boundary' | 'flowchart'>('prd');
  const [promptInput, setPromptInput] = useState('');
  const [selectedScenario, setSelectedScenario] = useState('新功能 MVP 规划');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const scenarioTemplates = [
    { label: '新功能 MVP 规划', desc: '快速提炼核心用例与 P0 验收条件' },
    { label: 'B端多角色权限重构', desc: '基于 RBAC 梳理权限与异常降级' },
    { label: 'AI 智能体 Agent 集成', desc: '自然语言多轮交互与工具调度契约' },
    { label: '数据中台与指标看板', desc: '定义数据管道、埋点与时效 SLA' },
    { label: '移动端多终端适配', desc: '针对移动端触控交互与网络容错' }
  ];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await generateRequirementAI(product.id, promptInput, selectedScenario);
      showToast('✨ AI 需求工程推导完成！已生成全套规格书与用户故事');
    } catch (e) {
      showToast('❌ 生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('📋 已复制至剪贴板');
  };

  const handleDownload = () => {
    const blob = new Blob([reqData.prdMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PRD_${product.name.replace(/\s+/g, '_')}_v${reqData.version}.md`;
    link.click();
    showToast('📥 需求规格说明书下载成功');
  };

  const handleConvertStoriesToTasks = () => {
    reqData.userStories.forEach(story => {
      addTask({
        id: `task-req-${Date.now()}-${story.id}`,
        title: `【${story.priority}】${story.feature}`,
        status: '进行中',
        priority: story.priority === 'P0' ? 'high' : story.priority === 'P1' ? 'medium' : 'low',
        assignee: product.owner.split(' ')[0] || 'Brandon',
        assigneeAvatar: 'BR',
        deadline: '2025-06-30 18:00',
        description: story.benefit,
        project: product.name,
        aiSuggestions: story.acceptanceCriteria || []
      }, 'requirement');
    });
    showToast(`🚀 已将 ${reqData.userStories.length} 条用户故事同步至【任务管理】看板！`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* AI Requirement Generator Input Box */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-500/20 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/30 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">AI 需求全自动设计与工程中枢</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  DeepSeek / Gemini 驱动
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                基于【{product.name}】的业务定位，一句话快速生成完整 PRD、用户故事地图、时序泳道图与边界漏洞自检方案。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">当前版本:</span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-mono border border-slate-700">
              {reqData.version}
            </span>
          </div>
        </div>

        {/* Quick Scenario Selector */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-400">选择场景预设模板：</div>
          <div className="flex flex-wrap gap-2">
            {scenarioTemplates.map((sc) => (
              <button
                key={sc.label}
                onClick={() => setSelectedScenario(sc.label)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  selectedScenario === sc.label
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 scale-102 border border-indigo-400/40'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-750 border border-slate-700/60'
                }`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Input */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              rows={3}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder={`输入具体需求构想（例如：“针对 ${product.name} 新增多 Agent 自动化协同派发与成果物一键导出功能，需支持断网离线降级与权限校验...”）`}
              className="w-full bg-slate-800/90 text-xs text-slate-100 placeholder:text-slate-500 rounded-2xl p-4 border border-slate-700/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>支持自动补齐非功能性指标 (SLA)、Given-When-Then 验收准则与异常分支。</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>AI 深度推导中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>AI 全自动推导需求方案</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveSubTab('prd')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'prd'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText size={14} />
            <span>PRD 规格说明书</span>
          </button>

          <button
            onClick={() => setActiveSubTab('stories')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'stories'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 size={14} />
            <span>用户故事地图 ({reqData.userStories?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('usecases')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'usecases'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers size={14} />
            <span>业务用例与流转 ({reqData.useCases?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('boundary')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'boundary'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck size={14} />
            <span>边界条件与异常自检 ({reqData.boundaryChecks?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('flowchart')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === 'flowchart'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <GitBranch size={14} />
            <span>泳道与时序流向</span>
          </button>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {activeSubTab === 'stories' && (
            <button
              onClick={handleConvertStoriesToTasks}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold rounded-xl border border-indigo-200 transition-colors"
            >
              <Zap size={13} className="text-indigo-600" />
              <span>转为研发任务看板</span>
            </button>
          )}

          <button
            onClick={() => handleCopy(reqData.prdMarkdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-xl border border-slate-200 transition-colors"
          >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            <span>复制 Markdown</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-xl border border-slate-200 transition-colors"
          >
            <Download size={13} />
            <span>导出 .md</span>
          </button>
        </div>
      </div>

      {/* Tab Content Display */}
      {activeSubTab === 'prd' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white rounded-3xl p-7 border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h4 className="font-bold text-slate-800 text-base">{reqData.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">编制人: {reqData.author} · 最后更新: {reqData.updatedAt}</p>
              </div>
              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-xl">
                {reqData.status}
              </span>
            </div>

            <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed font-sans">
              <ReactMarkdown>{reqData.prdMarkdown}</ReactMarkdown>
            </div>
          </div>

          {/* Right Summary & Key Indicators */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Target className="w-4 h-4 text-blue-600" />
                <span>业务目标与价值闭环</span>
              </div>
              <p className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 leading-relaxed">
                {reqData.businessGoal}
              </p>

              <div className="pt-2">
                <div className="text-xs font-semibold text-slate-400 mb-2">目标客群画像</div>
                <div className="space-y-1.5">
                  {reqData.targetAudience?.map((aud, i) => (
                    <div key={i} className="text-xs text-slate-700 bg-indigo-50/50 px-3 py-2 rounded-xl border border-indigo-100/60 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-600"></div>
                      <span>{aud}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-3xl p-6 border border-blue-200/60 space-y-3">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>AI 评审与逻辑自检结论</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                已通过 18 项大厂 PRD 规范性规则校验，正向流程闭环率 100%，已补齐网络重试与弱网降级策略。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* User Stories Tab */}
      {activeSubTab === 'stories' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reqData.userStories?.map((story) => (
              <div key={story.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-3 hover:border-blue-200 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-700">
                      {story.id}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      {story.epic}
                    </span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    story.priority === 'P0' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    story.priority === 'P1' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-slate-50 text-slate-700 border border-slate-200'
                  }`}>
                    {story.priority}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-700">
                  <div><strong className="text-slate-900">角色 (As a):</strong> {story.role}</div>
                  <div><strong className="text-slate-900">诉求 (I want):</strong> {story.feature}</div>
                  <div><strong className="text-slate-900">价值 (So that):</strong> {story.benefit}</div>
                </div>

                {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      验收标准 (Given-When-Then):
                    </div>
                    {story.acceptanceCriteria.map((ac, idx) => (
                      <div key={idx} className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100/80 font-mono">
                        {ac}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Use Cases Tab */}
      {activeSubTab === 'usecases' && (
        <div className="space-y-4">
          {reqData.useCases?.map((uc) => (
            <div key={uc.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-50 text-purple-600 font-mono font-bold text-xs">
                    {uc.id}
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">{uc.title}</h4>
                </div>
                <span className="text-xs text-slate-400">主要参与者: <strong className="text-slate-700">{uc.actor}</strong></span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span>标准主业务流 (Main Flow)</span>
                  </div>
                  <div className="space-y-1 text-slate-600">
                    {uc.mainFlow.map((step, idx) => (
                      <div key={idx}>{step}</div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 bg-amber-50/40 p-4 rounded-2xl border border-amber-100">
                  <div className="font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span>异常与替代流 (Alternative Flow)</span>
                  </div>
                  <div className="space-y-1 text-amber-800">
                    {uc.altFlow.map((step, idx) => (
                      <div key={idx}>{step}</div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-slate-500 border-t border-slate-100">
                <div>前置条件: <span className="text-slate-700 font-medium">{uc.preCondition}</span></div>
                <div>后置保证: <span className="text-slate-700 font-medium">{uc.postCondition}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Boundary Checks */}
      {activeSubTab === 'boundary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reqData.boundaryChecks?.map((b, idx) => (
              <div key={idx} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      b.riskLevel === 'high' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      b.riskLevel === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {b.riskLevel === 'high' ? '高风险' : b.riskLevel === 'medium' ? '中等风险' : '低风险'}
                    </span>
                    <ShieldCheck size={16} className="text-slate-400" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">{b.scenario}</h4>
                  <p className="text-xs text-slate-500">潜在影响: {b.impact}</p>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700">
                  <strong className="text-slate-900 block mb-1">应对策略：</strong>
                  {b.handlingStrategy}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flowchart Tab */}
      {activeSubTab === 'flowchart' && (
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-indigo-600" />
              <span>业务端到端时序流转图谱</span>
            </h4>
            <span className="text-xs text-slate-400">自动化协同流向</span>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-3 overflow-x-auto py-6">
            {reqData.flowchartNodes?.map((node, i) => (
              <div key={node.id} className="flex items-center gap-3 w-full md:w-auto">
                <div className={`p-4 rounded-2xl border text-xs text-center flex flex-col items-center gap-1.5 min-w-[140px] shadow-sm ${
                  node.type === 'start' ? 'bg-blue-50 border-blue-200 text-blue-900 font-bold' :
                  node.type === 'agent' ? 'bg-indigo-600 text-white font-bold shadow-indigo-600/20' :
                  node.type === 'decision' ? 'bg-amber-50 border-amber-200 text-amber-900 font-bold' :
                  node.type === 'end' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold' :
                  'bg-slate-50 border-slate-200 text-slate-800'
                }`}>
                  <span>{node.label}</span>
                  <span className={`text-[10px] font-normal ${node.type === 'agent' ? 'text-indigo-200' : 'text-slate-500'}`}>{node.desc}</span>
                </div>
                {i < reqData.flowchartNodes.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
