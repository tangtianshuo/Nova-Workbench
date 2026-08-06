import { Search, Bell, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { Task } from '../data/mockTasks';

export function Header({ title, subtitle }: { title: string, subtitle: string }) {
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const { addTask, categories } = useApp();

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    deadline: '',
    categoryId: categories[0]?.id || '',
  });

  const handleCreateTask = () => {
    if (!newTask.title.trim()) return;
    
    const task: Task = {
      id: `WXB-2025-${Math.floor(Math.random() * 900) + 100}`,
      title: newTask.title,
      description: newTask.description,
      priority: newTask.priority as 'high' | 'medium' | 'low',
      status: '未开始',
      project: '自定义任务',
      assignee: '当前用户',
      assigneeAvatar: 'ME',
      deadline: newTask.deadline || '未设置',
      aiSuggestions: []
    };
    
    addTask(task, newTask.categoryId);
    setShowNewTaskModal(false);
    setNewTask({ title: '', description: '', priority: 'medium', deadline: '', categoryId: categories[0]?.id || '' });
  };

  return (
    <>
      <header className="h-20 bg-transparent flex items-center justify-between px-8 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="搜索任务、项目或文件..."
              className="w-80 pl-10 pr-12 py-2.5 bg-white border border-slate-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <kbd className="hidden sm:inline-block border border-slate-200 rounded px-1.5 text-[10px] font-medium text-slate-400 bg-slate-50">
                ⌘K
              </kbd>
            </div>
          </div>

          <button className="relative p-2.5 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
            <Bell size={18} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
          </button>

          <button 
            onClick={() => setShowNewTaskModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors shadow-sm shadow-blue-600/20"
          >
            <Plus size={18} />
            新增任务
          </button>
        </div>
      </header>

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">手动新增任务</h2>
              <button 
                onClick={() => setShowNewTaskModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">任务标题</label>
                <input 
                  type="text" 
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  placeholder="输入任务名称"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">任务描述</label>
                <textarea 
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                  placeholder="任务详情描述"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">任务分类</label>
                <select 
                  value={newTask.categoryId}
                  onChange={(e) => setNewTask({...newTask, categoryId: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                >
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">优先级</label>
                  <select 
                    value={newTask.priority}
                    onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">截止日期</label>
                  <input 
                    type="date"
                    value={newTask.deadline}
                    onChange={(e) => setNewTask({...newTask, deadline: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button 
                onClick={() => setShowNewTaskModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleCreateTask}
                disabled={!newTask.title.trim()}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${newTask.title.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'}`}
              >
                创建任务
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
