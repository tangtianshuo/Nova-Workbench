import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../index';
import { confirmKnowledgeWrite, rejectKnowledgeWrite, type KnowledgeWriteCandidate } from '../confirmations';
import { executeTool } from '../registry';
import { useRndStore } from '../../stores/rndStore';

const productId = 'p1';
const category = '最佳实践' as const;

function args(overrides: Record<string, unknown> = {}) {
  return {
    productId,
    title: 'AI confirmation article',
    category,
    tags: ['ai', 'confirmation'],
    content: '# Candidate\n\nOnly confirmed content is persisted.',
    ...overrides,
  };
}

test('writeKnowledgeArticle stages a candidate and rejects unconfirmed mutation', async () => {
  const before = useRndStore.getState().knowledgeBase[productId]?.length ?? 0;
  let candidate: KnowledgeWriteCandidate | undefined;
  try {
    await executeTool('writeKnowledgeArticle', args());
    assert.fail('unconfirmed write must be rejected');
  } catch (error) {
    candidate = (error as { candidate?: KnowledgeWriteCandidate }).candidate;
    assert.equal(error instanceof Error, true);
  }
  assert.ok(candidate?.confirmationToken);
  assert.equal(useRndStore.getState().knowledgeBase[productId]?.length, before);
  await rejectKnowledgeWrite(candidate!.confirmationToken);
});

test('writeKnowledgeArticle creates only after matching explicit confirmation', async () => {
  const payload = args();
  let candidate: KnowledgeWriteCandidate | undefined;
  try {
    await executeTool('writeKnowledgeArticle', payload);
  } catch (error) {
    candidate = (error as { candidate?: KnowledgeWriteCandidate }).candidate;
  }
  assert.ok(candidate);
  await confirmKnowledgeWrite(candidate.confirmationToken);
  const result = await executeTool('writeKnowledgeArticle', {
    ...payload,
    confirmationToken: candidate.confirmationToken,
  }) as { articleId: string; operation: string };
  assert.equal(result.operation, 'created');
  const article = useRndStore.getState().knowledgeBase[productId]?.find((item) => item.id === result.articleId);
  assert.equal(article?.content, payload.content);
  assert.ok(!Number.isNaN(Date.parse(article?.updatedAt ?? '')), 'updatedAt must be an ISO timestamp since Phase 15');
  useRndStore.getState().deleteKnowledgeItem(productId, result.articleId);
});

test('writeKnowledgeArticle rejects a token before explicit confirmation and mismatched candidates', async () => {
  const payload = args({ title: 'Bound candidate' });
  let candidate: KnowledgeWriteCandidate | undefined;
  try {
    await executeTool('writeKnowledgeArticle', payload);
  } catch (error) {
    candidate = (error as { candidate?: KnowledgeWriteCandidate }).candidate;
  }
  assert.ok(candidate);
  await assert.rejects(
    executeTool('writeKnowledgeArticle', { ...payload, confirmationToken: candidate.confirmationToken }),
    /not been explicitly confirmed/,
  );
  await confirmKnowledgeWrite(candidate.confirmationToken);
  await assert.rejects(
    executeTool('writeKnowledgeArticle', {
      ...payload,
      title: 'Changed after confirmation',
      confirmationToken: candidate.confirmationToken,
    }),
    /do not match the confirmed candidate/,
  );
  assert.equal(useRndStore.getState().knowledgeBase[productId]?.some((item) => item.title === 'Bound candidate'), false);
  await rejectKnowledgeWrite(candidate.confirmationToken);
});

test('writeKnowledgeArticle updates in scope and rejects cross-product article IDs', async () => {
  const existing = useRndStore.getState().knowledgeBase[productId]?.[0];
  assert.ok(existing);
  const updatePayload = args({ itemId: existing.id, title: existing.title, content: `${existing.content}\n\nUpdated.` });
  let candidate: KnowledgeWriteCandidate | undefined;
  try {
    await executeTool('writeKnowledgeArticle', updatePayload);
  } catch (error) {
    candidate = (error as { candidate?: KnowledgeWriteCandidate }).candidate;
  }
  assert.ok(candidate);
  await confirmKnowledgeWrite(candidate.confirmationToken);
  const result = await executeTool('writeKnowledgeArticle', {
    ...updatePayload,
    confirmationToken: candidate.confirmationToken,
  }) as { articleId: string; operation: string };
  assert.deepEqual(result, { articleId: existing.id, operation: 'updated' });
  assert.equal(useRndStore.getState().knowledgeBase[productId]?.find((item) => item.id === existing.id)?.content, updatePayload.content);

  const otherProduct = Object.keys(useRndStore.getState().knowledgeBase).find((id) => id !== productId);
  if (otherProduct) {
    await assert.rejects(
      executeTool('writeKnowledgeArticle', args({ productId: otherProduct, itemId: existing.id })),
      /another product|not found/,
    );
  }
});

test('writeKnowledgeArticle rejects arbitrary path fields and invalid product IDs', async () => {
  await assert.rejects(
    executeTool('writeKnowledgeArticle', args({ path: 'C:\\secret\\article.md' })),
    /arg validation failed/,
  );
  await assert.rejects(
    executeTool('writeKnowledgeArticle', args({ productId: 'missing-product' })),
    /Product not found/,
  );
});

test('writeKnowledgeArticle accepts the UI knowledge categories used by ProductKnowledgeTab', async () => {
  let candidate: KnowledgeWriteCandidate | undefined;
  try {
    await executeTool('writeKnowledgeArticle', args({ category: '业务规则' }));
    assert.fail('unconfirmed write must be rejected');
  } catch (error) {
    candidate = (error as { candidate?: KnowledgeWriteCandidate }).candidate;
  }
  assert.equal(candidate?.category, '业务规则');
  await rejectKnowledgeWrite(candidate!.confirmationToken);
});
