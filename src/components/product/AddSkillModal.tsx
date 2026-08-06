import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { ProductSkill } from '../../data/mockProducts';
import { Lightning, CheckCircle } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogBody,
  Button,
  Input,
  Textarea,
  Badge,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui';

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader
          title="关联新 AI Skill 技能"
          description={`为【${currentProduct?.name}】挂载专属自动化 Agent 智能体`}
        />

        <DialogBody>
          {/* Mode Selector */}
          <div className="flex items-center gap-2 mb-5 bg-bg-secondary p-1 rounded-[var(--radius-md)] text-sm font-semibold">
            <button
              onClick={() => setMode('preset')}
              className={`flex-1 py-2 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                mode === 'preset' ? 'bg-bg-primary text-accent shadow-shadow-sm font-bold' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              从技能市场精选推荐
            </button>
            <button
              onClick={() => setMode('custom')}
              className={`flex-1 py-2 rounded-[var(--radius-sm)] transition-colors cursor-pointer ${
                mode === 'custom' ? 'bg-bg-primary text-accent shadow-shadow-sm font-bold' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              自定义创建新 Agent Skill
            </button>
          </div>

          {mode === 'preset' ? (
            <div className="space-y-3">
              {PRESET_SKILLS.map((preset, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedPresetIndex(idx)}
                  className={`p-4 rounded-[var(--radius-lg)] border transition-all cursor-pointer ${
                    selectedPresetIndex === idx
                      ? 'bg-accent-subtle border-accent shadow-shadow-sm ring-1 ring-accent/20'
                      : 'bg-bg-primary border-border-subtle hover:border-text-tertiary/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-primary">{preset.name}</span>
                      <Badge variant="neutral">{preset.category}</Badge>
                    </div>
                    {selectedPresetIndex === idx && <CheckCircle size={16} weight="duotone" className="text-accent" />}
                  </div>

                  <p className="text-sm text-text-secondary leading-relaxed mb-2">
                    {preset.description}
                  </p>

                  <div className="text-xs text-text-tertiary flex items-center gap-4">
                    <span>底座: <strong className="text-text-secondary">{preset.config.model}</strong></span>
                    <span>触发模式: <strong className="text-text-secondary">{preset.triggerType}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label="技能名称 *"
                type="text"
                required
                placeholder="例如: 智能需求差异比对 Agent"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary">业务类别</label>
                  <Select value={customCategory} onValueChange={(v) => setCustomCategory(v as ProductSkill['category'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="需求分析">需求分析</SelectItem>
                      <SelectItem value="代码审查">代码审查</SelectItem>
                      <SelectItem value="质量测试">质量测试</SelectItem>
                      <SelectItem value="竞品监控">竞品监控</SelectItem>
                      <SelectItem value="用户运营">用户运营</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-text-primary">底座模型</label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DeepSeek-V3">DeepSeek-V3 (推荐)</SelectItem>
                      <SelectItem value="Gemini 2.5 Pro">Gemini 2.5 Pro</SelectItem>
                      <SelectItem value="Gemini 2.5 Flash">Gemini 2.5 Flash</SelectItem>
                      <SelectItem value="DeepSeek-Coder">DeepSeek-Coder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Textarea
                label="技能职责与执行逻辑简述"
                rows={3}
                placeholder="详细说明该 Agent 在触发时应当调用的上下文、遵循的 SOP 规范与交付产出格式..."
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
              />
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleAttachSkill}>
            立即挂载到产品
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
