import { useMemo } from 'react';
import { motion } from 'motion/react';
import { CardHover } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import {
  ClipboardText,
  Pulse,
  CheckCircle,
  Warning,
} from '@phosphor-icons/react';
import { useTaskStore } from '@/src/stores/taskStore';

// 不可解析 deadline 永不计入今日/逾期,绝不 throw
function parseDeadline(deadline: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline.slice(0, 10));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function StatsRow() {
  const categories = useTaskStore((s) => s.categories);

  const stats = useMemo(() => {
    const tasks = categories.flatMap((c) => c.tasks);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const done = tasks.filter((t) => t.status === '已完成').length;
    const inProgress = tasks.filter((t) => t.status === '进行中').length;
    const unfinished = tasks.length - done;
    let dueToday = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.status === '已完成') continue;
      const d = parseDeadline(t.deadline);
      if (!d) continue;
      if (d.getTime() === today.getTime()) dueToday++;
      else if (d.getTime() < today.getTime()) overdue++;
    }

    const pct = (n: number) =>
      unfinished === 0 ? '暂无未完成' : `占未完成 ${Math.round((n / unfinished) * 100)}%`;

    return [
      { label: '今日待办', value: String(dueToday), sub: `共 ${unfinished} 项未完成`, icon: ClipboardText, badgeVariant: 'accent' as const, subLabel: '项任务' },
      { label: '进行中', value: String(inProgress), sub: pct(inProgress), icon: Pulse, badgeVariant: 'accent' as const, subLabel: '项任务' },
      { label: '已完成', value: String(done), sub: `共 ${tasks.length} 项任务`, icon: CheckCircle, badgeVariant: 'success' as const, subLabel: '项任务' },
      { label: '逾期任务', value: String(overdue), sub: pct(overdue), icon: Warning, badgeVariant: 'danger' as const, subLabel: '项任务' },
    ];
  }, [categories]);

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 25 }}
          >
            <CardHover variant="interactive" className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-text-secondary mb-2">{stat.label}</p>
                  <div className="flex items-baseline gap-1.5">
                    <h3 className="text-2xl font-bold text-text-primary tracking-tight">
                      {stat.value}
                    </h3>
                    <span className="text-xs text-text-tertiary">{stat.subLabel}</span>
                  </div>
                  <div className="mt-2 text-xs text-text-tertiary">
                    {stat.sub}
                  </div>
                </div>
                <div className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center bg-${stat.badgeVariant}-subtle`}>
                  <Icon size={20} weight="duotone" className={`text-${stat.badgeVariant}`} />
                </div>
              </div>
            </CardHover>
          </motion.div>
        );
      })}
    </div>
  );
}
