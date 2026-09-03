/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import {
  Code,
  Sparkle,
  Terminal,
  Database,
  ShippingContainer,
  GitBranch,
  Cpu,
  Stack,
  ArrowClockwise,
  FileCode,
} from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Tooltip } from '@/src/components/ui/Tooltip';
import { TabRunPanel } from '@/src/components/rnd/TabRunPanel';
import { DeliverableDocCard } from '@/src/components/rnd/DeliverableDocCard';
import { useTabRunStore, ACTIVE } from '@/src/stores/tabRunStore';
import { useRndStore } from '@/src/stores/rndStore';
import { buildCoreContext } from '@/src/ai/context';
import { isTauri } from '@/src/lib/api';

interface Props {
  product: Product;
}

const scaffoldPresets = [
  { type: 'api', label: '后端 API 路由', icon: Terminal, desc: 'Express / RESTful 端点' },
  { type: 'types', label: 'TS 类型契约', icon: Stack, desc: 'Schema 与 Payload 接口' },
  { type: 'component', label: 'React 核心组件', icon: Code, desc: '高保真交互组件' },
  { type: 'schema', label: '数据库 DDL', icon: Database, desc: 'PostgreSQL 建表脚本' },
  { type: 'docker', label: 'Docker 容器编排', icon: ShippingContainer, desc: '多阶段构建 Dockerfile' },
  { type: 'commit', label: 'Git 提交规约', icon: GitBranch, desc: '自动化 Commit 规范' },
] as const;

export function CodeManagementTab({ product }: Props) {
  const [selectedType, setSelectedType] = useState<(typeof scaffoldPresets)[number]['type']>('api');

  // Phase 26 (26-04): real engine run replaces the old mock generate flow.
  const runActive = useTabRunStore((s) => {
    const id = s.runsByTab['code'];
    return id ? ACTIVE.includes(s.runs[id]?.status) : false;
  });
  // 26-04 mock 全清: code scaffold content only via the committed DEL-DEV-01 slot.
  const codeSlot = useRndStore((s) => (s.deliverables[product.id] ?? []).find((d) => d.code === 'DEL-DEV-01'));
  const hasData = !!codeSlot?.content;

  const handleGenerate = () => {
    const preset = scaffoldPresets.find((p) => p.type === selectedType);
    useTabRunStore.getState().startTabRun({
      tabId: 'code',
      kind: 'code',
      productId: product.id,
      userMessage: `生成代码脚手架方案(${preset?.label ?? selectedType})。`,
      coreContext: buildCoreContext({
        kind: 'code',
        // 文档级:真实写文件能力属 v0.4 coding 工具(Out of Scope)。
        instruction: `为产品生成代码脚手架方案文档(Markdown,文档级方案:架构拓扑、模块划分、关键代码骨架示例)。侧重:${preset?.label ?? selectedType}(${preset?.desc ?? ''})。产物须经 generateDeliverable 工具产出候选(code=DEL-DEV-01),等待用户确认落槽。本期只产出方案文档,不真正写入工程文件。`,
      }),
      sessionTitle: `${product.name} · 代码脚手架生成`,
    });
  };

  const generateButton = (() => {
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
        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent text-white text-xs font-bold rounded-xl shadow-lg shadow-accent/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {runActive ? <ArrowClockwise size={16} weight="duotone" className="animate-spin" /> : <Sparkle size={16} weight="duotone" />}
        <span>{runActive ? '正在生成…' : '生成代码脚手架'}</span>
      </button>
    );
    return tooltip ? (
      <Tooltip content={tooltip}>
        <span className="inline-flex">{btn}</span>
      </Tooltip>
    ) : (
      btn
    );
  })();

  return (
    <div className="space-y-6">
      <TabRunPanel tabId="code" />

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

        {/* Scaffold type selector + generate */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1">
            {scaffoldPresets.map((preset) => {
              const Icon = preset.icon;
              return (
                <button
                  key={preset.type}
                  onClick={() => setSelectedType(preset.type)}
                  className={`p-3 h-auto text-left rounded-[var(--radius-lg)] border transition-all flex flex-col justify-between group !w-full ${
                    selectedType === preset.type
                      ? 'bg-accent-subtle border-accent/50 shadow-shadow-sm'
                      : 'bg-bg-secondary/50 border-border-subtle hover:border-accent/40 hover:bg-bg-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <div className="p-2 rounded-[var(--radius-md)] bg-bg-secondary text-accent">
                      <Icon size={16} weight="duotone" />
                    </div>
                    {selectedType === preset.type && <Sparkle size={12} weight="duotone" className="text-accent" />}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-text-primary">{preset.label}</div>
                    <div className="text-[10px] text-text-tertiary mt-0.5">{preset.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="shrink-0">{generateButton}</div>
        </div>
      </Card>

      {!hasData && (
        <Card className="p-10 flex flex-col items-center justify-center gap-3 text-center">
          <FileCode size={40} weight="duotone" className="text-text-tertiary" />
          <p className="text-sm text-text-secondary">
            还没有代码脚手架。点击上方生成按钮,AI 将生成候选供你确认。
          </p>
        </Card>
      )}

      {/* 代码 tab 产物投影(DEL-DEV-01 架构方案):此前 slot 已接线但内容从未渲染,补上 */}
      <DeliverableDocCard
        productId={product.id}
        code="DEL-DEV-01"
        title="系统总体技术架构设计方案"
        knowledgeCategory="架构设计"
      />
    </div>
  );
}
