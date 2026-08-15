// src/ai/agentScope.ts — ambient agent session scope. toolLoop 在每个 turn
// 入口设置;tool(如 generateDeliverable)读取它做 AI 溯源(sessionId +
// correlationId)。直接 executeTool(ChatPanel 确认后重放)时保持上一次
// 的值 — 同一 ChatPanel 内即同一 session,语义正确。
export interface AgentScope { sessionId: string; correlationId: string | null; }
let current: AgentScope | null = null;
export function setActiveAgentScope(scope: AgentScope | null): void { current = scope; }
export function getActiveAgentScope(): AgentScope | null { return current; }
