import { useState } from 'react';
import { Product, ProductMilestone, ProductRisk } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import { 
  Flag, 
  CheckCircle2, 
  Clock, 
  CircleDot, 
  AlertTriangle, 
  ShieldCheck, 
  Calendar, 
  User, 
  FileText, 
  Plus, 
  ArrowRight,
  TrendingUp,
  Layers
} from 'lucide-react';

interface Props {
  product: Product;
  onAddMilestone: () => void;
}

export function ProductMilestonesTab({ product, onAddMilestone }: Props) {
  const { updateMilestoneStatus, getProjectTaskCount } = useApp();
  const [activeStageFilter, setActiveStageFilter] = useState<string>('all');

  const taskCount = getProjectTaskCount(product.id);
  const completedCount = product.milestones.filter(m => m.status === 'completed').length;
  const totalMilestones = product.milestones.length;

  const handleToggleStatus = (m: ProductMilestone, idx: number) => {
    const mId = m.id || `m-${idx}`;
    const nextStatus = m.status === 'completed' ? 'in-progress' : m.status === 'in-progress' ? 'pending' : 'completed';
    updateMilestoneStatus(product.id, mId, nextStatus);
  };

  return (
    <div className="space-y-6">
      {/* Top Lifecycle Progress Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">产品全生命周期推进大盘</h3>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                product.status === '按期推进' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {product.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              目标发版时间: <span className="font-mono text-slate-700 font-bold">{product.deadline || '2025-06-30'}</span> · 当前已完成 {completedCount}/{totalMilestones} 个核心里程碑
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-slate-400">总体推进度</div>
              <div className="text-2xl font-black text-blue-600 font-mono">{product.progress}%</div>
            </div>
            <button
              onClick={onAddMilestone}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={14} />
              <span>新建里程碑</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700"
            style={{ width: `${product.progress}%` }}
          />
        </div>

        {/* Milestone Steps Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6 pt-6 border-t border-slate-100 text-xs">
          {product.milestones.map((m, idx) => {
            const isDone = m.status === 'completed';
            const isCurrent = m.status === 'in-progress';

            return (
              <div 
                key={idx} 
                onClick={() => handleToggleStatus(m, idx)}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isDone 
                    ? 'bg-emerald-50/50 border-emerald-200/60' 
                    : isCurrent 
                    ? 'bg-blue-50/50 border-blue-300 shadow-sm ring-1 ring-blue-500/20' 
                    : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-slate-400 font-medium">{m.date}</span>
                  {isDone && <CheckCircle2 size={14} className="text-emerald-600" />}
                  {isCurrent && <Clock size={14} className="text-blue-600 animate-pulse" />}
                  {!isDone && !isCurrent && <CircleDot size={14} className="text-slate-300" />}
                </div>
                <div className="font-bold text-slate-800 line-clamp-1">{m.title}</div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                  <span>{m.stage || '推进中'}</span>
                  <span className="font-medium text-slate-600">{m.owner || product.owner.split(' ')[0]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Milestones Detail Timeline & Risk Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Detailed Timeline */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Flag size={18} className="text-blue-600" />
              <span>关键交付里程碑时间轴</span>
            </h3>
            <span className="text-xs text-slate-400">点击卡片可快速变更推进状态</span>
          </div>

          <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {product.milestones.map((m, idx) => {
              const isDone = m.status === 'completed';
              const isCurrent = m.status === 'in-progress';

              return (
                <div key={idx} className="relative group">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[27px] top-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center transition-all ${
                    isDone 
                      ? 'bg-emerald-600 ring-4 ring-emerald-100' 
                      : isCurrent 
                      ? 'bg-blue-600 ring-4 ring-blue-100' 
                      : 'bg-slate-300'
                  }`} />

                  <div className="bg-slate-50/70 hover:bg-slate-50 p-4 rounded-2xl border border-slate-100 transition-all">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <span className="text-[11px] font-mono text-blue-600 font-bold mr-2">{m.date}</span>
                        <span className="text-xs font-bold text-slate-800">{m.title}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isDone ? 'bg-emerald-50 text-emerald-600' : isCurrent ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isDone ? '已完成' : isCurrent ? '进行中' : '未开始'}
                      </span>
                    </div>

                    {m.description && (
                      <p className="text-xs text-slate-600 mb-3 leading-relaxed">{m.description}</p>
                    )}

                    {m.deliverables && m.deliverables.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 mr-1 flex items-center gap-1">
                          <FileText size={11} /> 交付物:
                        </span>
                        {m.deliverables.map((d, dIdx) => (
                          <span key={dIdx} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] text-slate-700 font-medium">
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Risks & Blockers + Task Kanban Summary */}
        <div className="lg:col-span-5 space-y-6">
          {/* Risks & Blockers */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                <span>风险预警与阻塞项治理</span>
              </h3>
              <span className="text-xs font-bold text-slate-400">
                {product.risksAndBlockers.length} 项记录
              </span>
            </div>

            {product.risksAndBlockers.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                <ShieldCheck size={32} className="text-emerald-500 mx-auto mb-2" />
                <p className="font-medium text-slate-600">当前暂无高危风险与阻塞项</p>
              </div>
            ) : (
              <div className="space-y-3">
                {product.risksAndBlockers.map((risk) => (
                  <div key={risk.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        risk.level === 'high' 
                          ? 'bg-rose-100 text-rose-700' 
                          : risk.level === 'medium' 
                          ? 'bg-amber-100 text-amber-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {risk.level === 'high' ? '高风险' : risk.level === 'medium' ? '中等风险' : '低风险'}
                      </span>
                      <span className={`text-[10px] font-bold ${risk.status === 'resolved' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {risk.status === 'resolved' ? '已化解' : '跟进中'}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-800">{risk.title}</div>
                    
                    <div className="text-[11px] text-slate-500 leading-relaxed">
                      <span className="font-bold text-slate-700">影响分析：</span>{risk.impact}
                    </div>

                    <div className="text-[11px] text-emerald-700 bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                      <span className="font-bold">应对措施：</span>{risk.mitigation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task Linkage Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">关联任务矩阵</span>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs font-bold">
                  {taskCount} 项任务
                </span>
              </div>
              <h4 className="text-base font-bold text-white mb-2">
                需求与研发任务实时双向同步
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                当前产品下的所有 Milestone 节点均已自动映射到任务看板与日历，支持团队成员按优先级敏捷认领与状态推进。
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-700/60 flex items-center justify-between">
              <span className="text-xs text-slate-400">已关联到全局任务中心</span>
              <div className="flex items-center gap-1 text-xs text-blue-400 font-bold">
                <span>看板流转中</span>
                <ArrowRight size={14} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
