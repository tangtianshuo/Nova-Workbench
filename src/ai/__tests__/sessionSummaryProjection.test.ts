// Quick 260818-f3b — session summary projection: stable docId upsert
// (supersede on repeat), skip when no product, rndStore bucket increment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../index';
import { ChatSession } from '../chatSession';
import { deriveSummaryDoc, projectSessionSummary } from '../sessionSummaryProjection';
import { getMemoryKnowledgeRepo, resetMemoryKnowledgeRepo } from '../knowledgeRepo';
import { useUIStore } from '../../stores/uiStore';
import { useRndStore } from '../../stores/rndStore';
import { useProductStore } from '../../stores/productStore';

function buildSession(): ChatSession {
  const session = new ChatSession('proj-session-1');
  session.addMessage('user', '帮我规划一个智能音箱的新功能');
  session.addMessage('assistant', '[requesting tools]', 'tc-1', 'searchKnowledge');
  session.addMessage('tool', '[tool_result searchKnowledge] {"ok":true}', 'tc-1', 'searchKnowledge');
  session.addMessage('assistant', '[requesting tools]', 'tc-2', 'listTasks');
  session.addMessage('tool', '[tool_result listTasks] {"ok":true}', 'tc-2', 'listTasks');
  session.addMessage('tool', '[tool_result searchKnowledge] {"ok":true}', 'tc-1', 'searchKnowledge');
  session.addMessage('assistant', '调研完成。智能音箱可以增加离线语音唤醒与多房间联动两个方向,建议先做唤醒词自定义。');
  return session;
}

function resetAll(): void {
  resetMemoryKnowledgeRepo();
  useUIStore.setState({ selectedProductId: 'p1' });
  useRndStore.setState({ knowledgeBase: { p1: [] } });
}

test.afterEach(() => {
  useUIStore.setState({ selectedProductId: null });
});

test('projection writes doc session-summary-<sessionId> with agent provenance', async () => {
  resetAll();
  await projectSessionSummary(buildSession());
  const docs = await getMemoryKnowledgeRepo().getCurrentDocs('p1');
  const doc = docs.find((d) => d.docId === 'session-summary-proj-session-1');
  assert.ok(doc, 'summary doc exists');
  assert.equal(doc!.sourceType, 'agent');
  assert.equal(doc!.category, '经验沉淀');
  assert.equal(doc!.sourceSessionId, 'proj-session-1');
  assert.deepEqual(doc!.tags, ['会话纪要']);
  assert.equal(doc!.author, 'Nova Agent');
});

test('second projection supersedes v1 (version chain, no duplicates)', async () => {
  resetAll();
  const session = buildSession();
  await projectSessionSummary(session);
  session.addMessage('user', '再补充一下竞品分析');
  session.addMessage('assistant', '补充完成。竞品 A/B 均已支持唤醒词自定义。');
  await projectSessionSummary(session);

  const versions = await getMemoryKnowledgeRepo().listVersions('session-summary-proj-session-1');
  assert.equal(versions.length, 2);
  assert.equal(versions[1].supersededAt, null, 'v2 is current');
  assert.ok(versions[0].supersededAt, 'v1 superseded');
  const current = await getMemoryKnowledgeRepo().getCurrentDocs('p1');
  assert.equal(current.filter((d) => d.docId === 'session-summary-proj-session-1').length, 1);
});

test('no productId (store null, no explicit override) → no doc, no throw', async () => {
  resetAll();
  useUIStore.setState({ selectedProductId: null });
  await projectSessionSummary(buildSession());
  const docs = await getMemoryKnowledgeRepo().getCurrentDocs();
  assert.equal(docs.length, 0);
});

test('explicit productId param overrides the store selection', async () => {
  resetAll();
  useUIStore.setState({ selectedProductId: null });
  await projectSessionSummary(buildSession(), 'p1');
  const docs = await getMemoryKnowledgeRepo().getCurrentDocs('p1');
  assert.equal(docs.length, 1);
});

test('rndStore knowledgeBase bucket: item exists, replaced not appended', async () => {
  resetAll();
  const session = buildSession();
  await projectSessionSummary(session);
  let bucket = useRndStore.getState().knowledgeBase.p1;
  assert.equal(bucket.filter((k) => k.id === 'session-summary-proj-session-1').length, 1);
  assert.equal(bucket[0].category, '经验沉淀');

  session.addMessage('user', '再补充一下');
  session.addMessage('assistant', '补充完成。');
  await projectSessionSummary(session);
  bucket = useRndStore.getState().knowledgeBase.p1;
  assert.equal(bucket.filter((k) => k.id === 'session-summary-proj-session-1').length, 1, 'replaced, not appended');
});

test('content markdown includes deduped tool-call list; title uses product name', async () => {
  resetAll();
  const products = useProductStore.getState().products;
  const product = products[0];
  useUIStore.setState({ selectedProductId: product.id });
  useRndStore.setState({ knowledgeBase: { [product.id]: [] } });
  const doc = deriveSummaryDoc(buildSession(), product.id);
  assert.ok(doc.title.startsWith(`${product.name} 会话纪要:`), doc.title);
  assert.ok(doc.content.includes('searchKnowledge'));
  assert.ok(doc.content.includes('listTasks'));
  assert.ok(doc.content.includes('用户轮次'));
});

console.log('OK: sessionSummaryProjection tests passed');
