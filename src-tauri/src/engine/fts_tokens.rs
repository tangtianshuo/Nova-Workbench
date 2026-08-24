// src-tauri/src/engine/fts_tokens.rs
// Phase 22 (22-02) — bitwise port of src/ai/ftsTokens.ts (MEM-06).
// Index and query MUST share this tokenizer (parity with TS single-source rule).

use unicode_normalization::UnicodeNormalization;

/// lowercase then NFKC (order replicates TS `toLocaleLowerCase().normalize('NFKC')`),
/// extract [a-z0-9]+ words whole + CJK (U+3400..=U+9FFF) per char, dedup keep-first.
pub fn fts_tokens(text: &str) -> Vec<String> {
    let normalized: String = text.to_lowercase().nfkc().collect();
    // TS order: ALL latin words first, then CJK chars (Set keeps first occurrence).
    let mut tokens: Vec<String> = Vec::new();
    let mut push = |t: String| {
        if !tokens.contains(&t) {
            tokens.push(t);
        }
    };
    for w in normalized
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|s| !s.is_empty())
    {
        push(w.to_string());
    }
    for c in normalized.chars().filter(|c| ('\u{3400}'..='\u{9FFF}').contains(c)) {
        push(c.to_string());
    }
    tokens
}

/// FTS5 quoted-phrase AND string; tokens never contain quotes by construction,
/// escaping kept for exact TS parity.
pub fn fts_match_string(tokens: &[String]) -> String {
    tokens
        .iter()
        .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_world_abc() {
        assert_eq!(fts_tokens("Hello 世界abc"), vec!["hello", "abc", "世", "界"]);
    }

    #[test]
    fn nfkc_fullwidth() {
        // fullwidth ＡＢＣ -> lowercase -> NFKC -> "abc123" one word
        assert_eq!(fts_tokens("ＡＢＣ123"), vec!["abc123"]);
    }

    #[test]
    fn dedup_keeps_first_order() {
        assert_eq!(fts_tokens("需求 需求 api API"), vec!["api", "需", "求"]);
    }

    #[test]
    fn match_string_quotes_and_escapes() {
        assert_eq!(fts_match_string(&["hello".into(), "世".into()]), "\"hello\" \"世\"");
        assert_eq!(fts_match_string(&["a\"b".into()]), "\"a\"\"b\"");
    }

    #[test]
    fn empty_input() {
        assert!(fts_tokens("").is_empty());
        assert_eq!(fts_match_string(&[]), "");
    }
}
