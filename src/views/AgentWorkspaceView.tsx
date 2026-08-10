import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock,
  Lightning,
  Cube,
  FileText,
  CaretRight,
  Plus,
  PaperPlaneTilt,
  Paperclip,
  CaretDown,
  Robot,
  Terminal,
  Folder,
  Cpu,
  Stack,
} from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { Card, CardHover } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Avatar } from '@/src/components/ui/Avatar';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { Badge } from '@/src/components/ui/Badge';
import { Separator } from '@/src/components/ui/Separator';

export function AgentWorkspaceView() {
  const { addTask, addEvent } = useApp();
  const [activeTab, setActiveTab] = useState('recent');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');

    setTimeout(() => {
      if (text.includes('明天上午开会沟通需求') || text.includes('开会沟通需求')) {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: '好的，我已经解析了您的指令，并执行了以下自动化操作：\n\n- 在任务管理中创建了高优先级任务「沟通需求」\n- 在日程表中预定了明天上午 10:00 的「沟通需求会议」'
        }]);
        addTask({
          id: `WXB-2025-00${Math.floor(Math.random() * 900) + 10}`,
          title: '沟通需求',
          priority: 'high',
          status: '未开始',
          description: 'AI 根据对话自动创建：与团队沟通确认最新的业务需求细节。',
          project: 'WenXiBuddy 2.0',
          assignee: 'Brandon',
          assigneeAvatar: 'BR',
          deadline: '明天 12:00',
          aiSuggestions: ['建议提前准备会议大纲', '相关文件可能需要关联最新版 PRD']
        });
        addEvent({
          id: Date.now().toString(),
          title: '沟通需求会议',
          time: '10:00 - 11:30',
          date: '2025-05-16',
          type: 'meeting',
          location: '会议室 3A'
        });
      } else {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: `收到指令："${text}"。这是一个演示体验，您可以尝试输入："明天上午开会沟通需求"，体验自动化创建任务和日程的功能。`
        }]);
      }
    }, 1000);
  };

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

  return (
    <div className="flex gap-4 h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)]">
      {/* Left: Chat Area */}
      <Card variant="glass" className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Chat Header */}
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-border-subtle bg-bg-primary/60 backdrop-blur-sm absolute top-0 left-0 right-0 z-10">
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

        {/* Chat Messages / Empty State */}
        <div className="flex-1 overflow-y-auto p-6 pt-12 flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <h1 className="text-4xl font-bold text-text-placeholder/40 tracking-tighter mb-2 select-none">
                NovaAgents
              </h1>
              <p className="text-sm text-text-tertiary select-none">
                一念既起，万事皆成
              </p>
            </div>
          ) : (
            <div className="space-y-5 flex-1 pb-6">
              <AnimatePresence>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <Avatar
                      size="sm"
                      fallback={msg.role === 'user' ? 'ME' : 'AI'}
                      className={msg.role === 'user'
                        ? 'bg-accent text-white'
                        : 'bg-accent-subtle text-accent'
                      }
                    />
                    <div
                      className={`max-w-[70%] rounded-[var(--radius-lg)] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-accent text-white'
                          : 'bg-bg-secondary text-text-primary border border-border-subtle'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border-subtle bg-bg-primary/60 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto">
            <div className="bg-bg-input rounded-[var(--radius-lg)] border border-border focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 transition-all">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="今天，想干点啥？ (例如: 明天上午开会沟通需求)"
                className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-placeholder border-none focus:outline-none resize-none px-4 py-3 h-14"
              />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="xs" className="gap-1">
                    <Lightning size={12} weight="duotone" className="text-warning" />
                    NOVA
                    <CaretDown size={10} />
                  </Button>
                  <Separator orientation="vertical" className="h-3 mx-1" />
                  <Button variant="ghost" size="xs">
                    <Paperclip size={14} weight="duotone" />
                  </Button>
                  <Button variant="ghost" size="xs" className="gap-1">
                    <Lightning size={12} weight="duotone" className="text-accent" />
                    行动
                    <CaretDown size={10} />
                  </Button>
                  <Button variant="ghost" size="xs" className="gap-1">
                    <Stack size={12} weight="duotone" className="text-accent" />
                    工具
                  </Button>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="h-8 w-8 p-0 rounded-[var(--radius-md)]"
                >
                  <PaperPlaneTilt size={14} weight="fill" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Right: Workspace Sidebar */}
      <div className="w-[380px] shrink-0 flex flex-col gap-4 overflow-y-auto">
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
