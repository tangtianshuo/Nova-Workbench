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
}

export interface ChatSessionOptions {
  sessionId?: string;
  tokenBudget?: number;
}

type SessionTurn = ChatMessage[];

const DEFAULT_MAX_TURNS = 8;
const DEFAULT_TOKEN_BUDGET = 8_000;

function estimateMessageTokens(message: Pick<ChatMessage, 'content'>): number {
  return Math.ceil(message.content.length / 4);
}

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
  let total = result.flat().reduce((sum, message) => sum + estimateMessageTokens(message), 0);

  // Keep the newest exchanges and discard complete older turns first.
  while (result.length > 1 && total > tokenBudget) {
    total -= result[0].reduce((sum, message) => sum + estimateMessageTokens(message), 0);
    result.shift();
  }

  // A single oversized exchange is trimmed from the oldest side as a last resort.
  return total > tokenBudget
    ? trimOversizedTurn(result[0] ?? [], tokenBudget)
    : result.flat();
}

function trimOversizedTurn(turn: ChatMessage[], tokenBudget: number): ChatMessage[] {
  const result = turn.map((message) => ({ ...message }));
  let total = result.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  while (result.length > 0 && total > tokenBudget) {
    total -= estimateMessageTokens(result[0]);
    result.shift();
  }
  return result;
}

export class ChatSession {
  private messages: ChatMessage[] = [];

  readonly sessionId: string;
  readonly tokenBudget: number;

  constructor(sessionId?: string, tokenBudget?: number);
  constructor(options?: ChatSessionOptions);
  constructor(sessionIdOrOptions?: string | ChatSessionOptions, tokenBudget = DEFAULT_TOKEN_BUDGET) {
    if (typeof sessionIdOrOptions === 'object' && sessionIdOrOptions !== null) {
      this.sessionId = sessionIdOrOptions.sessionId ?? crypto.randomUUID();
      this.tokenBudget = sessionIdOrOptions.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
      return;
    }

    const sessionId = typeof sessionIdOrOptions === 'string'
      ? sessionIdOrOptions
      : crypto.randomUUID();
    this.sessionId = sessionId;
    this.tokenBudget = tokenBudget;
  }

  addMessage(message: ChatSessionMessageInput): void;
  addMessage(role: ChatSessionRole, content: string, toolCallId?: string, toolName?: string): void;
  addMessage(
    messageOrRole: ChatSessionMessageInput | ChatSessionRole,
    content?: string,
    toolCallId?: string,
    toolName?: string,
  ): void {
    const message = typeof messageOrRole === 'string'
      ? { role: messageOrRole, content: content ?? '', toolCallId, toolName }
      : messageOrRole;

    this.messages.push({ ...message, timestamp: Date.now() });
  }

  /** Return the newest complete exchanges; system prompts are supplied by the caller. */
  getMessagesForLLM(maxTurns = DEFAULT_MAX_TURNS): Array<{
    role: ChatSessionRole;
    content: string;
  }> {
    if (maxTurns <= 0) return [];

    const turns = groupIntoTurns(this.messages).slice(-maxTurns);
    const selected = trimToBudget(turns, this.tokenBudget);
    return selected.map(({ role, content }) => ({ role, content }));
  }

  getAllMessages(): ChatMessage[] {
    return this.messages.map((message) => ({ ...message }));
  }

  clear(): void {
    this.messages = [];
  }

  estimateTokens(): number {
    return this.messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  }
}
