/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Product } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import {
  Sparkle as PhSparkle,
  Robot as PhBot,
  FileText as PhFileText,
  Stack as PhLayers,
  CheckCircle as PhCheckCircle2,
  Warning as PhAlertTriangle,
  ArrowRight as PhArrowRight,
  Copy as PhCopy,
  Check as PhCheck,
  Download as PhDownload,
  Plus as PhPlus,
  ArrowClockwise as PhRefreshCw,
  ShieldCheck as PhShieldCheck,
  Share as PhShare2,
  CaretRight as PhChevronRight,
  GitBranch as PhGitBranch,
  Target as PhTarget,
  Clock as PhClock,
  Lightning as PhZap,
  Tag as PhTag,
} from '@phosphor-icons/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Textarea } from '@/src/components/ui/Input';
import { Separator } from '@/src/components/ui/Separator';

interface Props {
  product: Product;
}

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 25 };

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

  const subTabs = [
    { key: 'prd' as const, icon: PhFileText, label: 'PRD 规格说明书', count: null },
    { key: 'stories' as const, icon: PhCheckCircle2, label: `用户故事地图 (${reqData.userStories?.length || 0})`, count: null },
    { key: 'usecases' as const, icon: PhLayers, label: `业务用例与流转 (${reqData.useCases?.length || 0})`, count: null },
    { key: 'boundary' as const, icon: PhShieldCheck, label: `边界条件与异常自检 (${reqData.boundaryChecks?.length || 0})`, count: null },
    { key: 'flowchart' as const, icon: PhGitBranch, label: '泳道与时序流向', count: null },
  ];

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            className="fixed bottom-6 right-6 z-50 bg-bg-primary text-text-primary text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-border-subtle flex items-center gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={springTransition}
          >
            <PhSparkle size={16} weight="duotone" className="text-accent shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Requirement Generator Input Box */}
      <Card variant="dark" className="p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent/20 text-accent rounded-2xl border border-accent/30">
              <PhBot size={24} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-text-primary">AI 需求全自动设计与工程中枢</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-accent/20 text-accent border border-accent/30">
                  DeepSeek / Gemini 驱动
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5">
                基于【{product.name}】的业务定位，一句话快速生成完整 PRD、用户故事地图、时序泳道图与边界漏洞自检方案。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">当前版本:</span>
            <span className="px-2.5 py-1 rounded-lg bg-bg-secondary text-text-primary text-xs font-mono border border-border-subtle">
              {reqData.version}
            </span>
          </div>
        </div>

        {/* Quick Scenario Selector */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-text-tertiary">选择场景预设模板：</div>
          <div className="flex flex-wrap gap-2">
            {scenarioTemplates.map((sc) => (
              <button
                key={sc.label}
                onClick={() => setSelectedScenario(sc.label)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  selectedScenario === sc.label
                    ? 'bg-accent text-white shadow-md shadow-accent/30 scale-102 border border-accent/40'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary border border-border-subtle'
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
              placeholder={`输入具体需求构想（例如："针对 ${product.name} 新增多 Agent 自动化协同派发与成果物一键导出功能，需支持断网离线降级与权限校验..."）`}
              className="w-full bg-bg-secondary text-xs text-text-primary placeholder:text-text-placeholder rounded-2xl p-4 border border-border-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent resize-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <PhSparkle size={14} weight="duotone" className="text-accent" />
              <span>支持自动补齐非功能性指标 (SLA)、Given-When-Then 验收准则与异常分支。</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white text-xs font-bold rounded-xl shadow-lg shadow-accent/25 transition-all disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <PhRefreshCw size={16} weight="duotone" className="animate-spin" />
                    <span>AI 深度推导中...</span>
                  </>
                ) : (
                  <>
                    <PhSparkle size={16} weight="duotone" />
                    <span>AI 全自动推导需求方案</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Sub Tab Navigation */}
      <Card className="p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {subTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveSubTab(tab.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeSubTab === tab.key
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                  }`}
                >
                  <Icon size={14} weight="duotone" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Global actions */}
          <div className="flex items-center gap-2">
            {activeSubTab === 'stories' && (
              <Button variant="secondary" size="sm" onClick={handleConvertStoriesToTasks} className="text-accent border-accent/20 bg-accent-subtle hover:bg-accent-muted">
                <PhZap size={13} weight="duotone" />
                <span>转为研发任务看板</span>
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => handleCopy(reqData.prdMarkdown)}>
              {copied ? <PhCheck size={13} weight="duotone" className="text-success" /> : <PhCopy size={13} weight="duotone" />}
              <span>复制 Markdown</span>
            </Button>

            <Button variant="secondary" size="sm" onClick={handleDownload}>
              <PhDownload size={13} weight="duotone" />
              <span>导出 .md</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Tab Content Display */}
      {activeSubTab === 'prd' && (
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <Card className="lg:col-span-8 p-7 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <h4 className="font-bold text-text-primary text-base">{reqData.title}</h4>
                <p className="text-xs text-text-tertiary mt-0.5">编制人: {reqData.author} · 最后更新: {reqData.updatedAt}</p>
              </div>
              <Badge variant="success">{reqData.status}</Badge>
            </div>

            <div className="prose prose-slate prose-sm max-w-none text-text-secondary leading-relaxed font-sans">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{reqData.prdMarkdown}</ReactMarkdown>
            </div>
          </Card>

          {/* Right Summary & Key Indicators */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-text-primary font-bold text-sm">
                <PhTarget size={16} weight="duotone" className="text-accent" />
                <span>业务目标与价值闭环</span>
              </div>
              <p className="text-xs text-text-secondary bg-bg-secondary p-3.5 rounded-2xl border border-border-subtle leading-relaxed">
                {reqData.businessGoal}
              </p>

              <div className="pt-2">
                <div className="text-xs font-semibold text-text-tertiary mb-2">目标客群画像</div>
                <div className="space-y-1.5">
                  {reqData.targetAudience?.map((aud, i) => (
                    <div key={i} className="text-xs text-text-secondary bg-accent-subtle/50 px-3 py-2 rounded-xl border border-accent/10 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
                      <span>{aud}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <div className="bg-gradient-to-br from-accent/10 to-accent-subtle rounded-3xl p-6 border border-accent/20 space-y-3">
              <div className="flex items-center gap-2 text-accent font-bold text-xs">
                <PhSparkle size={16} weight="duotone" />
                <span>AI 评审与逻辑自检结论</span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                已通过 18 项大厂 PRD 规范性规则校验，正向流程闭环率 100%，已补齐网络重试与弱网降级策略。
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* User Stories Tab */}
      {activeSubTab === 'stories' && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reqData.userStories?.map((story) => (
              <Card key={story.id} variant="interactive" className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="text-xs font-mono font-bold">
                      {story.id}
                    </Badge>
                    <Badge variant="accent">{story.epic}</Badge>
                  </div>
                  <Badge
                    variant={
                      story.priority === 'P0' ? 'danger' :
                      story.priority === 'P1' ? 'warning' :
                      'neutral'
                    }
                  >
                    {story.priority}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-text-secondary">
                  <div><strong className="text-text-primary">角色 (As a):</strong> {story.role}</div>
                  <div><strong className="text-text-primary">诉求 (I want):</strong> {story.feature}</div>
                  <div><strong className="text-text-primary">价值 (So that):</strong> {story.benefit}</div>
                </div>

                {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
                  <div className="pt-2 border-t border-border-subtle space-y-1.5">
                    <div className="text-[11px] font-bold text-text-tertiary uppercase tracking-wider">
                      验收标准 (Given-When-Then):
                    </div>
                    {story.acceptanceCriteria.map((ac, idx) => (
                      <div key={idx} className="text-xs text-text-secondary bg-bg-secondary p-2 rounded-lg border border-border-subtle font-mono">
                        {ac}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Use Cases Tab */}
      {activeSubTab === 'usecases' && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          {reqData.useCases?.map((uc) => (
            <Card key={uc.id} className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-50 text-purple-600 font-mono font-bold text-xs">
                    {uc.id}
                  </div>
                  <h4 className="font-bold text-text-primary text-sm">{uc.title}</h4>
                </div>
                <span className="text-xs text-text-tertiary">主要参与者: <strong className="text-text-secondary">{uc.actor}</strong></span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-2 bg-bg-secondary p-4 rounded-2xl border border-border-subtle">
                  <div className="font-bold text-text-primary flex items-center gap-1.5">
                    <PhCheckCircle2 size={14} weight="duotone" className="text-success" />
                    <span>标准主业务流 (Main Flow)</span>
                  </div>
                  <div className="space-y-1 text-text-secondary">
                    {uc.mainFlow.map((step, idx) => (
                      <div key={idx}>{step}</div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 bg-warning-subtle/40 p-4 rounded-2xl border border-warning-subtle">
                  <div className="font-bold text-warning flex items-center gap-1.5">
                    <PhAlertTriangle size={14} weight="duotone" />
                    <span>异常与替代流 (Alternative Flow)</span>
                  </div>
                  <div className="space-y-1 text-warning">
                    {uc.altFlow.map((step, idx) => (
                      <div key={idx}>{step}</div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-text-secondary border-t border-border-subtle">
                <div>前置条件: <span className="text-text-primary font-medium">{uc.preCondition}</span></div>
                <div>后置保证: <span className="text-text-primary font-medium">{uc.postCondition}</span></div>
              </div>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Boundary Checks */}
      {activeSubTab === 'boundary' && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reqData.boundaryChecks?.map((b, idx) => (
              <Card key={idx} className="p-6 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        b.riskLevel === 'high' ? 'danger' :
                        b.riskLevel === 'medium' ? 'warning' :
                        'accent'
                      }
                    >
                      {b.riskLevel === 'high' ? '高风险' : b.riskLevel === 'medium' ? '中等风险' : '低风险'}
                    </Badge>
                    <PhShieldCheck size={16} weight="duotone" className="text-text-tertiary" />
                  </div>
                  <h4 className="font-bold text-text-primary text-sm">{b.scenario}</h4>
                  <p className="text-xs text-text-secondary">潜在影响: {b.impact}</p>
                </div>

                <div className="bg-bg-secondary p-3 rounded-xl border border-border-subtle text-xs text-text-secondary">
                  <strong className="text-text-primary block mb-1">应对策略：</strong>
                  {b.handlingStrategy}
                </div>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Flowchart Tab */}
      {activeSubTab === 'flowchart' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <Card className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-text-primary text-base flex items-center gap-2">
                <PhGitBranch size={20} weight="duotone" className="text-accent" />
                <span>业务端到端时序流转图谱</span>
              </h4>
              <span className="text-xs text-text-tertiary">自动化协同流向</span>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-3 overflow-x-auto py-6">
              {reqData.flowchartNodes?.map((node, i) => (
                <div key={node.id} className="flex items-center gap-3 w-full md:w-auto">
                  <div className={`p-4 rounded-2xl border text-xs text-center flex flex-col items-center gap-1.5 min-w-[140px] shadow-sm ${
                    node.type === 'start' ? 'bg-accent-subtle border-accent/20 text-accent font-bold' :
                    node.type === 'agent' ? 'bg-accent text-white font-bold shadow-accent/20' :
                    node.type === 'decision' ? 'bg-warning-subtle border-warning-subtle text-warning font-bold' :
                    node.type === 'end' ? 'bg-success-subtle border-success/20 text-success font-bold' :
                    'bg-bg-secondary border-border-subtle text-text-primary'
                  }`}>
                    <span>{node.label}</span>
                    <span className={`text-[10px] font-normal ${node.type === 'agent' ? 'text-white/70' : 'text-text-tertiary'}`}>{node.desc}</span>
                  </div>
                  {i < reqData.flowchartNodes.length - 1 && (
                    <PhArrowRight size={16} weight="duotone" className="text-text-tertiary shrink-0 hidden md:block" />
                  )}
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
