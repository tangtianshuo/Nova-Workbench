import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Product } from '../../data/mockProducts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogBody,
  Button,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '../ui';

interface Props {
  onClose: () => void;
}

export function CreateProductModal({ onClose }: Props) {
  const { addProduct } = useApp();
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Product['category']>('AI 协同 / SaaS');
  const [stage, setStage] = useState<Product['stage']>('规划中');
  const [owner, setOwner] = useState('Brandon (产品经理)');
  const [version, setVersion] = useState('v1.0.0');
  const [deadline, setDeadline] = useState('2025-09-30');
  const [positioning, setPositioning] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newProduct: Product = {
      id: `p-${Date.now()}`,
      name: name.trim(),
      tagline: tagline.trim() || '大模型驱动的创新产品系统',
      description: description.trim() || '该产品的详细背景与全生命周期管理记录。',
      category,
      stage,
      status: '按期推进',
      progress: stage === '已发布' ? 100 : stage === '公测灰度' ? 70 : stage === '研发中' ? 40 : 15,
      health: 'healthy',
      owner,
      version: version.trim() || 'v1.0.0',
      deadline,
      positioning: positioning.trim() || `为企业提供专属高效的 ${name} 解决方案。`,
      team: [
        { name: 'Brandon', role: 'Lead PM', avatar: 'BR', color: 'bg-indigo-600' },
        { name: 'Alex', role: 'Tech Lead', avatar: 'AL', color: 'bg-blue-600' }
      ],
      targetAudience: ['互联网与创新型产研团队', '业务决策层与数字化专家'],
      coreValues: [
        { title: '智能化协同流转', desc: '打通需求、架构、任务与代码资产链路。', icon: 'Bot' },
        { title: '全生命周期度量', desc: '实时掌控产品健康度与指标漏斗。', icon: 'LineChart' }
      ],
      techStack: ['React 19', 'TypeScript', 'Tailwind CSS', 'Vite', 'DeepSeek-V3'],
      featureMatrix: [
        { name: '核心能力 MVP', module: 'Core Module', status: '开发中', priority: 'P0', desc: '实现首期核心业务流程与交互闭环。' },
        { name: '数据统计大盘', module: 'Analytics', status: '规划中', priority: 'P1', desc: '业务数据流转与关键漏斗监控。' }
      ],
      documents: [
        {
          id: `doc-${Date.now()}`,
          title: `PRD_${name.replace(/\s+/g, '_')}_需求规格说明书_v1.0.docx`,
          category: 'PRD需求',
          version: 'v1.0',
          author: owner,
          updatedAt: '刚刚',
          wordCount: '4,500 字',
          summary: '初步定义了业务目标、用户故事与首期交付边界。',
          content: `### 1. 项目背景\n${description || name}\n\n### 2. 目标受众与定位\n${positioning || '面向企业核心产研团队'}`
        }
      ],
      associatedSkills: [
        {
          id: `sk-${Date.now()}`,
          name: 'PRD 智能扩写与规范校验 Agent',
          code: 'skill-prd-synthesizer',
          category: '需求分析',
          description: '自动对齐标准模板，智能检测业务逻辑漏洞与异常分支。',
          triggerType: '按需调用',
          invocations: 0,
          successRate: '100%',
          avgRuntime: '1.2s',
          lastInvoked: '尚未调用',
          status: 'active',
          config: { model: 'DeepSeek-V3', temperature: 0.3, autoSyncWorkspace: true }
        }
      ],
      milestones: [
        { id: `m-${Date.now()}-1`, title: '需求调研与立项评审', date: '2025-06-01', stage: '需求阶段', status: 'completed', owner: 'Brandon', deliverables: ['PRD v1.0'] },
        { id: `m-${Date.now()}-2`, title: '原型设计与技术预研', date: '2025-07-01', stage: '设计阶段', status: 'in-progress', owner: 'Alex', deliverables: ['交互原型', '架构设计'] },
        { id: `m-${Date.now()}-3`, title: '首期 MVP 上线公测', date: deadline, stage: '发布阶段', status: 'pending', owner: 'Brandon', deliverables: ['Release Note'] }
      ],
      risksAndBlockers: [],
      metrics: {
        dau: '1.2k',
        dauGrowth: '+0.0%',
        mau: '4.5k',
        mauGrowth: '+0.0%',
        retention7d: '62.0%',
        retentionTrend: '+0.0%',
        featureAdoption: '75.0%',
        conversionRate: '8.5%',
        avgLatency: '210ms',
        csatScore: '4.8 / 5.0',
        trafficTrend: [
          { date: '周一', dau: 800, mau: 4000, apiCalls: 3200 },
          { date: '周二', dau: 920, mau: 4100, apiCalls: 3600 },
          { date: '周三', dau: 1050, mau: 4200, apiCalls: 4100 },
          { date: '周四', dau: 1100, mau: 4300, apiCalls: 4300 },
          { date: '周五', dau: 1200, mau: 4500, apiCalls: 4800 },
          { date: '周六', dau: 650, mau: 4500, apiCalls: 2100 },
          { date: '周日', dau: 700, mau: 4500, apiCalls: 2400 }
        ],
        featureUsageFunnel: [
          { stage: '首屏访问', users: 1200, conversion: '100%', dropRate: '0%' },
          { stage: '功能体验', users: 960, conversion: '80.0%', dropRate: '20.0%' },
          { stage: '核心交互', users: 780, conversion: '65.0%', dropRate: '15.0%' }
        ],
        retentionCohort: [
          { period: '第 1 周', day1: 80, day3: 70, day7: 62, day14: 55, day30: 45 }
        ],
        aiPerformance: [
          { metric: '意图识别准确率', score: 96.5, target: 95.0, status: '达标' }
        ]
      }
    };

    addProduct(newProduct);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader
          title="创建新产品 / 项目"
          description="开启产品全生命周期管理、PRD文档与智能Agent联动"
        />

        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="产品名称 *"
                type="text"
                required
                placeholder="例如: SmartVision 视觉问答系统"
                value={name}
                onChange={e => setName(e.target.value)}
              />

              <Input
                label="一句话定位 (Tagline)"
                type="text"
                placeholder="例如: 下一代基于多模态大模型的视觉理解工具"
                value={tagline}
                onChange={e => setTagline(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-primary">产品类别</label>
                <Select value={category} onValueChange={(v) => setCategory(v as Product['category'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AI 协同 / SaaS">AI 协同 / SaaS</SelectItem>
                    <SelectItem value="移动端应用">移动端应用</SelectItem>
                    <SelectItem value="品牌数字资产">品牌数字资产</SelectItem>
                    <SelectItem value="数据中台">数据中台</SelectItem>
                    <SelectItem value="智能硬件">智能硬件</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-text-primary">生命周期阶段</label>
                <Select value={stage} onValueChange={(v) => setStage(v as Product['stage'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="规划中">规划中 (Planning)</SelectItem>
                    <SelectItem value="研发中">研发中 (In Development)</SelectItem>
                    <SelectItem value="公测灰度">公测灰度 (Beta)</SelectItem>
                    <SelectItem value="商业化运营">商业化运营 (Commercial)</SelectItem>
                    <SelectItem value="已发布">已发布 (Released)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Input
                label="版本规划"
                type="text"
                placeholder="v1.0.0"
                value={version}
                onChange={e => setVersion(e.target.value)}
                className="font-mono"
              />
            </div>

            <Textarea
              label="核心价值与定位简述"
              rows={2}
              placeholder="简述该产品的核心用户场景、解决的关键痛点与商业价值..."
              value={positioning}
              onChange={e => setPositioning(e.target.value)}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="主负责人"
                type="text"
                value={owner}
                onChange={e => setOwner(e.target.value)}
              />

              <Input
                label="目标上线/交付时间"
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" variant="primary">
                立即创建产品
              </Button>
            </DialogFooter>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
