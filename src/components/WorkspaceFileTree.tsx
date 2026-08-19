// WorkspaceFileTree — shared file tree with full ops (context menu, create/rename
// dialogs, drag-move, reveal in explorer, refresh after mutation). Used by
// AgentWorkspaceView "工作区文件" tab and FileArchiveView "工作区归档" tab.
// Web dev (non-Tauri): read-only tree, no menu, no dnd.
import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileTree, type FileTreeMenu, type FileTreeDnd } from '@/src/components/FileTree';
import { buildFileTree } from '@/src/lib/fileTree';
import { isValidFsName } from '@/src/lib/fsName';
import { isTauri } from '@/src/lib/api';
import { useWorkspaceStore, type WorkspaceFile } from '@/src/stores/workspaceStore';
import { Button, Dialog, DialogContent, DialogHeader, DialogFooter, Input, useToast } from '@/src/components/ui';

type NameDialog = {
  kind: 'newDir' | 'newFile' | 'rename';
  parentRel: string;
  rel?: string;
  currentName?: string;
};

export function WorkspaceFileTree({
  files,
  folderPath,
  workspaceId,
  emptyText = '暂无文件',
}: {
  files: WorkspaceFile[];
  folderPath?: string;
  workspaceId?: string | null;
  emptyText?: string;
}) {
  const scanWorkspaceFiles = useWorkspaceStore((s) => s.scanWorkspaceFiles);
  const { toast } = useToast();

  const nodes = useMemo(
    () =>
      buildFileTree(
        files.filter((f) => f.type !== 'dir').map((f) => f.path),
        folderPath,
        files.filter((f) => f.type === 'dir').map((f) => f.path),
      ),
    [files, folderPath],
  );
  const truncated = files.length >= 1000;

  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [nameInput, setNameInput] = useState('');

  const root = folderPath ?? '';
  const toAbs = (rel: string) =>
    rel ? `${root.replace(/[\\/]+$/, '')}${root.includes('\\') ? '\\' : '/'}${rel}` : root;

  const refreshTree = () => {
    if (workspaceId) void scanWorkspaceFiles(workspaceId);
  };

  const handleReveal = async (rel: string) => {
    try {
      await invoke('reveal_in_explorer', { path: toAbs(rel) });
    } catch (e) {
      toast({ type: 'error', title: '打开失败', description: String(e) });
    }
  };

  const submitNameDialog = async () => {
    if (!nameDialog) return;
    const name = nameInput.trim();
    if (!isValidFsName(name)) {
      toast({ type: 'error', title: '名称包含非法字符', description: '不能包含 / \\ : * ? " < > | 或 ..' });
      return;
    }
    try {
      if (nameDialog.kind === 'rename') {
        await invoke('fs_rename', { root, rel: nameDialog.rel, newName: name });
        toast({ type: 'success', title: '已重命名', description: name });
      } else {
        await invoke(nameDialog.kind === 'newDir' ? 'fs_create_dir' : 'fs_create_file', {
          root,
          parentRel: nameDialog.parentRel,
          name,
        });
        toast({ type: 'success', title: nameDialog.kind === 'newDir' ? '文件夹已创建' : '文件已创建', description: name });
      }
      setNameDialog(null);
      refreshTree();
    } catch (e) {
      toast({ type: 'error', title: '操作失败', description: String(e) });
    }
  };

  const handleMove = async (srcRel: string, destDirRel: string) => {
    try {
      await invoke('fs_move', { root, srcRel, destDirRel });
      toast({ type: 'success', title: '已移动', description: srcRel });
      refreshTree();
    } catch (e) {
      toast({ type: 'error', title: '移动失败', description: String(e) });
    }
  };

  const opsEnabled = isTauri() && !!folderPath;
  const menu: FileTreeMenu | undefined = opsEnabled
    ? {
        onReveal: (rel) => void handleReveal(rel),
        onCreate: (kind, parentRel) => {
          setNameInput('');
          setNameDialog({ kind: kind === 'dir' ? 'newDir' : 'newFile', parentRel });
        },
        onRename: (rel, _kind, currentName) => {
          setNameInput(currentName);
          setNameDialog({ kind: 'rename', parentRel: '', rel, currentName });
        },
      }
    : undefined;
  const dnd: FileTreeDnd | undefined = opsEnabled
    ? { onMove: (srcRel, destDirRel) => void handleMove(srcRel, destDirRel) }
    : undefined;

  return (
    <>
      <FileTree nodes={nodes} emptyText={emptyText} menu={menu} dnd={dnd} />
      {truncated && (
        <div className="text-[11px] text-text-tertiary text-center mt-2">
          已截断：仅显示前 1000 个文件
        </div>
      )}
      {!truncated && nodes.length > 0 && (
        <div className="text-[10px] text-text-placeholder text-center mt-2">
          文件较多时可能被截断
        </div>
      )}

      <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && setNameDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader
            title={nameDialog?.kind === 'rename' ? '重命名' : nameDialog?.kind === 'newDir' ? '新建文件夹' : '新建文件'}
            description={nameDialog?.kind === 'rename' ? nameDialog.currentName : nameDialog?.parentRel || '工作区根目录'}
          />
          <Input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="输入名称"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void submitNameDialog()}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setNameDialog(null)}>取消</Button>
            <Button variant="primary" onClick={() => void submitNameDialog()}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
