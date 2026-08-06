import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Folder,
  MagnifyingGlass,
  Sparkle,
  Plus,
  Copy,
  Play,
  FolderPlus,
  Star,
  Target,
  CheckSquare,
  Stack,
  FileText,
  FileXls,
  FileCode,
  File,
  Image,
  Archive,
  CheckCircle,
  Lightning,
} from '@phosphor-icons/react';
import { useApp, Workspace, LocalIndexedFile, WorkspaceFile } from '../store/AppContext';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Input } from '@/src/components/ui/Input';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { Separator } from '@/src/components/ui/Separator';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { cn } from '@/src/lib/utils';

import { WorkspaceSummaryModal } from '../components/WorkspaceSummaryModal';
import { SetAsWorkspaceModal } from '../components/SetAsWorkspaceModal';
import { AddWorkspaceModal } from '../components/AddWorkspaceModal';

export function FileArchiveView() {
  const {
    workspaces,
    projects,
    localIndexedFiles,
    setLocalIndexedFiles,
    getProjectTaskCount,
  } = useApp();

  const [activeTab, setActiveTab] = useState<string>('workspaces');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(workspaces[0]?.id || '');
  const [workspaceFileSearch, setWorkspaceFileSearch] = useState('');
  const [workspaceFileTypeFilter, setWorkspaceFileTypeFilter] = useState<string>('all');

  const [summaryWorkspace, setSummaryWorkspace] = useState<Workspace | null>(null);
  const [showAddWorkspaceModal, setShowAddWorkspaceModal] = useState(false);
  const [setAsWorkspaceData, setSetAsWorkspaceData] = useState<{
    folder: string;
    suggestedName?: string;
    files?: WorkspaceFile[];
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);

  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'launch' | 'copy' } | null>(null);

  const showToast = (text: string, type: 'success' | 'launch' | 'copy' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 2800);
  };

  const currentWorkspace = useMemo(() =>
    workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0],
    [workspaces, selectedWorkspaceId]
  );

  const associatedProject = useMemo(() => {
    if (!currentWorkspace) return null;
    return projects.find(p => p.id === currentWorkspace.projectId || p.name === currentWorkspace.projectName);
  }, [currentWorkspace, projects]);

  const taskCount = currentWorkspace ? getProjectTaskCount(currentWorkspace.projectId || currentWorkspace.projectName) : 0;
  const projectProgress = associatedProject ? associatedProject.progress : 50;

  const filteredWorkspaceFiles = useMemo(() => {
    if (!currentWorkspace) return [];
    return currentWorkspace.files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(workspaceFileSearch.toLowerCase()) ||
        (file.contentSnippet && file.contentSnippet.toLowerCase().includes(workspaceFileSearch.toLowerCase()));
      const matchesType = workspaceFileTypeFilter === 'all' || file.type === workspaceFileTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [currentWorkspace, workspaceFileSearch, workspaceFileTypeFilter]);

  const filteredLocalFiles = useMemo(() =>
    localIndexedFiles.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.folder.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.extension.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.associatedApp.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || file.type === categoryFilter;
      const matchesFav = !showOnlyFavorites || file.isFavorite;
      return matchesSearch && matchesCategory && matchesFav;
    }),
    [localIndexedFiles, searchQuery, categoryFilter, showOnlyFavorites]
  );

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

  const toggleFavorite = (id: string) => {
    setLocalIndexedFiles(prev => prev.map(f => f.id === id ? { ...f, isFavorite: !f.isFavorite } : f));
  };

  const handleLaunchFile = (file: { name: string; associatedApp?: string }) => {
    const app = file.associatedApp || '系统默认程序';
    showToast(`已在 ${app} 中快速启动：${file.name}`, 'launch');
  };

  const handleLocateFile = (path: string) => {
    navigator.clipboard.writeText(path);
    showToast(`已定位并复制路径到剪贴板：${path}`, 'copy');
  };

  const handleConvertToWorkspace = (folder: string, fileName?: string) => {
    const folderFiles = localIndexedFiles.filter(f => f.folder === folder).map(f => ({
      id: f.id, name: f.name, type: f.type, size: f.size, updatedAt: f.updatedAt, path: f.fullPath,
      contentSnippet: `来自本地索引路径 ${f.fullPath}`,
    }));
    const suggestedName = fileName ? fileName.replace(/\.[^/.]+$/, '') + ' 工作区' : undefined;
    setSetAsWorkspaceData({ folder, suggestedName, files: folderFiles });
  };

  const renderFileIcon = (type: string, size = 18) => {
    const icons: Record<string, { icon: typeof FileText; color: string }> = {
      doc: { icon: FileText, color: 'text-accent' },
      pdf: { icon: FileText, color: 'text-danger' },
      sheet: { icon: FileXls, color: 'text-success' },
      code: { icon: FileCode, color: 'text-accent' },
      design: { icon: Image, color: 'text-purple-500' },
      archive: { icon: Archive, color: 'text-warning' },
    };
    const cfg = icons[type] || { icon: File, color: 'text-text-tertiary' };
    const Icon = cfg.icon;
    return <Icon size={size} weight="duotone" className={cfg.color} />;
  };

  const fileTypeFilters = [
    { key: 'all', label: '全部' },
    { key: 'doc', label: '文档' },
    { key: 'pdf', label: 'PDF' },
    { key: 'sheet', label: '表格' },
    { key: 'code', label: '代码' },
    { key: 'design', label: '设计' },
  ];

  const localCategoryFilters = [
    { key: 'all', label: '全部文件' },
    { key: 'doc', label: '文档' },
    { key: 'pdf', label: 'PDF' },
    { key: 'sheet', label: '表格' },
    { key: 'code', label: '代码' },
    { key: 'design', label: '设计' },
    { key: 'archive', label: '压缩包' },
  ];

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed top-6 right-6 z-50"
          >
            <Card className="px-4 py-2.5 flex items-center gap-2.5 shadow-lg">
              <CheckCircle size={16} weight="fill" className="text-success shrink-0" />
              <span className="text-xs font-medium text-text-primary">{toastMessage.text}</span>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <Card className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SegmentedControl
            segments={[
              { id: 'workspaces', label: `工作区归档 (${workspaces.length})` },
              { id: 'local_index', label: `本地文件索引 (${localIndexedFiles.length})` },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>
        <div>
          {activeTab === 'workspaces' ? (
            <Button variant="primary" onClick={() => setShowAddWorkspaceModal(true)}>
              <Plus size={14} weight="bold" />
              新建工作区
            </Button>
          ) : (
            <span className="text-xs text-text-tertiary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              已建立全局实时索引
            </span>
          )}
        </div>
      </Card>

      {/* TAB 1: WORKSPACES */}
      {activeTab === 'workspaces' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
          {/* Workspace List */}
          <div className="lg:col-span-4 flex flex-col space-y-2 min-h-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-text-secondary">工作区列表</span>
              <span className="text-[10px] text-text-tertiary">关联项目总览与进度</span>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              {workspaces.map(ws => {
                const isSelected = ws.id === currentWorkspace?.id;
                const proj = projects.find(p => p.id === ws.projectId || p.name === ws.projectName);
                const wsTaskCount = getProjectTaskCount(ws.projectId || ws.projectName);
                const wsProgress = proj ? proj.progress : 50;

                return (
                  <motion.div
                    key={ws.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedWorkspaceId(ws.id)}
                    className={cn(
                      'p-3.5 rounded-[var(--radius-md)] border transition-all cursor-pointer',
                      isSelected
                        ? 'bg-accent/5 border-accent/30 ring-1 ring-accent/10'
                        : 'bg-bg-primary border-border-subtle hover:border-border'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn(
                          'w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0',
                          isSelected ? 'bg-accent/10 text-accent' : 'bg-bg-secondary text-text-tertiary'
                        )}>
                          <Folder size={16} weight="duotone" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold text-text-primary truncate">{ws.name}</h3>
                          <p className="text-[10px] text-text-tertiary font-mono truncate mt-0.5">{ws.folderPath}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="shrink-0 text-accent"
                        onClick={e => { e.stopPropagation(); setSummaryWorkspace(ws); }}
                      >
                        <Sparkle size={12} weight="duotone" />
                        AI总结
                      </Button>
                    </div>

                    <div className="mt-2.5 pt-2.5 border-t border-border-subtle space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1 text-text-secondary truncate">
                          <Target size={11} weight="duotone" className="text-accent" />
                          <span className="font-medium truncate">{proj?.name || ws.projectName || '未关联项目'}</span>
                        </span>
                        <span className="font-semibold text-text-primary">{wsProgress}%</span>
                      </div>
                      <ProgressBar value={wsProgress} />
                      <div className="flex items-center justify-between text-[10px] text-text-tertiary">
                        <span className="flex items-center gap-1">
                          <CheckSquare size={10} weight="duotone" className="text-success" /> {wsTaskCount} 个任务
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText size={10} weight="duotone" className="text-accent" /> {ws.files.length} 份文件
                        </span>
                        <span>{ws.createdAt}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Workspace Detail */}
          <div className="lg:col-span-8 flex flex-col space-y-0 min-h-0">
            {currentWorkspace ? (
              <Card className="flex flex-col flex-1 overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-border-subtle">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-[var(--radius-md)] bg-accent-subtle text-accent flex items-center justify-center shrink-0">
                        <Folder size={20} weight="duotone" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-text-primary">{currentWorkspace.name}</h2>
                          <Badge variant="success">已归档</Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-text-tertiary font-mono">{currentWorkspace.folderPath}</span>
                          <button
                            onClick={() => handleLocateFile(currentWorkspace.folderPath)}
                            className="text-text-tertiary hover:text-accent transition-colors p-0.5"
                          >
                            <Copy size={12} weight="duotone" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <Button variant="primary" onClick={() => setSummaryWorkspace(currentWorkspace)}>
                      <Sparkle size={14} weight="duotone" />
                      AI 智能工作区总结
                    </Button>
                  </div>

                  {/* Project Strip */}
                  <div className="mt-3 p-3 bg-bg-secondary/60 rounded-[var(--radius-md)] border border-border-subtle grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
                        <Target size={14} weight="duotone" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-text-tertiary block">关联项目</span>
                        <span className="text-xs font-semibold text-text-primary truncate block">
                          {associatedProject?.name || currentWorkspace.projectName || '未指定'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-accent/10 text-accent flex items-center justify-center shrink-0">
                        <Stack size={14} weight="duotone" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-text-tertiary">项目进度</span>
                          <span className="font-semibold text-text-primary">{projectProgress}%</span>
                        </div>
                        <ProgressBar value={projectProgress} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-success/10 text-success flex items-center justify-center shrink-0">
                        <CheckSquare size={14} weight="duotone" />
                      </div>
                      <div>
                        <span className="text-[10px] text-text-tertiary block">关联任务</span>
                        <span className="text-xs font-semibold text-text-primary">{taskCount} 个进行中</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search & Filter */}
                <div className="px-4 py-2.5 border-b border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <span className="text-[11px] font-semibold text-text-secondary shrink-0">文件列表 ({filteredWorkspaceFiles.length})</span>
                    <Separator orientation="vertical" className="h-3 mx-1" />
                    {fileTypeFilters.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setWorkspaceFileTypeFilter(f.key)}
                        className={cn(
                          'px-2 py-1 rounded-[var(--radius-sm)] text-[11px] font-medium transition-colors',
                          workspaceFileTypeFilter === f.key
                            ? 'bg-accent/10 text-accent font-semibold'
                            : 'text-text-secondary hover:bg-bg-secondary'
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="搜索工作区文件..."
                    icon={<MagnifyingGlass size={13} weight="duotone" className="text-text-tertiary" />}
                    value={workspaceFileSearch}
                    onChange={e => setWorkspaceFileSearch(e.target.value)}
                    className="w-48 sm:w-56 h-8 text-xs"
                  />
                </div>

                {/* Files Table */}
                <div className="flex-1 overflow-y-auto p-4">
                  {filteredWorkspaceFiles.length === 0 ? (
                    <div className="py-14 text-center text-text-tertiary text-xs">
                      <Folder size={28} weight="duotone" className="mx-auto text-text-placeholder mb-2" />
                      暂无匹配的工作区文件
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[10px] text-text-tertiary border-b border-border-subtle">
                          <th className="pb-2.5 px-2.5 font-medium">文件名与内容摘要</th>
                          <th className="pb-2.5 px-2.5 font-medium">大小</th>
                          <th className="pb-2.5 px-2.5 font-medium">更新时间</th>
                          <th className="pb-2.5 px-2.5 font-medium text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkspaceFiles.map(f => (
                          <tr key={f.id} className="hover:bg-bg-secondary/50 group border-b border-border-subtle last:border-none transition-colors">
                            <td className="py-2.5 px-2.5">
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-bg-secondary border border-border-subtle flex items-center justify-center shrink-0 mt-0.5">
                                  {renderFileIcon(f.type, 16)}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-xs text-text-primary group-hover:text-accent transition-colors">{f.name}</div>
                                  {f.contentSnippet && (
                                    <p className="text-[10px] text-text-tertiary line-clamp-1 mt-0.5 max-w-md">{f.contentSnippet}</p>
                                  )}
                                  <span className="text-[9px] text-text-placeholder font-mono block mt-0.5">{f.path}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5 text-[11px] text-text-secondary whitespace-nowrap">{f.size}</td>
                            <td className="py-2.5 px-2.5 text-[11px] text-text-secondary whitespace-nowrap">{f.updatedAt}</td>
                            <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                              <div className="flex justify-end gap-1.5">
                                <Button variant="ghost" size="xs" onClick={() => handleLaunchFile({ name: f.name, associatedApp: '系统编辑器' })}>
                                  <Play size={12} weight="duotone" /> 启动
                                </Button>
                                <Button variant="ghost" size="xs" onClick={() => handleLocateFile(f.path)}>
                                  <Copy size={12} weight="duotone" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="flex flex-col items-center justify-center flex-1 py-14">
                <Folder size={40} weight="duotone" className="text-text-placeholder mb-3" />
                <p className="text-sm font-semibold text-text-primary">请选择或新建一个工作区</p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: LOCAL FILE INDEX */}
      {activeTab === 'local_index' && (
        <Card className="flex flex-col flex-1 overflow-hidden p-4 space-y-4">
          {/* Quick Folders */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-secondary flex items-center gap-1.5">
                <FolderPlus size={14} weight="duotone" className="text-accent" />
                推荐本地文件夹
              </span>
              <span className="text-[10px] text-text-tertiary">一键设为工作区并关联项目</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {commonFolders.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-bg-secondary/60 border border-border-subtle rounded-[var(--radius-md)] flex items-center justify-between hover:border-accent/20 transition-all"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="text-xs font-semibold text-text-primary truncate block">
                      {item.folder.split(/[\\/]/).pop() || item.folder}
                    </span>
                    <span className="text-[10px] text-text-tertiary font-mono truncate block mt-0.5">
                      {item.folder} ({item.count} 个文件)
                    </span>
                  </div>
                  <Button variant="secondary" size="xs" onClick={() => handleConvertToWorkspace(item.folder)}>
                    <FolderPlus size={12} weight="duotone" />
                    设为工作区
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Search & Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {localCategoryFilters.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => { setCategoryFilter(cat.key); setShowOnlyFavorites(false); }}
                  className={cn(
                    'px-2.5 py-1.5 rounded-[var(--radius-md)] text-[11px] font-medium transition-all',
                    categoryFilter === cat.key && !showOnlyFavorites
                      ? 'bg-accent text-white font-semibold'
                      : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                  )}
                >
                  {cat.label}
                </button>
              ))}
              <button
                onClick={() => setShowOnlyFavorites(!showOnlyFavorites)}
                className={cn(
                  'px-2.5 py-1.5 rounded-[var(--radius-md)] text-[11px] font-medium transition-all flex items-center gap-1',
                  showOnlyFavorites
                    ? 'bg-warning text-white font-semibold'
                    : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
                )}
              >
                <Star size={11} weight={showOnlyFavorites ? 'fill' : 'duotone'} /> 收藏
              </button>
            </div>
            <Input
              placeholder="快速查找文件、路径、后缀..."
              icon={<MagnifyingGlass size={14} weight="duotone" className="text-text-tertiary" />}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full md:w-72"
            />
          </div>

          {/* Files Table */}
          <div className="flex-1 overflow-y-auto min-h-0 border border-border-subtle rounded-[var(--radius-md)]">
            {filteredLocalFiles.length === 0 ? (
              <div className="py-16 text-center text-text-tertiary text-xs">
                <File size={32} weight="duotone" className="mx-auto text-text-placeholder mb-2" />
                未检索到匹配的本地文件
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-bg-secondary/70 sticky top-0 z-10">
                  <tr className="text-[10px] text-text-tertiary border-b border-border-subtle">
                    <th className="py-2.5 px-3 font-medium">文件名</th>
                    <th className="py-2.5 px-3 font-medium">本地路径</th>
                    <th className="py-2.5 px-3 font-medium">默认程序</th>
                    <th className="py-2.5 px-3 font-medium">大小</th>
                    <th className="py-2.5 px-3 font-medium">更新</th>
                    <th className="py-2.5 px-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocalFiles.map(file => (
                    <tr key={file.id} className="hover:bg-bg-secondary/50 group border-b border-border-subtle last:border-none transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleFavorite(file.id)}
                            className={cn('p-0.5 rounded transition-colors', file.isFavorite ? 'text-warning' : 'text-text-placeholder hover:text-text-tertiary')}
                          >
                            <Star size={13} weight={file.isFavorite ? 'fill' : 'duotone'} />
                          </button>
                          <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-bg-secondary border border-border-subtle flex items-center justify-center shrink-0">
                            {renderFileIcon(file.type, 14)}
                          </div>
                          <span className="font-semibold text-[11px] text-text-primary group-hover:text-accent transition-colors">{file.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[10px] text-text-tertiary font-mono max-w-xs truncate">{file.fullPath}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-[var(--radius-sm)] bg-bg-secondary text-[10px] font-medium text-text-secondary">{file.associatedApp}</span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-text-secondary whitespace-nowrap">{file.size}</td>
                      <td className="py-2.5 px-3 text-[11px] text-text-secondary whitespace-nowrap">{file.updatedAt}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="ghost" size="xs" onClick={() => handleLaunchFile(file)}>
                            <Play size={11} weight="duotone" /> 启动
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => handleLocateFile(file.fullPath)}>
                            <Copy size={11} weight="duotone" /> 定位
                          </Button>
                          <Button variant="ghost" size="xs" className="text-success" onClick={() => handleConvertToWorkspace(file.folder, file.name)}>
                            <FolderPlus size={11} weight="duotone" /> 工作区
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {/* Modals */}
      {summaryWorkspace && <WorkspaceSummaryModal workspace={summaryWorkspace} onClose={() => setSummaryWorkspace(null)} />}
      {showAddWorkspaceModal && (
        <AddWorkspaceModal
          onClose={() => setShowAddWorkspaceModal(false)}
          onSuccess={newWs => {
            setShowAddWorkspaceModal(false);
            setSelectedWorkspaceId(newWs.id);
            setActiveTab('workspaces');
            showToast(`已创建工作区【${newWs.name}】并关联项目`);
          }}
        />
      )}
      {setAsWorkspaceData && (
        <SetAsWorkspaceModal
          initialFolder={setAsWorkspaceData.folder}
          suggestedName={setAsWorkspaceData.suggestedName}
          filesInFolder={setAsWorkspaceData.files}
          onClose={() => setSetAsWorkspaceData(null)}
          onSuccess={newWs => {
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
