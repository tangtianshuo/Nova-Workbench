import { useState, useEffect } from 'react';
import { X, Sparkles, Copy, Check, RefreshCw, Folder, Target, CheckSquare, Layers, AlertCircle, FileText } from 'lucide-react';
import Markdown from 'react-markdown';
import { Workspace, useApp } from '../store/AppContext';

interface WorkspaceSummaryModalProps {
  workspace: Workspace;
  onClose: () => void;
}

export function WorkspaceSummaryModal({ workspace, onClose }: WorkspaceSummaryModalProps) {
  const { projects, getProjectTaskCount, updateWorkspace } = useApp();
  const [loading, setLoading] = useState(!workspace.summary);
  const [summary, setSummary] = useState(workspace.summary || '');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const associatedProject = projects.find(p => p.id === workspace.projectId || p.name === workspace.projectName);
  const taskCount = getProjectTaskCount(workspace.projectId || workspace.projectName);
  const progress = associatedProject ? associatedProject.progress : 50;

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/summarize-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceName: workspace.name,
          folderPath: workspace.folderPath,
          files: workspace.files,
          projectName: associatedProject?.name || workspace.projectName || '未指定',
          projectProgress: progress,
          taskCount
        })
      });

      if (!response.ok) {
        throw new Error('总结生成失败，请检查服务');
      }

      const data = await response.json();
      setSummary(data.summary);
      updateWorkspace(workspace.id, { summary: data.summary });
    } catch (err: any) {
      console.error(err);
      setError(err.message || '生成失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!workspace.summary) {
      fetchSummary();
    }
  }, [workspace.id]);

  const handleCopy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">AI 智能工作区文件总结</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                  {workspace.name}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
                <Folder size={12} /> {workspace.folderPath}
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

        {/* Association Meta Banner */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 grid grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-blue-500 shrink-0" />
            <div className="truncate">
              <span className="text-slate-400 block">关联项目</span>
              <span className="font-semibold text-slate-700 truncate">{associatedProject?.name || workspace.projectName || '未关联'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-indigo-500 shrink-0" />
            <div>
              <span className="text-slate-400 block">项目进度</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">{progress}%</span>
                <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${progress}%` }}></div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckSquare size={15} className="text-emerald-500 shrink-0" />
            <div>
              <span className="text-slate-400 block">关联任务数</span>
              <span className="font-semibold text-slate-700">{taskCount} 个任务 · {workspace.files.length} 份文件</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-white space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 animate-pulse">
                  <Sparkles size={28} />
                </div>
                <div className="absolute inset-0 rounded-2xl border-2 border-blue-500 border-t-transparent animate-spin"></div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">正在深入解析工作区全量文档...</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  AI 正在综合 PRD、系统架构、接口文档及关联任务进度，提炼关键目标、风险点与行动建议
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 text-rose-700 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold">总结生成失败</div>
                <div className="text-xs text-rose-600 mt-0.5">{error}</div>
                <button 
                  onClick={fetchSummary}
                  className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition-colors"
                >
                  重试生成
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-700">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 shadow-xs">
                <Markdown>{summary}</Markdown>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <FileText size={14} /> 已索引 {workspace.files.length} 个工作区核心文件
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchSummary}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 重新分析
            </button>
            <button 
              onClick={handleCopy}
              disabled={!summary || loading}
              className="px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
            >
              {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copied ? '已复制到剪贴板' : '复制总结'}
            </button>
            <button 
              onClick={onClose}
              className="px-5 py-2 text-xs font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-xs"
            >
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
