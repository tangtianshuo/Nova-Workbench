import { useState, useEffect, useMemo } from 'react';
import { Trash, X, MagnifyingGlass } from '@phosphor-icons/react';
import { useScheduleStore, type ScheduleEvent, type ScheduleEventType } from '@/src/stores/scheduleStore';
import { useProductStore } from '@/src/stores/productStore';
import { useToast } from '@/src/components/ui/Toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from '@/src/components/ui/Dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/src/components/ui/Popover';
import { Input } from '@/src/components/ui/Input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/src/components/ui/Select';
import { DatePickerInput } from '@/src/components/ui/DatePickerInput';
import { Button } from '@/src/components/ui/Button';
import { cn } from '@/src/lib/utils';

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  event?: ScheduleEvent;
  defaultDate?: string; // YYYY-MM-DD, create 模式预填
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_EVENT: Omit<ScheduleEvent, 'id'> = {
  title: '',
  time: '09:00 - 10:00',
  date: '',
  type: 'meeting',
  location: '',
};

export function ScheduleDialog({
  open,
  onOpenChange,
  mode,
  event,
  defaultDate,
}: ScheduleDialogProps) {
  const createEvent = useScheduleStore((s) => s.createEvent);
  const updateEvent = useScheduleStore((s) => s.updateEvent);
  const deleteEvent = useScheduleStore((s) => s.deleteEvent);
  const products = useProductStore((s) => s.products);
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string>(todayISO());
  const [time, setTime] = useState('09:00 - 10:00');
  const [type, setType] = useState<ScheduleEventType>('meeting');
  const [location, setLocation] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  // P13: reset form when dialog opens or event changes
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && event) {
      setTitle(event.title);
      setDate(event.date);
      setTime(event.time);
      setType(event.type);
      setLocation(event.location);
      setProjectId(event.projectId);
    } else {
      setTitle('');
      setDate(defaultDate ?? todayISO());
      setTime('09:00 - 10:00');
      setType('meeting');
      setLocation('');
      setProjectId(undefined);
    }
    setProductSearch('');
    setShowDeleteConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, event?.id]);

  const selectedProduct = products.find((p) => p.id === projectId);
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, productSearch]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      date,
      time: time.trim(),
      type,
      location: location.trim(),
      projectId,
    };
    if (mode === 'create') {
      createEvent({ ...DEFAULT_EVENT, id: crypto.randomUUID(), ...payload });
      toast({ type: 'success', title: '日程已创建' });
    } else if (event) {
      updateEvent(event.id, payload);
      toast({ type: 'success', title: '已保存' });
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!event) return;
    deleteEvent(event.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
    toast({ type: 'success', title: '日程已删除' });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader
            title={mode === 'create' ? '新建日程' : '编辑日程'}
            description={
              mode === 'create' ? '安排一个新的日程事件' : `编辑 ${event?.title ?? ''}`
            }
          />
          <DialogBody>
            {/* 1. 标题 */}
            <Input
              placeholder="日程标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={mode === 'create'}
            />

            {/* 2. 日期 / 时间 (grid 2 cols) */}
            <div className="grid grid-cols-2 gap-2">
              <DatePickerInput value={date} onChange={setDate} placeholder="日期" />
              <Input
                placeholder="09:00 - 10:00"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>

            {/* 3. 类型 / 地点 (grid 2 cols) */}
            <div className="grid grid-cols-2 gap-2">
              <Select value={type} onValueChange={(v) => setType(v as ScheduleEventType)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">会议</SelectItem>
                  <SelectItem value="deadline">截止</SelectItem>
                  <SelectItem value="task">任务</SelectItem>
                  <SelectItem value="reminder">提醒</SelectItem>
                  <SelectItem value="review">评审</SelectItem>
                  <SelectItem value="sync">同步</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="地点"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            {/* 4. 关联产品 Combobox (复用 Phase 5 模式) */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">
                关联产品 (可选)
              </label>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectId(undefined);
                        }}
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
                      <p className="text-xs text-text-tertiary py-6 text-center">
                        未找到匹配的产品
                      </p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setProjectId(p.id);
                            setComboboxOpen(false);
                            setProductSearch('');
                          }}
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
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button variant="primary" disabled={!title.trim()} onClick={handleSubmit}>
              {mode === 'create' ? '创建日程' : '保存修改'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 嵌套删除确认 (top-level Dialog, z-modal 自动叠加) */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader title="删除日程?" />
          <DialogBody>
            <p className="text-sm text-text-secondary">
              日程 "{event?.title}" 将被永久删除,此操作无法撤销。
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
