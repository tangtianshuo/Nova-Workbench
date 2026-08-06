import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { 
  LineChart as LineChartIcon, 
  TrendingUp, 
  Users, 
  Activity, 
  Zap, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  ArrowUpRight,
  Filter,
  BarChart3,
  Percent,
  Smile
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid,
  BarChart,
  Bar,
  Cell
} from 'recharts';

interface Props {
  product: Product;
}

export function ProductAnalyticsTab({ product }: Props) {
  const [metricTimeframe, setMetricTimeframe] = useState<'7d' | '30d' | '90d'>('7d');
  const metrics = product.metrics;

  const FUNNEL_COLORS = ['#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#10B981'];

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* DAU */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>日活跃用户 (DAU)</span>
            <Users size={14} className="text-blue-500" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 tracking-tight">{metrics.dau}</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 mt-1">
              <TrendingUp size={12} />
              <span>{metrics.dauGrowth} 较上周</span>
            </div>
          </div>
        </div>

        {/* MAU */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>月活跃用户 (MAU)</span>
            <Activity size={14} className="text-indigo-500" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 tracking-tight">{metrics.mau}</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 mt-1">
              <TrendingUp size={12} />
              <span>{metrics.mauGrowth} 较上月</span>
            </div>
          </div>
        </div>

        {/* 7-Day Retention */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>7日次留存率</span>
            <Percent size={14} className="text-emerald-500" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 tracking-tight">{metrics.retention7d}</div>
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 mt-1">
              <TrendingUp size={12} />
              <span>{metrics.retentionTrend} 环比</span>
            </div>
          </div>
        </div>

        {/* Feature Adoption */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>核心功能渗透率</span>
            <Zap size={14} className="text-amber-500" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 tracking-tight">{metrics.featureAdoption}</div>
            <div className="text-[11px] text-slate-400 mt-1">高频主力模块</div>
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>综合转化率</span>
            <BarChart3 size={14} className="text-rose-500" />
          </div>
          <div>
            <div className="text-xl font-black text-slate-800 tracking-tight">{metrics.conversionRate}</div>
            <div className="text-[11px] text-slate-400 mt-1">线索/付费转化</div>
          </div>
        </div>

        {/* Latency / CSAT */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>响应延时 / 满意度</span>
            <Smile size={14} className="text-purple-500" />
          </div>
          <div>
            <div className="text-base font-black text-slate-800 tracking-tight">{metrics.avgLatency}</div>
            <div className="text-[11px] font-bold text-purple-600 mt-1">CSAT {metrics.csatScore}</div>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Traffic Trend Chart */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <LineChartIcon size={18} className="text-blue-600" />
                <span>日活用户与 API 调用趋势分析</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">监控用户活跃度波动与 Agent 后台调用峰值</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-100 text-xs">
                <button
                  onClick={() => setMetricTimeframe('7d')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    metricTimeframe === '7d' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-500'
                  }`}
                >
                  近7天
                </button>
                <button
                  onClick={() => setMetricTimeframe('30d')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    metricTimeframe === '30d' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-500'
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
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="apiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} />
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
                <Area type="monotone" dataKey="dau" name="DAU 活跃用户" stroke="#3B82F6" strokeWidth={2.5} fillOpacity={1} fill="url(#dauGradient)" />
                <Area type="monotone" dataKey="apiCalls" name="API 调用次数" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="4 4" fillOpacity={1} fill="url(#apiGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center justify-center gap-6 mt-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              <span className="text-slate-600 font-medium">DAU 活跃用户数</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500"></span>
              <span className="text-slate-600 font-medium">API 与 Agent 调用量</span>
            </div>
          </div>
        </div>

        {/* Right: Funnel Breakdown */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-1">功能使用转化漏斗</h3>
            <p className="text-xs text-slate-400 mb-5">各业务链路关键环节留存率</p>

            <div className="space-y-3">
              {metrics.featureUsageFunnel.map((step, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">{step.stage}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">{step.users.toLocaleString()}</span>
                      <span className="font-bold text-blue-600 font-mono">{step.conversion}</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: step.conversion,
                        backgroundColor: FUNNEL_COLORS[idx % FUNNEL_COLORS.length]
                      }}
                    />
                  </div>
                  {idx > 0 && (
                    <div className="text-[10px] text-slate-400 text-right">
                      流失率: <span className="text-rose-500 font-medium">{step.dropRate}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>端到端总转化效率:</span>
            <span className="font-bold text-emerald-600 text-sm">54.3%</span>
          </div>
        </div>
      </div>

      {/* Cohort Retention & AI Health Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Retention Cohort Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-1">留存率热力队列 (Cohort Retention)</h3>
          <p className="text-xs text-slate-400 mb-4">按周维度追踪新加入用户的长期留存曲线</p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-medium">
                  <th className="pb-2 text-left pl-2">入驻批次</th>
                  <th className="pb-2">第1天</th>
                  <th className="pb-2">第3天</th>
                  <th className="pb-2">第7天</th>
                  <th className="pb-2">第14天</th>
                  <th className="pb-2 pr-2">第30天</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-mono">
                {metrics.retentionCohort.map((c, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2.5 text-left pl-2 font-bold text-slate-700 font-sans">{c.period}</td>
                    <td className="py-2.5">
                      <span className="inline-block px-2 py-1 rounded bg-blue-100 text-blue-800 font-bold">{c.day1}%</span>
                    </td>
                    <td className="py-2.5">
                      <span className="inline-block px-2 py-1 rounded bg-blue-50 text-blue-700 font-bold">{c.day3}%</span>
                    </td>
                    <td className="py-2.5">
                      <span className="inline-block px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-bold">{c.day7}%</span>
                    </td>
                    <td className="py-2.5">
                      <span className="inline-block px-2 py-1 rounded bg-indigo-50 text-indigo-700">{c.day14}%</span>
                    </td>
                    <td className="py-2.5 pr-2">
                      <span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-700">{c.day30}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Performance & Health Check */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800 mb-1">AI 引擎运行健康度</h3>
            <p className="text-xs text-slate-400 mb-4">大模型意图解析与自动化任务采纳度量</p>

            <div className="space-y-4">
              {metrics.aiPerformance.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">{item.metric}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800">{item.score}%</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600">
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${item.score >= 95 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2 text-xs text-slate-600">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <span>智能归因系统评定：该产品目前各项核心业务与工程性能指标运行平稳，无异常告警。</span>
          </div>
        </div>
      </div>
    </div>
  );
}
