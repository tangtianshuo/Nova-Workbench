// src/ai/events/invariants.ts
// Phase 13 — executable invariants ("不变量可执行", DSSH_INSIGHTS §4.4):
// tool_call ↔ tool_result must pair exactly by toolCallId; seq must be
// contiguous within a session. Violations are REPORTED, never silently passed.
import type { AgentEvent, EventStreamIssue } from './types';

/** Pure check: returns every pairing/seq issue found in a session's event stream. */
export function checkEventStream(events: AgentEvent[]): EventStreamIssue[] {
  const issues: EventStreamIssue[] = [];
  const sessionId = events[0]?.sessionId ?? '(unknown)';
  const sorted = [...events].sort((a, b) => a.seq - b.seq);

  // 1. seq contiguity: expect 1..N with no gaps.
  sorted.forEach((event, index) => {
    const expected = index + 1;
    if (event.seq !== expected) {
      issues.push({
        code: 'SEQ_GAP',
        sessionId,
        seq: event.seq,
        detail: `expected seq ${expected}, found ${event.seq} (event ${event.eventId}, type ${event.eventType})`,
      });
    }
  });

  // 2. tool pairing by payload.toolCallId.
  const openCalls = new Map<string, AgentEvent>();
  const seenResults = new Set<string>();

  for (const event of sorted) {
    if (event.eventType === 'tool_call') {
      const toolCallId = typeof event.payload.toolCallId === 'string' ? event.payload.toolCallId : null;
      if (!toolCallId) {
        issues.push({ code: 'MISSING_TOOL_RESULT', sessionId, seq: event.seq, detail: 'tool_call event without payload.toolCallId' });
        continue;
      }
      if (openCalls.has(toolCallId)) {
        issues.push({ code: 'DUPLICATE_TOOL_CALL', sessionId, seq: event.seq, toolCallId, detail: `duplicate tool_call for toolCallId ${toolCallId}` });
      } else {
        openCalls.set(toolCallId, event);
      }
    }

    if (event.eventType === 'tool_result') {
      const toolCallId = typeof event.payload.toolCallId === 'string' ? event.payload.toolCallId : null;
      if (!toolCallId) {
        issues.push({ code: 'RESULT_BEFORE_CALL', sessionId, seq: event.seq, detail: 'tool_result event without payload.toolCallId' });
        continue;
      }
      if (seenResults.has(toolCallId)) {
        issues.push({ code: 'DUPLICATE_TOOL_RESULT', sessionId, seq: event.seq, toolCallId, detail: `duplicate tool_result for toolCallId ${toolCallId}` });
      } else if (!openCalls.has(toolCallId)) {
        issues.push({ code: 'RESULT_BEFORE_CALL', sessionId, seq: event.seq, toolCallId, detail: `tool_result without matching tool_call for toolCallId ${toolCallId}` });
      } else {
        openCalls.delete(toolCallId);
        seenResults.add(toolCallId);
      }
    }
  }

  for (const [toolCallId, callEvent] of openCalls) {
    issues.push({
      code: 'MISSING_TOOL_RESULT',
      sessionId,
      seq: callEvent.seq,
      toolCallId,
      detail: `tool_call ${toolCallId} (${String(callEvent.payload.toolName ?? '?')}) has no matching tool_result`,
    });
  }

  return issues;
}

/** Throws a loud Error listing every issue — use at rebuild/audit boundaries. */
export function assertEventStreamValid(events: AgentEvent[]): void {
  const issues = checkEventStream(events);
  if (issues.length > 0) {
    console.error('[event-log] invariant violations detected', issues);
    throw new Error(
      `[event-log] invariant violation: ${issues.map((issue) => `${issue.code}@seq${issue.seq ?? '?'}${issue.toolCallId ? `:${issue.toolCallId}` : ''}`).join('; ')}`,
    );
  }
}
