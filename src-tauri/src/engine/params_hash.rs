// src-tauri/src/engine/params_hash.rs
// Phase 22 (22-02) — bitwise port of src/ai/paramsHash.ts (EVT-05).
// Locked by golden fixture: src/ai/__tests__/fixtures/golden-paramsHash.json
// (includes real legacy hash cf8dab5a — cross-engine pending-candidate dedup lifeline).
//
// serde_json must be built WITHOUT preserve_order (default BTreeMap) so object
// keys iterate in lexicographic order, matching TS Object.keys().sort().

use sha2::{Digest, Sha256};

/// Canonical JSON: object keys sorted at every depth, array order preserved,
/// null preserved. serde_json Value.to_string() already emits compact JSON
/// with the same escaping as JSON.stringify for string/number/bool.
pub fn canonical_json(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Array(a) => {
            format!("[{}]", a.iter().map(canonical_json).collect::<Vec<_>>().join(","))
        }
        serde_json::Value::Object(o) => {
            format!(
                "{{{}}}",
                o.iter()
                    .map(|(k, val)| format!("{}:{}", serde_json::Value::String(k.to_string()), canonical_json(val)))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        // Null/Bool/Number/String: compact serialization identical to JSON.stringify
        other => other.to_string(),
    }
}

/// params_hash = lowercase hex SHA-256 of canonical JSON.
pub fn params_hash(v: &serde_json::Value) -> String {
    let mut hasher = Sha256::new();
    hasher.update(canonical_json(v).as_bytes());
    let digest = hasher.finalize();
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{b:02x}"));
    }
    hex
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/ai/__tests__/fixtures");

    #[test]
    fn golden_params_hash() {
        let raw = std::fs::read_to_string(format!("{FIXTURES}/golden-paramsHash.json")).unwrap();
        let cases: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap();
        let mut has_legacy = false;
        for c in &cases {
            let expected = c["expectedHash"].as_str().unwrap();
            if expected.starts_with("cf8dab5a") {
                has_legacy = true;
            }
            assert_eq!(params_hash(&c["params"]), expected);
        }
        assert!(has_legacy, "real legacy hash case must be present");
    }

    #[test]
    fn canonical_key_order_independent() {
        let a = json!({"b": {"y": [3, 1, 2], "a": 1}});
        let b = json!({"b": {"a": 1, "y": [3, 1, 2]}});
        assert_eq!(canonical_json(&a), canonical_json(&b));
        assert_eq!(params_hash(&a), params_hash(&b));
    }

    #[test]
    fn canonical_forms() {
        assert_eq!(canonical_json(&json!({})), "{}");
        assert_eq!(canonical_json(&json!(null)), "null");
        assert_eq!(canonical_json(&json!([1, null, "x"])), "[1,null,\"x\"]");
        assert_eq!(canonical_json(&json!({"n": 1.5, "i": 1})), "{\"i\":1,\"n\":1.5}");
    }
}
