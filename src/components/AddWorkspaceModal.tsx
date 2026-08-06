import { useState } from 'react';
import { FolderPlus, Link, Stack } from '@phosphor-icons/react';
import { useApp, Workspace, WorkspaceFile } from '../store/AppContext';
import { Dialog, DialogContent, DialogHeader, DialogFooter } from '@/src/components/ui/Dialog';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Badge } from '@/src/components/ui/Badge';

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
        contentSnippet: '工作区初始化文档、代码提交规范与分支管理策略。',
      },
      {
        id: `f-${Date.now()}-2`,
        name: 'architecture_overview.pdf',
        type: 'pdf',
        size: '3.2 MB',
        updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        path: `${folderPath}\\architecture_overview.pdf`,
        contentSnippet: '系统架构概要与高可用架构拓扑规划。',
      },
    ];

    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name: name.trim(),
      folderPath: folderPath.trim(),
      projectId: selectedProj?.id,
      projectName: selectedProj?.name,
      createdAt: new Date().toISOString().split('T')[0],
      files: defaultFiles,
      summary: '',
    };

    addWorkspace(newWs);
    onSuccess(newWs);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader
          title="新建工作区"
          description="创建工作区并关联项目总览，实时同步进度与任务"
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="工作区名称 *"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如：WenXiBuddy 跨端组件库工作区"
            required
          />
          <Input
            label="本地工作区物理路径 *"
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="例如：D:\Projects\MobileComponents"
            className="font-mono text-xs"
            required
          />
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">关联项目</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-border rounded-[var(--radius-md)] bg-bg-input text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            >
              {projects.map(proj => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} (当前进度: {proj.progress}%)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-text-tertiary mt-1 flex items-center gap-1">
              <Link size={12} weight="duotone" /> 关联后可在工作区内直接查看该项目的里程碑与任务负荷
            </p>
          </div>

          <div className="p-3 bg-bg-secondary/60 border border-border-subtle rounded-[var(--radius-md)] flex items-center gap-2 text-xs text-text-secondary">
            <Stack size={14} weight="duotone" className="text-accent shrink-0" />
            将自动初始化并索引工作区内核心文档
          </div>

          <DialogFooter>
            <Button variant="secondary" type="button" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit">
              <FolderPlus size={14} weight="duotone" />
              确认创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
