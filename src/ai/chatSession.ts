// src/ai/chatSession.ts
// Phase 13 Plan 02 — ChatSession as a projection of the event log.
// addMessage dual-writes (in-memory messages + event append); fromEvents rebuilds
// a session from its event stream; getMessagesForLLM is the single derived format
// (tool_call assistant rows collapsed, tool content passed through verbatim).
import { getEventStore } from './events/eventStore';
import type { AgentEvent, AgentEventInput } from './events/types';
import { estimateTokens } from './tokenEstimate';

export type ChatSessionRole = 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatSessionRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
  timestamp: number;
}

export interface ChatSessionMessageInput {
  role: ChatSessionRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
  /** Structured payload recorded on the emitted event (args / ok / error / artifactId / ...). */
  payload?: Record<string, unknown>;
}

export interface ChatSessionOptions {
  sessionId?: string;
  tokenBudget?: number;
  /** @internal rebuilt sessions never re-emit events. */
  __emitEvents?: boolean;
}

/** CMP-02 provenance: what the summary covers, when it was generated, by which model. */
export interface CompactionSummaryRecord {
  coveredSeqStart: number;
  coveredSeqEnd: number;
  summaryText: string;
  model: string;
  generatedAt: string;
}

export function formatCompactionSummary(record: CompactionSummaryRecord): string {
  return `[历史压缩摘要 | 覆盖事件 seq ${record.coveredSeqStart}-${record.coveredSeqEnd} | 生成于 ${record.generatedAt} | 模型 ${record.model}]\n${record.summaryText}`;
}

type SessionTurn = ChatMessage[];

const DEFAULT_MAX_TURNS = 8;
const DEFAULT_TOKEN_BUDGET = 8_000;

function groupIntoTurns(messages: ChatMessage[]): SessionTurn[] {
  const turns: SessionTurn[] = [];
  let current: SessionTurn = [];

  for (const message of messages) {
    current.push(message);
    // Tool requests/results remain in the same turn as their surrounding exchange.
    if (message.role === 'assistant' && !message.toolCallId) {
      turns.push(current);
      current = [];
    }
  }

  if (current.length > 0) turns.push(current);
  return turns;
}

function trimToBudget(turns: SessionTurn[], tokenBudget: number): ChatMessage[] {
  if (tokenBudget <= 0) return [];

  const result = turns.map((turn) => turn.map((message) => ({ ...message })));
  let total = result.flat().reduce((sum, message) => sum + estimateTokens(message.content), 0);

  // Keep the newest exchanges and discard complete older turns first.
  while (result.length > 1 && total > tokenBudget) {
    total -= result[0].reduce((sum, message) => sum + estimateTokens(message.content), 0);
    result.shift();
  }

  // A single oversized exchange is trimmed from the oldest side as a last resort.
  return total > tokenBudget
    ? trimOversizedTurn(result[0] ?? [], tokenBudget)
    : result.flat();
}

function trimOversizedTurn(turn: ChatMessage[], tokenBudget: number): ChatMessage[] {
  const result = turn.map((message) => ({ ...message }));
  let total = result.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  while (result.length > 0 && total > tokenBudget) {
    total -= estimateTokens(result[0].content);
    result.shift();
  }
  return result;
}

/** One model response may request N tools => N assistant-with-toolCallId rows in
 * the session; the LLM must see that response once. Collapse consecutive rows. */
function collapseToolCallAssistants(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const message of messages) {
    const prev = out[out.length - 1];
    if (message.role === 'assistant' && message.toolCallId && prev && prev.role === 'assistant' && prev.toolCallId) {
      continue;
    }
    out.push(message);
  }
  return out;
}

export class ChatSession {
  private messages: ChatMessage[] = [];
  private currentCorrelationId: string | null = null;
  private emitEvents: boolean;
  private sessionCreatedEmitted = false;
  private lastEventPromise: Promise<unknown> = Promise.resolve();
  private compaction: CompactionSummaryRecord | null = null;

  readonly sessionId: string;
  readonly tokenBudget: number;

  getCompaction(): CompactionSummaryRecord | null {
    return this.compaction ? { ...this.compaction } : null;
  }

  constructor(sessionId?: string, tokenBudget?: number);
  constructor(options?: ChatSessionOptions);
  constructor(sessionIdOrOptions?: string | ChatSessionOptions, tokenBudget = DEFAULT_TOKEN_BUDGET) {
    let resolvedOptions: ChatSessionOptions | undefined;
    if (typeof sessionIdOrOptions === 'object' && sessionIdOrOptions !== null) {
      resolvedOptions = sessionIdOrOptions;
    } else if (typeof sessionIdOrOptions === 'string') {
      resolvedOptions = { sessionId: sessionIdOrOptions, tokenBudget };
    }
    this.sessionId = resolvedOptions?.sessionId ?? crypto.randomUUID();
    this.tokenBudget = resolvedOptions?.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    this.emitEvents = resolvedOptions?.__emitEvents ?? true;
    // NOTE: no event emission here — session_created is lazy (ensureSessionCreatedEvent).
    // ChatPanel.tsx:93 does useRef(new ChatSession({ tokenBudget: 8_000 })) which React
    // evaluates on EVERY render; constructor-time emission would flood agent_events.
  }

  setCorrelationId(correlationId: string | null): void {
    this.currentCorrelationId = correlationId;
  }

  /** EVT-04: resumeEventEmission — a session rebuilt by fromEvents is projection-only
   * (__emitEvents: false). Once it becomes the live session again, resume emission on
   * the ORIGINAL stream. sessionCreatedEmitted is forced true so session_created is NOT
   * re-emitted — it already exists in the restored stream (count stays 1 across restore). */
  resumeEventEmission(): void {
    this.emitEvents = true;
    this.sessionCreatedEmitted = true;
  }

  /** Await pending event writes for this session (tests + turn-end audits). */
  async flushEvents(): Promise<void> {
    await this.lastEventPromise;
  }

  /** LAZY session_created — emitted at the FIRST real event write, never in the
   * constructor. Once-guarded; enqueued before the triggering message event so
   * seq stays [session_created, <first msg>, ...]. */
  private ensureSessionCreatedEvent(): void {
    if (!this.emitEvents || this.sessionCreatedEmitted) return;
    this.sessionCreatedEmitted = true;
    this.lastEventPromise = getEventStore().append({
      sessionId: this.sessionId,
      eventType: 'session_created',
      payload: { sessionId: this.sessionId, tokenBudget: this.tokenBudget },
    }).then(() => undefined, () => undefined);
  }

  /** Emit turn_ended (no in-memory message). payload: { outcome, iterations, toolCallsExecuted }. */
  recordTurnEnd(payload: Record<string, unknown>): void {
    if (!this.emitEvents) return;
    this.ensureSessionCreatedEvent();
    this.lastEventPromise = getEventStore().append({
      sessionId: this.sessionId,
      eventType: 'turn_ended',
      payload,
      correlationId: this.currentCorrelationId,
    }).then(() => undefined, () => undefined);
  }

  /** MEM-08 (Phase 15): append an auxiliary (non-message) event — e.g.
   * context_injected — through the same event-store enqueue chain as
   * addMessage, so seq stays contiguous. rebuildMessages' default:break
   * ignores it: the event log carries the audit, replay produces no message. */
  appendAuxEvent(eventType: string, payload: Record<string, unknown>): void {
    if (!this.emitEvents) return;
    this.ensureSessionCreatedEvent();
    this.lastEventPromise = getEventStore().append({
      sessionId: this.sessionId,
      eventType,
      payload,
      correlationId: this.currentCorrelationId,
    }).then(() => undefined, () => undefined);
  }

  addMessage(message: ChatSessionMessageInput): void;
  addMessage(role: ChatSessionRole, content: string, toolCallId?: string, toolName?: string, payload?: Record<string, unknown>): void;
  addMessage(
    messageOrRole: ChatSessionMessageInput | ChatSessionRole,
    content?: string,
    toolCallId?: string,
    toolName?: string,
    payload?: Record<string, unknown>,
  ): void {
    const message: ChatSessionMessageInput = typeof messageOrRole === 'string'
      ? { role: messageOrRole, content: content ?? '', toolCallId, toolName, payload }
      : messageOrRole;

    this.messages.push({ ...message, timestamp: Date.now() });

    if (this.emitEvents) {
      this.ensureSessionCreatedEvent(); // lazy session_created — once-guarded, chain-ordered first
      this.lastEventPromise = getEventStore().append(this.toEventInput(message)).then(() => undefined, () => undefined);
    }
  }

  private toEventInput(message: ChatSessionMessageInput): AgentEventInput {
    const correlationId = this.currentCorrelationId;
    if (message.role === 'user') {
      return { sessionId: this.sessionId, eventType: 'user_message', payload: { content: message.content }, correlationId };
    }
    if (message.role === 'assistant' && !message.toolCallId) {
      return { sessionId: this.sessionId, eventType: 'assistant_message', payload: { content: message.content }, correlationId };
    }
    if (message.role === 'assistant' && message.toolCallId) {
      return {
        sessionId: this.sessionId,
        eventType: 'tool_call',
        payload: { toolCallId: message.toolCallId, toolName: message.toolName ?? null, args: message.payload?.args ?? null, content: message.content },
        correlationId,
      };
    }
    // role 'tool' — model-visible text is the content itself (composed by toolLoop)
    return {
      sessionId: this.sessionId,
      eventType: 'tool_result',
      payload: { toolCallId: message.toolCallId ?? null, toolName: message.toolName ?? null, modelText: message.content, ...(message.payload ?? {}) },
      correlationId,
    };
  }

  /** Convert an event stream into ChatMessage[] (the switch body formerly inline in
   * fromEvents). session_created / turn_ended / compaction_started /
   * compaction_completed carry no message — they hit the default: break. */
  private static rebuildMessages(events: AgentEvent[]): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const event of events) {
      const eventPayload = event.payload;
      const timestamp = Date.parse(event.createdAt) || Date.now();
      switch (event.eventType) {
        case 'user_message':
          messages.push({ role: 'user', content: String(eventPayload.content ?? ''), timestamp });
          break;
        case 'assistant_message':
          messages.push({ role: 'assistant', content: String(eventPayload.content ?? ''), timestamp });
          break;
        case 'tool_call':
          messages.push({
            role: 'assistant',
            content: String(eventPayload.content ?? '[requesting tools]'),
            toolCallId: typeof eventPayload.toolCallId === 'string' ? eventPayload.toolCallId : undefined,
            toolName: typeof eventPayload.toolName === 'string' ? eventPayload.toolName : undefined,
            timestamp,
          });
          break;
        case 'tool_result':
          messages.push({
            role: 'tool',
            content: String(eventPayload.modelText ?? ''),
            toolCallId: typeof eventPayload.toolCallId === 'string' ? eventPayload.toolCallId : undefined,
            toolName: typeof eventPayload.toolName === 'string' ? eventPayload.toolName : undefined,
            timestamp,
          });
          break;
        default:
          break; // session_created / turn_ended / compaction_started / compaction_completed
      }
    }
    return messages;
  }

  /** Rebuild a session as a pure projection of its event stream. Never re-emits events.
   * Compaction-aware: if the log contains a compaction_completed, only events with
   * seq > coveredSeqEnd are replayed and the summary is carried on the session so
   * getMessagesForLLM prepends it as a sourced summary. */
  static fromEvents(events: AgentEvent[], options?: { sessionId?: string; tokenBudget?: number }): ChatSession {
    const sessionId = options?.sessionId ?? events[0]?.sessionId ?? crypto.randomUUID();
    const sorted = [...events].sort((a, b) => a.seq - b.seq);
    const lastCompaction = [...sorted].reverse().find((event) => event.eventType === 'compaction_completed');
    let replayEvents = sorted;
    let compaction: CompactionSummaryRecord | null = null;
    if (lastCompaction) {
      const payload = lastCompaction.payload;
      const coveredSeqEnd = typeof payload.coveredSeqEnd === 'number' ? payload.coveredSeqEnd : -1;
      if (coveredSeqEnd >= 0 && typeof payload.summaryText === 'string') {
        compaction = {
          coveredSeqStart: typeof payload.coveredSeqStart === 'number' ? payload.coveredSeqStart : 1,
          coveredSeqEnd,
          summaryText: String(payload.summaryText),
          model: String(payload.model ?? 'unknown'),
          generatedAt: String(payload.generatedAt ?? ''),
        };
        replayEvents = sorted.filter((event) => event.seq > coveredSeqEnd);
      }
    }
    const session = new ChatSession({ sessionId, tokenBudget: options?.tokenBudget, __emitEvents: false });
    session.messages = ChatSession.rebuildMessages(replayEvents);
    session.compaction = compaction;
    return session;
  }

  /** CMP-01 (projection-only): applyCompactionResult replaces the projection with
   * [sourced summary] + suffix turns after a successful compaction. Called by
   * maybeCompactSession; events are append-only — nothing here deletes from the log. */
  applyCompactionResult(record: CompactionSummaryRecord, eventsAfterSplit: AgentEvent[]): void {
    this.compaction = { ...record };
    this.messages = ChatSession.rebuildMessages([...eventsAfterSplit].sort((a, b) => a.seq - b.seq));
  }

  /** Return the newest complete exchanges; system prompts are supplied by the caller.
   * When a compaction has occurred, the sourced summary is prepended so earlier
   * history enters context with attribution (CMP-02 provenance). */
  getMessagesForLLM(maxTurns = DEFAULT_MAX_TURNS): Array<{
    role: ChatSessionRole;
    content: string;
  }> {
    if (maxTurns <= 0) return [];

    const turns = groupIntoTurns(this.messages).slice(-maxTurns);
    const selected = trimToBudget(turns, this.tokenBudget);
    const derived = collapseToolCallAssistants(selected).map(({ role, content }) => ({ role, content }));
    if (this.compaction) {
      return [{ role: 'user', content: formatCompactionSummary(this.compaction) }, ...derived];
    }
    return derived;
  }

  getAllMessages(): ChatMessage[] {
    return this.messages.map((message) => ({ ...message }));
  }

  /** Clear in-memory projection only. Event log is append-only — no deletion. */
  clear(): void {
    this.messages = [];
  }

  estimateTokens(): number {
    return this.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  }
}
