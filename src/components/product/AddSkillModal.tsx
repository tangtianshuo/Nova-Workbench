import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { ProductSkill } from '../../data/mockProducts';
import { X, Zap, CheckCircle2, Cpu, Plus, Sparkles, Sliders } from 'lucide-react';

interface Props {
  productId: string;
  onClose: () => void;
}

const PRESET_SKILLS: Array<Omit<ProductSkill, 'id' | 'invocations' | 'successRate' | 'avgRuntime' | 'lastInvoked' | 'status'>> = [
  {
    name: '用户工单与负面反馈聚类 Agent',
    code: 'skill-feedback-classifier',
    category: '用户运营',
    description: '自动对全网用户工单和应用商店差评进行语义聚类，提取高频体验缺陷与 PM 改进项。',
    triggerType: '定时巡检',
    config: { model: 'Gemini 2.5 Flash', temperature: 0.3, autoSyncWorkspace: true },
    sampleResult: {
      title: '本周用户反馈聚类分析',
      time: '刚刚',
      summary: '累计分析 128 条用户工单，提炼出 3 项核心卡点。',
      details: [
        '【体验卡点】42% 用户反馈希望增加深色模式与快捷键支持',
        '【性能卡点】弱网环境下部分图片资源加载偏慢',
        '【建议】已自动生成 2 项 P1 级优化任务建议'
      ]
    }
  },
  {
    name: '全链路性能与慢 API 巡检助手',
    code: 'skill-perf-watcher',
    category: '质量测试',
    description: '持续监测生产与测试环境的 API 响应时延分布，自动下钻定位耗时瓶颈与死锁隐患。',
    triggerType: '自动触发',
    config: { model: 'DeepSeek-Coder', temperature: 0.1, autoSyncWorkspace: false }
  },
  {
    name: '国际化多语言翻译与地道化润色 Skill',
    code: 'skill-i18n-localizer',
    category: '需求分析',
    description: '针对产品文案、按钮标签与 PRD 术语进行中英日韩西等多语言高质量地道化对齐。',
    triggerType: '按需调用',
    config: { model: 'DeepSeek-V3', temperature: 0.4, autoSyncWorkspace: true }
  }
];

export function AddSkillModal({ productId, onClose }: Props) {
  const { updateProduct, products } = useApp();
  const currentProduct = products.find(p => p.id === productId);

  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customCategory, setCustomCategory] = useState<ProductSkill['category']>('需求分析');
  const [model, setModel] = useState('DeepSeek-V3');
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');

  const handleAttachSkill = () => {
    if (!currentProduct) return;

    let newSkill: ProductSkill;

    if (mode === 'preset') {
      const preset = PRESET_SKILLS[selectedPresetIndex];
      newSkill = {
        id: `sk-${Date.now()}`,
        ...preset,
        invocations: 0,
        successRate: '100%',
        avgRuntime: '1.2s',
        lastInvoked: '尚未调用',
        status: 'active'
      };
    } else {
      if (!customName.trim()) return;
      newSkill = {
        id: `sk-${Date.now()}`,
        name: customName.trim(),
        code: `skill-${customName.toLowerCase().replace(/[\s\W]+/g, '-')}`,
        category: customCategory,
        description: customDesc.trim() || '自定义大模型 Agent 赋能技能。',
        triggerType: '按需调用',
        invocations: 0,
        successRate: '100%',
        avgRuntime: '1.0s',
        lastInvoked: '尚未调用',
        status: 'active',
        config: { model, temperature: 0.3, autoSyncWorkspace: true }
      };
    }

    updateProduct(productId, {
      associatedSkills: [...currentProduct.associatedSkills, newSkill]
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">关联新 AI Skill 技能</h2>
              <p className="text-xs text-slate-400">为【{currentProduct?.name}】挂载专属自动化 Agent 智能体</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-2 mb-5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setMode('preset')}
            className={`flex-1 py-2 rounded-lg transition-colors ${
              mode === 'preset' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            从技能市场精选推荐
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 py-2 rounded-lg transition-colors ${
              mode === 'custom' ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            自定义创建新 Agent Skill
          </button>
        </div>

        {mode === 'preset' ? (
          <div className="space-y-3 mb-6">
            {PRESET_SKILLS.map((preset, idx) => (
              <div
                key={idx}
                onClick={() => setSelectedPresetIndex(idx)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  selectedPresetIndex === idx
                    ? 'bg-blue-50/50 border-blue-500 shadow-sm ring-1 ring-blue-500/20'
                    : 'bg-white border-slate-100 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">{preset.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      {preset.category}
                    </span>
                  </div>
                  {selectedPresetIndex === idx && <CheckCircle2 size={16} className="text-blue-600" />}
                </div>

                <p className="text-xs text-slate-500 leading-relaxed mb-2">
                  {preset.description}
                </p>

                <div className="text-[11px] text-slate-400 flex items-center gap-4">
                  <span>底座: <strong className="text-slate-700">{preset.config.model}</strong></span>
                  <span>触发模式: <strong className="text-slate-700">{preset.triggerType}</strong></span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 text-xs mb-6">
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">技能名称 *</label>
              <input
                type="text"
                required
                placeholder="例如: 智能需求差异比对 Agent"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">业务类别</label>
                <select
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="需求分析">需求分析</option>
                  <option value="代码审查">代码审查</option>
                  <option value="质量测试">质量测试</option>
                  <option value="竞品监控">竞品监控</option>
                  <option value="用户运营">用户运营</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">底座模型</label>
                <select
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="DeepSeek-V3">DeepSeek-V3 (推荐)</option>
                  <option value="Gemini 2.5 Pro">Gemini 2.5 Pro</option>
                  <option value="Gemini 2.5 Flash">Gemini 2.5 Flash</option>
                  <option value="DeepSeek-Coder">DeepSeek-Coder</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1.5">技能职责与执行逻辑简述</label>
              <textarea
                rows={3}
                placeholder="详细说明该 Agent 在触发时应当调用的上下文、遵循的 SOP 规范与交付产出格式..."
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium text-xs"
          >
            取消
          </button>
          <button
            onClick={handleAttachSkill}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm text-xs"
          >
            立即挂载到产品
          </button>
        </div>
      </div>
    </div>
  );
}
