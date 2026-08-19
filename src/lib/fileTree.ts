// buildFileTree — pure path-list → nested tree transform (no deps).

export type FileTreeNode =
  | { kind: 'folder'; name: string; path: string; children: FileTreeNode[] }
  | { kind: 'file'; name: string; path: string };

// internal: nested map — leaf value is the original path string, branches are Maps
function toTree(map: Map<string, unknown>, prefix: string): FileTreeNode[] {
  const folders: FileTreeNode[] = [];
  const files: FileTreeNode[] = [];
  for (const [name, value] of map) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (value instanceof Map) {
      folders.push({ kind: 'folder', name, path, children: toTree(value, path) });
    } else {
      files.push({ kind: 'file', name, path: value as string });
    }
  }
  const byName = (a: FileTreeNode, b: FileTreeNode) => a.name.localeCompare(b.name);
  return [...folders.sort(byName), ...files.sort(byName)];
}

// strip rootPath prefix (case-insensitive, Windows-safe); paths outside root are kept as-is
function relativize(p: string, rootPath: string): string {
  const pp = p.replace(/\\/g, '/');
  const rr = rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
  return pp.toLowerCase().startsWith(rr.toLowerCase() + '/') ? pp.slice(rr.length + 1) : pp;
}

// longest common ancestor directory of a path list ('' → undefined)
export function commonRootDir(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const posix = paths.map((p) => p.replace(/\\/g, '/'));
  let prefix = posix[0].slice(0, posix[0].lastIndexOf('/') + 1);
  for (const p of posix) {
    while (prefix && !p.toLowerCase().startsWith(prefix.toLowerCase())) {
      const i = prefix.lastIndexOf('/', prefix.length - 2);
      if (i < 0) { prefix = ''; break; }
      prefix = prefix.slice(0, i + 1);
    }
  }
  return prefix || undefined;
}

export function buildFileTree(paths: string[], rootPath?: string, dirs: string[] = []): FileTreeNode[] {
  const rel = (p: string) => (rootPath ? relativize(p, rootPath) : p);
  const root = new Map<string, unknown>();
  // explicit dir entries (incl. empty folders) become branch nodes
  for (const dir of dirs.map(rel).filter(Boolean)) {
    let node: Map<string, unknown> = root;
    for (const part of dir.replace(/\\/g, '/').split('/').filter(Boolean)) {
      const existing: unknown = node.get(part);
      const next = existing instanceof Map ? existing : new Map<string, unknown>();
      if (!(existing instanceof Map)) node.set(part, next);
      node = next;
    }
  }
  for (const raw of paths.map(rel).filter(Boolean)) {
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
  return toTree(root, '');
}
