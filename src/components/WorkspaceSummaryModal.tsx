import { useState, useEffect } from 'react';
import { Sparkle, Copy, Check, ArrowClockwise, Folder, Target, CheckSquare, Stack, WarningCircle, FileText } from '@phosphor-icons/react';
import Markdown from 'react-markdown';
import { Workspace, useApp } from '../store/AppContext';
import { Dialog, DialogContent } from '@/src/components/ui/Dialog';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { ProgressBar } from '@/src/components/ui/ProgressBar';

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
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-bg-secondary/50 -mx-6 -mt-6 mb-4 rounded-t-[var(--radius-xl)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shadow-xs">
              <Sparkle size={20} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text-primary">AI 智能工作区文件总结</h2>
                <Badge variant="accent" className="text-[11px]">{workspace.name}</Badge>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1 font-mono">
                <Folder size={12} weight="duotone" /> {workspace.folderPath}
              </p>
            </div>
          </div>
        </div>

        {/* Association Meta Banner */}
        <div className="bg-bg-secondary/60 px-6 py-3 border-b border-border-subtle -mx-6 grid grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Target size={15} weight="duotone" className="text-accent shrink-0" />
            <div className="truncate">
              <span className="text-text-tertiary block">关联项目</span>
              <span className="font-semibold text-text-primary truncate block">{associatedProject?.name || workspace.projectName || '未关联'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Stack size={15} weight="duotone" className="text-purple-500 shrink-0" />
            <div>
              <span className="text-text-tertiary block">项目进度</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">{progress}%</span>
                <div className="w-16">
                  <ProgressBar value={progress} size="sm" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckSquare size={15} weight="duotone" className="text-success shrink-0" />
            <div>
              <span className="text-text-tertiary block">关联任务数</span>
              <span className="font-semibold text-text-primary">{taskCount} 个任务 · {workspace.files.length} 份文件</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent animate-pulse">
                  <Sparkle size={28} weight="duotone" />
                </div>
                <div className="absolute inset-0 rounded-2xl border-2 border-accent border-t-transparent animate-spin"></div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">正在深入解析工作区全量文档...</h3>
                <p className="text-xs text-text-tertiary mt-1 max-w-sm">
                  AI 正在综合 PRD、系统架构、接口文档及关联任务进度，提炼关键目标、风险点与行动建议
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 bg-danger/5 border border-danger/20 rounded-[var(--radius-md)] flex items-start gap-3 text-danger text-sm">
              <WarningCircle size={18} weight="duotone" className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold">总结生成失败</div>
                <div className="text-xs text-danger/80 mt-0.5">{error}</div>
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-3"
                  onClick={fetchSummary}
                >
                  重试生成
                </Button>
              </div>
            </div>
          ) : (
            <div className="prose max-w-none text-sm leading-relaxed text-text-secondary">
              <div className="bg-bg-secondary/60 border border-border-subtle rounded-[var(--radius-md)] p-5 shadow-xs">
                <Markdown>{summary}</Markdown>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between bg-bg-secondary/50 -mx-6 -mb-6 rounded-b-[var(--radius-xl)]">
          <div className="text-xs text-text-tertiary flex items-center gap-1.5">
            <FileText size={14} weight="duotone" /> 已索引 {workspace.files.length} 个工作区核心文件
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchSummary}
              disabled={loading}
              className="gap-1.5"
            >
              <ArrowClockwise size={14} weight="duotone" className={loading ? 'animate-spin' : ''} />
              重新分析
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              disabled={!summary || loading}
              className="gap-1.5"
            >
              {copied ? <Check size={14} weight="bold" className="text-success" /> : <Copy size={14} weight="duotone" />}
              {copied ? '已复制' : '复制总结'}
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              完成
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
