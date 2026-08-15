// src/ai/contextAssembler.ts
// Phase 15 Plan 02 (MEM-08) — five-segment priority context assembly
// (RESEARCH Pattern 5). Segment quotas [core 600 / pending 200 / memories 500
// / fts 400 / recent 300] sum to the 2000-token hard injection cap (= 25% of
// the 8000 session budget, keeping the 30/10/25/20/15 ratio). Overflow drops
// the OLDEST entries; every segment is audited as {name, items, tokens,
// truncated}. Pure function: buildCore and searchKnowledge are injected, and
// the context_injected event is appended by toolLoop (Task 3), not here.
import { estimateTokens } from './tokenEstimate';
import { toFtsTokens, toFtsMatchString } from './ftsTokens';
import { getMemoryStore } from './memoryStore';

export interface KnowledgeSearchHit {
  title: string;
  version: number;
  updatedAt: string;
  summary: string;
}

export interface SegmentAudit {
  name: 'core' | 'pending' | 'memories' | 'fts_topk' | 'recent_dialog';
  items: number;
  tokens: number;
  truncated: boolean;
  reservedTokens?: number;
  query?: string;
  skipped?: boolean;
  error?: string;
}

export interface AssembledContext {
  coreContext: string;
  audit: { segments: SegmentAudit[] };
}

const SEGMENT_QUOTAS = {
  core: 600,
  pending: 200,
  memories: 500,
  fts_topk: 400,
  recent_dialog: 300,
} as const;

/** Full-session reservation for the recent-dialog window (15% of 8000). */
const RECENT_DIALOG_RESERVED = 1200;
const FTS_TOP_K = 5;
const REJECTED_LIMIT = 5;

/** Longest prefix of `text` fitting `quota` tokens (binary search; estimateTokens is monotone in length). */
function clampToTokens(text: string, quota: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= quota) return { text, truncated: false };
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid)) <= quota) lo = mid;
    else hi = mid - 1;
  }
  return { text: text.slice(0, lo), truncated: true };
}

/** Keep the head of `lines` (already ordered keep-first) within `quota`; the tail is dropped. */
function clampLines(lines: string[], quota: number): { text: string; kept: number; truncated: boolean } {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = estimateTokens(line);
    if (kept.length > 0 && used + cost > quota) break;
    kept.push(line);
    used += cost;
  }
  const dropped = lines.length - kept.length;
  return { text: kept.join('\n'), kept: kept.length, truncated: dropped > 0 };
}

export async function assembleInjectedContext(opts: {
  buildCore: () => string;
  searchKnowledge: (query: string, limit: number) => Promise<KnowledgeSearchHit[]>;
  productId?: string | null;
  userMessage: string;
}): Promise<AssembledContext> {
  const store = getMemoryStore();
  const segments: SegmentAudit[] = [];
  const sections: string[] = [];

  // 1. core — business facts (locked: stays the coreContext seed)
  const coreClamped = clampToTokens(opts.buildCore(), SEGMENT_QUOTAS.core);
  sections.push(coreClamped.text);
  segments.push({ name: 'core', items: 1, tokens: estimateTokens(coreClamped.text), truncated: coreClamped.truncated });

  // 2. pending candidates + rejected do-not-repropose list (MEM-02)
  const [pending, rejected] = await Promise.all([store.listPending(), store.listRejected(REJECTED_LIMIT)]);
  const pendingLines: string[] = [];
  if (rejected.length > 0) {
    pendingLines.push(`不要再提出以下记忆（用户已拒绝）: ${rejected.map((item) => item.content).join('；')}`);
  }
  pendingLines.push(...pending.map((item) => `- （待用户确认）${item.content}`));
  if (pendingLines.length > 0) {
    const clamped = clampLines(pendingLines, SEGMENT_QUOTAS.pending);
    sections.push(`## 待确认记忆候选\n${clamped.text}`);
    segments.push({ name: 'pending', items: pending.length, tokens: estimateTokens(clamped.text), truncated: clamped.truncated });
  } else {
    segments.push({ name: 'pending', items: 0, tokens: 0, truncated: false });
  }

  // 3. confirmed memories — listActiveMemories is newest-first, so the tail
  // (oldest by confirmed_at) is what overflow drops (locked decision).
  const memories = await store.listActiveMemories(opts.productId ?? undefined);
  if (memories.length > 0) {
    const clamped = clampLines(
      memories.map((memory) => `- ${memory.content}`),
      SEGMENT_QUOTAS.memories,
    );
    sections.push(`## 已确认长期记忆\n${clamped.text}`);
    segments.push({ name: 'memories', items: memories.length, tokens: estimateTokens(clamped.text), truncated: clamped.truncated });
  } else {
    segments.push({ name: 'memories', items: 0, tokens: 0, truncated: false });
  }

  // 4. fts_topk — knowledge hybrid retrieval; symbol-only input skips; failure degrades
  if (toFtsTokens(opts.userMessage).length === 0) {
    segments.push({ name: 'fts_topk', items: 0, tokens: 0, truncated: false, skipped: true });
  } else {
    try {
      const query = toFtsMatchString(opts.userMessage);
      const hits = await opts.searchKnowledge(query, FTS_TOP_K);
      const clamped = clampLines(
        hits.map((hit) => `- ${hit.summary}（来源: ${hit.title} v${hit.version} ${hit.updatedAt}）`),
        SEGMENT_QUOTAS.fts_topk,
      );
      if (clamped.text) sections.push(`## 知识库检索 top-${FTS_TOP_K}\n${clamped.text}`);
      segments.push({ name: 'fts_topk', items: hits.length, tokens: estimateTokens(clamped.text), truncated: clamped.truncated, query });
    } catch {
      segments.push({ name: 'fts_topk', items: 0, tokens: 0, truncated: false, error: 'unavailable' });
    }
  }

  // 5. recent_dialog — budget reservation only, no content re-injection (locked)
  segments.push({
    name: 'recent_dialog',
    items: 0,
    tokens: SEGMENT_QUOTAS.recent_dialog,
    truncated: false,
    reservedTokens: RECENT_DIALOG_RESERVED,
  });

  return { coreContext: sections.filter(Boolean).join('\n\n'), audit: { segments } };
}
