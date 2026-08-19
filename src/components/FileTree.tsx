import { useState } from 'react';
import { CaretDown, CaretRight, Folder, FileText, FileCode, FileXls, Image, File } from '@phosphor-icons/react';
import type { FileTreeNode } from '@/src/lib/fileTree';

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

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (key: string) => void;
}) {
  const padding = { paddingLeft: `${8 + depth * 14}px` };

  if (node.kind === 'file') {
    return (
      <div className="flex items-center gap-1.5 py-1 pr-2 rounded-[var(--radius-sm)] hover:bg-bg-secondary text-sm" style={padding}>
        <FileIcon name={node.name} />
        <span className="text-text-secondary truncate" title={node.path}>{node.name}</span>
      </div>
    );
  }

  const key = node.name + '#' + depth; // ponytail: sibling-level key; upgrade to full path key if same-name sibling folders collide
  const isExpanded = expanded.has(key);
  return (
    <div>
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
        className="flex items-center gap-1.5 py-1 pr-2 rounded-[var(--radius-sm)] hover:bg-bg-secondary cursor-pointer outline-none focus-visible:bg-bg-secondary transition-colors text-sm"
        style={padding}
      >
        {isExpanded
          ? <CaretDown size={10} className="text-text-tertiary shrink-0" />
          : <CaretRight size={10} className="text-text-tertiary shrink-0" />}
        <Folder size={14} weight="duotone" className="text-accent shrink-0" />
        <span className="text-text-primary font-medium truncate">{node.name}</span>
        <span className="text-[10px] text-text-tertiary shrink-0">{countFiles(node)}</span>
      </div>
      {isExpanded && node.children.map((child, i) => (
        <TreeRow key={child.name + i} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} />
      ))}
    </div>
  );
}

export function FileTree({
  nodes,
  defaultExpandedDepth = 1,
  emptyText = '暂无文件',
}: {
  nodes: FileTreeNode[];
  defaultExpandedDepth?: number;
  emptyText?: string;
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

  return (
    <div className="text-sm">
      {nodes.map((node, i) => (
        <TreeRow key={node.name + i} node={node} depth={0} expanded={expanded} toggle={toggle} />
      ))}
    </div>
  );
}
