import { useState, useEffect } from 'react';
import { Sparkle, Folder, FileText, ArrowsClockwise, Stop } from '@phosphor-icons/react';
import { useApp, Project } from '../store/AppContext';
import { Task } from '../data/mockTasks';
import { Dialog, DialogContent, DialogHeader, DialogFooter } from '@/src/components/ui/Dialog';
import { Button } from '@/src/components/ui/Button';
import { Textarea } from '@/src/components/ui/Input';
import { useToast } from '@/src/components/ui/Toast';
import { streamGenerateProject, type GenerateProjectResult } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';

interface ProjectCreateModalProps {
  onClose: () => void;
}

export function ProjectCreateModal({ onClose }: ProjectCreateModalProps) {
  const { addProject, addTask, categories, addCategory } = useApp();
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/workspace-files')
      .then(res => res.json())
      .then(data => setFiles(data))
      .catch(err => console.error(err));
  }, []);

  // Pitfall 5: abort in-flight stream when modal closes/unmounts
  useEffect(() => {
    return () => {
      abortController?.abort();
    };
  }, [abortController]);

  const toggleFile = (id: string) => {
    setSelectedFileIds(prev =>
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setStreamedText('');

    const filesContext = selectedFileIds.map(id => {
      const f = files.find(f => f.id === id);
      return f ? `- ${f.name} (type: ${f.type})` : '';
    }).join('\n');

    const controller = new AbortController();
    setAbortController(controller);

    let data: any;
    try {
      const result: GenerateProjectResult = await streamGenerateProject(
        prompt,
        filesContext,
        (token) => setStreamedText(prev => prev + token),
        controller.signal,
      );

      // Parse result.content as JSON; fall back to raw text as projectDescription
      try {
        data = JSON.parse(result.content);
      } catch {
        data = {
          projectName: 'AI 协同产品工程',
          projectDescription: result.content,
          milestones: [],
          tasks: [],
        };
      }

      const newProject: Project = {
        id: `p-${Date.now()}`,
        name: data.projectName || 'AI 协同产品工程',
        tagline: '智能大模型驱动的创新产品系统',
        description: data.projectDescription || '由 AI 辅助分析自动生成的产品工程与生命周期档案。',
        category: 'AI 协同 / SaaS',
        stage: '规划中',
        progress: 10,
        status: '按期推进',
        health: 'healthy',
        owner: 'Brandon (产品经理)',
        version: 'v1.0.0',
        deadline: data.milestones?.[data.milestones.length - 1]?.date || '2025-12-31',
        positioning: `为团队提供高效的 ${data.projectName} 解决方案。`,
        team: [
          { name: 'Brandon', role: 'Lead PM', avatar: 'BR', color: 'bg-accent' },
          { name: 'Alex', role: 'Tech Lead', avatar: 'AL', color: 'bg-blue-500' }
        ],
        targetAudience: ['企业产研团队', '业务专家'],
        coreValues: [
          { title: '智能化协同流转', desc: '打通需求、架构、任务与代码资产链路。', icon: 'Bot' }
        ],
        techStack: ['React 19', 'TypeScript', 'Tailwind CSS'],
        featureMatrix: [
          { name: '首期 MVP 核心功能', module: 'Core', status: '开发中', priority: 'P0', desc: '实现首期核心业务闭环' }
        ],
        documents: [
          {
            id: `doc-${Date.now()}`,
            title: `PRD_${(data.projectName || 'Project').replace(/\s+/g, '_')}_规格说明书.docx`,
            category: 'PRD需求',
            version: 'v1.0',
            author: 'AI Assistant',
            updatedAt: '刚刚',
            wordCount: '3,200 字',
            summary: data.projectDescription || '自动生成的产品需求说明书。',
            content: `### 1. 项目背景\n${data.projectDescription || ''}\n\n### 2. 目标规划\n交付高质量业务模块。`
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
        milestones: data.milestones?.map((m: any, idx: number) => ({
          id: `m-${Date.now()}-${idx}`,
          title: m.title || `阶段 ${idx + 1}`,
          date: m.date || '2025-06-30',
          stage: '规划阶段',
          status: idx === 0 ? 'in-progress' : 'pending',
          owner: 'Brandon',
          deliverables: ['交付物文档'],
          description: '自动生成的里程碑节点。'
        })) || [],
        risksAndBlockers: [],
        metrics: {
          dau: '1.0k',
          dauGrowth: '+0.0%',
          mau: '3.5k',
          mauGrowth: '+0.0%',
          retention7d: '60.0%',
          retentionTrend: '+0.0%',
          featureAdoption: '70.0%',
          conversionRate: '8.0%',
          avgLatency: '200ms',
          csatScore: '4.8 / 5.0',
          trafficTrend: [
            { date: '周一', dau: 800, mau: 3500, apiCalls: 3000 },
            { date: '周日', dau: 1000, mau: 3500, apiCalls: 3800 }
          ],
          featureUsageFunnel: [
            { stage: '首屏访问', users: 1000, conversion: '100%', dropRate: '0%' },
            { stage: '核心交互', users: 700, conversion: '70%', dropRate: '30%' }
          ],
          retentionCohort: [
            { period: '第 1 周', day1: 80, day3: 70, day7: 60, day14: 50, day30: 40 }
          ],
          aiPerformance: [
            { metric: '意图识别准确率', score: 96.0, target: 95.0, status: '达标' }
          ]
        }
      };

      addProject(newProject);

      addCategory(newProject.name, 'bg-accent');

      data.tasks?.forEach((task: any, index: number) => {
        const newTask: Task = {
          id: `t-gen-${Date.now()}-${index}`,
          title: task.title,
          description: task.description,
          priority: task.priority as 'high' | 'medium' | 'low',
          status: '待处理',
          deadline: task.deadline,
          project: data.projectName,
          assignee: 'AI Assistant',
          assigneeAvatar: 'AI',
          aiSuggestions: []
        };
        addTask(newTask, categories[0]?.id);
      });

      onClose();
    } catch (error) {
      // D-14: Cancelled is silent (user-initiated). Other errors → toast with humanized message.
      const msg = (error as Error).message ?? String(error);
      if (msg === '已取消' || (error as Error).name === 'AbortError') return;
      toast({
        type: 'error',
        title: '生成失败',
        description: msg,
      });
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleStop = () => {
    abortController?.abort();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader
          title="AI 智能创建项目"
          description="输入需求描述，AI 将自动生成完整的产品规划"
        />

        <div className="flex-1 overflow-y-auto space-y-6 py-2">
          <Textarea
            label="项目需求描述"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：开发一个面向企业的内部知识库系统，包含文档编辑、权限控制和全文搜索功能..."
            rows={5}
            className="resize-none"
          />

          <div className="space-y-3">
            <label className="text-sm font-medium text-text-primary flex items-center gap-2">
              <Folder size={16} weight="duotone" className="text-text-tertiary" />
              关联本地工作区文件作为上下文
            </label>
            <div className="grid grid-cols-2 gap-3">
              {files.map(f => (
                <div
                  key={f.id}
                  onClick={() => toggleFile(f.id)}
                  className={cn(
                    'p-3 rounded-[var(--radius-md)] border cursor-pointer flex items-center gap-3 transition-colors',
                    selectedFileIds.includes(f.id)
                      ? 'border-accent bg-accent/5'
                      : 'border-border-subtle bg-bg-secondary/30 hover:bg-bg-secondary/60'
                  )}
                >
                  <FileText
                    size={16}
                    weight="duotone"
                    className={selectedFileIds.includes(f.id) ? 'text-accent' : 'text-text-tertiary'}
                  />
                  <span className={cn(
                    'text-sm truncate',
                    selectedFileIds.includes(f.id) ? 'font-medium text-accent' : 'text-text-secondary'
                  )}>{f.name}</span>
                </div>
              ))}
            </div>
          </div>

          {streamedText && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Sparkle size={16} weight="duotone" className="text-accent" />
                实时生成预览
              </label>
              <div className="p-3 rounded-[var(--radius-md)] bg-bg-secondary/50 border border-border-subtle max-h-40 overflow-y-auto">
                <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono">
                  {streamedText}
                </pre>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          {isGenerating && (
            <Button variant="danger" onClick={handleStop} className="gap-2">
              <Stop size={16} weight="duotone" /> 停止生成
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="gap-2"
          >
            {isGenerating ? (
              <><ArrowsClockwise size={16} weight="duotone" className="animate-spin" /> 生成中...</>
            ) : (
              <><Sparkle size={16} weight="duotone" /> 生成项目计划</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
