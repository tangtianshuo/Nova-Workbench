import { useState } from 'react';
import { CaretDown, CaretRight, Folder, FileText, FileCode, FileXls, Image, File, FolderOpen, FolderPlus, FilePlus, PencilSimple } from '@phosphor-icons/react';
import type { FileTreeNode } from '@/src/lib/fileTree';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/src/components/ui/ContextMenu';
import { cn } from '@/src/lib/utils';

export interface FileTreeMenu {
  onReveal: (path: string) => void;
  onCreate: (kind: 'dir' | 'file', parentRel: string) => void;
  onRename: (rel: string, kind: 'folder' | 'file', currentName: string) => void;
}

export interface FileTreeDnd {
  onMove: (srcRel: string, destDirRel: string) => void;
}

const EXT_ICONS: Record<string, typeof FileText> = {
  doc: FileText, docx: FileText, md: FileText, txt: FileText, pdf: FileText,
  ts: FileCode, tsx: FileCode, js: FileCode, json: FileCode, rs: FileCode, py: FileCode,
  xls: FileXls, xlsx: FileXls, csv: FileXls,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, fig: Image, psd: Image,
};

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const Icon = EXT_ICONS[ext] ?? File;
  return <Icon size={14} weight="duotone" className="text-text-tertiary shrink-0" />;
}

function countFiles(node: FileTreeNode): number {
  if (node.kind === 'file') return 1;
  return node.children.reduce((sum, c) => sum + countFiles(c), 0);
}

// parent dir of a rel path, '' at workspace root
const parentRel = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  menu,
  dnd,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (key: string) => void;
  menu?: FileTreeMenu;
  dnd?: FileTreeDnd;
}) {
  const padding = { paddingLeft: `${8 + depth * 14}px` };
  const [dragging, setDragging] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const dragProps = dnd
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData('text/plain', node.path);
          e.dataTransfer.effectAllowed = 'move';
          setDragging(true);
        },
        onDragEnd: () => setDragging(false),
      }
    : {};

  if (node.kind === 'file') {
    const row = (
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 pr-2 rounded-[var(--radius-sm)] hover:bg-bg-secondary text-sm',
          dragging && 'opacity-50',
        )}
        style={padding}
        {...dragProps}
      >
        <FileIcon name={node.name} />
        <span className="text-text-secondary truncate" title={node.path}>{node.name}</span>
      </div>
    );
    if (!menu) return row;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => menu.onReveal(node.path)}>
            <FolderOpen size={12} weight="duotone" className="text-text-tertiary" />
            在文件资源管理器中打开位置
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => menu.onCreate('dir', parentRel(node.path))}>
            <FolderPlus size={12} weight="duotone" className="text-text-tertiary" />
            新建文件夹
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => menu.onCreate('file', parentRel(node.path))}>
            <FilePlus size={12} weight="duotone" className="text-text-tertiary" />
            新建文件
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => menu.onRename(node.path, 'file', node.name)}>
            <PencilSimple size={12} weight="duotone" className="text-text-tertiary" />
            重命名
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  const key = node.name + '#' + depth; // ponytail: sibling-level key; upgrade to full path key if same-name sibling folders collide
  const isExpanded = expanded.has(key);
  const dropProps = dnd
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropActive(true);
        },
        onDragLeave: () => setDropActive(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation(); // don't bubble to the root container drop target
          setDropActive(false);
          setDragging(false);
          const src = e.dataTransfer.getData('text/plain');
          if (src && src !== node.path) dnd.onMove(src, node.path);
        },
      }
    : {};
  const header = (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={() => toggle(key)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle(key);
        }
      }}
      className={cn(
        'flex items-center gap-1.5 py-1 pr-2 rounded-[var(--radius-sm)] hover:bg-bg-secondary cursor-pointer outline-none focus-visible:bg-bg-secondary transition-colors text-sm',
        dragging && 'opacity-50',
        dropActive && 'bg-accent-subtle',
      )}
      style={padding}
      {...dragProps}
      {...dropProps}
    >
      {isExpanded
        ? <CaretDown size={10} className="text-text-tertiary shrink-0" />
        : <CaretRight size={10} className="text-text-tertiary shrink-0" />}
      <Folder size={14} weight="duotone" className="text-accent shrink-0" />
      <span className="text-text-primary font-medium truncate">{node.name}</span>
      <span className="text-[10px] text-text-tertiary shrink-0">{countFiles(node)}</span>
    </div>
  );
  return (
    <div>
      {menu ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => menu.onReveal(node.path)}>
              <FolderOpen size={12} weight="duotone" className="text-text-tertiary" />
              在文件资源管理器中打开位置
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => menu.onCreate('dir', node.path)}>
              <FolderPlus size={12} weight="duotone" className="text-text-tertiary" />
              新建文件夹
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => menu.onCreate('file', node.path)}>
              <FilePlus size={12} weight="duotone" className="text-text-tertiary" />
              新建文件
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => menu.onRename(node.path, 'folder', node.name)}>
              <PencilSimple size={12} weight="duotone" className="text-text-tertiary" />
              重命名
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : header}
      {isExpanded && node.children.map((child, i) => (
        <TreeRow key={child.name + i} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} menu={menu} dnd={dnd} />
      ))}
    </div>
  );
}

export function FileTree({
  nodes,
  defaultExpandedDepth = 1,
  emptyText = '暂无文件',
  menu,
  dnd,
}: {
  nodes: FileTreeNode[];
  defaultExpandedDepth?: number;
  emptyText?: string;
  menu?: FileTreeMenu;
  dnd?: FileTreeDnd;
}) {
  const initial = new Set<string>();
  const collect = (list: FileTreeNode[], depth: number) => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.kind !== 'folder') continue;
      const key = n.name + '#' + depth;
      if (depth < defaultExpandedDepth) initial.add(key);
      collect(n.children, depth + 1);
    }
  };
  collect(nodes, 0);
  const [expanded, setExpanded] = useState<Set<string>>(initial);
  const [rootDropActive, setRootDropActive] = useState(false);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (nodes.length === 0) {
    return <div className="text-center text-sm text-text-tertiary py-4">{emptyText}</div>;
  }

  const tree = (
    <div
      className={cn('text-sm', dnd && rootDropActive && 'bg-accent-subtle')}
      {...(dnd
        ? {
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setRootDropActive(true);
            },
            onDragLeave: () => setRootDropActive(false),
            onDrop: (e: React.DragEvent) => {
              e.preventDefault();
              setRootDropActive(false);
              const src = e.dataTransfer.getData('text/plain');
              if (src && src !== '' && parentRel(src) !== '') dnd.onMove(src, '');
            },
          }
        : {})}
    >
      {nodes.map((node, i) => (
        <TreeRow key={node.name + i} node={node} depth={0} expanded={expanded} toggle={toggle} menu={menu} dnd={dnd} />
      ))}
    </div>
  );

  if (!menu) return tree;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{tree}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => menu.onCreate('dir', '')}>
          <FolderPlus size={12} weight="duotone" className="text-text-tertiary" />
          新建文件夹
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => menu.onCreate('file', '')}>
          <FilePlus size={12} weight="duotone" className="text-text-tertiary" />
          新建文件
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
