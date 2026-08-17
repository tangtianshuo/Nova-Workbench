import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners,
  useDroppable, useDraggable,
  type DragStartEvent, type DragEndEvent, type DragMoveEvent,
} from '@dnd-kit/core';
import {
  CaretDown, Funnel, ArrowsDownUp, CheckCircle, Clock, Sparkle, Plus, DotsThree,
  PencilSimple, Copy, ArrowCounterClockwise, Trash, FolderSimple, Calendar,
  Notepad, TreeStructure, CalendarPlus,
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskCategory, Task } from '../data/mockTasks';
import { useTaskStore } from '@/src/stores/taskStore';
import { useProductStore } from '@/src/stores/productStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useApp } from '@/src/store/AppContext';
import { useToast } from '@/src/components/ui/Toast';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Input, Textarea } from '@/src/components/ui/Input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/src/components/ui/Select';
import { DatePickerInput } from '@/src/components/ui/DatePickerInput';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/src/components/ui/DropdownMenu';
import { AiContextMenu } from '@/src/components/ui/ContextMenu';
import { fireAiAction } from '@/src/lib/aiActions';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter,
} from '@/src/components/ui/Dialog';
import { TaskDialog } from './TaskDialog';
import { ProductSummaryDrawer } from './ProductSummaryDrawer';
import { cn } from '@/src/lib/utils';

interface TaskKanbanProps {
  className?: string;
  categories: TaskCategory[];
  selectedTaskId: string;
  onSelectTask: (id: string) => void;
  onRequestCreateTask?: (categoryId: string) => void;
}

// ponytail: GAP-05 display-only short id. MMDD from createdAt (fallback today), suffix = uuid first 4 hex.
// Internal task.id (uuid) is unchanged — only the kanban badge is shortened to free title space.
function formatTaskDisplayId(task: Pick<Task, 'id' | 'createdAt'>): string {
  const d = new Date(task.createdAt ?? Date.now());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}${dd}-${task.id.slice(0, 4)}`;
}

export function TaskKanban({ className = '', categories, selectedTaskId, onSelectTask, onRequestCreateTask }: TaskKanbanProps) {
  const { addCategory, moveTask } = useTaskStore();
  const { arrangeOnCalendar } = useApp();
  const { toast } = useToast();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  // Phase 17 UX-02: viewMode lifted to uiStore so ⌘K carry can read the active filter.
  const viewMode = useUIStore((s) => s.taskKanbanView);
  const setViewMode = useUIStore((s) => s.setTaskKanbanView);
  const taskKanbanCategory = useUIStore((s) => s.taskKanbanCategory);
  const setTaskKanbanCategory = useUIStore((s) => s.setTaskKanbanCategory);

  // DotsMenu / Dialog state (single source for all cards)
  const [editDialogTask, setEditDialogTask] = useState<Task | undefined>();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<Task | undefined>();
  const [confirmRearrangeTask, setConfirmRearrangeTask] = useState<Task | undefined>();
  const [drawerProductId, setDrawerProductId] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // DnD state (D-05, D-06)
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
  const [overCatId, setOverCatId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ponytail: GAP-02 collapse expanded card on outside click.
  // Clicks inside a [data-task-card] toggle (handled by card's own onClick);
  // clicks elsewhere (column bg, page chrome) clear selection.
  // GAP-06: exclude Radix portals (Select/Popover/Tooltip render to body via Portal,
  // so picking an option was misdetected as outside-click → card collapsed mid-edit).
  useEffect(() => {
    if (!selectedTaskId) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-task-card]')) return;
      if (target.closest('[data-radix-popper-content-wrapper]')) return;
      if (target.closest('[role="option"]')) return;
      onSelectTask('');
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [selectedTaskId, onSelectTask]);

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

  // DnD handlers (D-05, D-06, D-07)
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    const task = categories.flatMap((c) => c.tasks).find((t) => t.id === e.active.id) ?? null;
    setActiveDragTask(task);
  };
  const handleDragMove = (e: DragMoveEvent) => {
    if (e.over) setOverCatId(String(e.over.id));
  };
  const handleDragEnd = (e: DragEndEvent) => {
    const taskId = String(e.active.id);
    const fromCatId = (e.active.data.current as any)?.fromCatId;
    const toCatId = e.over ? String(e.over.id) : null;
    if (fromCatId && toCatId && fromCatId !== toCatId) {
      moveTask(taskId, fromCatId, toCatId);
    }
    setActiveDragId(null);
    setActiveDragTask(null);
    setOverCatId(null);
  };

  // Callbacks for cards → top-level state
  const handleRequestDialogEdit = (task: Task) => {
    setEditDialogTask(task);
    setEditDialogOpen(true);
  };
  const handleRequestDelete = (task: Task) => {
    setConfirmDeleteTask(task);
  };
  const handleOpenProductDrawer = (productId: string) => {
    setDrawerProductId(productId);
    setDrawerOpen(true);
  };

  // Phase 7 CROSS-01/CROSS-02 (D-01/D-02/D-03): "安排到日历" flow.
  const handleArrangeOnCalendar = (task: Task) => {
    const result = arrangeOnCalendar(task.id);
    if (result.success) {
      toast({
        type: 'success',
        title: '已添加到日历',
        description: `「${task.title}」已同步到日程`,
      });
    } else if (result.reason === 'already-arranged') {
      setConfirmRearrangeTask(task);
    } else if (result.reason === 'no-deadline') {
      toast({
        type: 'error',
        title: '无法安排',
        description: '任务缺少截止日期,请先编辑设置截止日期',
      });
    } else if (result.reason === 'task-not-found') {
      toast({ type: 'error', title: '任务不存在' });
    }
  };

  const handleConfirmRearrange = () => {
    if (!confirmRearrangeTask) return;
    const taskId = confirmRearrangeTask.id;
    const oldEventId = confirmRearrangeTask.scheduledEventId;
    // Rearrange = clear scheduledEventId → delete old event → arrangeOnCalendar creates new
    useTaskStore.getState().updateTask(taskId, { scheduledEventId: undefined });
    if (oldEventId) useScheduleStore.getState().deleteEvent(oldEventId);
    const result = arrangeOnCalendar(taskId);
    if (result.success) {
      toast({
        type: 'success',
        title: '已重新安排',
        description: '旧日程已替换为新日程',
      });
    } else if (result.reason === 'no-deadline') {
      toast({
        type: 'error',
        title: '无法重新安排',
        description: '任务缺少截止日期',
      });
    }
    setConfirmRearrangeTask(undefined);
  };

  return (
    <>
      <Card className={cn('flex flex-col', className)}>
        {/* Header (preserved) */}
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
            {displayGroups.map(group => (
              <KanbanColumn
                key={group.id}
                cat={group}
                isDateView={viewMode === 'date'}
                // Phase 17 UX-02: column-header click sets the active category for
                // ⌘K carry (「任务 · {分类名}」). Zero visual change — no highlight.
                onHeaderClick={
                  viewMode === 'category'
                    ? () => setTaskKanbanCategory(taskKanbanCategory === group.name ? null : group.name)
                    : undefined
                }
                selectedTaskId={selectedTaskId}
                onSelectTask={onSelectTask}
                onRequestDialogEdit={handleRequestDialogEdit}
                onRequestDelete={handleRequestDelete}
                onRequestArrange={handleArrangeOnCalendar}
                onOpenProductDrawer={handleOpenProductDrawer}
                onRequestCreateTask={onRequestCreateTask}
                activeDragId={activeDragId}
                activeDragTask={activeDragTask}
                overCatId={overCatId}
              />
            ))}
            <DragOverlay>
              {activeDragTask ? (
                <div className="opacity-90 rotate-2 shadow-shadow-xl rounded-[var(--radius-md)] bg-bg-primary border border-border-subtle p-3 max-w-[280px]">
                  <h4 className="text-sm font-medium text-text-primary truncate">{activeDragTask.title}</h4>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add Category (preserved) */}
          {viewMode === 'category' && (isAddingCategory ? (
            <div className="min-w-[clamp(240px,22vw,300px)] w-[clamp(240px,22vw,300px)] p-3 border border-accent/20 bg-accent/5 rounded-[var(--radius-md)]">
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
            <div className="min-w-[clamp(240px,22vw,300px)] w-[clamp(240px,22vw,300px)] pt-1">
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

      {/* Edit dialog (DotsMenu "在对话框中编辑") */}
      <TaskDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        mode={editDialogTask ? 'edit' : 'create'}
        task={editDialogTask}
      />

      {/* Delete confirm (DotsMenu "删除") */}
      <Dialog open={!!confirmDeleteTask} onOpenChange={(o) => !o && setConfirmDeleteTask(undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader title="删除任务?" />
          <DialogBody>
            <p className="text-sm text-text-secondary">
              任务 "{confirmDeleteTask?.title}" 将被永久删除,此操作无法撤销。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDeleteTask(undefined)}>取消</Button>
            <DeleteConfirmButton task={confirmDeleteTask} onDone={() => setConfirmDeleteTask(undefined)} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rearrange confirm (Phase 7 D-03) */}
      <Dialog open={!!confirmRearrangeTask} onOpenChange={(o) => !o && setConfirmRearrangeTask(undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader title="已安排,是否重新安排?" />
          <DialogBody>
            <p className="text-sm text-text-secondary">
              将删除旧日程并基于任务的最新截止日期创建新日程。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmRearrangeTask(undefined)}>取消</Button>
            <Button variant="danger" onClick={handleConfirmRearrange}>重新安排</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product summary drawer (badge click) */}
      <ProductSummaryDrawer
        productId={drawerProductId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}

/* === Delete confirm button (separated to call store action) === */
function DeleteConfirmButton({ task, onDone }: { task: Task | undefined; onDone: () => void }) {
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const { toast } = useToast();
  return (
    <Button
      variant="danger"
      onClick={() => {
        if (task) {
          deleteTask(task.id);
          toast({ type: 'success', title: '任务已删除' });
        }
        onDone();
      }}
    >
      删除
    </Button>
  );
}

/* === Column (useDroppable + real-time count badge) === */
interface KanbanColumnProps {
  cat: TaskCategory;
  isDateView: boolean;
  onHeaderClick?: () => void;
  selectedTaskId: string;
  onSelectTask: (id: string) => void;
  onRequestDialogEdit: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
  onRequestArrange: (task: Task) => void;
  onOpenProductDrawer: (productId: string) => void;
  onRequestCreateTask?: (categoryId: string) => void;
  activeDragId: string | null;
  activeDragTask: Task | null;
  overCatId: string | null;
}

function KanbanColumn({
  cat, isDateView, onHeaderClick, selectedTaskId, onSelectTask,
  onRequestDialogEdit, onRequestDelete, onRequestArrange, onOpenProductDrawer, onRequestCreateTask,
  activeDragId, activeDragTask, overCatId,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: cat.id });
  const taskKanbanCategory = useUIStore((s) => s.taskKanbanCategory);

  // D-06 real-time count: +1 for column being dragged-over, -1 for source column
  const isSource = !!activeDragTask && cat.tasks.some((t) => t.id === activeDragTask.id);
  const isOverThis = overCatId === cat.id && !!activeDragId;
  const derivedCount = cat.tasks.length + (isOverThis ? 1 : 0) - (isSource && activeDragId ? 1 : 0);

  return (
    <div
      ref={!isDateView ? setNodeRef : undefined}
      className={cn(
        'min-w-[clamp(240px,22vw,300px)] w-[clamp(240px,22vw,300px)] bg-bg-secondary/60 rounded-[var(--radius-md)] p-3 flex flex-col max-h-full border transition-colors',
        isOver && !isDateView
          ? 'ring-2 ring-accent/40 bg-bg-tertiary/50 border-accent/30'
          : 'border-border-subtle',
      )}
    >
      <div className="flex items-center justify-between py-1 mb-2 px-1">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', cat.color)} />
          <h3 className={cn(
            'text-sm font-semibold text-text-primary',
            onHeaderClick && 'cursor-pointer hover:text-accent',
            onHeaderClick && taskKanbanCategory === cat.name && 'text-accent',
          )} onClick={onHeaderClick}>{cat.name}</h3>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={derivedCount}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <Badge variant="neutral" className="text-[10px]">{derivedCount}</Badge>
            </motion.span>
          </AnimatePresence>
        </div>
        <Button
          variant="ghost"
          size="xs"
          aria-label="新建任务"
          onClick={() => onRequestCreateTask?.(cat.id)}
        >
          <Plus size={14} weight="bold" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-2">
        {cat.tasks.length === 0 ? (
          <div className="text-center py-6 text-xs text-text-tertiary">
            <p>暂无任务</p>
            <p className="mt-1">点击 + 新建一个任务</p>
          </div>
        ) : (
          cat.tasks.map(task => (
            <KanbanCard
              key={task.id}
              task={task}
              cat={cat}
              isExpanded={selectedTaskId === task.id}
              onToggleExpand={() => onSelectTask(selectedTaskId === task.id ? '' : task.id)}
              onRequestDialogEdit={() => onRequestDialogEdit(task)}
              onRequestDelete={() => onRequestDelete(task)}
              onRequestArrange={() => onRequestArrange(task)}
              onOpenProductDrawer={onOpenProductDrawer}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* === Card (useDraggable + inline edit + DotsMenu) === */
interface KanbanCardProps {
  task: Task;
  cat: TaskCategory;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRequestDialogEdit: () => void;
  onRequestDelete: () => void;
  onRequestArrange: () => void;
  onOpenProductDrawer: (productId: string) => void;
}

function KanbanCard({
  task, cat, isExpanded, onToggleExpand,
  onRequestDialogEdit, onRequestDelete, onRequestArrange, onOpenProductDrawer,
}: KanbanCardProps) {
  const { updateTask, completeTask, reopenTask, moveTask, setTaskProject } = useTaskStore();
  const categories = useTaskStore((s) => s.categories);
  const products = useProductStore((s) => s.products);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const { syncTaskSchedule } = useApp();
  const { toast } = useToast();

  // DnD (D-05, D-07)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { fromCatId: cat.id },
  });

  // Inline edit local state (D-01)
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [deadlineDate, setDeadlineDate] = useState<string | undefined>(
    task.deadline ? task.deadline.split(' ')[0] : undefined,
  );
  const [deadlineHour, setDeadlineHour] = useState(
    task.deadline ? Number(task.deadline.split(' ')[1]?.split(':')[0]) || 18 : 18,
  );
  const [categoryId, setCategoryId] = useState(cat.id);

  // Sync when expand toggles open
  useEffect(() => {
    if (isExpanded) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setStatus(task.status);
      setDeadlineDate(task.deadline ? task.deadline.split(' ')[0] : undefined);
      setDeadlineHour(task.deadline ? Number(task.deadline.split(' ')[1]?.split(':')[0]) || 18 : 18);
      setCategoryId(cat.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, task.id]);

  // Debounced autosave per field (D-02)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // ponytail: GAP-01 saved-flash. Flip true when debounce fires; auto-reset after 1.2s.
  // Border + ring transition from accent→success→accent via `transition-all duration-300`.
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scheduleSave = useCallback((key: string, updates: Partial<Task>) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => {
      updateTask(task.id, updates);
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 1200);
    }, 400);
  }, [task.id, updateTask]);

  // Quick 260811-v3i: debounced schedule sync after deadline autosave.
  // 500ms > scheduleSave's 400ms, so updateTask has landed in the store before sync.
  const syncTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scheduleScheduleSync = useCallback((prevDeadline: string) => {
    if (syncTimers.current.deadline) clearTimeout(syncTimers.current.deadline);
    syncTimers.current.deadline = setTimeout(() => {
      syncTaskSchedule(task.id, prevDeadline);
    }, 500);
  }, [task.id, syncTaskSchedule]);

  // Flush on unmount
  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
    Object.values(syncTimers.current).forEach(clearTimeout);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const product = task.projectId ? products.find((p) => p.id === task.projectId) : undefined;

  const handleCopyId = () => {
    navigator.clipboard.writeText(task.id);
    toast({ type: 'success', title: '已复制任务 ID' });
  };

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    // Phase 17 UX-04: right-click AI actions — prefill ChatPanel, never auto-send.
    <AiContextMenu items={[
      { icon: <Notepad size={14} weight="duotone" className="text-accent" />, label: '总结此任务', onSelect: () => fireAiAction(`请总结任务「${task.title}」：当前状态、关键信息与风险。`) },
      { icon: <TreeStructure size={14} weight="duotone" className="text-accent" />, label: 'AI 拆解子任务', onSelect: () => fireAiAction(`请把任务「${task.title}」拆解为可执行的子任务清单。`) },
      { icon: <CalendarPlus size={14} weight="duotone" className="text-accent" />, label: '安排到日程', onSelect: () => fireAiAction(`请把任务「${task.title}」安排到日程，并建议合适的时间段。`) },
    ]}>
      <motion.div
      ref={setNodeRef}
      style={dragStyle}
      {...attributes}
      {...listeners}
      layout
      data-task-card
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0, scale: isDragging ? 1.02 : 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={(e) => {
        // click-vs-drag: PointerSensor 8px threshold. Stop if click hit interactive element.
        const target = e.target as HTMLElement;
        if (target.closest('input, textarea, button, [role="menuitem"], [data-no-expand]')) return;
        onToggleExpand();
      }}
      className={cn(
        'bg-bg-primary rounded-[var(--radius-md)] p-3 transition-all duration-300 cursor-grab active:cursor-grabbing border relative',
        isExpanded
          ? justSaved
            ? 'border-success shadow-md ring-2 ring-success/40'
            : 'border-accent shadow-md ring-1 ring-accent/15'
          : 'border-border-subtle shadow-xs hover:border-border hover:shadow-sm',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 pr-8">
        {!isDragging && (
          <span className="text-[10px] font-mono text-text-tertiary shrink-0">{formatTaskDisplayId(task)}</span>
        )}
        {isExpanded ? (
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); scheduleSave('title', { title: e.target.value }); }}
            className="h-7 px-1 -mx-1 text-sm font-medium border-transparent hover:border-border-subtle focus:border-accent"
            data-no-expand
          />
        ) : (
          <h4 className={cn(
            'text-sm font-medium leading-tight flex-1 min-w-0 truncate',
            task.status === '已完成' ? 'text-text-tertiary line-through' : 'text-text-primary',
          )}>
            {task.title}
          </h4>
        )}
      </div>

      {/* Status indicator (collapsed + done) — moved to right-bottom badge */}

      {/* DotsMenu — always present, top-right */}
      <div className="absolute top-3 right-3" data-no-expand>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" aria-label="任务操作" className="h-6 w-6 p-0">
              <DotsThree size={16} weight="duotone" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[10rem]" align="end">
            <DropdownMenuItem onSelect={onRequestDialogEdit}>
              <PencilSimple size={14} weight="duotone" /> 在对话框中编辑
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRequestArrange}>
              <Calendar size={14} weight="duotone" /> 安排到日历
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleCopyId}>
              <Copy size={14} weight="duotone" /> 复制 ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={task.status !== '已完成'}
              onSelect={() => reopenTask(task.id)}
            >
              <ArrowCounterClockwise size={14} weight="duotone" /> 重新打开
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-danger"
              onSelect={onRequestDelete}
            >
              <Trash size={14} weight="duotone" /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Collapsed preview */}
      {!isExpanded && (
        <div className="mt-2.5 flex items-center justify-between pr-6">
          <Badge
            variant={task.priority === 'high' ? 'danger' : task.priority === 'medium' ? 'warning' : 'neutral'}
            className="text-[10px]"
          >
            {task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
          </Badge>
          <div className="flex items-center gap-2">
            {product && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenProductDrawer(task.projectId!); }}
                className="inline-flex"
              >
                <Badge variant="accent" className="text-[10px] gap-1 cursor-pointer hover:bg-accent-subtle/80">
                  <FolderSimple size={10} weight="fill" />
                  {product.name}
                </Badge>
              </button>
            )}
            {task.scheduledEventId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('schedule');
                }}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium hover:bg-success/20 transition-colors cursor-pointer"
                title="跳转到日程"
              >
                <Calendar size={10} weight="duotone" />
                日程
              </button>
            )}
            <Badge
              variant={task.status === '已完成' ? 'success' : task.status === '进行中' ? 'warning' : 'neutral'}
              className="text-[10px] gap-0.5"
            >
              {task.status === '已完成' && <CheckCircle size={10} weight="fill" />}
              {task.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Expanded body — inline editable */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border-subtle space-y-3" data-no-expand>
          <Textarea
            placeholder="添加描述..."
            value={description}
            onChange={(e) => { setDescription(e.target.value); scheduleSave('description', { description: e.target.value }); }}
            className="min-h-[60px] resize-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <Select
              value={priority}
              onValueChange={(v) => {
                setPriority(v as 'high' | 'medium' | 'low');
                scheduleSave('priority', { priority: v as 'high' | 'medium' | 'low' });
              }}
            >
              <SelectTrigger className="h-8"><SelectValue placeholder="优先级" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                scheduleSave('status', { status: v });
              }}
            >
              <SelectTrigger className="h-8"><SelectValue placeholder="状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="未开始">未开始</SelectItem>
                <SelectItem value="进行中">进行中</SelectItem>
                <SelectItem value="已完成">已完成</SelectItem>
              </SelectContent>
            </Select>
            <div className="col-span-2">
              <Select
                value={task.projectId ?? '__none__'}
                onValueChange={(v) => {
                  const pid = v === '__none__' ? undefined : v;
                  setTaskProject(task.id, pid);
                }}
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
                onChange={(d) => {
                  setDeadlineDate(d);
                  scheduleSave('deadline', { deadline: d ? `${d} ${String(deadlineHour).padStart(2, '0')}:00` : '' });
                  scheduleScheduleSync(task.deadline);
                }}
              />
              <Select
                value={String(deadlineHour)}
                onValueChange={(v) => {
                  const h = Number(v);
                  setDeadlineHour(h);
                  if (deadlineDate) scheduleSave('deadline', { deadline: `${deadlineDate} ${String(h).padStart(2, '0')}:00` });
                  if (deadlineDate) scheduleScheduleSync(task.deadline);
                }}
              >
                <SelectTrigger className="h-9 w-[92px] px-2"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                    <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  setCategoryId(v);
                  // Move to new category = moveTask (D-07)
                  if (v !== cat.id) moveTask(task.id, cat.id, v);
                }}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="分类" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            variant={task.status === '已完成' ? 'secondary' : 'primary'}
            size="sm"
            className="w-full"
            disabled={task.status === '已完成'}
            onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
          >
            <CheckCircle size={14} weight="duotone" />
            {task.status === '已完成' ? '已完成' : '标记完成'}
          </Button>
        </div>
      )}
    </motion.div>
    </AiContextMenu>
  );
}
