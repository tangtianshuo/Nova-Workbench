import { CaretDown, Funnel, ArrowsDownUp, CheckCircle, Clock, Sparkle, Plus } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { TaskCategory, Task } from '../data/mockTasks';
import { useApp } from '../store/AppContext';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Input } from '@/src/components/ui/Input';
import { Separator } from '@/src/components/ui/Separator';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { cn } from '@/src/lib/utils';
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
  const [viewMode, setViewMode] = useState('category');

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
        if (!groups[dateStr]) groups[dateStr] = [];
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
        id: `date-${dateStr}`, name: dateStr, color: 'bg-accent', tasks,
      }));
  }, [categories, viewMode]);

  const displayGroups = viewMode === 'category' ? categories : dateGroups;

  return (
    <Card className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="p-5 border-b border-border-subtle">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">任务看板</h2>
            <SegmentedControl
              segments={[{ id: 'category', label: '按分类' }, { id: 'date', label: '按日期' }]}
              value={viewMode}
              onChange={setViewMode}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs"><Funnel size={14} weight="duotone" /></Button>
            <Button variant="ghost" size="xs"><ArrowsDownUp size={14} weight="duotone" /></Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="pb-2 text-sm font-semibold text-accent border-b-2 border-accent relative top-[1px]">全部任务</span>
          <Button variant="ghost" size="sm" className="ml-auto gap-1">
            状态 <CaretDown size={12} weight="bold" />
          </Button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex items-start gap-4 h-full">
        {displayGroups.map(group => (
          <div key={group.id} className="min-w-[300px] w-[300px] bg-bg-secondary/60 rounded-[var(--radius-md)] p-3 flex flex-col max-h-full border border-border-subtle">
            <div className="flex items-center justify-between py-1 mb-2 px-1">
              <div className="flex items-center gap-2">
                <div className={cn('w-2 h-2 rounded-full', group.color)} />
                <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors cursor-pointer">{group.name}</h3>
                <Badge variant="neutral" className="text-[10px]">{group.tasks.length}</Badge>
              </div>
              <Button variant="ghost" size="xs"><Plus size={14} weight="bold" /></Button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-2">
              {group.tasks.map((task, idx) => {
                const isExpanded = selectedTaskId === task.id;
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => onSelectTask(isExpanded ? '' : task.id)}
                    className={cn(
                      'bg-bg-primary rounded-[var(--radius-md)] p-3 transition-all cursor-pointer border',
                      isExpanded
                        ? 'border-accent shadow-md ring-1 ring-accent/15'
                        : 'border-border-subtle shadow-xs hover:border-border hover:shadow-sm'
                    )}
                  >
                    {task.status === '已完成' && !isExpanded && (
                      <CheckCircle size={14} weight="fill" className="absolute top-3 right-3 text-success" />
                    )}
                    <div className="flex items-center gap-2 pr-5">
                      <span className="text-[10px] font-mono text-text-tertiary">{task.id}</span>
                      <h4 className={cn(
                        'text-sm font-medium leading-tight',
                        task.status === '已完成' ? 'text-text-tertiary line-through' : 'text-text-primary'
                      )}>
                        {task.title}
                      </h4>
                    </div>

                    {!isExpanded && (
                      <div className="mt-2.5 flex items-center justify-between">
                        <Badge variant={task.priority === 'high' ? 'danger' : 'warning'} className="text-[10px]">
                          {task.priority === 'high' ? '高' : '中'}
                        </Badge>
                        <span className="text-[11px] text-text-tertiary">{task.time || task.status}</span>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border-subtle space-y-3" onClick={e => e.stopPropagation()}>
                        <p className="text-sm text-text-secondary leading-relaxed">{task.description}</p>
                        <div className="grid gap-2 text-xs">
                          <div className="flex items-center gap-2 text-text-secondary">
                            <Clock size={13} weight="duotone" className="text-text-tertiary shrink-0" />
                            截止: <span className="font-medium text-text-primary">{task.deadline}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              task.status === '已完成' ? 'bg-success' : 'bg-accent'
                            )} />
                            <span className={cn(
                              'text-xs font-medium',
                              task.status === '已完成' ? 'text-success' : 'text-accent'
                            )}>{task.status}</span>
                          </div>
                        </div>

                        {task.aiSuggestions && task.aiSuggestions.length > 0 && (
                          <div className="bg-accent-subtle/50 rounded-[var(--radius-sm)] p-2.5 border border-accent/10">
                            <h4 className="text-[11px] font-semibold text-text-primary flex items-center gap-1.5 mb-2">
                              <Sparkle size={12} weight="duotone" className="text-accent" />
                              AI 建议
                            </h4>
                            <ul className="space-y-1.5">
                              {task.aiSuggestions.map((s, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-[11px] text-text-secondary">
                                  <span className="w-1 h-1 rounded-full mt-1.5 shrink-0 bg-accent" />
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <Button
                          variant={task.status === '已完成' ? 'secondary' : 'primary'}
                          size="sm"
                          className="w-full"
                          disabled={task.status === '已完成'}
                          onClick={e => { e.stopPropagation(); completeTask(task.id); }}
                        >
                          <CheckCircle size={14} weight="duotone" />
                          {task.status === '已完成' ? '已完成' : '标记完成'}
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Add Category */}
        {viewMode === 'category' && (isAddingCategory ? (
          <div className="min-w-[300px] w-[300px] p-3 border border-accent/20 bg-accent/5 rounded-[var(--radius-md)]">
            <Input
              autoFocus
              placeholder="输入分类名称..."
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddCategory();
                if (e.key === 'Escape') { setIsAddingCategory(false); setNewCategoryName(''); }
              }}
              className="mb-3"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="xs" onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }}>取消</Button>
              <Button variant="primary" size="xs" disabled={!newCategoryName.trim()} onClick={handleAddCategory}>保存分类</Button>
            </div>
          </div>
        ) : (
          <div className="min-w-[300px] w-[300px] pt-1">
            <button
              onClick={() => setIsAddingCategory(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-[var(--radius-md)] text-sm font-medium text-text-tertiary hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all"
            >
              <Plus size={16} weight="bold" /> 新增任务分类
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
