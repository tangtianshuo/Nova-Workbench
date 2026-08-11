import { useState, useEffect } from 'react';
import { Trash } from '@phosphor-icons/react';
import { Task } from '@/src/data/mockTasks';
import { useTaskStore } from '@/src/stores/taskStore';
import { useProductStore } from '@/src/stores/productStore';
import { useApp } from '@/src/store/AppContext';
import { useToast } from '@/src/components/ui/Toast';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
} from '@/src/components/ui/Dialog';
import { Input, Textarea } from '@/src/components/ui/Input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/src/components/ui/Select';
import { DatePickerInput } from '@/src/components/ui/DatePickerInput';
import { Button } from '@/src/components/ui/Button';

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
  const { syncTaskSchedule } = useApp();
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [status, setStatus] = useState('未开始');
  const [categoryId, setCategoryId] = useState('');
  const [deadlineDate, setDeadlineDate] = useState<string | undefined>(undefined);
  const [deadlineHour, setDeadlineHour] = useState(18);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
      setDeadlineHour(task.deadline ? Number(task.deadline.split(' ')[1]?.split(':')[0]) || 18 : 18);
      setProjectId(task.projectId);
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setStatus('未开始');
      setCategoryId(defaultCategoryId ?? categories[0]?.id ?? '');
      setDeadlineDate(undefined);
      setDeadlineHour(18);
      setProjectId(undefined);
    }
    setShowDeleteConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, task?.id]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const deadline = deadlineDate ? `${deadlineDate} ${String(deadlineHour).padStart(2, '0')}:00` : '';
    const productName = projectId ? products.find((p) => p.id === projectId)?.name ?? '' : '';
    if (mode === 'create') {
      const newId = crypto.randomUUID();
      addTask(
        {
          ...DEFAULT_TASK,
          id: newId,
          createdAt: Date.now(),
          title: title.trim(),
          description: description.trim(),
          priority,
          status,
          deadline,
          projectId,
          project: productName,
        },
        categoryId,
      );
      syncTaskSchedule(newId);
      toast({ type: 'success', title: '任务已创建' });
    } else if (task) {
      const prevDeadline = task.deadline;
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
      syncTaskSchedule(task.id, prevDeadline);
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
            <Input
              placeholder="任务标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={mode === 'create'}
            />

            <Textarea
              placeholder="添加描述..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px] resize-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <Select value={priority} onValueChange={(v) => setPriority(v as 'high' | 'medium' | 'low')}>
                <SelectTrigger className="h-8"><SelectValue placeholder="优先级" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="未开始">未开始</SelectItem>
                  <SelectItem value="进行中">进行中</SelectItem>
                  <SelectItem value="已完成">已完成</SelectItem>
                </SelectContent>
              </Select>
              <div className="col-span-2">
                <Select
                  value={projectId ?? '__none__'}
                  onValueChange={(v) => setProjectId(v === '__none__' ? undefined : v)}
                >
                  <SelectTrigger className="h-8"><SelectValue placeholder="产品" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">无关联产品</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex gap-2">
                <DatePickerInput
                  className="flex-1"
                  value={deadlineDate}
                  onChange={setDeadlineDate}
                  placeholder="截止日期"
                />
                <Select value={String(deadlineHour)} onValueChange={(v) => setDeadlineHour(Number(v))}>
                  <SelectTrigger className="h-9 w-[92px] px-2"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="分类" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
