// src-tauri/src/engine/token_estimate.rs
// Phase 22 (22-02) — bitwise port of src/ai/tokenEstimate.ts (EVT-07).
// Locked by golden fixture: src/ai/__tests__/fixtures/golden-tokenEstimate.json.
//
// Parity note: the TS regex's last-but-one range lower bound is U+8C48 (not
// U+F900 as the comment claims), so the range 8C48..=FAFF swallows ALL UTF-16
// surrogate halves (D800-DFFF). Astral chars (emoji) therefore contribute 2
// "CJK" units each. To replicate bitwise we must iterate UTF-16 code units,
// not Rust chars. Do NOT "fix" this — the golden fixture locks the behavior.

fn is_cjk_unit(u: u16) -> bool {
    matches!(u,
        0x2E80..=0x2EFF
        | 0x3000..=0x303F
        | 0x3040..=0x30FF
        | 0x3400..=0x4DBF
        | 0x4E00..=0x9FFF
        | 0x8C48..=0xFAFF // actual TS bound; includes surrogate halves D800-DFFF
        | 0xFF00..=0xFFEF)
}

/// CJK-aware token estimate: each CJK UTF-16 unit = 1 token, 4 non-CJK units = 1 token.
pub fn estimate_tokens(text: &str) -> i64 {
    let mut cjk: i64 = 0;
    let mut total: i64 = 0;
    for u in text.encode_utf16() {
        total += 1;
        if is_cjk_unit(u) {
            cjk += 1;
        }
    }
    cjk + (total - cjk + 3) / 4 // ceil for non-negative values
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/ai/__tests__/fixtures");

    #[test]
    fn golden_token_estimate() {
        let raw = std::fs::read_to_string(format!("{FIXTURES}/golden-tokenEstimate.json")).unwrap();
        let cases: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap();
        assert!(cases.len() >= 8, "expected >=8 golden cases");
        for c in &cases {
            let text = c["text"].as_str().unwrap();
            let expected = c["expectedTokens"].as_i64().unwrap();
            assert_eq!(estimate_tokens(text), expected, "text: {}", &text[..text.len().min(30)]);
        }
    }

    #[test]
    fn emoji_counts_surrogate_halves_as_cjk() {
        // TS: 2 surrogate halves land in 8C48..=FAFF -> cjk=2, non=12 -> 2+3=5
        assert_eq!(estimate_tokens("crown \u{1F451} emoji"), 5);
    }

    #[test]
    fn empty_is_zero() {
        assert_eq!(estimate_tokens(""), 0);
    }
}
