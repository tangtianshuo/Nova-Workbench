import { useState, useEffect } from 'react';
import { X, Sparkles, Folder, File, Loader2 } from 'lucide-react';
import { useApp, Project } from '../store/AppContext';
import { Task } from '../data/mockTasks';

interface ProjectCreateModalProps {
  onClose: () => void;
}

export function ProjectCreateModal({ onClose }: ProjectCreateModalProps) {
  const { addProject, addTask, categories, addCategory } = useApp();
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetch('/api/workspace-files')
      .then(res => res.json())
      .then(data => setFiles(data))
      .catch(err => console.error(err));
  }, []);

  const toggleFile = (id: string) => {
    setSelectedFileIds(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);

    const filesContext = selectedFileIds.map(id => {
      const f = files.find(f => f.id === id);
      return f ? `- ${f.name} (type: ${f.type})` : '';
    }).join('\\n');

    try {
      const response = await fetch('/api/generate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, filesContext })
      });
      const data = await response.json();
      
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
          { name: 'Brandon', role: 'Lead PM', avatar: 'BR', color: 'bg-indigo-600' },
          { name: 'Alex', role: 'Tech Lead', avatar: 'AL', color: 'bg-blue-600' }
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

      // Add a specific category for this project if we want, or use first one
      addCategory(newProject.name, 'bg-indigo-500');
      
      // We need to wait for state to update, or just find it.
      // But addCategory works asynchronously. It's better to just put them in the first category for simplicity or create a unique category ID.
      // Let's create a category object immediately if we were mutating, but we only have addTask which takes a string ID.
      // Actually we can just pass the category name as we don't have its ID yet, but addTask needs ID.
      // For now, we'll just put them in categories[0].
      
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
        // Add to the first category by default
        addTask(newTask, categories[0]?.id);
      });

      onClose();
    } catch (error) {
      console.error(error);
      alert('项目生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Sparkles size={20} className="text-blue-500" />
            AI 智能创建项目
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">项目需求描述</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：开发一个面向企业的内部知识库系统，包含文档编辑、权限控制和全文搜索功能..."
                className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Folder size={16} className="text-slate-400" />
                关联本地工作区文件作为上下文
              </label>
              <div className="grid grid-cols-2 gap-3">
                {files.map(f => (
                  <div 
                    key={f.id} 
                    onClick={() => toggleFile(f.id)}
                    className={`p-3 rounded-xl border cursor-pointer flex items-center gap-3 transition-colors ${selectedFileIds.includes(f.id) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <File size={16} className={selectedFileIds.includes(f.id) ? 'text-blue-500' : 'text-slate-400'} />
                    <span className={`text-sm ${selectedFileIds.includes(f.id) ? 'font-medium text-blue-700' : 'text-slate-600'}`}>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            取消
          </button>
          <button 
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {isGenerating ? (
              <><Loader2 size={16} className="animate-spin" /> 生成中...</>
            ) : (
              <><Sparkles size={16} /> 生成项目计划</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
