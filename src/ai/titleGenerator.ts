// src/ai/titleGenerator.ts
// Phase 21 (TITLE-01/02) — session auto-naming. Mirrors defaultCompactionSummarizer
// (compaction.ts): LLM via chatWithTools, fallback to first-user-message truncation.
// Never throws — callers run it fire-and-forget.
import { chatWithTools, type Provider } from '@/src/lib/api';

export const TITLE_MAX_CHARS = 20;

const TITLE_SYSTEM_PROMPT = [
  'You name chat sessions for a product-manager AI workspace.',
  '根据对话内容用中文生成一个不超过 20 字的会话标题,概括用户的核心意图。',
  '只输出标题本身,不要引号、不要标点结尾、不得虚构。',
].join('\n');

export async function generateSessionTitle(input: {
  firstUserMessage: string;
  transcript: string;
  provider: Provider;
  ollamaModel?: string;
  llm?: typeof chatWithTools; // test injection, defaults to chatWithTools
}): Promise<{ title: string; source: 'llm' | 'fallback' }> {
  try {
    const result = await (input.llm ?? chatWithTools)({
      messages: [{ role: 'user', content: input.transcript }],
      tools: [],
      systemPrompt: TITLE_SYSTEM_PROMPT,
      provider: input.provider,
      ollamaModel: input.ollamaModel,
    });
    const title = result.content.trim();
    if (title) return { title: title.slice(0, TITLE_MAX_CHARS), source: 'llm' };
  } catch (error) {
    console.error('[title] LLM generation failed, using fallback', error);
  }
  return { title: input.firstUserMessage.slice(0, TITLE_MAX_CHARS), source: 'fallback' };
}
