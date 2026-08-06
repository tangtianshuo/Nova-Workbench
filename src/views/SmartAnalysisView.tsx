import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Card } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/src/components/ui/Select';

const lineData = [
  { name: 'Mon', completed: 4, added: 2 },
  { name: 'Tue', completed: 6, added: 3 },
  { name: 'Wed', completed: 8, added: 5 },
  { name: 'Thu', completed: 5, added: 4 },
  { name: 'Fri', completed: 9, added: 2 },
  { name: 'Sat', completed: 3, added: 0 },
  { name: 'Sun', completed: 2, added: 1 },
];

const barData = [
  { name: 'UI设计', hours: 45 },
  { name: '前端开发', hours: 80 },
  { name: '后端开发', hours: 65 },
  { name: '测试验证', hours: 35 },
  { name: '需求分析', hours: 25 },
];

const pieData = [
  { name: '进行中', value: 45 },
  { name: '已完成', value: 30 },
  { name: '未开始', value: 15 },
  { name: '已延期', value: 10 },
];

// Apple-style palette aligned with design tokens
const COLORS = ['#0077ED', '#2D9B5A', '#C8CED6', '#E03E3E'];
const GRID_COLOR = '#EDEFF2';
const TICK_COLOR = '#8A919E';

export function SmartAnalysisView() {
  return (
    <div className="space-y-5 h-full overflow-y-auto pb-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Line Chart */}
        <Card className="lg:col-span-2 p-5">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-base font-bold text-text-primary">任务吞吐量趋势</h3>
            <Select defaultValue="week">
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">本周</SelectItem>
                <SelectItem value="last-week">上周</SelectItem>
                <SelectItem value="month">本月</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_COLOR} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: TICK_COLOR }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
                <RechartsTooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.04)', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="completed" name="已完成" stroke="#0077ED" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: '#0077ED' }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="added" name="新增" stroke="#C8CED6" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: '#C8CED6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Pie Chart */}
        <Card className="p-5 flex flex-col">
          <h3 className="text-base font-bold text-text-primary mb-5">任务状态分布</h3>
          <div className="flex-1 flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.06)', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
              <span className="text-2xl font-bold text-text-primary">124</span>
              <span className="text-[11px] text-text-tertiary">总任务数</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {pieData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx] }} />
                <span className="text-xs text-text-secondary">{item.name}</span>
                <span className="text-xs font-semibold text-text-primary ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bar Chart */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-text-primary mb-5">工时消耗统计 (部门)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 5, right: 0, bottom: 5, left: 0 }} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_COLOR} />
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
              <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: TICK_COLOR }} width={80} />
              <RechartsTooltip
                cursor={{ fill: 'hsl(220, 14%, 97%)' }}
                contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 12px rgb(0 0 0 / 0.06)', fontSize: 12 }}
              />
              <Bar dataKey="hours" name="消耗工时" fill="#7B61FF" radius={[0, 6, 6, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
