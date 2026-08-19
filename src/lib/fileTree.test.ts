import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFileTree, commonRootDir } from './fileTree.ts';

describe('buildFileTree', () => {
  it('empty input → empty output', () => {
    assert.deepEqual(buildFileTree([]), []);
  });

  it('nests paths into folders', () => {
    const tree = buildFileTree(['a/b/c.txt', 'a/d.txt', 'e.txt']);
    assert.equal(tree.length, 2);
    const a = tree[0];
    assert.equal(a.kind, 'folder');
    assert.equal(a.name, 'a');
    if (a.kind !== 'folder') return;
    assert.equal(a.children.length, 2);
    const b = a.children[0];
    assert.equal(b.kind, 'folder');
    assert.equal(b.name, 'b');
    if (b.kind !== 'folder') return;
    assert.equal(b.children.length, 1);
    assert.deepEqual(b.children[0], { kind: 'file', name: 'c.txt', path: 'a/b/c.txt' });
    assert.deepEqual(a.children[1], { kind: 'file', name: 'd.txt', path: 'a/d.txt' });
    assert.deepEqual(tree[1], { kind: 'file', name: 'e.txt', path: 'e.txt' });
  });

  it('folders before files, each sorted by name', () => {
    const tree = buildFileTree(['z.txt', 'b-folder/x.md', 'a-folder/y.md', 'a.txt']);
    assert.deepEqual(tree.map((n) => n.name), ['a-folder', 'b-folder', 'a.txt', 'z.txt']);
  });

  it('normalizes backslash paths (Windows)', () => {
    const tree = buildFileTree(['D:\\ws\\docs\\PRD.docx']);
    assert.equal(tree.length, 1);
    const d = tree[0];
    assert.equal(d.kind, 'folder');
    assert.equal(d.name, 'D:');
    if (d.kind !== 'folder') return;
    assert.equal(d.children[0]?.name, 'ws');
    const ws = d.children[0];
    if (ws?.kind !== 'folder') return;
    assert.deepEqual(ws.children[0]?.name, 'docs');
    const docs = ws.children[0];
    if (docs?.kind !== 'folder') return;
    assert.deepEqual(docs.children[0], {
      kind: 'file',
      name: 'PRD.docx',
      path: 'D:\\ws\\docs\\PRD.docx',
    });
  });

  it('strips rootPath prefix (backslash + case-insensitive)', () => {
    const tree = buildFileTree(['D:\\ws\\docs\\PRD.docx', 'D:\\ws\\readme.md'], 'd:/ws/');
    assert.deepEqual(tree.map((n) => n.name), ['docs', 'readme.md']);
    const docs = tree[0];
    if (docs?.kind !== 'folder') return;
    assert.deepEqual(docs.children[0], { kind: 'file', name: 'PRD.docx', path: 'docs/PRD.docx' });
  });

  it('keeps paths outside rootPath as-is', () => {
    const tree = buildFileTree(['E:\\other\\x.txt'], 'D:/ws');
    const e = tree[0];
    if (e?.kind !== 'folder') return;
    assert.equal(e.name, 'E:');
  });

  it('commonRootDir finds shared ancestor and undefined edge cases', () => {
    assert.equal(commonRootDir([]), undefined);
    assert.equal(commonRootDir(['D:/a/b/x.txt']), 'D:/a/b/');
    assert.equal(commonRootDir(['D:\\a\\b\\x.txt', 'd:/A/c/y.txt']), 'D:/a/');
    assert.equal(commonRootDir(['D:/a/x.txt', 'E:/a/y.txt']), undefined);
  });

  it('creates implicit intermediate folders', () => {
    const tree = buildFileTree(['x/y/z/deep.md']);
    let node = tree[0];
    for (const name of ['x', 'y', 'z']) {
      assert.equal(node.kind, 'folder');
      assert.equal(node.name, name);
      if (node.kind !== 'folder') return;
      node = node.children[0];
    }
    assert.deepEqual(node, { kind: 'file', name: 'deep.md', path: 'x/y/z/deep.md' });
  });
});
