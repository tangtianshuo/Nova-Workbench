import { useState } from 'react';
import { Product } from '../../data/mockProducts';
import { 
  Target, 
  Users, 
  Layers, 
  Code2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  FileText, 
  LineChart,
  Bot,
  Plus,
  ArrowRight
} from 'lucide-react';

interface Props {
  product: Product;
  onNavigateToRnd?: (productId: string) => void;
}

export function ProductOverviewTab({ product, onNavigateToRnd }: Props) {
  const [filterModule, setFilterModule] = useState<string>('all');

  const modules = ['all', ...Array.from(new Set(product.featureMatrix.map(f => f.module)))];

  const filteredFeatures = filterModule === 'all' 
    ? product.featureMatrix 
    : product.featureMatrix.filter(f => f.module === filterModule);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Bot': return <Bot className="w-5 h-5 text-blue-600" />;
      case 'FileText': return <FileText className="w-5 h-5 text-indigo-600" />;
      case 'Zap': return <Zap className="w-5 h-5 text-amber-500" />;
      case 'LineChart': return <LineChart className="w-5 h-5 text-emerald-600" />;
      default: return <Sparkles className="w-5 h-5 text-blue-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* R&D Center Linkage Banner */}
      <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 rounded-2xl p-4 border border-indigo-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-sm shrink-0">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-indigo-950 flex items-center gap-2">
              <span>【产品研发中心】AI 成果物工坊已就绪</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-200/60 text-indigo-800">
                18 份交付物 · 原型 · 代码 · 测试
              </span>
            </div>
            <p className="text-[11px] text-indigo-700 mt-0.5">
              本页面用于总览和管控【{product.name}】；若需 AI 自动化推导与生成 PRD、原型、脚手架或测试集，可直接前往研发中心。
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateToRnd?.(product.id)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm shrink-0 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <span>进入研发中心</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Product Positioning & Target Audience */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Positioning */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Target className="w-5 h-5" />
            </div>
            <span>产品核心定位与愿景</span>
          </div>
          <p className="text-slate-700 leading-relaxed text-sm bg-slate-50/80 p-4 rounded-xl border border-slate-100">
            {product.positioning}
          </p>
          
          <div className="pt-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              技术架构栈选型
            </div>
            <div className="flex flex-wrap gap-2">
              {product.techStack.map((tech, idx) => (
                <span 
                  key={idx} 
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/60 flex items-center gap-1.5"
                >
                  <Code2 size={13} className="text-slate-400" />
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Target Audience & Team */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-800 font-bold text-base mb-3">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <Users className="w-5 h-5" />
              </div>
              <span>目标用户画像</span>
            </div>
            <div className="space-y-2">
              {product.targetAudience.map((audience, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-600 bg-indigo-50/40 p-2.5 rounded-xl border border-indigo-100/40">
                  <ShieldCheck size={15} className="text-indigo-600 shrink-0 mt-0.5" />
                  <span>{audience}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              产研负责人团队
            </div>
            <div className="flex items-center gap-3">
              {product.team.map((member, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                  <div className={`w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold ${member.color || 'bg-blue-600'}`}>
                    {member.avatar}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">{member.name}</div>
                    <div className="text-[10px] text-slate-400">{member.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Core Value Proposition Cards */}
      <div>
        <div className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <span>核心价值主张 (Core Value Propositions)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {product.coreValues.map((val, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-blue-200 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                {getIcon(val.icon)}
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1.5">{val.title}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{val.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Matrix */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Layers size={18} className="text-blue-600" />
              <span>核心功能特性矩阵 (Feature Matrix)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">全量模块功能交付状态与优先级追踪</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">模块筛选:</span>
            <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-100 text-xs">
              {modules.map((mod) => (
                <button
                  key={mod}
                  onClick={() => setFilterModule(mod)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    filterModule === mod
                      ? 'bg-white text-blue-600 shadow-sm font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {mod === 'all' ? '全部模块' : mod}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="pb-3 pl-2">功能名称</th>
                <th className="pb-3">所属模块</th>
                <th className="pb-3">优先级</th>
                <th className="pb-3">交付状态</th>
                <th className="pb-3 pr-2">功能简述</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredFeatures.map((f, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 pl-2 font-bold text-slate-800">{f.name}</td>
                  <td className="py-3.5">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                      {f.module}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      f.priority === 'P0' 
                        ? 'bg-rose-50 text-rose-600' 
                        : f.priority === 'P1' 
                        ? 'bg-amber-50 text-amber-600' 
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {f.priority}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium ${
                      f.status === '已上线'
                        ? 'bg-emerald-50 text-emerald-600'
                        : f.status === '开发中'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {f.status === '已上线' && <CheckCircle2 size={12} />}
                      {f.status === '开发中' && <Clock size={12} />}
                      {f.status === '规划中' && <AlertCircle size={12} />}
                      {f.status}
                    </span>
                  </td>
                  <td className="py-3.5 pr-2 text-slate-600 max-w-md">{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
