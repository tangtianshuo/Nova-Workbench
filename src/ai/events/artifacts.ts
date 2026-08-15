// src/ai/events/artifacts.ts
// Phase 13 — oversized tool results (> 4KB) go to the artifacts store; model
// history keeps summary + artifact reference + head fragment (replaces the
// blind JSON.stringify(...).slice(0, 2000) in the old toolLoop).
import type { AgentArtifact } from './types';

export const ARTIFACT_THRESHOLD_CHARS = 4096;
export const ARTIFACT_HEAD_CHARS = 512;

export interface PrepareToolResultInput {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  value: unknown;
}

export interface PreparedToolResult {
  /** Model-visible user-role content, already prefixed `[tool_result <name>] `. */
  modelText: string;
  /** Present only when the serialized result exceeded ARTIFACT_THRESHOLD_CHARS. */
  artifact: AgentArtifact | null;
}

export function prepareToolResult(input: PrepareToolResultInput): PreparedToolResult {
  let json: string;
  try {
    json = JSON.stringify({ ok: true, data: input.value });
  } catch {
    json = JSON.stringify({ ok: true, data: String(input.value) });
  }

  if (json.length <= ARTIFACT_THRESHOLD_CHARS) {
    return { modelText: `[tool_result ${input.toolName}] ${json}`, artifact: null };
  }

  const artifact: AgentArtifact = {
    artifactId: crypto.randomUUID(),
    sessionId: input.sessionId,
    toolName: input.toolName,
    byteSize: json.length,
    content: json,
    createdAt: new Date().toISOString(),
  };

  const reference = {
    ok: true,
    summary: `Tool result too large (${json.length} chars); full content stored as artifact ${artifact.artifactId}`,
    artifactId: artifact.artifactId,
    head: json.slice(0, ARTIFACT_HEAD_CHARS),
  };
  return { modelText: `[tool_result ${input.toolName}] ${JSON.stringify(reference)}`, artifact };
}
