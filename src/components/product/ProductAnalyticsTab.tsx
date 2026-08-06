import { useState } from 'react';
import { motion } from 'motion/react';
import { Product } from '../../data/mockProducts';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';

// Phosphor icon adapter – renders with weight="duotone"
import {
  ChartLine as PhChartLine,
  ChartLineUp as PhChartLineUp,
  Users as PhUsers,
  Pulse as PhPulse,
  Lightning as PhLightning,
  CheckCircle as PhCheckCircle,
  SealPercent as PhSealPercent,
  Smiley as PhSmiley,
  ChartBar as PhChartBar,
} from '@phosphor-icons/react';

interface Props {
  product: Product;
}

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 25 };

export function ProductAnalyticsTab({ product }: Props) {
  const [metricTimeframe, setMetricTimeframe] = useState<'7d' | '30d' | '90d'>('7d');
  const metrics = product.metrics;

  const FUNNEL_COLORS = ['#0077ED', '#7B61FF', '#8B5CF6', '#EC4899', '#2D9B5A'];

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* DAU */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springTransition}
        >
          <Card className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-text-tertiary text-xs mb-2">
              <span>日活跃用户 (DAU)</span>
              <PhUsers size={14} weight="duotone" className="text-accent" />
            </div>
            <div>
              <div className="text-xl font-black text-text-primary tracking-tight">{metrics.dau}</div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-success mt-1">
                <PhChartLineUp size={12} weight="duotone" />
                <span>{metrics.dauGrowth} 较上周</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* MAU */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 0.05 }}
        >
          <Card className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-text-tertiary text-xs mb-2">
              <span>月活跃用户 (MAU)</span>
              <PhPulse size={14} weight="duotone" className="text-accent" />
            </div>
            <div>
              <div className="text-xl font-black text-text-primary tracking-tight">{metrics.mau}</div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-success mt-1">
                <PhChartLineUp size={12} weight="duotone" />
                <span>{metrics.mauGrowth} 较上月</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* 7-Day Retention */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 0.1 }}
        >
          <Card className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-text-tertiary text-xs mb-2">
              <span>7日次留存率</span>
              <PhSealPercent size={14} weight="duotone" className="text-success" />
            </div>
            <div>
              <div className="text-xl font-black text-text-primary tracking-tight">{metrics.retention7d}</div>
              <div className="flex items-center gap-1 text-[11px] font-bold text-success mt-1">
                <PhChartLineUp size={12} weight="duotone" />
                <span>{metrics.retentionTrend} 环比</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Feature Adoption */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 0.15 }}
        >
          <Card className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-text-tertiary text-xs mb-2">
              <span>核心功能渗透率</span>
              <PhLightning size={14} weight="duotone" className="text-warning" />
            </div>
            <div>
              <div className="text-xl font-black text-text-primary tracking-tight">{metrics.featureAdoption}</div>
              <div className="text-[11px] text-text-tertiary mt-1">高频主力模块</div>
            </div>
          </Card>
        </motion.div>

        {/* Conversion Rate */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 0.2 }}
        >
          <Card className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-text-tertiary text-xs mb-2">
              <span>综合转化率</span>
              <PhChartBar size={14} weight="duotone" className="text-danger" />
            </div>
            <div>
              <div className="text-xl font-black text-text-primary tracking-tight">{metrics.conversionRate}</div>
              <div className="text-[11px] text-text-tertiary mt-1">线索/付费转化</div>
            </div>
          </Card>
        </motion.div>

        {/* Latency / CSAT */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springTransition, delay: 0.25 }}
        >
          <Card className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between text-text-tertiary text-xs mb-2">
              <span>响应延时 / 满意度</span>
              <PhSmiley size={14} weight="duotone" className="text-purple-500" />
            </div>
            <div>
              <div className="text-base font-black text-text-primary tracking-tight">{metrics.avgLatency}</div>
              <div className="text-[11px] font-bold text-purple-500 mt-1">CSAT {metrics.csatScore}</div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Traffic Trend Chart */}
        <motion.div
          className="lg:col-span-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.1 }}
        >
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <PhChartLine size={18} weight="duotone" className="text-accent" />
                  <span>日活用户与 API 调用趋势分析</span>
                </h3>
                <p className="text-xs text-text-tertiary mt-0.5">监控用户活跃度波动与 Agent 后台调用峰值</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-bg-secondary p-1 rounded-xl border border-border-subtle text-xs">
                  <button
                    onClick={() => setMetricTimeframe('7d')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      metricTimeframe === '7d' ? 'bg-bg-primary text-accent shadow-sm font-bold' : 'text-text-secondary'
                    }`}
                  >
                    近7天
                  </button>
                  <button
                    onClick={() => setMetricTimeframe('30d')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                      metricTimeframe === '30d' ? 'bg-bg-primary text-accent shadow-sm font-bold' : 'text-text-secondary'
                    }`}
                  >
                    近30天
                  </button>
                </div>
              </div>
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.trafficTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dauGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0077ED" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0077ED" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="apiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7B61FF" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#7B61FF" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDEFF2" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8A919E' }} axisLine={{ stroke: '#EDEFF2' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8A919E' }} axisLine={{ stroke: '#EDEFF2' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1E293B',
                      borderRadius: '12px',
                      border: 'none',
                      color: '#FFF',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                    itemStyle={{ color: '#F8FAFC' }}
                  />
                  <Area type="monotone" dataKey="dau" name="DAU 活跃用户" stroke="#0077ED" strokeWidth={2.5} fillOpacity={1} fill="url(#dauGradient)" />
                  <Area type="monotone" dataKey="apiCalls" name="API 调用次数" stroke="#7B61FF" strokeWidth={2} strokeDasharray="4 4" fillOpacity={1} fill="url(#apiGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-6 mt-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-accent"></span>
                <span className="text-text-secondary font-medium">DAU 活跃用户数</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                <span className="text-text-secondary font-medium">API 与 Agent 调用量</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Right: Funnel Breakdown */}
        <motion.div
          className="lg:col-span-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.15 }}
        >
          <Card className="p-6 flex flex-col justify-between h-full">
            <div>
              <h3 className="text-base font-bold text-text-primary mb-1">功能使用转化漏斗</h3>
              <p className="text-xs text-text-tertiary mb-5">各业务链路关键环节留存率</p>

              <div className="space-y-3">
                {metrics.featureUsageFunnel.map((step, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-text-secondary">{step.stage}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-text-tertiary font-mono">{step.users.toLocaleString()}</span>
                        <span className="font-bold text-accent font-mono">{step.conversion}</span>
                      </div>
                    </div>
                    <div className="w-full bg-bg-secondary h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: step.conversion,
                          backgroundColor: FUNNEL_COLORS[idx % FUNNEL_COLORS.length]
                        }}
                      />
                    </div>
                    {idx > 0 && (
                      <div className="text-[10px] text-text-tertiary text-right">
                        流失率: <span className="text-danger font-medium">{step.dropRate}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border-subtle text-xs text-text-secondary flex items-center justify-between">
              <span>端到端总转化效率:</span>
              <span className="font-bold text-success text-sm">54.3%</span>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Cohort Retention & AI Health Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Retention Cohort Table */}
        <motion.div
          className="lg:col-span-7"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.2 }}
        >
          <Card className="p-6">
            <h3 className="text-base font-bold text-text-primary mb-1">留存率热力队列 (Cohort Retention)</h3>
            <p className="text-xs text-text-tertiary mb-4">按周维度追踪新加入用户的长期留存曲线</p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center">
                <thead>
                  <tr className="border-b border-border-subtle text-text-tertiary font-medium">
                    <th className="pb-2 text-left pl-2">入驻批次</th>
                    <th className="pb-2">第1天</th>
                    <th className="pb-2">第3天</th>
                    <th className="pb-2">第7天</th>
                    <th className="pb-2">第14天</th>
                    <th className="pb-2 pr-2">第30天</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-mono">
                  {metrics.retentionCohort.map((c, idx) => (
                    <tr key={idx} className="hover:bg-bg-secondary/50">
                      <td className="py-2.5 text-left pl-2 font-bold text-text-secondary font-sans">{c.period}</td>
                      <td className="py-2.5">
                        <span className="inline-block px-2 py-1 rounded bg-accent-subtle text-accent font-bold">{c.day1}%</span>
                      </td>
                      <td className="py-2.5">
                        <span className="inline-block px-2 py-1 rounded bg-accent-subtle/60 text-accent font-bold">{c.day3}%</span>
                      </td>
                      <td className="py-2.5">
                        <span className="inline-block px-2 py-1 rounded bg-success-subtle text-success font-bold">{c.day7}%</span>
                      </td>
                      <td className="py-2.5">
                        <span className="inline-block px-2 py-1 rounded bg-accent-subtle/40 text-accent">{c.day14}%</span>
                      </td>
                      <td className="py-2.5 pr-2">
                        <span className="inline-block px-2 py-1 rounded bg-bg-secondary text-text-secondary">{c.day30}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* AI Performance & Health Check */}
        <motion.div
          className="lg:col-span-5"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.25 }}
        >
          <Card className="p-6 flex flex-col justify-between h-full">
            <div>
              <h3 className="text-base font-bold text-text-primary mb-1">AI 引擎运行健康度</h3>
              <p className="text-xs text-text-tertiary mb-4">大模型意图解析与自动化任务采纳度量</p>

              <div className="space-y-4">
                {metrics.aiPerformance.map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-text-secondary">{item.metric}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-text-primary">{item.score}%</span>
                        <Badge variant="success" className="text-[10px] font-bold">
                          {item.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="w-full bg-bg-secondary h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.score >= 95 ? 'bg-success' : 'bg-accent'}`}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 p-3 bg-bg-secondary rounded-xl border border-border-subtle flex items-start gap-2 text-xs text-text-secondary">
              <PhCheckCircle size={16} weight="duotone" className="text-success shrink-0 mt-0.5" />
              <span>智能归因系统评定：该产品目前各项核心业务与工程性能指标运行平稳，无异常告警。</span>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
