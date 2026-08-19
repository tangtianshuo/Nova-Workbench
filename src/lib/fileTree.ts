// buildFileTree — pure path-list → nested tree transform (no deps).

export type FileTreeNode =
  | { kind: 'folder'; name: string; children: FileTreeNode[] }
  | { kind: 'file'; name: string; path: string };

// internal: nested map — leaf value is the original path string, branches are Maps
function toTree(map: Map<string, unknown>): FileTreeNode[] {
  const folders: FileTreeNode[] = [];
  const files: FileTreeNode[] = [];
  for (const [name, value] of map) {
    if (value instanceof Map) {
      folders.push({ kind: 'folder', name, children: toTree(value) });
    } else {
      files.push({ kind: 'file', name, path: value as string });
    }
  }
  const byName = (a: FileTreeNode, b: FileTreeNode) => a.name.localeCompare(b.name);
  return [...folders.sort(byName), ...files.sort(byName)];
}

export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root = new Map<string, unknown>();
  for (const raw of paths) {
    const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
    let node: Map<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const existing: unknown = node.get(parts[i]);
      const next = existing instanceof Map ? existing : new Map<string, unknown>();
      if (!(existing instanceof Map)) node.set(parts[i], next);
      node = next;
    }
    const fileName = parts[parts.length - 1];
    if (fileName !== undefined && !(node.get(fileName) instanceof Map)) {
      node.set(fileName, raw);
    }
  }
  return toTree(root);
}
