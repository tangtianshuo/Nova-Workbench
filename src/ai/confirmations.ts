import type { ProductKnowledgeItem } from '../stores/rndStore';

export type KnowledgeWriteOperation = 'created' | 'updated';

export interface KnowledgeWriteDraft {
  productId: string;
  itemId?: string;
  operation: KnowledgeWriteOperation;
  title: string;
  category: ProductKnowledgeItem['category'];
  tags: string[];
  content: string;
  summary: string;
  author: string;
  readTime: string;
}

export interface KnowledgeWriteCandidate extends KnowledgeWriteDraft {
  confirmationToken: string;
}

interface PendingConfirmation {
  candidate: KnowledgeWriteCandidate;
  status: 'pending' | 'confirmed';
}

const pendingConfirmations = new Map<string, PendingConfirmation>();

export class ConfirmationRequiredError extends Error {
  constructor(public readonly candidate: KnowledgeWriteCandidate) {
    super('Explicit confirmation is required before writing knowledge.');
    this.name = 'ConfirmationRequiredError';
  }
}

export class KnowledgeWriteConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeWriteConfirmationError';
  }
}

export function createKnowledgeWriteCandidate(draft: KnowledgeWriteDraft): KnowledgeWriteCandidate {
  const confirmationToken = globalThis.crypto.randomUUID();
  const candidate = { ...draft, tags: [...draft.tags], confirmationToken };
  pendingConfirmations.set(confirmationToken, { candidate, status: 'pending' });
  return candidate;
}

export function getKnowledgeWriteCandidate(confirmationToken: string): KnowledgeWriteCandidate | undefined {
  return pendingConfirmations.get(confirmationToken)?.candidate;
}

export function confirmKnowledgeWrite(confirmationToken: string): KnowledgeWriteCandidate {
  const pending = pendingConfirmations.get(confirmationToken);
  if (!pending) {
    throw new KnowledgeWriteConfirmationError('Knowledge write confirmation token is invalid or expired.');
  }
  pending.status = 'confirmed';
  return pending.candidate;
}

function sameDraft(left: KnowledgeWriteDraft, right: KnowledgeWriteDraft): boolean {
  return left.productId === right.productId
    && left.itemId === right.itemId
    && left.operation === right.operation
    && left.title === right.title
    && left.category === right.category
    && left.content === right.content
    && left.summary === right.summary
    && left.author === right.author
    && left.readTime === right.readTime
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index]);
}

export function consumeKnowledgeWriteConfirmation(
  confirmationToken: string,
  draft: KnowledgeWriteDraft,
): KnowledgeWriteCandidate {
  const pending = pendingConfirmations.get(confirmationToken);
  if (!pending) {
    throw new KnowledgeWriteConfirmationError('Knowledge write confirmation token is invalid or expired.');
  }
  if (pending.status !== 'confirmed') {
    throw new KnowledgeWriteConfirmationError('Knowledge write candidate has not been explicitly confirmed.');
  }
  if (!sameDraft(pending.candidate, draft)) {
    throw new KnowledgeWriteConfirmationError('Knowledge write arguments do not match the confirmed candidate.');
  }

  pendingConfirmations.delete(confirmationToken);
  return pending.candidate;
}

export function rejectKnowledgeWrite(confirmationToken: string): boolean {
  return pendingConfirmations.delete(confirmationToken);
}

export interface DestructiveActionCandidate {
  confirmationToken: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

interface PendingDestructiveAction {
  candidate: DestructiveActionCandidate;
  status: 'pending' | 'confirmed';
}

const pendingDestructiveActions = new Map<string, PendingDestructiveAction>();

export class DestructiveActionConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DestructiveActionConfirmationError';
  }
}

export function createDestructiveActionCandidate(
  toolName: string,
  args: Record<string, unknown>,
  summary: string,
): DestructiveActionCandidate {
  const confirmationToken = globalThis.crypto.randomUUID();
  const candidate = {
    confirmationToken,
    toolName,
    args: { ...args },
    summary,
  };
  pendingDestructiveActions.set(confirmationToken, { candidate, status: 'pending' });
  return candidate;
}

export function confirmDestructiveAction(confirmationToken: string): DestructiveActionCandidate {
  const pending = pendingDestructiveActions.get(confirmationToken);
  if (!pending) {
    throw new DestructiveActionConfirmationError('Destructive action confirmation token is invalid or expired.');
  }
  pending.status = 'confirmed';
  return pending.candidate;
}

export function rejectDestructiveAction(confirmationToken: string): boolean {
  return pendingDestructiveActions.delete(confirmationToken);
}

export function consumeDestructiveActionConfirmation(
  confirmationToken: string,
  toolName: string,
  args: Record<string, unknown>,
): DestructiveActionCandidate {
  const pending = pendingDestructiveActions.get(confirmationToken);
  if (!pending) {
    throw new DestructiveActionConfirmationError('Destructive action confirmation token is invalid or expired.');
  }
  if (pending.status !== 'confirmed') {
    throw new DestructiveActionConfirmationError('Destructive action has not been explicitly confirmed.');
  }
  if (pending.candidate.toolName !== toolName || JSON.stringify(pending.candidate.args) !== JSON.stringify(args)) {
    throw new DestructiveActionConfirmationError('Destructive action arguments do not match the confirmed action.');
  }
  pendingDestructiveActions.delete(confirmationToken);
  return pending.candidate;
}
