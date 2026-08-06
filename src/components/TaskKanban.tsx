import { ChevronDown, Filter, ArrowUpDown, CheckCircle2, Clock, Sparkles, Plus, X } from 'lucide-react';
import { TaskCategory, Task } from '../data/mockTasks';
import { useApp } from '../store/AppContext';
import { useState, useMemo } from 'react';

interface TaskKanbanProps {
  className?: string;
  categories: TaskCategory[];
  selectedTaskId: string;
  onSelectTask: (id: string) => void;
}

export function TaskKanban({ className = '', categories, selectedTaskId, onSelectTask }: TaskKanbanProps) {
  const { completeTask, addCategory } = useApp();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [viewMode, setViewMode] = useState<'category' | 'date'>('category');

  const handleAddCategory = () => {
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim());
      setNewCategoryName('');
      setIsAddingCategory(false);
    }
  };

  const dateGroups = useMemo(() => {
    if (viewMode !== 'date') return [];
    
    const groups: Record<string, Task[]> = {};
    categories.forEach(cat => {
      cat.tasks.forEach(task => {
        const dateStr = task.deadline ? task.deadline.split(' ')[0] : '无截止日期';
        if (!groups[dateStr]) {
          groups[dateStr] = [];
        }
        groups[dateStr].push(task);
      });
    });

    return Object.entries(groups)
      .sort((a, b) => {
        if (a[0] === '无截止日期') return 1;
        if (b[0] === '无截止日期') return -1;
        return a[0].localeCompare(b[0]);
      })
      .map(([dateStr, tasks]) => ({
        id: `date-${dateStr}`,
        name: dateStr,
        color: 'bg-indigo-500',
        tasks
      }));
  }, [categories, viewMode]);

  const displayGroups = viewMode === 'category' ? categories : dateGroups;

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col ${className}`}>
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">任务看板</h2>
            <div className="flex items-center bg-slate-100 p-1 rounded-lg text-sm">
              <button 
                onClick={() => setViewMode('category')}
                className={`px-3 py-1 rounded-md transition-colors ${viewMode === 'category' ? 'bg-white text-blue-600 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
              >
                按分类
              </button>
              <button 
                onClick={() => setViewMode('date')}
                className={`px-3 py-1 rounded-md transition-colors ${viewMode === 'date' ? 'bg-white text-blue-600 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
              >
                按日期
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
               <Filter size={16} />
             </button>
             <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
               <ArrowUpDown size={16} />
             </button>
          </div>
        </div>
        <div className="flex items-center gap-6 border-b border-slate-100">
          <button className="pb-3 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 relative top-[1px]">
            全部任务
          </button>
          <button className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 ml-auto flex items-center gap-1">
            状态 <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex items-start gap-4 h-full">
        {displayGroups.map(group => (
          <div key={group.id} className="min-w-[320px] w-[320px] bg-slate-50 rounded-xl p-3 flex flex-col max-h-full border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between py-1 mb-2 px-1 group-container cursor-pointer">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${group.color}`}></div>
                <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{group.name}</h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-200/50 px-1.5 py-0.5 rounded">{group.tasks.length}</span>
              </div>
              <button className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded">
                <Plus size={14} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar pb-2">
              {group.tasks.map(task => {
                const isExpanded = selectedTaskId === task.id;
                
                return (
                  <div 
                    key={task.id} 
                    onClick={() => onSelectTask(isExpanded ? '' : task.id)}
                    className={`bg-white border ${isExpanded ? 'border-blue-500 shadow-md ring-1 ring-blue-500/20' : 'border-slate-100 shadow-sm'} rounded-xl p-3 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group relative`}
                  >
                    {task.status === '已完成' && !isExpanded && (
                      <div className="absolute top-3 right-3 text-emerald-500">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 pr-6">
                         <span className="text-xs font-medium text-slate-400">{task.id}</span>
                         <h4 className={`text-sm font-medium transition-colors leading-tight ${task.status === '已完成' ? 'text-slate-400 line-through' : 'text-slate-700 group-hover:text-blue-600'}`}>{task.title}</h4>
                      </div>
                    </div>
                    
                    {!isExpanded && (
                      <div className="mt-3 flex items-center justify-between">
                         <div className="flex items-center gap-3 text-xs">
                            {task.priority === 'high' ? (
                               <span className="text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded text-[10px] uppercase">高</span>
                            ) : (
                               <span className="text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded text-[10px] uppercase">中</span>
                            )}
                         </div>
                         <span className="text-xs text-slate-500">{task.time || task.status}</span>
                      </div>
                    )}
                    
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-4" onClick={(e) => e.stopPropagation()}>
                         <p className="text-sm text-slate-600 leading-relaxed">{task.description}</p>
                         
                         <div className="grid grid-cols-1 gap-2 text-xs">
                           <div className="flex items-center gap-2 text-slate-600">
                             <Clock size={14} className="text-slate-400 shrink-0" />
                             截止: <span className="font-medium text-slate-800">{task.deadline}</span>
                           </div>
                           <div className="flex items-center gap-2 text-slate-600">
                             <span className={`font-medium flex items-center gap-1.5 ${task.status === '已完成' ? 'text-emerald-600' : 'text-blue-600'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${task.status === '已完成' ? 'bg-emerald-600' : 'bg-blue-600'}`}></span>
                                {task.status}
                             </span>
                           </div>
                         </div>
                         
                         {task.aiSuggestions && task.aiSuggestions.length > 0 && (
                           <div className="bg-indigo-50/50 rounded-lg p-2.5 border border-indigo-100/50">
                             <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 mb-2">
                               <Sparkles size={14} className="text-indigo-600" />
                               AI 建议
                             </h4>
                             <ul className="space-y-1.5">
                               {task.aiSuggestions.map((suggestion, index) => (
                                 <li key={index} className="flex items-start gap-1.5 text-xs text-slate-600">
                                   <span className="w-1 h-1 rounded-full mt-1.5 shrink-0 bg-indigo-400"></span>
                                   <span>{suggestion}</span>
                                 </li>
                               ))}
                             </ul>
                           </div>
                         )}
                         
                         <div className="flex justify-end pt-2">
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               completeTask(task.id);
                             }}
                             disabled={task.status === '已完成'}
                             className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm ${
                               task.status === '已完成' 
                                 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                                 : 'bg-emerald-500 text-white hover:bg-emerald-600'
                             }`}
                           >
                             <CheckCircle2 size={14} /> {task.status === '已完成' ? '已完成' : '标记完成'}
                           </button>
                         </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {viewMode === 'category' && (isAddingCategory ? (
          <div className="min-w-[320px] w-[320px] p-3 border border-blue-200 bg-blue-50/50 rounded-xl shadow-sm">
            <input
              type="text"
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddCategory();
                if (e.key === 'Escape') {
                  setIsAddingCategory(false);
                  setNewCategoryName('');
                }
              }}
              placeholder="输入分类名称..."
              className="w-full bg-white px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 mb-3"
            />
            <div className="flex items-center justify-end gap-2">
              <button 
                onClick={() => {
                  setIsAddingCategory(false);
                  setNewCategoryName('');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleAddCategory}
                disabled={!newCategoryName.trim()}
                className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-colors ${newCategoryName.trim() ? 'bg-blue-600 hover:bg-blue-700 shadow-sm' : 'bg-blue-300 cursor-not-allowed'}`}
              >
                保存分类
              </button>
            </div>
          </div>
        ) : (
          <div className="min-w-[320px] w-[320px] pt-1">
            <button 
               onClick={() => setIsAddingCategory(true)}
               className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-medium text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all bg-slate-50/50"
             >
               <Plus size={16} /> 新增任务分类
             </button>
          </div>
        ))}
      </div>
    </div>
  );
}
