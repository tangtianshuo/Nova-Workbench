import { motion } from 'motion/react';
import { CardHover } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import {
  ClipboardText,
  Pulse,
  CheckCircle,
  Warning,
  ArrowUpRight,
  ArrowDownRight,
} from '@phosphor-icons/react';

const stats = [
  {
    label: "今日待办",
    value: "12",
    trend: "+20%",
    isPositive: true,
    icon: ClipboardText,
    badgeVariant: 'accent' as const,
    subLabel: "项任务"
  },
  {
    label: "进行中",
    value: "28",
    trend: "+8%",
    isPositive: true,
    icon: Pulse,
    badgeVariant: 'accent' as const,
    subLabel: "项任务"
  },
  {
    label: "已完成",
    value: "56",
    trend: "+15%",
    isPositive: true,
    icon: CheckCircle,
    badgeVariant: 'success' as const,
    subLabel: "项任务"
  },
  {
    label: "逾期任务",
    value: "3",
    trend: "-40%",
    isPositive: true,
    icon: Warning,
    badgeVariant: 'danger' as const,
    subLabel: "项任务"
  }
];

export function StatsRow() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        const TrendIcon = stat.isPositive ? ArrowUpRight : ArrowDownRight;
        const trendColor = stat.isPositive ? 'text-success' : 'text-danger';

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
                  <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trendColor}`}>
                    <TrendIcon size={12} weight="duotone" />
                    <span>{stat.trend}</span>
                    <span className="text-text-tertiary font-normal ml-0.5">较昨日</span>
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
