// src/ai/events/types.ts
// Phase 13 — Agent Event Log vocabulary and shapes (AGENT_MEMORY_REFERENCE §3).
// event_type is TEXT and payload_json is flexible on purpose: approval & memory
// event types land in later phases without another migration.

export const AGENT_EVENT_TYPES = [
  'session_created',
  'user_message',
  'assistant_message',
  'tool_call',
  'tool_result',
  'turn_ended',
  'context_injected', // Phase 15 (MEM-08): per-turn injected-context audit
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number] | (string & {});

export interface EventScope {
  workspaceId: string | null;
  productId: string | null;
  projectId: string | null;
}

/** Input for appending one event; eventId/seq/createdAt are assigned by the store. */
export interface AgentEventInput {
  sessionId: string;
  eventType: AgentEventType;
  payload: Record<string, unknown>;
  correlationId?: string | null;
  workspaceId?: string | null;
  productId?: string | null;
  projectId?: string | null;
}

export interface AgentEvent {
  eventId: string;
  sessionId: string;
  seq: number;
  eventType: AgentEventType;
  createdAt: string;
  workspaceId: string | null;
  productId: string | null;
  projectId: string | null;
  correlationId: string | null;
  payload: Record<string, unknown>;
}

export interface AgentArtifact {
  artifactId: string;
  sessionId: string;
  toolName: string;
  byteSize: number;
  content: string;
  createdAt: string;
}

export type EventIssueCode =
  | 'MISSING_TOOL_RESULT'
  | 'DUPLICATE_TOOL_CALL'
  | 'DUPLICATE_TOOL_RESULT'
  | 'RESULT_BEFORE_CALL'
  | 'SEQ_GAP';

export interface EventStreamIssue {
  code: EventIssueCode;
  sessionId: string;
  seq?: number;
  toolCallId?: string;
  detail: string;
}
