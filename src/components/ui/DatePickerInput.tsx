import { useState } from 'react';
import { Calendar, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from '@/src/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from './Popover';

// ponytail: native <input type="date"> picker does not surface in Tauri frameless
// transparent windows on Windows (WebView2 layered-window limitation). This replaces
// it with a Popover + month grid that lives inside the same React tree as Dialog,
// inheriting the z-tooltip fix from Popover.tsx.

interface DatePickerInputProps {
  value?: string; // YYYY-MM-DD
  onChange?: (date: string) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  className?: string;
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_NAMES = [
  '1 月', '2 月', '3 月', '4 月', '5 月', '6 月',
  '7 月', '8 月', '9 月', '10 月', '11 月', '12 月',
];

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function DatePickerInput({
  value,
  onChange,
  label,
  placeholder = '选择日期',
  id,
  className,
}: DatePickerInputProps) {
  // ponytail: hybrid controlled/uncontrolled — internal state mirrors value when controlled,
  // owns it when uncontrolled. Lets mock/demo dialogs (Header's NewTaskDialog) work without
  // a parent wiring state, while real forms (CreateProductModal etc.) stay fully controlled.
  const [internal, setInternal] = useState<string | undefined>(value);
  const effectiveValue = value ?? internal;
  const selected = effectiveValue ? new Date(effectiveValue + 'T00:00:00') : null;
  const today = new Date();
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [open, setOpen] = useState(false);

  const year = view.getFullYear();
  const month = view.getMonth();
  // Monday=0 .. Sunday=6
  const firstDayMon = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells: Array<{ day: number; month: 'prev' | 'curr' | 'next'; date: Date }> = [];
  for (let i = firstDayMon - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: 'prev', date: new Date(year, month - 1, daysInPrev - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: 'curr', date: new Date(year, month, d) });
  }
  while (cells.length < 42) {
    const next = cells.length - firstDayMon - daysInMonth + 1;
    cells.push({ day: next, month: 'next', date: new Date(year, month + 1, next) });
  }

  const shiftMonth = (delta: number) =>
    setView(new Date(view.getFullYear(), view.getMonth() + delta, 1));

  const pick = (date: Date) => {
    const str = toDateStr(date);
    setInternal(str);
    onChange?.(str);
    setOpen(false);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            className={cn(
              'w-full h-9 px-3 text-sm rounded-[var(--radius-md)]',
              'bg-bg-input border border-border text-text-primary',
              'flex items-center justify-between gap-2 text-left',
              'transition-colors duration-fast cursor-pointer',
              'hover:border-text-tertiary/30',
              'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
            )}
          >
            <span className={cn(!selected && 'text-text-placeholder')}>
              {selected ? toDateStr(selected) : placeholder}
            </span>
            <Calendar size={16} weight="duotone" className="text-text-tertiary" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="h-6 w-6 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-bg-secondary text-text-secondary"
            >
              <CaretLeft size={14} />
            </button>
            <span className="text-sm font-medium text-text-primary">
              {year} 年 {MONTH_NAMES[month]}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="h-6 w-6 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-bg-secondary text-text-secondary"
            >
              <CaretRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="h-7 flex items-center justify-center text-[11px] text-text-tertiary">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ day, month: cellMonth, date }, idx) => {
              const isSelected = selected && isSameDay(date, selected);
              const isToday = isSameDay(date, today);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => pick(date)}
                  className={cn(
                    'h-7 flex items-center justify-center text-xs rounded-[var(--radius-sm)]',
                    'transition-colors duration-fast',
                    cellMonth !== 'curr' && 'text-text-tertiary/50',
                    cellMonth === 'curr' && !isSelected && 'text-text-primary hover:bg-bg-secondary',
                    isSelected && 'bg-accent text-white font-medium hover:bg-accent',
                    isToday && !isSelected && 'ring-1 ring-accent/40',
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
