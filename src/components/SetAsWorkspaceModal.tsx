import { useState } from 'react';
import { X, FolderPlus, Link2, PlusCircle, CheckCircle2, Folder, Calendar, Layers } from 'lucide-react';
import { useApp, Workspace, WorkspaceFile } from '../store/AppContext';

interface SetAsWorkspaceModalProps {
  initialFolder: string;
  suggestedName?: string;
  filesInFolder?: WorkspaceFile[];
  onClose: () => void;
  onSuccess: (workspace: Workspace) => void;
}

export function SetAsWorkspaceModal({
  initialFolder,
  suggestedName,
  filesInFolder = [],
  onClose,
  onSuccess
}: SetAsWorkspaceModalProps) {
  const { projects, addProject, addWorkspace } = useApp();

  const folderName = initialFolder.split(/[\\/]/).filter(Boolean).pop() || '新建工作区';
  const [workspaceName, setWorkspaceName] = useState(suggestedName || folderName);
  const [folderPath, setFolderPath] = useState(initialFolder);
  
  // 'existing' or 'new'
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  // For existing project association
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');

  // For new project creation
  const [newProjectName, setNewProjectName] = useState(suggestedName || folderName);
  const [newProjectDesc, setNewProjectDesc] = useState(`基于工作区【${workspaceName}】创建的新项目研发与推进任务。`);
  const [newProjectDeadline, setNewProjectDeadline] = useState('2025-10-30');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim() || !folderPath.trim()) return;

    let targetProjectId = '';
    let targetProjectName = '';

    if (mode === 'existing') {
      targetProjectId = selectedProjectId;
      const found = projects.find(p => p.id === selectedProjectId);
      targetProjectName = found ? found.name : '未命名项目';
    } else {
      // Create new project
      const newProjId = `p-${Date.now()}`;
      targetProjectId = newProjId;
      targetProjectName = newProjectName.trim() || workspaceName.trim();
      addProject({
        id: newProjId,
        name: targetProjectName,
        tagline: '本地工作区关联的创新产品工程',
        description: newProjectDesc.trim() || '由本地工作区文件映射初始化的产品档案。',
        category: 'AI 协同 / SaaS',
        stage: '研发中',
        progress: 15,
        status: '按期推进',
        health: 'healthy',
        owner: 'Brandon (产品经理)',
        version: 'v1.0.0',
        deadline: newProjectDeadline,
        positioning: `为团队打造以 ${targetProjectName} 为核心的智能协同流。`,
        team: [
          { name: 'Brandon', role: 'PM', avatar: 'BR', color: 'bg-indigo-600' }
        ],
        targetAudience: ['企业产研团队'],
        coreValues: [
          { title: '本地资产自动化映射', desc: '深度整合本地工程代码与 PRD 资产。', icon: 'Bot' }
        ],
        techStack: ['TypeScript', 'React'],
        featureMatrix: [
          { name: '工作区资产纳管', module: 'Workspace', status: '开发中', priority: 'P0', desc: '本地文件与项目关联' }
        ],
        documents: [
          {
            id: `doc-${Date.now()}`,
            title: `PRD_${targetProjectName.replace(/\s+/g, '_')}_规格说明.docx`,
            category: 'PRD需求',
            version: 'v1.0',
            author: 'Brandon',
            updatedAt: '刚刚',
            wordCount: '2,800 字',
            summary: '工作区关联初始文档。',
            content: `### 1. 项目概况\n${newProjectDesc || targetProjectName}`
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
          { id: `m-${Date.now()}-1`, title: '工作区资产梳理与需求规格确认', date: '2025-06-01', stage: '需求阶段', status: 'in-progress', owner: 'Brandon', deliverables: ['PRD v1.0'] },
          { id: `m-${Date.now()}-2`, title: '核心模块开发与联调', date: '2025-07-15', stage: '开发阶段', status: 'pending', owner: 'Alex', deliverables: ['模块代码'] },
          { id: `m-${Date.now()}-3`, title: '测试验收与正式归档上线', date: newProjectDeadline, stage: '发布阶段', status: 'pending', owner: 'Brandon', deliverables: ['上线报告'] },
        ],
        risksAndBlockers: [],
        metrics: {
          dau: '1.0k',
          dauGrowth: '+0.0%',
          mau: '3.0k',
          mauGrowth: '+0.0%',
          retention7d: '60.0%',
          retentionTrend: '+0.0%',
          featureAdoption: '70.0%',
          conversionRate: '8.0%',
          avgLatency: '200ms',
          csatScore: '4.8 / 5.0',
          trafficTrend: [
            { date: '周一', dau: 700, mau: 3000, apiCalls: 2800 },
            { date: '周日', dau: 1000, mau: 3000, apiCalls: 3600 }
          ],
          featureUsageFunnel: [
            { stage: '首屏访问', users: 1000, conversion: '100%', dropRate: '0%' }
          ],
          retentionCohort: [
            { period: '第 1 周', day1: 80, day3: 70, day7: 60, day14: 50, day30: 40 }
          ],
          aiPerformance: [
            { metric: '意图识别准确率', score: 96.0, target: 95.0, status: '达标' }
          ]
        }
      });
    }

    // Default sample files if folder has none
    const actualFiles: WorkspaceFile[] = filesInFolder.length > 0 ? filesInFolder : [
      {
        id: `f-${Date.now()}-1`,
        name: `${workspaceName}_需求规格书.docx`,
        type: 'doc',
        size: '1.8 MB',
        updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        path: `${folderPath}\\docs\\${workspaceName}_需求规格书.docx`,
        contentSnippet: '工作区核心需求规格与设计目标说明。'
      },
      {
        id: `f-${Date.now()}-2`,
        name: 'architecture_design.pdf',
        type: 'pdf',
        size: '2.4 MB',
        updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        path: `${folderPath}\\architecture_design.pdf`,
        contentSnippet: '系统拓扑架构与数据流图谱。'
      }
    ];

    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name: workspaceName.trim(),
      folderPath: folderPath.trim(),
      projectId: targetProjectId,
      projectName: targetProjectName,
      createdAt: new Date().toISOString().split('T')[0],
      files: actualFiles,
      summary: ''
    };

    addWorkspace(newWs);
    onSuccess(newWs);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <FolderPlus size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">将本地文件夹设为工作区</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                绑定项目总览与进度看板，一键开启 AI 深度归档总结
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Workspace Basic Info */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                工作区名称 <span className="text-rose-500">*</span>
              </label>
              <input 
                type="text"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                placeholder="例如：WenXiBuddy 核心研发工作区"
                className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                本地文件夹路径
              </label>
              <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-mono">
                <Folder size={14} className="text-slate-400 shrink-0" />
                <input 
                  type="text"
                  value={folderPath}
                  onChange={e => setFolderPath(e.target.value)}
                  className="bg-transparent w-full focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Project Association Mode Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              项目关联方式 <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                  mode === 'existing'
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Link2 size={14} /> 关联已有项目 ({projects.length})
              </button>
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                  mode === 'new'
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PlusCircle size={14} /> 创建新项目
              </button>
            </div>
          </div>

          {/* Association Content */}
          {mode === 'existing' ? (
            <div className="space-y-2">
              <label className="block text-xs text-slate-500">选择要关联的项目总览项目：</label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {projects.map(proj => (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedProjectId(proj.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedProjectId === proj.id
                        ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500/20'
                        : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-800">{proj.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                          {proj.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-1">
                        <span>进度: {proj.progress}%</span>
                        {proj.deadline && <span>截止: {proj.deadline}</span>}
                        <span>里程碑: {proj.milestones.length} 个</span>
                      </div>
                    </div>
                    {selectedProjectId === proj.id && (
                      <CheckCircle2 size={18} className="text-blue-600 shrink-0 ml-3" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 p-4 bg-slate-50 border border-slate-100 rounded-xl">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  新项目名称 <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="项目名称..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  项目描述
                </label>
                <textarea 
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  预计截止日期
                </label>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs">
                  <Calendar size={14} className="text-slate-400" />
                  <input 
                    type="date"
                    value={newProjectDeadline}
                    onChange={e => setNewProjectDeadline(e.target.value)}
                    className="bg-transparent w-full focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Files Preview in Folder */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Layers size={14} className="text-blue-500" />
              已检测到该文件夹包含 {filesInFolder.length > 0 ? filesInFolder.length : 2} 个关联文档
            </span>
            <span className="text-[11px] text-slate-400">自动同步至工作区</span>
          </div>

          {/* Footer Action */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <FolderPlus size={14} /> 确认创建工作区
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
