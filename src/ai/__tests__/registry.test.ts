import assert from 'node:assert/strict';
import { z } from 'zod';
import '../index';
import { executeTool, listToolNames, ToolArgError, toolRegistry, toolsToOpenAI, toolsToSchemas } from '../registry';
import { useRndStore } from '../../stores/rndStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const expectedTools = [
  'createTask',
  'listTasks',
  'listProducts',
  'getProductDetails',
  'createScheduleEvent',
  'listScheduleEvents',
  'listWorkspaceFiles',
  'getCurrentContext',
  'updateWorkspaceSummary',
  'readKnowledgeArticle',
  'openView',
  'executeNavigation',
  'writeKnowledgeArticle',
  'updateTask',
  'deleteTask',
  'moveTask',
  'rescheduleTask',
  'setTaskPriority',
  'bulkCompleteTasks',
  'bulkDeleteTasks',
  'bulkUpdatePriority',
  'createEvent',
  'updateEvent',
  'deleteEvent',
  'listEvents',
  'associateTaskWithEvent',
  'getTaskDependencies',
  'getProductFeatureBreakdown',
  'getProductDocumentContext',
  'getPRDDraftContext',
  'generateDeliverable',
  'listKnowledgeArticles',
  'searchKnowledgeBase',
  'proposeMemory',
];

assert.deepEqual([...listToolNames()].sort(), [...expectedTools].sort());
assert.equal(toolRegistry.size, expectedTools.length);
assert.equal([...toolRegistry.values()].every(({ tool }) => tool.schema instanceof z.ZodType), true);
assert.equal(toolsToSchemas().length, expectedTools.length);
assert.equal(toolsToOpenAI().every((tool) => (tool as { type?: unknown }).type === 'function'), true);
assert.equal(toolsToSchemas().every((tool) => ((tool.parameters as { type?: unknown })?.type === 'object')), true);

try {
  await executeTool('createTask', {});
  assert.fail('createTask should reject missing title');
} catch (error) {
  assert.equal(error instanceof ToolArgError, true);
  assert.equal((error as ToolArgError).toolName, 'createTask');
  assert.equal((error as ToolArgError).zodIssues[0]?.path[0], 'title');
}

const context = await executeTool('getCurrentContext', {});
assert.equal(typeof context, 'object');

const originalWorkspaces = useWorkspaceStore.getState().workspaces;
try {
  useWorkspaceStore.setState({
    workspaces: [{
      ...originalWorkspaces[0],
      id: 'ws-limit-test',
      files: Array.from({ length: 51 }, (_, index) => ({
        id: `file-${index}`,
        name: `file-${index}.md`,
        type: 'doc' as const,
        size: '1 KB',
        updatedAt: '2026-08-10',
        path: `D:\\private\\file-${index}.md`,
        contentSnippet: 'x'.repeat(600),
      })),
    }],
  });

  const workspaceResult = await executeTool('listWorkspaceFiles', { workspaceId: 'ws-limit-test' }) as {
    files: Array<Record<string, unknown>>;
    truncated: boolean;
  };
  assert.equal(workspaceResult.files.length, 50);
  assert.equal(workspaceResult.truncated, true);
  assert.equal((workspaceResult.files[0].contentSnippet as string).length, 500);
  assert.equal('path' in workspaceResult.files[0], false);
  assert.equal('fullPath' in workspaceResult.files[0], false);
} finally {
  useWorkspaceStore.setState({ workspaces: originalWorkspaces });
}

const article = useRndStore.getState().knowledgeBase.p1?.[0];
assert.ok(article);
const articleResult = await executeTool('readKnowledgeArticle', {
  productId: 'p1',
  itemId: article.id,
}) as { article: typeof article };
assert.deepEqual(articleResult.article, article);

const crossProductResult = await executeTool('readKnowledgeArticle', {
  productId: 'p2',
  itemId: article.id,
}) as { ok: boolean; error: { code: string; productId: string; itemId: string } };
assert.equal(crossProductResult.ok, false);
assert.equal(crossProductResult.error.code, 'KNOWLEDGE_ARTICLE_NOT_FOUND');
assert.equal(crossProductResult.error.productId, 'p2');
assert.equal(crossProductResult.error.itemId, article.id);
assert.equal('article' in crossProductResult, false);

console.log(`OK: ${expectedTools.length} AI tools registered and Phase 11 read smoke checks passed`);
