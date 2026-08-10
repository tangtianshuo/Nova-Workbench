import { useState, useEffect, useMemo } from 'react';
import { Trash, X, MagnifyingGlass } from '@phosphor-icons/react';
import { Task } from '@/src/data/mockTasks';
import { useTaskStore } from '@/src/stores/taskStore';
import { useProductStore } from '@/src/stores/productStore';
import { useToast } from '@/src/components/ui/Toast';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
} from '@/src/components/ui/Dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/src/components/ui/Popover';
import { Input, Textarea } from '@/src/components/ui/Input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/src/components/ui/Select';
import { DatePickerInput } from '@/src/components/ui/DatePickerInput';
import { Button } from '@/src/components/ui/Button';
import { cn } from '@/src/lib/utils';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  task?: Task;
  defaultCategoryId?: string;
}

const DEFAULT_TASK: Omit<Task, 'id'> = {
  title: '',
  priority: 'medium',
  status: '未开始',
  description: '',
  project: '',
  assignee: '',
  assigneeAvatar: '',
  deadline: '',
  aiSuggestions: [],
};

export function TaskDialog({ open, onOpenChange, mode, task, defaultCategoryId }: TaskDialogProps) {
  const categories = useTaskStore((s) => s.categories);
  const addTask = useTaskStore((s) => s.addTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const setTaskProject = useTaskStore((s) => s.setTaskProject);
  const products = useProductStore((s) => s.products);
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [status, setStatus] = useState('未开始');
  const [categoryId, setCategoryId] = useState('');
  const [deadlineDate, setDeadlineDate] = useState<string | undefined>(undefined);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // P13: reset form when dialog opens or task changes
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setStatus(task.status);
      setCategoryId(categories.find((c) => c.tasks.some((t) => t.id === task.id))?.id ?? '');
      setDeadlineDate(task.deadline ? task.deadline.split(' ')[0] : undefined);
      setProjectId(task.projectId);
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStatus('未开始');
      setCategoryId(defaultCategoryId ?? categories[0]?.id ?? '');
      setDeadlineDate(undefined);
      setProjectId(undefined);
    }
    setProductSearch('');
    setShowDeleteConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, task?.id]);

  const selectedProduct = products.find((p) => p.id === projectId);
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const deadline = deadlineDate ? `${deadlineDate} 18:00` : '';
    if (mode === 'create') {
      addTask(
        {
          ...DEFAULT_TASK,
          id: crypto.randomUUID(),
          title: title.trim(),
          description: description.trim(),
          priority,
          status,
          deadline,
          projectId,
          project: selectedProduct?.name ?? '',
        },
        categoryId,
      );
      toast({ type: 'success', title: '任务已创建' });
    } else if (task) {
      updateTask(task.id, {
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        deadline,
      });
      if ((task.projectId ?? undefined) !== projectId) {
        setTaskProject(task.id, projectId);
      }
      toast({ type: 'success', title: '已保存' });
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!task) return;
    deleteTask(task.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
    toast({ type: 'success', title: '任务已删除' });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader
            title={mode === 'create' ? '新建任务' : '编辑任务'}
            description={mode === 'create' ? '快速记录一个新任务' : `编辑 ${task?.title ?? ''}`}
          />
          <DialogBody>
            {/* 1. 标题 */}
            <Input
              placeholder="任务标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={mode === 'create'}
            />

            {/* 2. 描述 */}
            <Textarea
              placeholder="详细描述..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px]"
            />

            {/* 3. 优先级 / 分类 (grid 2 cols) */}
            <div className="grid grid-cols-2 gap-2">
              <Select value={priority} onValueChange={(v) => setPriority(v as 'high' | 'medium' | 'low')}>
                <SelectTrigger className="h-9"><SelectValue placeholder="优先级" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="分类" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 4. 截止日期 / 状态 (grid 2 cols) */}
            <div className="grid grid-cols-2 gap-2">
              <DatePickerInput
                value={deadlineDate}
                onChange={setDeadlineDate}
                placeholder="截止日期"
              />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="未开始">未开始</SelectItem>
                  <SelectItem value="进行中">进行中</SelectItem>
                  <SelectItem value="已完成">已完成</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 5. 关联产品 Combobox */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">关联产品 (可选)</label>
              <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'w-full h-9 px-3 text-sm rounded-[var(--radius-md)]',
                      'bg-bg-input border border-border text-text-primary',
                      'flex items-center justify-between gap-2 text-left',
                      'cursor-pointer transition-colors duration-fast',
                      'hover:border-text-tertiary/30',
                      'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                    )}
                  >
                    <span className={cn(!selectedProduct && 'text-text-placeholder')}>
                      {selectedProduct ? selectedProduct.name : '搜索产品...'}
                    </span>
                    {selectedProduct ? (
                      <button
                        type="button"
                        aria-label="清除产品关联"
                        onClick={(e) => { e.stopPropagation(); setProjectId(undefined); }}
                        className="text-text-tertiary hover:text-text-primary"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <MagnifyingGlass size={14} className="text-text-tertiary" />
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-1" align="start">
                  <Input
                    placeholder="搜索产品..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="mb-1"
                    autoFocus
                  />
                  <div className="max-h-[200px] overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <p className="text-xs text-text-tertiary py-6 text-center">未找到匹配的产品</p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setProjectId(p.id); setComboboxOpen(false); setProductSearch(''); }}
                          className="w-full text-left px-2.5 py-1.5 text-sm rounded-[var(--radius-sm)] hover:bg-bg-secondary text-text-primary"
                        >
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </DialogBody>

          <DialogFooter>
            {mode === 'edit' && (
              <Button
                variant="danger"
                size="sm"
                className="mr-auto"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash size={14} />
                删除
              </Button>
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!title.trim()}
              onClick={handleSubmit}
            >
              {mode === 'create' ? '创建任务' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 嵌套删除确认 (top-level Dialog, z-modal 自动叠加) */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader title="删除任务?" />
          <DialogBody>
            <p className="text-sm text-text-secondary">
              任务 "{task?.title}" 将被永久删除,此操作无法撤销。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
            <Button variant="danger" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
