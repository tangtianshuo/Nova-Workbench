import { useState, useMemo } from 'react';
import { 
  Folder, 
  Search, 
  Sparkles, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  Play, 
  FolderPlus, 
  Star, 
  Target, 
  CheckSquare, 
  Layers, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  File as FileIcon, 
  Image as ImageIcon, 
  Archive, 
  Calendar, 
  ArrowRight,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { useApp, Workspace, LocalIndexedFile, WorkspaceFile } from '../store/AppContext';
import { WorkspaceSummaryModal } from '../components/WorkspaceSummaryModal';
import { SetAsWorkspaceModal } from '../components/SetAsWorkspaceModal';
import { AddWorkspaceModal } from '../components/AddWorkspaceModal';

export function FileArchiveView() {
  const { 
    workspaces, 
    projects, 
    localIndexedFiles, 
    setLocalIndexedFiles,
    getProjectTaskCount 
  } = useApp();

  // Active Tab: 'workspaces' | 'local_index'
  const [activeTab, setActiveTab] = useState<'workspaces' | 'local_index'>('workspaces');

  // Workspaces State
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(workspaces[0]?.id || '');
  const [workspaceFileSearch, setWorkspaceFileSearch] = useState('');
  const [workspaceFileTypeFilter, setWorkspaceFileTypeFilter] = useState<string>('all');

  // Modals State
  const [summaryWorkspace, setSummaryWorkspace] = useState<Workspace | null>(null);
  const [showAddWorkspaceModal, setShowAddWorkspaceModal] = useState(false);
  const [setAsWorkspaceData, setSetAsWorkspaceData] = useState<{
    folder: string;
    suggestedName?: string;
    files?: WorkspaceFile[];
  } | null>(null);

  // Local Index State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; icon?: 'success' | 'launch' | 'copy' } | null>(null);

  const showToast = (text: string, icon: 'success' | 'launch' | 'copy' = 'success') => {
    setToastMessage({ text, icon });
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Active Workspace Object
  const currentWorkspace = useMemo(() => {
    return workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0];
  }, [workspaces, selectedWorkspaceId]);

  // Associated Project for Active Workspace
  const associatedProject = useMemo(() => {
    if (!currentWorkspace) return null;
    return projects.find(p => p.id === currentWorkspace.projectId || p.name === currentWorkspace.projectName);
  }, [currentWorkspace, projects]);

  const taskCount = currentWorkspace ? getProjectTaskCount(currentWorkspace.projectId || currentWorkspace.projectName) : 0;
  const projectProgress = associatedProject ? associatedProject.progress : 50;

  // Filtered Workspace Files
  const filteredWorkspaceFiles = useMemo(() => {
    if (!currentWorkspace) return [];
    return currentWorkspace.files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(workspaceFileSearch.toLowerCase()) ||
        (file.contentSnippet && file.contentSnippet.toLowerCase().includes(workspaceFileSearch.toLowerCase()));
      const matchesType = workspaceFileTypeFilter === 'all' || file.type === workspaceFileTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [currentWorkspace, workspaceFileSearch, workspaceFileTypeFilter]);

  // Filtered Local Indexed Files
  const filteredLocalFiles = useMemo(() => {
    return localIndexedFiles.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.folder.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.extension.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.associatedApp.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || file.type === categoryFilter;
      const matchesFav = !showOnlyFavorites || file.isFavorite;

      return matchesSearch && matchesCategory && matchesFav;
    });
  }, [localIndexedFiles, searchQuery, categoryFilter, showOnlyFavorites]);

  // Common Local Folders for Quick Conversion
  const commonFolders = useMemo(() => {
    const map = new Map<string, { folder: string; count: number; files: LocalIndexedFile[] }>();
    localIndexedFiles.forEach(f => {
      const existing = map.get(f.folder);
      if (existing) {
        existing.count += 1;
        existing.files.push(f);
      } else {
        map.set(f.folder, { folder: f.folder, count: 1, files: [f] });
      }
    });
    return Array.from(map.values()).slice(0, 3);
  }, [localIndexedFiles]);

  // Toggle Favorite
  const toggleFavorite = (id: string) => {
    setLocalIndexedFiles(prev => prev.map(f => f.id === id ? { ...f, isFavorite: !f.isFavorite } : f));
  };

  // Launch File Action
  const handleLaunchFile = (file: { name: string; associatedApp?: string }) => {
    const app = file.associatedApp || '系统默认程序';
    showToast(`🚀 已在 ${app} 中快速启动：${file.name}`, 'launch');
  };

  // Locate File Action
  const handleLocateFile = (path: string) => {
    navigator.clipboard.writeText(path);
    showToast(`📍 已定位并复制路径到剪贴板：${path}`, 'copy');
  };

  // Convert File/Folder to Workspace
  const handleConvertToWorkspace = (folder: string, fileName?: string) => {
    const folderFiles = localIndexedFiles.filter(f => f.folder === folder).map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      updatedAt: f.updatedAt,
      path: f.fullPath,
      contentSnippet: `来自本地索引路径 ${f.fullPath}`
    }));

    const suggestedName = fileName ? fileName.replace(/\.[^/.]+$/, "") + " 工作区" : undefined;

    setSetAsWorkspaceData({
      folder,
      suggestedName,
      files: folderFiles
    });
  };

  // Helper for File Icon
  const renderFileIcon = (type: string, size = 18) => {
    switch (type) {
      case 'doc':
      case 'pdf':
        return <FileText size={size} className="text-blue-500" />;
      case 'sheet':
        return <FileSpreadsheet size={size} className="text-emerald-500" />;
      case 'code':
        return <FileCode size={size} className="text-indigo-500" />;
      case 'design':
        return <ImageIcon size={size} className="text-purple-500" />;
      case 'archive':
        return <Archive size={size} className="text-amber-500" />;
      default:
        return <FileIcon size={size} className="text-slate-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl border border-slate-700/50 flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Top Header & Tab Navigation */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('workspaces')}
              className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                activeTab === 'workspaces'
                  ? 'bg-white text-blue-600 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Folder size={15} />
              <span>工作区归档</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-600 font-bold">
                {workspaces.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('local_index')}
              className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                activeTab === 'local_index'
                  ? 'bg-white text-blue-600 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode size={15} />
              <span>本地文件索引</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-bold">
                {localIndexedFiles.length}
              </span>
            </button>
          </div>
        </div>

        {/* Global Action depending on Tab */}
        <div className="flex items-center gap-3">
          {activeTab === 'workspaces' ? (
            <button
              onClick={() => setShowAddWorkspaceModal(true)}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Plus size={15} /> 新建工作区
            </button>
          ) : (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>已建立全局实时索引</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: WORKSPACES VIEW */}
      {/* ======================================================== */}
      {activeTab === 'workspaces' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
          {/* Left Column: Workspaces List */}
          <div className="lg:col-span-4 flex flex-col space-y-3 min-h-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-700">工作区列表 ({workspaces.length})</span>
              <span className="text-[11px] text-slate-400">关联项目总览与进度</span>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {workspaces.map(ws => {
                const isSelected = ws.id === (currentWorkspace?.id);
                const proj = projects.find(p => p.id === ws.projectId || p.name === ws.projectName);
                const wsTaskCount = getProjectTaskCount(ws.projectId || ws.projectName);
                const wsProgress = proj ? proj.progress : 50;

                return (
                  <div
                    key={ws.id}
                    onClick={() => setSelectedWorkspaceId(ws.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white ${
                      isSelected
                        ? 'border-blue-500 shadow-sm ring-2 ring-blue-500/10'
                        : 'border-slate-100 hover:border-slate-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Folder size={18} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-slate-800 truncate">{ws.name}</h3>
                          <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{ws.folderPath}</p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSummaryWorkspace(ws);
                        }}
                        title="AI 智能总结"
                        className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-[11px] font-semibold flex items-center gap-1 transition-colors shrink-0 shadow-2xs"
                      >
                        <Sparkles size={12} /> AI总结
                      </button>
                    </div>

                    {/* Associated Project Info */}
                    <div className="mt-3 pt-3 border-t border-slate-50 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1 text-slate-500 truncate">
                          <Target size={12} className="text-blue-500" />
                          <span className="font-medium text-slate-700 truncate">{proj?.name || ws.projectName || '未关联项目'}</span>
                        </span>
                        <span className="font-bold text-slate-700">{wsProgress}%</span>
                      </div>

                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full rounded-full transition-all duration-300" style={{ width: `${wsProgress}%` }}></div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <span className="flex items-center gap-1">
                          <CheckSquare size={11} className="text-emerald-500" /> {wsTaskCount} 个任务
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText size={11} className="text-indigo-500" /> {ws.files.length} 份文件
                        </span>
                        <span>{ws.createdAt}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Workspace Detail */}
          <div className="lg:col-span-8 flex flex-col space-y-4 min-h-0">
            {currentWorkspace ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col flex-1 overflow-hidden">
                {/* Workspace Header */}
                <div className="p-5 border-b border-slate-100 bg-white">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
                        <Folder size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-base font-bold text-slate-800">{currentWorkspace.name}</h2>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
                            已归档
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                            {currentWorkspace.folderPath}
                          </span>
                          <button
                            onClick={() => handleLocateFile(currentWorkspace.folderPath)}
                            className="text-slate-400 hover:text-blue-600 transition-colors p-0.5"
                            title="复制路径"
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => setSummaryWorkspace(currentWorkspace)}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 transition-all hover:scale-[1.02]"
                      >
                        <Sparkles size={15} /> AI 智能工作区总结
                      </button>
                    </div>
                  </div>

                  {/* Project Overview Association Strip */}
                  <div className="mt-4 p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <Target size={16} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-400 block">关联项目总览</span>
                        <span className="font-bold text-slate-800 truncate block">
                          {associatedProject?.name || currentWorkspace.projectName || '未指定'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                        <Layers size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-slate-400">项目进度</span>
                          <span className="font-bold text-slate-800">{projectProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full rounded-full" style={{ width: `${projectProgress}%` }}></div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckSquare size={16} />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">关联任务数</span>
                        <span className="font-bold text-slate-800">
                          {taskCount} 个进行中任务
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Workspace Files Search & Filter Bar */}
                <div className="px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <span className="text-xs font-semibold text-slate-600 shrink-0">文件列表 ({filteredWorkspaceFiles.length})</span>
                    <div className="h-3.5 w-px bg-slate-200 mx-1"></div>
                    {['all', 'doc', 'pdf', 'sheet', 'code', 'design'].map(type => (
                      <button
                        key={type}
                        onClick={() => setWorkspaceFileTypeFilter(type)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          workspaceFileTypeFilter === type
                            ? 'bg-blue-50 text-blue-600 font-bold'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {type === 'all' && '全部'}
                        {type === 'doc' && '文档'}
                        {type === 'pdf' && 'PDF'}
                        {type === 'sheet' && '表格'}
                        {type === 'code' && '代码/协议'}
                        {type === 'design' && '设计资产'}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={workspaceFileSearch}
                      onChange={e => setWorkspaceFileSearch(e.target.value)}
                      placeholder="搜索工作区内文件..."
                      className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48 sm:w-60 bg-white"
                    />
                  </div>
                </div>

                {/* Workspace Files Table */}
                <div className="flex-1 overflow-y-auto p-5">
                  {filteredWorkspaceFiles.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-xs">
                      <Folder size={32} className="mx-auto text-slate-300 mb-2" />
                      暂无匹配的工作区文件
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[11px] text-slate-400 border-b border-slate-100">
                          <th className="pb-3 font-medium px-3">文件名与内容摘要</th>
                          <th className="pb-3 font-medium px-3">大小</th>
                          <th className="pb-3 font-medium px-3">更新时间</th>
                          <th className="pb-3 font-medium px-3 text-right">快捷操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkspaceFiles.map(f => (
                          <tr key={f.id} className="hover:bg-slate-50 group border-b border-slate-50 last:border-none transition-colors">
                            <td className="py-3 px-3">
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                                  {renderFileIcon(f.type, 18)}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-xs text-slate-800 group-hover:text-blue-600 transition-colors">
                                    {f.name}
                                  </div>
                                  {f.contentSnippet && (
                                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 max-w-md">
                                      {f.contentSnippet}
                                    </p>
                                  )}
                                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                    {f.path}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">{f.size}</td>
                            <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">{f.updatedAt}</td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => handleLaunchFile({ name: f.name, associatedApp: '系统编辑器' })}
                                  className="px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg font-medium flex items-center gap-1 transition-colors"
                                  title="快速启动"
                                >
                                  <Play size={12} /> 启动
                                </button>
                                <button
                                  onClick={() => handleLocateFile(f.path)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                                  title="定位并复制路径"
                                >
                                  <Copy size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-12 text-center text-slate-400 flex flex-col items-center justify-center flex-1">
                <Folder size={48} className="text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-700">请选择或新建一个工作区</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: LOCAL FILE INDEX VIEW */}
      {/* ======================================================== */}
      {activeTab === 'local_index' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-xs flex flex-col flex-1 overflow-hidden space-y-4 p-5">
          {/* Quick Folder to Workspace Shortcuts Banner */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <FolderPlus size={15} className="text-blue-600" />
                推荐本地文件夹（一键设为工作区并关联项目）
              </span>
              <span className="text-[11px] text-slate-400">可关联已有项目或直接创建新项目</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {commonFolders.map((item, idx) => (
                <div 
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between hover:border-blue-200 hover:bg-blue-50/20 transition-all"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="text-xs font-semibold text-slate-800 truncate block">
                      {item.folder.split(/[\\/]/).pop() || item.folder}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono truncate block mt-0.5">
                      {item.folder} ({item.count} 个文件)
                    </span>
                  </div>
                  <button
                    onClick={() => handleConvertToWorkspace(item.folder)}
                    className="px-2.5 py-1.5 bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1 shadow-2xs"
                  >
                    <FolderPlus size={13} /> 设为工作区
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Search, Filter & Tag Bar */}
          <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {[
                { key: 'all', label: '全部文件' },
                { key: 'doc', label: '文档 (Word/PPT)' },
                { key: 'pdf', label: 'PDF 规格' },
                { key: 'sheet', label: '表格 (Excel)' },
                { key: 'code', label: '代码/接口' },
                { key: 'design', label: '设计 (Figma)' },
                { key: 'archive', label: '压缩包' },
              ].map(cat => (
                <button
                  key={cat.key}
                  onClick={() => {
                    setCategoryFilter(cat.key);
                    setShowOnlyFavorites(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    categoryFilter === cat.key && !showOnlyFavorites
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}

              <button
                onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
                  showOnlyFavorites
                    ? 'bg-amber-500 text-white font-semibold shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Star size={12} /> 常用收藏
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="快速查找文件、路径、后缀或程序..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-full md:w-80 bg-white"
              />
            </div>
          </div>

          {/* Local Indexed Files Table */}
          <div className="flex-1 overflow-y-auto min-h-0 border border-slate-100 rounded-xl">
            {filteredLocalFiles.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-xs">
                <FileIcon size={36} className="mx-auto text-slate-300 mb-2" />
                未检索到匹配的本地文件
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/70 sticky top-0 z-10">
                  <tr className="text-[11px] text-slate-400 border-b border-slate-100">
                    <th className="py-3 px-4 font-medium">文件名与扩展名</th>
                    <th className="py-3 px-4 font-medium">本地完整路径</th>
                    <th className="py-3 px-4 font-medium">默认启动程序</th>
                    <th className="py-3 px-4 font-medium">大小</th>
                    <th className="py-3 px-4 font-medium">更新时间</th>
                    <th className="py-3 px-4 font-medium text-right">快捷操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocalFiles.map(file => (
                    <tr key={file.id} className="hover:bg-slate-50 group border-b border-slate-50 last:border-none transition-colors">
                      {/* Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleFavorite(file.id)}
                            className={`p-1 rounded transition-colors ${
                              file.isFavorite ? 'text-amber-400' : 'text-slate-300 hover:text-slate-500'
                            }`}
                            title="收藏/取消收藏"
                          >
                            <Star size={14} fill={file.isFavorite ? 'currentColor' : 'none'} />
                          </button>
                          <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                            {renderFileIcon(file.type, 16)}
                          </div>
                          <span className="font-semibold text-xs text-slate-800 group-hover:text-blue-600 transition-colors">
                            {file.name}
                          </span>
                        </div>
                      </td>

                      {/* Path */}
                      <td className="py-3.5 px-4 text-xs text-slate-500 font-mono">
                        <div className="flex items-center gap-1.5 max-w-xs xl:max-w-md truncate" title={file.fullPath}>
                          <span className="truncate">{file.fullPath}</span>
                        </div>
                      </td>

                      {/* App */}
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 text-[11px] font-medium text-slate-700">
                          {file.associatedApp}
                        </span>
                      </td>

                      {/* Size */}
                      <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">{file.size}</td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">{file.updatedAt}</td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* 快速启动 */}
                          <button
                            onClick={() => handleLaunchFile(file)}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
                            title={`在 ${file.associatedApp} 中启动`}
                          >
                            <Play size={12} /> 快速启动
                          </button>

                          {/* 快速定位 */}
                          <button
                            onClick={() => handleLocateFile(file.fullPath)}
                            className="px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1"
                            title="定位并复制绝对路径"
                          >
                            <Copy size={12} /> 定位
                          </button>

                          {/* 设为工作区 */}
                          <button
                            onClick={() => handleConvertToWorkspace(file.folder, file.name)}
                            className="px-2 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1"
                            title="将此文件所在目录设为工作区并关联项目"
                          >
                            <FolderPlus size={12} /> 设为工作区
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODALS */}
      {/* ======================================================== */}

      {/* AI Workspace Summary Modal */}
      {summaryWorkspace && (
        <WorkspaceSummaryModal
          workspace={summaryWorkspace}
          onClose={() => setSummaryWorkspace(null)}
        />
      )}

      {/* Add Workspace Modal */}
      {showAddWorkspaceModal && (
        <AddWorkspaceModal
          onClose={() => setShowAddWorkspaceModal(false)}
          onSuccess={(newWs) => {
            setShowAddWorkspaceModal(false);
            setSelectedWorkspaceId(newWs.id);
            setActiveTab('workspaces');
            showToast(`已创建工作区【${newWs.name}】并关联项目`);
          }}
        />
      )}

      {/* Set As Workspace Modal */}
      {setAsWorkspaceData && (
        <SetAsWorkspaceModal
          initialFolder={setAsWorkspaceData.folder}
          suggestedName={setAsWorkspaceData.suggestedName}
          filesInFolder={setAsWorkspaceData.files}
          onClose={() => setSetAsWorkspaceData(null)}
          onSuccess={(newWs) => {
            setSetAsWorkspaceData(null);
            setSelectedWorkspaceId(newWs.id);
            setActiveTab('workspaces');
            showToast(`已成功将【${newWs.name}】设为工作区！`);
          }}
        />
      )}
    </div>
  );
}
