import { CaretLeft, CaretRight, Clock, MapPin, VideoCamera, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { ScheduleDialog } from '@/src/components/ScheduleDialog';
import { useScheduleStore, type ScheduleEvent } from '@/src/stores/scheduleStore';
import { cn } from '@/src/lib/utils';

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  meeting:  { bg: 'bg-accent/10',     text: 'text-accent',     dot: 'bg-accent' },
  deadline: { bg: 'bg-danger/10',     text: 'text-danger',     dot: 'bg-danger' },
  task:     { bg: 'bg-purple-500/10', text: 'text-purple-600', dot: 'bg-purple-500' },
  reminder: { bg: 'bg-warning/10',    text: 'text-warning',    dot: 'bg-warning' },
  review:   { bg: 'bg-purple-500/10', text: 'text-purple-600', dot: 'bg-purple-500' },
  sync:     { bg: 'bg-success/10',    text: 'text-success',    dot: 'bg-success' },
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseMonthDay = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return { m, d };
};

export function ScheduleView() {
  const events = useScheduleStore((s) => s.events);
  const [viewMode, setViewMode] = useState('month');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | undefined>();
  const [createDefaultDate, setCreateDefaultDate] = useState<string | undefined>();

  const { year, month } = currentMonth;
  const today = todayISO();

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0=Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  // 42 cells: leading days from prev month, current month, trailing from next
  type Cell = {
    dateStr: string;
    dayNum: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    dayEvents: ScheduleEvent[];
  };
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    let dayNum: number;
    let y = year;
    let m = month;
    let isCurrentMonth = true;
    if (i < firstDayOfMonth) {
      dayNum = prevMonthDays - firstDayOfMonth + i + 1;
      m = month - 1;
      if (m < 0) {
        m = 11;
        y = year - 1;
      }
      isCurrentMonth = false;
    } else if (i >= firstDayOfMonth + daysInMonth) {
      dayNum = i - firstDayOfMonth - daysInMonth + 1;
      m = month + 1;
      if (m > 11) {
        m = 0;
        y = year + 1;
      }
      isCurrentMonth = false;
    } else {
      dayNum = i - firstDayOfMonth + 1;
    }
    const dateStr = toISO(y, m, dayNum);
    cells.push({
      dateStr,
      dayNum,
      isCurrentMonth,
      isToday: dateStr === today,
      dayEvents: events.filter((e) => e.date === dateStr),
    });
  }

  // Agenda: events within currentMonth, sorted by date+time, top 8
  const monthStart = toISO(year, month, 1);
  const monthEnd = toISO(year, month, daysInMonth);
  const agendaEvents = events
    .filter((e) => e.date >= monthStart && e.date <= monthEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
    .slice(0, 8);

  const goPrev = () =>
    setCurrentMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  const goNext = () =>
    setCurrentMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );
  const goToday = () => {
    const d = new Date();
    setCurrentMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  const openCreate = (defaultDate?: string) => {
    setEditingEvent(undefined);
    setCreateDefaultDate(defaultDate);
    setDialogOpen(true);
  };
  const openEdit = (event: ScheduleEvent) => {
    setEditingEvent(event);
    setCreateDefaultDate(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="flex gap-5 h-full min-h-[700px]">
      {/* Calendar */}
      <Card className="flex-1 flex flex-col p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-text-primary">
              {year}年 {month + 1}月
            </h2>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="xs" onClick={goPrev} aria-label="上个月">
                <CaretLeft size={14} weight="bold" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs font-medium px-2"
                onClick={goToday}
              >
                今天
              </Button>
              <Button variant="ghost" size="xs" onClick={goNext} aria-label="下个月">
                <CaretRight size={14} weight="bold" />
              </Button>
            </div>
          </div>
          <SegmentedControl
            segments={[
              { id: 'month', label: '月视图' },
              { id: 'week', label: '周视图' },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
        </div>

        <div className="grid grid-cols-7 gap-px bg-border-subtle rounded-[var(--radius-md)] overflow-hidden flex-1 border border-border-subtle">
          {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((d) => (
            <div
              key={d}
              className="bg-bg-secondary py-2.5 text-center text-xs font-semibold text-text-tertiary"
            >
              {d}
            </div>
          ))}
          {cells.map((cell, i) => (
            <div
              key={i}
              className={cn(
                'bg-bg-primary min-h-[90px] p-1.5 transition-colors hover:bg-bg-secondary/50 cursor-pointer',
                !cell.isCurrentMonth && 'opacity-25',
              )}
              onClick={() => cell.isCurrentMonth && openCreate(cell.dateStr)}
            >
              <div
                className={cn(
                  'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-0.5',
                  cell.isToday ? 'bg-accent text-white' : 'text-text-primary',
                )}
              >
                {cell.dayNum}
              </div>
              {cell.isCurrentMonth && cell.dayEvents.length > 0 && (
                <div className="space-y-0.5">
                  {cell.dayEvents.map((e) => {
                    const c = EVENT_COLORS[e.type] || EVENT_COLORS.meeting;
                    return (
                      <div
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          openEdit(e);
                        }}
                        className={cn(
                          'px-1 py-px text-[10px] rounded font-medium truncate',
                          c.bg,
                          c.text,
                        )}
                      >
                        {e.time.split(' ')[0]} {e.title}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Agenda */}
      <Card className="w-72 p-5 flex flex-col shrink-0">
        <h3 className="text-base font-bold text-text-primary mb-4 flex items-center justify-between">
          本月日程
          <Badge variant="neutral">{agendaEvents.length} 个事件</Badge>
        </h3>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {agendaEvents.length === 0 ? (
            <p className="text-xs text-text-tertiary py-6 text-center">本月暂无日程</p>
          ) : (
            agendaEvents.map((event) => {
              const c = EVENT_COLORS[event.type] || EVENT_COLORS.meeting;
              const { m, d } = parseMonthDay(event.date);
              const isToday = event.date === today;
              return (
                <div
                  key={event.id}
                  className="relative pl-5 pb-4 border-l-2 border-border-subtle last:border-transparent last:pb-0"
                >
                  <div
                    className={cn(
                      'absolute -left-[5px] top-0 w-2 h-2 rounded-full',
                      c.dot,
                    )}
                  />
                  <div
                    className="bg-bg-secondary rounded-[var(--radius-md)] p-3 hover:bg-bg-tertiary transition-colors cursor-pointer group"
                    onClick={() => openEdit(event)}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                        {event.title}
                      </h4>
                      <Badge
                        variant={isToday ? 'accent' : 'neutral'}
                        className="text-[10px]"
                      >
                        {isToday ? '今天' : `${m}月${d}日`}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-2">
                      <Clock size={12} weight="duotone" />
                      {event.time}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-bg-primary px-2 py-1 rounded-[var(--radius-sm)] border border-border-subtle w-fit">
                        {event.location.includes('线上') ||
                        event.location.includes('Meeting') ? (
                          <VideoCamera
                            size={12}
                            weight="duotone"
                            className="text-accent"
                          />
                        ) : (
                          <MapPin size={12} weight="duotone" className="text-danger" />
                        )}
                        {event.location}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <Button variant="primary" className="w-full mt-3" onClick={() => openCreate()}>
          <Plus size={14} weight="duotone" />
          新建日程
        </Button>
      </Card>

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editingEvent ? 'edit' : 'create'}
        event={editingEvent}
        defaultDate={createDefaultDate}
      />
    </div>
  );
}
