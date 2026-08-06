import { useState } from 'react';
import { Product, ProductSkill } from '../../data/mockProducts';
import { useApp } from '../../store/AppContext';
import { 
  Zap, 
  Play, 
  CheckCircle2, 
  Settings2, 
  Plus, 
  Cpu, 
  Clock, 
  Activity, 
  Layers, 
  Sparkles, 
  ChevronRight, 
  RotateCw,
  Sliders,
  Check,
  X,
  Code2
} from 'lucide-react';

interface Props {
  product: Product;
  onAddSkill: () => void;
}

export function ProductSkillsTab({ product, onAddSkill }: Props) {
  const { toggleSkillStatus, runProductSkill } = useApp();
  const [runningSkillId, setRunningSkillId] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<{
    skillName: string;
    title: string;
    time: string;
    summary: string;
    details: string[];
  } | null>(null);

  const handleRunSkill = async (skill: ProductSkill) => {
    setRunningSkillId(skill.id);
    try {
      await runProductSkill(product.id, skill.id);
      if (skill.sampleResult) {
        setSelectedResult({
          skillName: skill.name,
          ...skill.sampleResult
        });
      } else {
        setSelectedResult({
          skillName: skill.name,
          title: `${skill.name} 执行完成`,
          time: new Date().toLocaleTimeString(),
          summary: `已成功对【${product.name}】全量工作区资产完成自动化分析与扫描。`,
          details: [
            '已扫描产品 PRD 需求文档与接口定义',
            '合规度与完整性评估得分 98.2 分',
            '自动化建议与优化报告已同步至本地工作区'
          ]
        });
      }
    } finally {
      setRunningSkillId(null);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case '需求分析': return 'bg-blue-50 text-blue-700 border-blue-200';
      case '代码审查': return 'bg-purple-50 text-purple-700 border-purple-200';
      case '质量测试': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case '竞品监控': return 'bg-amber-50 text-amber-700 border-amber-200';
      case '用户运营': return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-lg bg-white/20 backdrop-blur-sm">
              <Zap size={16} />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-blue-100">
              AI Skill & Multi-Agent 赋能矩阵
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            当前产品已挂载 {product.associatedSkills.length} 项专属智能 Agent 技能
          </h2>
          <p className="text-xs text-blue-100/90 mt-1 max-w-2xl">
            智能 Skill 能够深度联动当前产品下的 PRD 文档、接口规范、本地代码工程与历史指标，实现需求自检、用例自动生成与质量巡检。
          </p>
        </div>

        <button
          onClick={onAddSkill}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors shadow-sm shrink-0 self-start md:self-auto"
        >
          <Plus size={16} />
          <span>关联新 Skill</span>
        </button>
      </div>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {product.associatedSkills.map((skill) => {
          const isRunning = runningSkillId === skill.id || skill.status === 'running';

          return (
            <div
              key={skill.id}
              className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:border-blue-200 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                      <Zap size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">{skill.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryColor(skill.category)}`}>
                          {skill.category}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 font-medium">
                        {skill.code}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      skill.status === 'active' 
                        ? 'bg-emerald-50 text-emerald-600' 
                        : isRunning 
                        ? 'bg-blue-50 text-blue-600 animate-pulse'
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        skill.status === 'active' ? 'bg-emerald-500' : isRunning ? 'bg-blue-500' : 'bg-slate-400'
                      }`} />
                      {isRunning ? '正在运行' : skill.status === 'active' ? '已就绪' : '已暂停'}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-600 leading-relaxed mb-4">
                  {skill.description}
                </p>

                {/* Meta details */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100/80 mb-4 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">调用总数</div>
                    <div className="text-xs font-bold text-slate-800 font-mono mt-0.5">{skill.invocations} 次</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">成功率</div>
                    <div className="text-xs font-bold text-emerald-600 font-mono mt-0.5">{skill.successRate}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">平均耗时</div>
                    <div className="text-xs font-bold text-slate-800 font-mono mt-0.5">{skill.avgRuntime}</div>
                  </div>
                </div>

                {/* Model & Config Pill */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 mb-4">
                  <span className="flex items-center gap-1">
                    <Cpu size={12} className="text-indigo-500" />
                    底座模型: <span className="font-semibold text-slate-700">{skill.config.model}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    最近调用: {skill.lastInvoked}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => toggleSkillStatus(product.id, skill.id)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors font-medium"
                >
                  {skill.status === 'active' ? '暂停技能' : '恢复启用'}
                </button>

                <div className="flex items-center gap-2">
                  {skill.sampleResult && (
                    <button
                      onClick={() => setSelectedResult({ skillName: skill.name, ...skill.sampleResult! })}
                      className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-xl transition-colors font-medium border border-blue-200"
                    >
                      查看报告
                    </button>
                  )}

                  <button
                    onClick={() => handleRunSkill(skill)}
                    disabled={isRunning}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      isRunning
                        ? 'bg-blue-100 text-blue-600 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <RotateCw size={14} className="animate-spin" />
                        <span>正在执行...</span>
                      </>
                    ) : (
                      <>
                        <Play size={14} className="fill-current" />
                        <span>立即执行</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Output / Diagnostic Result Modal */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">{selectedResult.title}</h3>
                  <p className="text-xs text-slate-400">由 【{selectedResult.skillName}】 生成 · {selectedResult.time}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedResult(null)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="py-5 space-y-4 text-xs text-slate-700">
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100/80 text-slate-700 leading-relaxed font-medium">
                {selectedResult.summary}
              </div>

              <div>
                <div className="font-bold text-slate-800 text-xs mb-2">执行诊断细节与建议清单：</div>
                <div className="space-y-2">
                  {selectedResult.details.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setSelectedResult(null)}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors"
              >
                确认并关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
