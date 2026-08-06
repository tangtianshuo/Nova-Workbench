import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, ChevronDown, Bot, Terminal, Folder, Cpu, Layers } from 'lucide-react';
import { useApp } from '../store/AppContext';

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
          date: 16,
          type: 'meeting',
          location: '会议室 3A'
        });
      } else {
        setMessages(prev => [...prev, { 
          role: 'ai', 
          text: `收到指令："${text}"。这只是一个演示体验。您可以尝试输入：“明天上午开会沟通需求”，体验跨模块创建任务和日程的自动化编排功能。` 
        }]);
      }
    }, 1000);
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col h-full overflow-hidden text-slate-700 ${className}`}>
      {/* Header */}
      <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs font-medium">
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-1.5 hover:text-slate-900 transition-colors bg-white border border-slate-200 px-2 py-1 rounded shadow-sm">
            <Folder size={14} className="text-blue-500" />
            WenXiBuddy 2.0
            <ChevronDown size={12} className="text-slate-400" />
          </button>
          <button className="flex items-center gap-1.5 hover:text-slate-900 transition-colors bg-white border border-slate-200 px-2 py-1 rounded shadow-sm">
            <Cpu size={14} className="text-blue-500" />
            Claude 3.5 Sonnet
            <ChevronDown size={12} className="text-slate-400" />
          </button>
        </div>
        <Terminal size={14} className="text-slate-400" />
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
              {msg.role === 'user' ? <div className="text-[10px] font-bold">ME</div> : <Bot size={16} />}
            </div>
            <div className={`max-w-[85%] rounded-xl p-3 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm' 
                : 'bg-slate-50 text-slate-700 rounded-tl-sm border border-slate-200'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-100">
        <div className="bg-slate-50 rounded-xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all p-1 shadow-sm">
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
            className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 border-none focus:outline-none resize-none px-3 py-2 h-12"
          />
          <div className="flex justify-between items-center px-2 py-1">
            <div className="flex items-center gap-2">
              <button className="text-slate-400 hover:text-slate-700 transition-colors p-1" title="选择本地文件">
                <Paperclip size={16} />
              </button>
              <button className="text-slate-400 hover:text-slate-700 transition-colors p-1" title="调用工具集">
                <Layers size={16} />
              </button>
            </div>
            <button 
              onClick={handleSubmit}
              disabled={!input.trim()}
              className={`p-1.5 rounded-lg transition-colors shadow-sm ${input.trim() ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              <Send size={14} className={input.trim() ? 'translate-x-px' : ''} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
