/**
 * getLatestKnowledgeByCategory selector tests (quick-260903-gh0).
 * Covers the knowledge_write → tab card fallback projection.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLatestKnowledgeByCategory } from '../rndStore';
import type { ProductKnowledgeItem } from '../../data/mockRndData';

function item(id: string, category: ProductKnowledgeItem['category'], updatedAt?: string): ProductKnowledgeItem {
  return { id, productId: 'p1', title: `t-${id}`, category, updatedAt: updatedAt ?? '', tags: [], author: 'a', readTime: '1 分钟', summary: '', content: '' };
}

test('returns the latest updatedAt among multiple matches', () => {
  const items = [item('a', '竞品分析', '2026-01-01'), item('b', '竞品分析', '2026-09-02'), item('c', '竞品分析', '2026-05-01')];
  assert.equal(getLatestKnowledgeByCategory(items, '竞品分析')?.id, 'b');
});

test('returns undefined when no matching category', () => {
  assert.equal(getLatestKnowledgeByCategory([item('a', '架构设计', '2026-01-01')], '竞品分析'), undefined);
  assert.equal(getLatestKnowledgeByCategory([], '竞品分析'), undefined);
});

test('stable fallback: missing/equal updatedAt keeps array order (first wins, no throw)', () => {
  const items = [item('first', '架构设计'), item('second', '架构设计', ''), item('third', '架构设计')];
  assert.equal(getLatestKnowledgeByCategory(items, '架构设计')?.id, 'first');
  const same = [item('x', '竞品分析', '2026-01-01'), item('y', '竞品分析', '2026-01-01')];
  assert.equal(getLatestKnowledgeByCategory(same, '竞品分析')?.id, 'x');
});
