/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Product } from '../../data/mockProducts';
import {
  Sparkle as PhSparkle,
  Palette as PhPalette,
  Copy as PhCopy,
  Check as PhCheck,
  Download as PhDownload,
  ArrowClockwise as PhRefreshCw,
  Layout as PhLayout,
  FileText as PhFileText,
} from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Tooltip } from '@/src/components/ui/Tooltip';
import { MarkdownRenderer } from '@/src/components/ui';
import { TabRunPanel } from '@/src/components/rnd/TabRunPanel';
import { useTabRunStore, ACTIVE } from '@/src/stores/tabRunStore';
import { useRndStore } from '@/src/stores/rndStore';
import { buildCoreContext } from '@/src/ai/context';
import { isTauri } from '@/src/lib/api';

interface Props {
  product: Product;
}

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 25 };

const DEVICE_LABEL: Record<string, string> = { desktop: '桌面端', tablet: '平板端', mobile: '移动端' };

export function UIPrototypeTab({ product }: Props) {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [theme, setTheme] = useState<'indigo' | 'dark' | 'mint' | 'sunset'>('indigo');
  const [promptInput, setPromptInput] = useState('');
  const [copied, setCopied] = useState(false);

  // Phase 26 (26-04): real engine run replaces the old mock generate flow.
  const runActive = useTabRunStore((s) => {
    const id = s.runsByTab['prototype'];
    return id ? ACTIVE.includes(s.runs[id]?.status) : false;
  });
  // 26-04 mock 全清: prototype content only via the committed DEL-DES-01 slot.
  const protoSlot = useRndStore((s) => (s.deliverables[product.id] ?? []).find((d) => d.code === 'DEL-DES-01'));
  const hasData = !!protoSlot?.content;
  const protoMarkdown = protoSlot?.content ?? '';

  const handleGenerate = () => {
    useTabRunStore.getState().startTabRun({
      tabId: 'prototype',
      kind: 'prototype',
      productId: product.id,
      userMessage: `生成原型方案。${promptInput || ''}`,
      coreContext: buildCoreContext({
        kind: 'prototype',
        instruction: `为产品生成原型方案文档(Markdown,含界面分区说明:页面结构、分区布局、交互说明、响应式断点)。产物须经 generateDeliverable 工具产出候选(code=DEL-DES-01),等待用户确认落槽。设备偏好:${DEVICE_LABEL[device]};配色主题:${theme}。${promptInput}`,
      }),
      sessionTitle: `${product.name} · 原型方案生成`,
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(protoMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([protoMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `UI_SPEC_${product.name.replace(/\s+/g, '_')}.md`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <TabRunPanel tabId="prototype" />

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
                  UI Design Engine
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5">
                基于【{product.name}】产品属性,生成高保真原型方案文档(界面分区说明 + 交互规范),确认后落槽。
              </p>
            </div>
          </div>

          {/* Quick theme selector */}
          <div className="flex items-center gap-2 bg-bg-secondary p-1.5 rounded-2xl border border-border-subtle">
            <span className="text-[11px] text-text-tertiary px-2">配色风格:</span>
            <button onClick={() => setTheme('indigo')} className={`w-6 h-6 rounded-full bg-indigo-600 transition-all ${theme === 'indigo' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`} title="Indigo Tech" />
            <button onClick={() => setTheme('dark')} className={`w-6 h-6 rounded-full bg-slate-800 border border-slate-500 transition-all ${theme === 'dark' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`} title="Dark Titanium" />
            <button onClick={() => setTheme('mint')} className={`w-6 h-6 rounded-full bg-emerald-600 transition-all ${theme === 'mint' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`} title="Mint Emerald" />
            <button onClick={() => setTheme('sunset')} className={`w-6 h-6 rounded-full bg-orange-600 transition-all ${theme === 'sunset' ? 'ring-2 ring-accent scale-110' : 'opacity-60'}`} title="Sunset Orange" />
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
          {(() => {
            const webMode = !isTauri();
            const disabled = webMode || runActive;
            const tooltip = webMode
              ? '此功能需要桌面引擎，请使用桌面版 Nova。'
              : runActive
                ? '本 tab 已有生成任务进行中'
                : null;
            const btn = (
              <button
                onClick={handleGenerate}
                disabled={disabled}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white text-xs font-bold rounded-xl shadow-lg shadow-accent/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {runActive ? <PhRefreshCw size={16} weight="duotone" className="animate-spin" /> : <PhSparkle size={16} weight="duotone" />}
                <span>{runActive ? '正在生成…' : '生成原型方案'}</span>
              </button>
            );
            return tooltip ? (
              <Tooltip content={tooltip}>
                <span className="inline-flex">{btn}</span>
              </Tooltip>
            ) : (
              btn
            );
          })()}
        </div>
      </Card>

      {/* Device preference selector (feeds the generation prompt) */}
      <Card className="p-3.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
          <PhPalette size={14} weight="duotone" className="text-accent" />
          <span>目标设备:</span>
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                device === d ? 'bg-accent text-white shadow-sm' : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
              }`}
            >
              {DEVICE_LABEL[d]}
            </button>
          ))}
        </div>
      </Card>

      {!hasData && (
        <Card className="p-10 flex flex-col items-center justify-center gap-3 text-center">
          <PhFileText size={40} weight="duotone" className="text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            还没有原型方案。点击上方生成按钮,AI 将生成候选供你确认。
          </p>
        </Card>
      )}

      {hasData && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springTransition}>
          <Card className="p-7 space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <h4 className="font-bold text-text-primary text-base">{protoSlot?.title}</h4>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  {copied ? <PhCheck size={13} weight="duotone" className="text-success" /> : <PhCopy size={13} weight="duotone" />}
                  <span>复制 Markdown</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  <PhDownload size={13} weight="duotone" />
                  <span>导出 .md</span>
                </Button>
              </div>
            </div>
            <div className="prose prose-slate prose-sm max-w-none text-text-secondary leading-relaxed font-sans">
              <MarkdownRenderer>{protoMarkdown}</MarkdownRenderer>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
