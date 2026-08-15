// src/ai/compaction.ts
// Phase 14 (CMP-01/CMP-02) — token-pressure compaction at pairing-balanced turn
// boundaries. Projection-only: agent_events is append-only and never loses events;
// compaction appends compaction_started / compaction_completed events and rebuilds
// the session projection as [sourced summary] + suffix turns. Split-point validity
// reuses Phase 13's checkEventStream (pairing + seq invariants).
import { chatWithTools, type Provider } from '@/src/lib/api';
import type { ChatSession, CompactionSummaryRecord } from './chatSession';
import type { AgentEvent } from './events/types';
import { getEventStore } from './events/eventStore';
import { checkEventStream } from './events/invariants';
import { estimateTokens } from './tokenEstimate';

export const COMPACTION_PRESSURE_RATIO = 0.8; // trigger: pressure >= 0.8 x context window
export const COMPACTION_KEEP_RATIO = 0.5;     // raw suffix kept after split <= 0.5 x window
export const COMPACTION_TRANSCRIPT_MAX_CHARS = 12_000;
export const COMPACTION_SOURCE_MAX_CHARS = 2_000;

export type CompactionSummarizer = (input: {
  transcript: string;
  provider: Provider;
  ollamaModel?: string;
}) => Promise<string>;

export interface CompactionOptions {
  ollamaModel?: string;
  summarizer?: CompactionSummarizer; // tests inject a fake; production uses chatWithTools
  force?: boolean;                    // bypass the pressure gate (tests / manual)
}

export function tokenPressure(session: ChatSession): number {
  return session.estimateTokens() / session.tokenBudget;
}

function estimateEventTokens(event: AgentEvent): number {
  const payload = event.payload;
  switch (event.eventType) {
    case 'user_message':
    case 'assistant_message':
      return estimateTokens(String(payload.content ?? ''));
    case 'tool_call':
      return estimateTokens(String(payload.content ?? '')) + estimateTokens(JSON.stringify(payload.args ?? {}));
    case 'tool_result':
      return estimateTokens(String(payload.modelText ?? ''));
    default:
      return 0;
  }
}

function endsAtTurnBoundary(event: AgentEvent): boolean {
  return event.eventType === 'turn_ended';
}

/** Largest seq S (on a turn_ended boundary) such that events[seq<=S] is fully
 * pairing-balanced (checkEventStream clean), the suffix estimates <= keepTokenTarget,
 * and the prefix contains at least one turn_ended. Returns 0 when no split qualifies —
 * the caller then skips compaction rather than splitting inside a tool pair. */
export function findCompactionSplitPoint(events: AgentEvent[], keepTokenTarget: number): number {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const suffixTokens: number[] = [];
  let total = 0;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    total += estimateEventTokens(sorted[i]);
    suffixTokens[i] = total;
  }
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const candidate = sorted[i];
    if (!endsAtTurnBoundary(candidate)) continue;
    const suffixAfter = i + 1 < sorted.length ? suffixTokens[i + 1] : 0;
    if (suffixAfter > keepTokenTarget) continue;
    const prefix = sorted.slice(0, i + 1);
    if (prefix.filter((e) => e.eventType === 'turn_ended').length < 1) continue;
    if (checkEventStream(prefix).length !== 0) continue;
    return candidate.seq;
  }
  return 0;
}

/** Model-visible transcript of the prefix, each source line capped; if the prefix
 * itself contains an earlier compaction_completed, its summary is carried forward
 * first so successive compactions never drop the older summary. */
export function buildCompactionTranscript(prefix: AgentEvent[]): string {
  const lines: string[] = [];
  for (const event of prefix) {
    const payload = event.payload;
    if (event.eventType === 'compaction_completed' && typeof payload.summaryText === 'string') {
      lines.push(`[earlier compressed summary] ${payload.summaryText.slice(0, COMPACTION_SOURCE_MAX_CHARS)}`);
    } else if (event.eventType === 'user_message' || event.eventType === 'assistant_message') {
      lines.push(`${event.eventType === 'user_message' ? 'user' : 'assistant'}: ${String(payload.content ?? '').slice(0, COMPACTION_SOURCE_MAX_CHARS)}`);
    } else if (event.eventType === 'tool_call') {
      lines.push(`tool_call: ${String(payload.toolName ?? '?')} ${JSON.stringify(payload.args ?? {}).slice(0, COMPACTION_SOURCE_MAX_CHARS)}`);
    } else if (event.eventType === 'tool_result') {
      lines.push(`tool_result: ${String(payload.modelText ?? '').slice(0, COMPACTION_SOURCE_MAX_CHARS)}`);
    }
  }
  const joined = lines.join('\n');
  return joined.length <= COMPACTION_TRANSCRIPT_MAX_CHARS
    ? joined
    : `${joined.slice(0, COMPACTION_TRANSCRIPT_MAX_CHARS)}\n[transcript truncated]`;
}

const COMPACTION_SYSTEM_PROMPT = [
  'You compress earlier conversation history for a product-manager AI workspace.',
  '用中文写 200-400 字摘要,必须保留:用户目标、已完成的操作与结果(含关键 ID/数据)、未完成事项与待确认项。',
  '只总结提供的内容,不得虚构。直接输出摘要正文。',
].join('\n');

export async function defaultCompactionSummarizer(input: { transcript: string; provider: Provider; ollamaModel?: string }): Promise<string> {
  const result = await chatWithTools({
    messages: [{ role: 'user', content: input.transcript }],
    tools: [],
    systemPrompt: COMPACTION_SYSTEM_PROMPT,
    provider: input.provider,
    ollamaModel: input.ollamaModel,
  });
  const summary = result.content.trim();
  if (!summary) throw new Error('Compaction summarizer returned an empty summary.');
  return summary;
}

/** Compact when pressure >= COMPACTION_PRESSURE_RATIO (or options.force). Returns the
 * persisted record, or null when skipped. Append-only: original events untouched. */
export async function maybeCompactSession(
  session: ChatSession,
  provider: Provider,
  options?: CompactionOptions,
): Promise<CompactionSummaryRecord | null> {
  if (!options?.force && tokenPressure(session) < COMPACTION_PRESSURE_RATIO) return null;
  const store = getEventStore();
  const events = await store.listEvents(session.sessionId);
  if (events.length === 0) return null;

  const keepTarget = Math.floor(session.tokenBudget * COMPACTION_KEEP_RATIO);
  const splitSeq = findCompactionSplitPoint(events, keepTarget);
  if (splitSeq <= 0) return null;

  const prefix = events.filter((event) => event.seq <= splitSeq);
  const suffix = events.filter((event) => event.seq > splitSeq);
  const startedAt = new Date().toISOString();
  await store.append({
    sessionId: session.sessionId,
    eventType: 'compaction_started',
    payload: { reason: 'token_pressure', pressure: tokenPressure(session), threshold: COMPACTION_PRESSURE_RATIO, splitSeq },
  });

  const transcript = buildCompactionTranscript(prefix);
  const summarizer = options?.summarizer ?? defaultCompactionSummarizer;
  const summaryText = await summarizer({ transcript, provider, ollamaModel: options?.ollamaModel });
  const generatedAt = new Date().toISOString();
  const model = provider === 'ollama' && options?.ollamaModel ? `ollama:${options.ollamaModel}` : provider;

  const record: CompactionSummaryRecord = {
    coveredSeqStart: prefix[0].seq,
    coveredSeqEnd: splitSeq,
    summaryText,
    model,
    generatedAt,
  };
  await store.append({
    sessionId: session.sessionId,
    eventType: 'compaction_completed',
    payload: {
      ...record,
      coveredEventCount: prefix.length,
      tokenCountBefore: session.estimateTokens(),
      startedAt,
    },
  });

  session.applyCompactionResult(record, suffix);
  return record;
}
