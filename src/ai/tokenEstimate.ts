// src/ai/tokenEstimate.ts
// Phase 13 (EVT-07) — CJK-aware token estimate. The old `length / 4` heuristic
// underestimates Chinese 4-8x (each CJK char ≈ 1 token, not 0.25), which made
// replay budgets overflow. Budget math must err on the OVER side: counting each
// CJK char as 1 token is conservative and safe for window budgeting.

// CJK ranges: radicals, CJK symbols/punctuation, kana, CJK unified ideographs
// (incl. ext A), compatibility ideographs, fullwidth forms.
const CJK_CHAR_REGEX = /[⺀-⻿　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/g;

export function estimateTokens(text: string): number {
  const cjkCount = (text.match(CJK_CHAR_REGEX) ?? []).length;
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(cjkCount + nonCjkCount / 4);
}
