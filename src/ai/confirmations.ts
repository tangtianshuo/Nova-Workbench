// Phase 14 (EVT-05) — confirmation candidates persist in SQLite (Tauri) / the memory store (Node tests).
// Public names unchanged from Phase 9; every function is now async. Restart-safe: pending candidates are
// re-listed from the store, never from a module Map. Consumption is atomic (conditional UPDATE) — no
// double-consume across restarts or concurrent callers.
import type { ProductKnowledgeItem } from '../stores/rndStore';
import {
  ConfirmationStoreError,
  getConfirmationStore,
  type PersistedConfirmation,
} from './confirmationStore';
import { computeParamsHash } from './paramsHash';

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

export class DestructiveActionConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DestructiveActionConfirmationError';
  }
}

export interface DestructiveActionCandidate {
  confirmationToken: string;
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
}

/* === Private helpers === */

function knowledgeParams(draft: KnowledgeWriteDraft): Record<string, unknown> {
  return {
    productId: draft.productId,
    itemId: draft.itemId,
    operation: draft.operation,
    title: draft.title,
    category: draft.category,
    tags: [...draft.tags],
    content: draft.content,
    summary: draft.summary,
    author: draft.author,
    readTime: draft.readTime,
  };
}

function destructiveParams(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return { toolName, args: JSON.parse(JSON.stringify(args)) };
}

function draftFromParams(params: Record<string, unknown>): KnowledgeWriteDraft {
  const p = params as {
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
  };
  return {
    productId: p.productId,
    itemId: p.itemId,
    operation: p.operation,
    title: p.title,
    category: p.category,
    tags: [...p.tags],
    content: p.content,
    summary: p.summary,
    author: p.author,
    readTime: p.readTime,
  };
}

function candidateFromRow(row: PersistedConfirmation): KnowledgeWriteCandidate {
  return { ...draftFromParams(row.params), confirmationToken: row.confirmationToken };
}

function destructiveFromRow(row: PersistedConfirmation): DestructiveActionCandidate {
  const p = row.params as { toolName: string; args: Record<string, unknown> };
  return {
    confirmationToken: row.confirmationToken,
    toolName: p.toolName,
    args: p.args,
    summary: row.summary ?? '',
  };
}

function knowledgeErrorMessage(code: ConfirmationStoreError['code']): string {
  if (code === 'not_confirmed') return 'Knowledge write candidate has not been explicitly confirmed.';
  if (code === 'params_mismatch') return 'Knowledge write arguments do not match the confirmed candidate.';
  return 'Knowledge write confirmation token is invalid or expired.';
}

function destructiveErrorMessage(code: ConfirmationStoreError['code']): string {
  if (code === 'not_confirmed') return 'Destructive action has not been explicitly confirmed.';
  if (code === 'params_mismatch') return 'Destructive action arguments do not match the confirmed action.';
  return 'Destructive action confirmation token is invalid or expired.';
}

function isRowAlive(row: PersistedConfirmation): boolean {
  if (row.status === 'consumed' || row.status === 'rejected') return true;
  if (row.expiresAt <= new Date().toISOString()) return true;
  return false;
}

/* === Public async API === */

export async function createKnowledgeWriteCandidate(
  draft: KnowledgeWriteDraft,
): Promise<KnowledgeWriteCandidate> {
  const row = await getConfirmationStore().create({
    kind: 'knowledge_write',
    params: knowledgeParams(draft),
    summary: draft.title,
    sessionId: null,
  });
  return { ...draft, tags: [...draft.tags], confirmationToken: row.confirmationToken };
}

export async function getKnowledgeWriteCandidate(
  confirmationToken: string,
): Promise<KnowledgeWriteCandidate | undefined> {
  const row = await getConfirmationStore().get(confirmationToken);
  if (!row) return undefined;
  if (row.kind !== 'knowledge_write') return undefined;
  if (isRowAlive(row)) return undefined;
  return candidateFromRow(row);
}

export async function confirmKnowledgeWrite(
  confirmationToken: string,
): Promise<KnowledgeWriteCandidate> {
  try {
    const row = await getConfirmationStore().confirm(confirmationToken);
    return candidateFromRow(row);
  } catch (error) {
    if (error instanceof ConfirmationStoreError) {
      throw new KnowledgeWriteConfirmationError(knowledgeErrorMessage(error.code));
    }
    throw error;
  }
}

export async function consumeKnowledgeWriteConfirmation(
  confirmationToken: string,
  draft: KnowledgeWriteDraft,
): Promise<KnowledgeWriteCandidate> {
  const hash = await computeParamsHash(knowledgeParams(draft));
  try {
    const row = await getConfirmationStore().consume(confirmationToken, hash);
    return candidateFromRow(row);
  } catch (error) {
    if (error instanceof ConfirmationStoreError) {
      throw new KnowledgeWriteConfirmationError(knowledgeErrorMessage(error.code));
    }
    throw error;
  }
}

export async function rejectKnowledgeWrite(confirmationToken: string): Promise<boolean> {
  return getConfirmationStore().reject(confirmationToken);
}

export async function createDestructiveActionCandidate(
  toolName: string,
  args: Record<string, unknown>,
  summary: string,
): Promise<DestructiveActionCandidate> {
  const row = await getConfirmationStore().create({
    kind: 'destructive_action',
    params: destructiveParams(toolName, args),
    summary,
    sessionId: null,
  });
  return {
    confirmationToken: row.confirmationToken,
    toolName,
    args: { ...args },
    summary,
  };
}

export async function confirmDestructiveAction(
  confirmationToken: string,
): Promise<DestructiveActionCandidate> {
  try {
    const row = await getConfirmationStore().confirm(confirmationToken);
    return destructiveFromRow(row);
  } catch (error) {
    if (error instanceof ConfirmationStoreError) {
      throw new DestructiveActionConfirmationError(destructiveErrorMessage(error.code));
    }
    throw error;
  }
}

export async function rejectDestructiveAction(confirmationToken: string): Promise<boolean> {
  return getConfirmationStore().reject(confirmationToken);
}

export async function consumeDestructiveActionConfirmation(
  confirmationToken: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<DestructiveActionCandidate> {
  const hash = await computeParamsHash(destructiveParams(toolName, args));
  try {
    const row = await getConfirmationStore().consume(confirmationToken, hash);
    return destructiveFromRow(row);
  } catch (error) {
    if (error instanceof ConfirmationStoreError) {
      throw new DestructiveActionConfirmationError(destructiveErrorMessage(error.code));
    }
    throw error;
  }
}

export async function listPendingKnowledgeWrites(): Promise<KnowledgeWriteCandidate[]> {
  const rows = await getConfirmationStore().listActive('knowledge_write');
  return rows.map(candidateFromRow);
}

export async function listPendingDestructiveActions(): Promise<DestructiveActionCandidate[]> {
  const rows = await getConfirmationStore().listActive('destructive_action');
  return rows.map(destructiveFromRow);
}

/* === Phase 16: deliverable draft candidates (PRD pipeline, DELIV-01..03) === */

export type DeliverableCode = 'prd';

export interface DeliverableDraftCandidate {
  confirmationToken: string;
  productId: string;
  code: DeliverableCode;
  title: string;
  draft: string;
  sessionId: string | null;
  /** correlation_id of the generating turn — queryable in agent_events (source-event pointer). */
  eventId: string | null;
  createdAt: string;
}

export class DeliverableDraftConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliverableDraftConfirmationError';
  }
}

// type alias (not interface) so `row.params as DeliverableParams` passes tsc —
// object-literal types get an implicit index signature, interfaces don't.
type DeliverableParams = {
  code: DeliverableCode;
  productId: string;
  title: string;
  draft: string;
  eventId: string | null;
};

// eventId rides in params so provenance survives restart, but is excluded from
// the dedup key: a later turn re-generating the same draft still dedups to the
// original candidate.
function deliverableParams(input: {
  code: DeliverableCode;
  productId: string;
  title: string;
  draft: string;
  eventId: string | null;
}): Record<string, unknown> {
  return {
    code: input.code,
    productId: input.productId,
    title: input.title,
    draft: input.draft,
    eventId: input.eventId,
  };
}

function deliverableFromRow(row: PersistedConfirmation): DeliverableDraftCandidate {
  const p = row.params as DeliverableParams;
  return {
    confirmationToken: row.confirmationToken,
    productId: p.productId,
    code: p.code,
    title: p.title,
    draft: p.draft,
    sessionId: row.sessionId,
    eventId: p.eventId ?? null,
    createdAt: row.createdAt,
  };
}

function deliverableErrorMessage(code: ConfirmationStoreError['code']): string {
  if (code === 'not_confirmed') return 'Deliverable draft candidate has not been explicitly confirmed.';
  if (code === 'params_mismatch') return 'Deliverable draft arguments do not match the confirmed candidate.';
  return 'Deliverable draft confirmation token is invalid or expired.';
}

// paramsHash dedup (locked decision): agent_confirmation_candidates has no
// UNIQUE constraint on params_hash, so dedup happens here — same content
// returns the SAME token without inserting a row.
export async function createDeliverableDraftCandidate(input: {
  productId: string;
  code: DeliverableCode;
  title: string;
  draft: string;
  sessionId: string | null;
  eventId: string | null;
}): Promise<DeliverableDraftCandidate> {
  const active = await getConfirmationStore().listActive('deliverable_draft');
  const duplicate = active.find((row) => {
    const p = row.params as DeliverableParams;
    return p.code === input.code
      && p.productId === input.productId
      && p.title === input.title
      && p.draft === input.draft;
  });
  if (duplicate) return deliverableFromRow(duplicate);
  const row = await getConfirmationStore().create({
    kind: 'deliverable_draft',
    params: deliverableParams(input),
    summary: input.title,
    sessionId: input.sessionId,
  });
  return deliverableFromRow(row);
}

export async function getDeliverableDraftCandidate(
  confirmationToken: string,
): Promise<DeliverableDraftCandidate | undefined> {
  const row = await getConfirmationStore().get(confirmationToken);
  if (!row) return undefined;
  if (row.kind !== 'deliverable_draft') return undefined;
  if (isRowAlive(row)) return undefined;
  return deliverableFromRow(row);
}

export async function confirmDeliverableDraft(
  confirmationToken: string,
): Promise<DeliverableDraftCandidate> {
  try {
    const row = await getConfirmationStore().confirm(confirmationToken);
    return deliverableFromRow(row);
  } catch (error) {
    if (error instanceof ConfirmationStoreError) {
      throw new DeliverableDraftConfirmationError(deliverableErrorMessage(error.code));
    }
    throw error;
  }
}

export async function rejectDeliverableDraft(confirmationToken: string): Promise<boolean> {
  return getConfirmationStore().reject(confirmationToken);
}

export async function listPendingDeliverableDrafts(): Promise<DeliverableDraftCandidate[]> {
  const rows = await getConfirmationStore().listActive('deliverable_draft');
  return rows.map(deliverableFromRow);
}

export async function listRejectedDeliverableDrafts(limit = 5): Promise<DeliverableDraftCandidate[]> {
  const rows = await getConfirmationStore().listRejected('deliverable_draft', limit);
  return rows.map(deliverableFromRow);
}

// 关键设计:锁定决策「确认→编辑→落槽」使内容 hash 匹配不可能(draft 被用户
// 编辑)。消费 hash 从 candidate 的原始字段重算(非调用方编辑后的 draft),
// 必然等于行内 paramsHash。防护来自:① store 原子条件 UPDATE(双并发恰一
// 成功,Phase 14 不变量);② tool 内 args↔candidate 身份校验。
export async function consumeDeliverableDraftConfirmation(
  candidate: DeliverableDraftCandidate,
): Promise<DeliverableDraftCandidate> {
  const hash = await computeParamsHash(deliverableParams(candidate));
  try {
    const row = await getConfirmationStore().consume(candidate.confirmationToken, hash);
    return deliverableFromRow(row);
  } catch (error) {
    if (error instanceof ConfirmationStoreError) {
      throw new DeliverableDraftConfirmationError(deliverableErrorMessage(error.code));
    }
    throw error;
  }
}
