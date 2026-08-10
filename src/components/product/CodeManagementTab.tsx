/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { CodeScaffoldItem } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import {
  Code,
  Sparkle,
  Copy,
  Check,
  Download,
  Plus,
  Terminal,
  FileCode,
  Database,
  ShippingContainer,
  GitBranch,
  Cpu,
  Stack,
  ArrowClockwise,
  Eye,
  CheckCircle,
} from '@phosphor-icons/react';
import { Card, Badge, Button } from '../ui';

interface Props {
  product: Product;
}

export function CodeManagementTab({ product }: Props) {
  const { getCodeScaffoldsForProduct, generateCodeScaffoldAI, addCodeScaffold } = useApp();
  const scaffolds = getCodeScaffoldsForProduct(product.id);

  const [selectedScaffoldId, setSelectedScaffoldId] = useState<string | null>(scaffolds[0]?.id || null);
  const [generatorPrompt, setGeneratorPrompt] = useState('');
  const [selectedType, setSelectedType] = useState<'api' | 'types' | 'component' | 'schema' | 'docker' | 'commit'>('api');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const selectedScaffold = scaffolds.find(s => s.id === selectedScaffoldId) || scaffolds[0];

  const handleGenerateScaffold = async (type: 'api' | 'types' | 'component' | 'schema' | 'docker' | 'commit') => {
    setIsGenerating(true);
    try {
      await generateCodeScaffoldAI(product.id, type, generatorPrompt);
      showToast(`⚡ 已为【${product.name}】自动推导并生成 ${type.toUpperCase()} 源码脚手架！`);
    } catch (e) {
      showToast('❌ 生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('📋 代码已复制至剪贴板');
  };

  const handleDownload = (scaffold: CodeScaffoldItem) => {
    const blob = new Blob([scaffold.code], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = scaffold.filename.split('/').pop() || 'code.ts';
    link.click();
    showToast(`📥 已导出文件 ${scaffold.filename}`);
  };

  const scaffoldPresets = [
    { type: 'api', label: '后端 API 路由', icon: Terminal, desc: 'Express / RESTful 端点' },
    { type: 'types', label: 'TS 类型契约', icon: Stack, desc: 'Schema 与 Payload 接口' },
    { type: 'component', label: 'React 核心组件', icon: Code, desc: '高保真交互组件' },
    { type: 'schema', label: '数据库 DDL', icon: Database, desc: 'PostgreSQL 建表脚本' },
    { type: 'docker', label: 'Docker 容器编排', icon: ShippingContainer, desc: '多阶段构建 Dockerfile' },
    { type: 'commit', label: 'Git 提交规约', icon: GitBranch, desc: '自动化 Commit 规范' }
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-bg-primary text-text-primary text-xs px-4 py-2.5 rounded-[var(--radius-lg)] shadow-shadow-lg border border-border-subtle flex items-center gap-2 animate-in fade-in">
          <Sparkle size={16} weight="duotone" className="text-accent" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Code Generation Studio Banner */}
      <Card variant="dark" className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-accent/20 text-accent rounded-[var(--radius-md)] border border-accent/30">
                <Code size={24} weight="duotone" />
              </div>
              <h3 className="text-xl font-black">AI 全自动架构设计与代码脚手架中枢</h3>
            </div>
            <p className="text-xs text-text-tertiary">
              围绕【{product.name}】自动推导全栈架构拓扑、TypeScript 契约、Express 路由、SQL 建表与 Docker 部署规范。
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-accent bg-accent-subtle px-3 py-1.5 rounded-[var(--radius-md)] border border-accent/30">
            <Cpu size={14} weight="duotone" />
            <span>Node.js v20 / TS 5.x / PostgreSQL</span>
          </div>
        </div>

        {/* Quick Scaffold Generators Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {scaffoldPresets.map((preset) => {
            const Icon = preset.icon;
            return (
              <Button
                key={preset.type}
                variant="ghost"
                onClick={() => handleGenerateScaffold(preset.type as any)}
                disabled={isGenerating}
                className="p-3 h-auto bg-bg-secondary/50 hover:bg-bg-secondary text-left rounded-[var(--radius-lg)] border border-border-subtle hover:border-accent/40 transition-all flex flex-col justify-between group !w-full"
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="p-2 rounded-[var(--radius-md)] bg-bg-secondary text-accent group-hover:bg-accent/20 transition-colors">
                    <Icon size={16} weight="duotone" />
                  </div>
                  <Sparkle size={12} weight="duotone" className="text-text-tertiary group-hover:text-accent transition-colors" />
                </div>
                <div>
                  <div className="font-bold text-xs text-text-primary group-hover:text-accent transition-colors">{preset.label}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">{preset.desc}</div>
                </div>
              </Button>
            );
          })}
        </div>
      </Card>

      {/* Code Browser & IDE View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: File Tree */}
        <Card className="lg:col-span-4 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <h4 className="font-bold text-xs text-text-secondary flex items-center gap-2">
              <FileCode size={16} weight="duotone" className="text-accent" />
              <span>工程代码资产目录 ({scaffolds.length})</span>
            </h4>
          </div>

          <div className="space-y-2">
            {scaffolds.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedScaffoldId(item.id)}
                className={`p-3.5 rounded-[var(--radius-lg)] border transition-all cursor-pointer space-y-1.5 ${
                  selectedScaffoldId === item.id
                    ? 'bg-accent-subtle border-accent/50 shadow-shadow-sm'
                    : 'bg-bg-secondary/50 border-border-subtle hover:bg-bg-secondary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-text-primary truncate">{item.filename}</span>
                  <Badge variant="neutral">{item.language.toUpperCase()}</Badge>
                </div>
                <p className="text-[11px] text-text-tertiary line-clamp-1">{item.description}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Right Column: Code Viewer */}
        <Card className="lg:col-span-8 bg-slate-950 text-slate-100 border-slate-800 p-6 space-y-4 flex flex-col justify-between min-h-[500px]">
          {selectedScaffold ? (
            <>
              {/* Code Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-[var(--radius-md)] bg-slate-900 border border-slate-800 text-accent font-mono text-xs">
                    {selectedScaffold.language}
                  </div>
                  <div>
                    <h3 className="font-mono font-bold text-sm text-slate-200">{selectedScaffold.filename}</h3>
                    <p className="text-xs text-text-tertiary">{selectedScaffold.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleCopy(selectedScaffold.code)}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                  >
                    {copied ? <Check size={13} weight="duotone" className="text-success" /> : <Copy size={13} weight="duotone" />}
                    <span>{copied ? '已复制' : '复制代码'}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleDownload(selectedScaffold)}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                  >
                    <Download size={13} weight="duotone" />
                    <span>导出代码</span>
                  </Button>
                </div>
              </div>

              {/* Code Body */}
              <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-4 bg-slate-900/90 rounded-[var(--radius-lg)] leading-relaxed border border-slate-800/80 flex-1 my-2">
                <code>{selectedScaffold.code}</code>
              </pre>

              {/* Code Footer */}
              <div className="flex items-center justify-between text-xs text-text-tertiary pt-2 border-t border-slate-900">
                <span>代码类型: <strong className="text-text-secondary">{selectedScaffold.type}</strong></span>
                <span className="flex items-center gap-1.5 text-success">
                  <CheckCircle size={13} weight="duotone" />
                  <span>符合工业级 ESLint / Prettier 代码规范</span>
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-text-tertiary text-xs">
              请选择左侧代码文件或点击顶部按钮自动生成脚手架。
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
