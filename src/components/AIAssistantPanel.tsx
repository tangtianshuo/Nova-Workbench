import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { PaperPlaneRight, Paperclip, CaretDown, Robot, Terminal, Folder, Cpu, Stack } from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { cn } from '@/src/lib/utils';

export function AIAssistantPanel({ className = '' }: { className?: string }) {
  const { addTask, addEvent } = useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: '您好！我是您的智能工作台助手 (Claude)。已接入当前工作区，我可以帮您操作本地文件、安排任务、管理日程。' }
  ]);
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
          text: '好的，我已经解析了您的指令，并执行了以下自动化操作：\n\n✅ 在任务管理中创建了高优先级任务【沟通需求】\n✅ 在日程表中预定了明天上午 10:00 的【沟通需求会议】'
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
          text: `收到指令："${text}"。这只是一个演示体验。您可以尝试输入："明天上午开会沟通需求"，体验跨模块创建任务和日程的自动化编排功能。`
        }]);
      }
    }, 1000);
  };

  return (
    <Card className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="p-3 bg-bg-secondary/60 border-b border-border-subtle flex items-center justify-between text-xs font-medium">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="xs" className="gap-1.5">
            <Folder size={14} weight="duotone" className="text-accent" />
            WenXiBuddy 2.0
            <CaretDown size={12} weight="bold" className="text-text-tertiary" />
          </Button>
          <Button variant="secondary" size="xs" className="gap-1.5">
            <Cpu size={14} weight="duotone" className="text-accent" />
            Claude 3.5 Sonnet
            <CaretDown size={12} weight="bold" className="text-text-tertiary" />
          </Button>
        </div>
        <Terminal size={14} weight="duotone" className="text-text-tertiary" />
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}
          >
            <div className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
              msg.role === 'user'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-accent/10 text-accent border border-accent/15'
            )}>
              {msg.role === 'user'
                ? <div className="text-[10px] font-bold">ME</div>
                : <Robot size={16} weight="duotone" />}
            </div>
            <div className={cn(
              'max-w-[85%] rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap',
              msg.role === 'user'
                ? 'bg-accent text-white rounded-tr-sm shadow-sm'
                : 'bg-bg-secondary text-text-primary rounded-tl-sm border border-border-subtle'
            )}>
              {msg.text}
            </div>
          </motion.div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-border-subtle">
        <div className="bg-bg-secondary/60 rounded-xl border border-border focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20 transition-all p-1 shadow-xs">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="输入指令 (如: 明天上午开会沟通需求)..."
            className="w-full bg-transparent text-sm text-text-primary placeholder-text-tertiary border-none focus:outline-none resize-none px-3 py-2 h-12"
          />
          <div className="flex justify-between items-center px-2 py-1">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="xs" aria-label="选择本地文件">
                <Paperclip size={16} weight="duotone" />
              </Button>
              <Button variant="ghost" size="xs" aria-label="调用工具集">
                <Stack size={16} weight="duotone" />
              </Button>
            </div>
            <Button
              variant="primary"
              size="xs"
              disabled={!input.trim()}
              onClick={handleSubmit}
              className="shadow-sm"
            >
              <PaperPlaneRight size={14} weight="bold" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
