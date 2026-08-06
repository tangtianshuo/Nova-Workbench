/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { CodeScaffoldItem } from '../../data/mockRndData';
import { useApp } from '../../store/AppContext';
import { 
  Code2, 
  Sparkles, 
  Copy, 
  Check, 
  Download, 
  Plus, 
  Terminal, 
  FileCode, 
  Database, 
  Container, 
  GitCommit, 
  Cpu, 
  Layers, 
  RefreshCw,
  Eye,
  CheckCircle2
} from 'lucide-react';

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
    { type: 'types', label: 'TS 类型契约', icon: Layers, desc: 'Schema 与 Payload 接口' },
    { type: 'component', label: 'React 核心组件', icon: Code2, desc: '高保真交互组件' },
    { type: 'schema', label: '数据库 DDL', icon: Database, desc: 'PostgreSQL 建表脚本' },
    { type: 'docker', label: 'Docker 容器编排', icon: Container, desc: '多阶段构建 Dockerfile' },
    { type: 'commit', label: 'Git 提交规约', icon: GitCommit, desc: '自动化 Commit 规范' }
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Code Generation Studio Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-cyan-500/20 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-400/30">
                <Code2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black">AI 全自动架构设计与代码脚手架中枢</h3>
            </div>
            <p className="text-xs text-slate-400">
              围绕【{product.name}】自动推导全栈架构拓扑、TypeScript 契约、Express 路由、SQL 建表与 Docker 部署规范。
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-950/60 px-3 py-1.5 rounded-xl border border-cyan-800/60">
            <Cpu size={14} />
            <span>Node.js v20 / TS 5.x / PostgreSQL</span>
          </div>
        </div>

        {/* Quick Scaffold Generators Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {scaffoldPresets.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.type}
                onClick={() => handleGenerateScaffold(preset.type as any)}
                disabled={isGenerating}
                className="p-3 bg-slate-900/90 hover:bg-slate-850 text-left rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between group disabled:opacity-50"
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="p-2 rounded-xl bg-slate-800 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                    <Icon size={16} />
                  </div>
                  <Sparkles size={12} className="text-slate-600 group-hover:text-cyan-400 transition-colors" />
                </div>
                <div>
                  <div className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors">{preset.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{preset.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Code Browser & IDE View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: File Tree */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="font-bold text-xs text-slate-700 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-blue-600" />
              <span>工程代码资产目录 ({scaffolds.length})</span>
            </h4>
          </div>

          <div className="space-y-2">
            {scaffolds.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedScaffoldId(item.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-1.5 ${
                  selectedScaffoldId === item.id
                    ? 'bg-cyan-50/70 border-cyan-300 shadow-sm'
                    : 'bg-slate-50/60 border-slate-100 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-800 truncate">{item.filename}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                    {item.language.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-1">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Code Viewer */}
        <div className="lg:col-span-8 bg-slate-950 text-slate-100 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4 flex flex-col justify-between min-h-[500px]">
          {selectedScaffold ? (
            <>
              {/* Code Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 font-mono text-xs">
                    {selectedScaffold.language}
                  </div>
                  <div>
                    <h3 className="font-mono font-bold text-sm text-slate-200">{selectedScaffold.filename}</h3>
                    <p className="text-xs text-slate-500">{selectedScaffold.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(selectedScaffold.code)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-xl border border-slate-800 transition-colors"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copied ? '已复制' : '复制代码'}</span>
                  </button>

                  <button
                    onClick={() => handleDownload(selectedScaffold)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-xl border border-slate-800 transition-colors"
                  >
                    <Download size={13} />
                    <span>导出代码</span>
                  </button>
                </div>
              </div>

              {/* Code Body */}
              <pre className="text-xs font-mono text-slate-300 overflow-x-auto p-4 bg-slate-900/90 rounded-2xl leading-relaxed border border-slate-800/80 flex-1 my-2">
                <code>{selectedScaffold.code}</code>
              </pre>

              {/* Code Footer */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-900">
                <span>代码类型: <strong className="text-slate-400">{selectedScaffold.type}</strong></span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 size={13} />
                  <span>符合工业级 ESLint / Prettier 代码规范</span>
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-20 text-slate-500 text-xs">
              请选择左侧代码文件或点击顶部按钮自动生成脚手架。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
