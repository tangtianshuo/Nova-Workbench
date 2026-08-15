// src/ai/ftsTokens.ts
// Phase 15 (MEM-06) — shared CJK segmentation for FTS5. Index and query MUST go
// through the same tokenizer (2-char Chinese queries can only match per-char
// indexed text). Extracted verbatim from knowledgeSearch.ts lexicalTerms so the
// in-memory lexical fallback and the SQLite FTS path stay same-source.

export function toFtsTokens(text: string): string[] {
  const normalized = text.toLocaleLowerCase().normalize('NFKC');
  const words = normalized.match(/[a-z0-9]+/g) ?? []; // latin words kept whole
  const cjk = normalized.match(/[㐀-鿿]/g) ?? []; // CJK per character
  return [...new Set([...words, ...cjk])];
}

export function toFtsIndexedText(text: string): string {
  return toFtsTokens(text).join(' '); // form written into fts columns: "需 求 评 审 api"
}

export function toFtsMatchString(query: string): string {
  // Every token double-quoted = FTS5 quoted phrase; spaces = implicit AND.
  // The tokenizer only emits [a-z0-9]+ and single CJK chars, so FTS5 syntax
  // characters (quotes / NEAR / OR / column filters) are stripped at the source
  // — user input can never trigger a MATCH syntax error or injection.
  return toFtsTokens(query).map((t) => `"${t.replace(/"/g, '""')}"`).join(' ');
}
