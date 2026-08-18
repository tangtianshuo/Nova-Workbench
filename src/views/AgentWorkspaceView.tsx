import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Clock,
  Lightning,
  Cube,
  FileText,
  CaretRight,
  Plus,
  Folder,
  Cpu,
  CaretDown,
} from '@phosphor-icons/react';
import { Card, CardHover, Button, Badge, Separator, SegmentedControl } from '@/src/components/ui';
import { AgentConsole } from '@/src/components/AgentConsole';
import { MorningReport } from '@/src/components/MorningReport';

const recentTasks = [
  { time: '5 分钟前', title: 'BLCaptain 付费榜扫描选品', messageCount: 7, agent: 'Nova' },
  { time: '5 分钟前', title: '安装 BLCaptain App Store Demand...', messageCount: 1, agent: 'Nova' },
  { time: '6 天前', title: '直接在 Reddit 上进行需求挖掘', messageCount: 2, agent: 'Nova' },
  { time: '7月21日', title: '非遗手工制品跨境平台调研', messageCount: 4, agent: 'Nova' },
  { time: '7月21日', title: '非遗手工制品跨境平台调研', messageCount: 6, agent: 'Nova' },
];

const agents = [
  { name: 'NOVA', path: 'C:\\Users\\10345\\...', icon: Lightning, color: 'text-warning', bg: 'bg-warning-subtle' },
  { name: 'Obsidian', path: 'G:\\Documents\\N...', icon: Cube, color: 'text-text-secondary', bg: 'bg-bg-secondary' },
  { name: 'Nova (微信)', path: 'C:\\Users\\10345\\...', icon: Lightning, color: 'text-warning', bg: 'bg-warning-subtle' },
  { name: '合同审核', path: 'D:\\Projects\\...', icon: FileText, color: 'text-accent', bg: 'bg-accent-subtle' },
  { name: '文档审核', path: 'D:\\Projects\\...', icon: FileText, color: 'text-accent', bg: 'bg-accent-subtle' },
  { name: 'AI 报销审查', path: 'D:\\Projects\\...', icon: Cube, color: 'text-text-secondary', bg: 'bg-bg-secondary' },
  { name: 'Novel', path: 'C:\\Users\\10345\\...', icon: Lightning, color: 'text-warning', bg: 'bg-warning-subtle' },
];

export function AgentWorkspaceView() {
  const [activeTab, setActiveTab] = useState('recent');

  return (
    <div className="flex gap-4 h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)]">
      {/* Left: Chat Area */}
      <Card variant="glass" className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-border-subtle bg-bg-primary/60 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="xs" className="gap-1">
              <Folder size={12} weight="duotone" className="text-accent" />
              当前工作区
              <CaretDown size={10} />
            </Button>
            <Button variant="secondary" size="xs" className="gap-1">
              <Cpu size={12} weight="duotone" className="text-accent" />
              DeepSeek Chat
              <CaretDown size={10} />
            </Button>
          </div>
        </div>
        <AgentConsole layout="page" />
      </Card>

      {/* Right: Workspace Sidebar */}
      <div className="w-[380px] shrink-0 flex flex-col gap-4 overflow-y-auto">
        <MorningReport />

        {/* Recent Tasks */}
        <Card variant="default" className="p-5">
          <SegmentedControl
            segments={[
              { id: 'recent', label: '最近任务' },
              { id: 'scheduled', label: '定时任务' },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            size="sm"
            className="mb-4"
          />

          <div className="space-y-1">
            {activeTab === 'recent' && recentTasks.map((task, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.04 }}
                className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-[var(--radius-md)] hover:bg-bg-secondary transition-colors cursor-pointer group"
              >
                <Clock size={12} className="text-text-tertiary shrink-0" />
                <span className="text-[11px] text-text-tertiary w-12 shrink-0">{task.time}</span>
                <span className="text-sm text-text-primary truncate flex-1 font-medium">
                  {task.title}
                </span>
                <Badge variant="neutral" className="text-[10px] px-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {task.messageCount} 条
                </Badge>
              </motion.div>
            ))}
            {activeTab === 'scheduled' && (
              <div className="text-center text-sm text-text-tertiary py-6">
                暂无定时任务
              </div>
            )}
          </div>

          <Separator className="my-3" />
          <Button variant="ghost" size="sm" className="w-full justify-between">
            查看全部
            <CaretRight size={14} />
          </Button>
        </Card>

        {/* Agent Workspace Grid */}
        <Card variant="default" className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Agent 工作区
            </h3>
            <Button variant="primary" size="xs">
              <Plus size={12} weight="bold" />
              添加
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {agents.map((agent, idx) => {
              const Icon = agent.icon;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <CardHover variant="interactive" className="p-3">
                    <div className="flex items-start gap-2.5">
                      <div className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 ${agent.bg} ${agent.color}`}>
                        <Icon size={16} weight="duotone" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text-primary text-truncate">
                          {agent.name}
                        </div>
                        <div className="text-[11px] text-text-tertiary text-truncate mt-0.5 font-mono">
                          {agent.path}
                        </div>
                      </div>
                    </div>
                  </CardHover>
                </motion.div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
