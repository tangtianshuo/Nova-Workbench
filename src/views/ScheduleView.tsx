import { CaretLeft, CaretRight, Clock, MapPin, VideoCamera } from '@phosphor-icons/react';
import { useState } from 'react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { useApp } from '../store/AppContext';
import { cn } from '@/src/lib/utils';

const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  meeting: { bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent' },
  review: { bg: 'bg-purple-500/10', text: 'text-purple-600', dot: 'bg-purple-500' },
  sync: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
};

export function ScheduleView() {
  const { events } = useApp();
  const [viewMode, setViewMode] = useState('month');

  const daysInMonth = 31;
  const firstDayOfMonth = 4;

  const days = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDayOfMonth + 1;
    return {
      date: day,
      isCurrentMonth: day > 0 && day <= daysInMonth,
      isToday: day === 15,
      hasEvents: events.some(e => e.date === day),
      dayEvents: events.filter(e => e.date === day),
    };
  });

  const upcomingEvents = events
    .filter(e => e.date >= 15)
    .sort((a, b) => a.date - b.date)
    .slice(0, 5);

  return (
    <div className="flex gap-5 h-full min-h-[700px]">
      {/* Calendar */}
      <Card className="flex-1 flex flex-col p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-text-primary">2025年 5月</h2>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="xs"><CaretLeft size={14} weight="bold" /></Button>
              <Button variant="ghost" size="xs" className="text-xs font-medium px-2">今天</Button>
              <Button variant="ghost" size="xs"><CaretRight size={14} weight="bold" /></Button>
            </div>
          </div>
          <SegmentedControl
            options={[{ id: 'month', label: '月视图' }, { id: 'week', label: '周视图' }]}
            value={viewMode}
            onChange={setViewMode}
          />
        </div>

        <div className="grid grid-cols-7 gap-px bg-border-subtle rounded-[var(--radius-md)] overflow-hidden flex-1 border border-border-subtle">
          {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map(day => (
            <div key={day} className="bg-bg-secondary py-2.5 text-center text-xs font-semibold text-text-tertiary">
              {day}
            </div>
          ))}

          {days.map((day, i) => (
            <div
              key={i}
              className={cn(
                'bg-bg-primary min-h-[90px] p-1.5 transition-colors hover:bg-bg-secondary/50',
                !day.isCurrentMonth && 'opacity-25'
              )}
            >
              <div className={cn(
                'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-0.5',
                day.isToday ? 'bg-accent text-white' : 'text-text-primary'
              )}>
                {day.date > 0 && day.date <= 31 ? day.date : (day.date <= 0 ? 30 + day.date : day.date - 31)}
              </div>

              {day.isCurrentMonth && day.hasEvents && (
                <div className="space-y-0.5">
                  {day.dayEvents.map(e => {
                    const c = EVENT_COLORS[e.type] || EVENT_COLORS.meeting;
                    return (
                      <div key={e.id} className={cn('px-1 py-px text-[10px] rounded font-medium truncate', c.bg, c.text)}>
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
          近期日程
          <Badge variant="neutral">{upcomingEvents.length} 个事件</Badge>
        </h3>
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {upcomingEvents.map(event => {
            const c = EVENT_COLORS[event.type] || EVENT_COLORS.meeting;
            return (
              <div key={event.id} className="relative pl-5 pb-4 border-l-2 border-border-subtle last:border-transparent last:pb-0">
                <div className={cn('absolute -left-[5px] top-0 w-2 h-2 rounded-full', c.dot)} />
                <div className="bg-bg-secondary rounded-[var(--radius-md)] p-3 hover:bg-bg-tertiary transition-colors cursor-pointer group">
                  <div className="flex justify-between items-start mb-1.5">
                    <h4 className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">{event.title}</h4>
                    <Badge
                      variant={event.date === 15 ? 'accent' : event.date === 16 ? 'success' : 'neutral'}
                      className="text-[10px]"
                    >
                      {event.date === 15 ? '今天' : event.date === 16 ? '明天' : `5月${event.date}日`}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-tertiary mb-2">
                    <Clock size={12} weight="duotone" />
                    {event.time}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary bg-bg-primary px-2 py-1 rounded-[var(--radius-sm)] border border-border-subtle w-fit">
                    {event.location.includes('线上') || event.location.includes('Meeting')
                      ? <VideoCamera size={12} weight="duotone" className="text-accent" />
                      : <MapPin size={12} weight="duotone" className="text-danger" />
                    }
                    {event.location}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="primary" className="w-full mt-3">+ 新建日程</Button>
      </Card>
    </div>
  );
}
