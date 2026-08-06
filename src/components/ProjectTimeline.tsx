import { Calendar, CaretDown } from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { cn } from '@/src/lib/utils';

export function ProjectTimeline({ className = '' }: { className?: string }) {
  const { projects } = useApp();
  const days = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const phases = projects.flatMap((p, i) => {
    const colors = [
      'bg-accent/20 border-accent/40 text-accent',
      'bg-accent-subtle border-accent/30 text-accent',
      'bg-success-subtle border-success/40 text-success',
      'bg-purple-500/10 border-purple-500/30 text-purple-600',
      'bg-warning-subtle border-warning/40 text-warning',
    ];

    return {
      name: p.name,
      color: colors[i % colors.length],
      dotColor: ['bg-accent', 'bg-accent', 'bg-success', 'bg-purple-500', 'bg-warning'][i % 5],
      start: (i * 4) % 15,
      end: ((i * 4) % 15) + (Math.random() * 5 + 5),
      label: `${p.name} - ${p.status}`,
    };
  });

  return (
    <Card className={`p-5 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-accent rounded-full" />
          <h2 className="text-sm font-bold text-text-primary">项目时间线</h2>
          <Button variant="secondary" size="xs" className="gap-1 ml-2">
            <Calendar size={12} weight="duotone" />
            当前进度
          </Button>
        </div>
        <Button variant="ghost" size="xs" className="gap-1">
          周 <CaretDown size={12} weight="bold" />
        </Button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="min-w-[800px] h-full flex flex-col relative">
          {/* X Axis (Days) */}
          <div className="flex ml-[140px] mb-2 border-b border-border-subtle pb-2">
            {days.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end relative">
                <span className={cn(
                  'text-[10px] font-medium',
                  day === 24 ? 'bg-success text-white w-5 h-5 rounded-full flex items-center justify-center -mt-1 shadow-sm' : 'text-text-tertiary'
                )}>
                  {day}
                </span>
                <div className="absolute top-6 bottom-[-500px] w-px bg-border-subtle pointer-events-none" />
              </div>
            ))}
            <div className="flex-1 text-[10px] font-semibold text-accent flex justify-center items-end pb-1">今天</div>
          </div>

          {/* Y Axis & Gantt Bars */}
          <div className="flex-1 flex flex-col justify-start relative pt-2 gap-4">
            {phases.map((phase, index) => (
              <div key={index} className="flex items-center group">
                <div className="w-[140px] flex items-center gap-2 shrink-0">
                  <div className={cn('w-1.5 h-1.5 rounded-full', phase.dotColor)} />
                  <span className="text-xs font-medium text-text-secondary truncate pr-2" title={phase.name}>{phase.name}</span>
                </div>
                <div className="flex-1 flex relative h-8 items-center">
                  <div
                    className={cn(
                      'absolute h-6 rounded-[var(--radius-sm)] border shadow-xs flex items-center px-2 text-[10px] font-semibold whitespace-nowrap overflow-hidden transition-all group-hover:brightness-95 cursor-pointer hover:z-10',
                      phase.color
                    )}
                    style={{
                      left: `${(phase.start / 34) * 100}%`,
                      width: `${((phase.end - phase.start) / 34) * 100}%`,
                    }}
                  >
                    {phase.label}
                  </div>
                </div>
              </div>
            ))}

            {/* Today Indicator Line */}
            <div className="absolute top-0 bottom-[-500px] pointer-events-none" style={{ left: `calc(140px + ${(6.5 / 24) * 100}%)` }}>
              <div className="w-px h-full bg-success/50 border-r border-dashed border-success/50" />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
