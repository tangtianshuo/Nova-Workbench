import { useState } from 'react';
import { X, FolderPlus, Link2, Layers } from 'lucide-react';
import { useApp, Workspace, WorkspaceFile } from '../store/AppContext';

interface AddWorkspaceModalProps {
  onClose: () => void;
  onSuccess: (workspace: Workspace) => void;
}

export function AddWorkspaceModal({ onClose, onSuccess }: AddWorkspaceModalProps) {
  const { projects, addWorkspace } = useApp();

  const [name, setName] = useState('');
  const [folderPath, setFolderPath] = useState('D:\\Projects\\NewWorkspace');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !folderPath.trim()) return;

    const selectedProj = projects.find(p => p.id === projectId);

    const defaultFiles: WorkspaceFile[] = [
      {
        id: `f-${Date.now()}-1`,
        name: 'README_工作区规范.md',
        type: 'doc',
        size: '12 KB',
        updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        path: `${folderPath}\\README_工作区规范.md`,
        contentSnippet: '工作区初始化文档、代码提交规范与分支管理策略。'
      },
      {
        id: `f-${Date.now()}-2`,
        name: 'architecture_overview.pdf',
        type: 'pdf',
        size: '3.2 MB',
        updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        path: `${folderPath}\\architecture_overview.pdf`,
        contentSnippet: '系统架构概要与高可用架构拓扑规划。'
      }
    ];

    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name: name.trim(),
      folderPath: folderPath.trim(),
      projectId: selectedProj?.id,
      projectName: selectedProj?.name,
      createdAt: new Date().toISOString().split('T')[0],
      files: defaultFiles,
      summary: ''
    };

    addWorkspace(newWs);
    onSuccess(newWs);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <FolderPlus size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">新建工作区</h2>
              <p className="text-xs text-slate-400 mt-0.5">创建工作区并关联项目总览，实时同步进度与任务</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              工作区名称 <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：WenXiBuddy 跨端组件库工作区"
              className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              本地工作区物理路径 <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text"
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              placeholder="例如：D:\Projects\MobileComponents"
              className="w-full px-3.5 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              关联项目总览中的项目
            </label>
            <div className="relative">
              <select 
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700"
              >
                {projects.map(proj => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name} (当前进度: {proj.progress}%)
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
              <Link2 size={12} /> 关联后可在工作区内直接查看该项目的里程碑与任务负荷
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Layers size={14} className="text-blue-500" />
              将自动初始化并索引工作区内核心文档
            </span>
          </div>

          {/* Footer */}
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
              <FolderPlus size={14} /> 确认创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
