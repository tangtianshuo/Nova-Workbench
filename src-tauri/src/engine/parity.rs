// src-tauri/src/engine/parity.rs
// Phase 22 (22-07) — PERMANENT replay parity harness (ENG-03). Do not delete.
//
// Convention: 新语义分支 = 在 src/ai/__tests__/fixtures/ 双侧加 projection 用例
// (projection-cases.json 或 realdb-sample-*.json);本文件的 glob 遍历与 TS 侧
// src/ai/__tests__/parity.rust.test.ts 自动纳入同一批 fixture — 单源双侧。
//
// 规范化五条 (22-RESEARCH §JSON 序列化 parity):
// 1. 键序: parse 后 canonical(字典序)重新序列化 — serde_json Map 默认 BTreeMap,
//    不要启用 preserve_order。
// 2. 时间戳/ID 白名单字段置占位: "<ts>" / "<uuid>"(双侧各自 apply)。
// 3. null vs 缺键视为不同(payload 形状是规格的一部分)。
// 4. 整数保持 i64 形态(serde_json Number 天然区分)。
// 5. modelText 逐字节比较(不做任何归一化 — modelText 字符串里的 JSON 是手写 format! 保序)。

use crate::engine::chat_session::{ChatSession, DEFAULT_MAX_TURNS, DEFAULT_TOKEN_BUDGET};
use crate::engine::event_log::AgentEvent;
use serde_json::{json, Value};

/// Whitelisted volatile fields replaced with a placeholder before diff.
pub const TIMESTAMP_KEYS: &[&str] = &["timestamp", "createdAt", "generatedAt", "startedAt", "lastEventAt"];
pub const ID_KEYS: &[&str] = &["eventId", "artifactId", "correlationId", "toolCallId", "confirmationToken"];

/// Rule 2: recursively replace whitelisted timestamp/ID string values with placeholders.
/// Rule 5 in action: `modelText` and every other string is left byte-identical.
pub fn normalize(v: &mut Value) {
    match v {
        Value::Object(map) => {
            for (k, val) in map.iter_mut() {
                if val.is_string() {
                    if TIMESTAMP_KEYS.contains(&k.as_str()) {
                        *val = Value::String("<ts>".into());
                        continue;
                    }
                    if ID_KEYS.contains(&k.as_str()) {
                        *val = Value::String("<uuid>".into());
                        continue;
                    }
                }
                normalize(val);
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                normalize(item);
            }
        }
        _ => {}
    }
}

/// Rules 1 + 4: serialize with object keys in lexicographic order (BTreeMap default),
/// integers as integers. The canonical comparison form.
pub fn canonical_string(v: &Value) -> String {
    serde_json::to_string(v).expect("canonical serialize")
}

/// Normalize both sides, compare canonical strings. `None` = identical.
/// `Some(path)` = first differing path (rule 3: null vs missing key is a difference).
pub fn diff(a: &Value, b: &Value) -> Option<String> {
    let mut a = a.clone();
    let mut b = b.clone();
    normalize(&mut a);
    normalize(&mut b);
    if canonical_string(&a) == canonical_string(&b) {
        None
    } else {
        Some(first_diff(&a, &b))
    }
}

fn first_diff(a: &Value, b: &Value) -> String {
    match (a, b) {
        (Value::Object(ma), Value::Object(mb)) => {
            let mut keys: std::collections::BTreeSet<&String> = ma.keys().chain(mb.keys()).collect();
            for k in keys {
                match (ma.get(k), mb.get(k)) {
                    (Some(x), Some(y)) => {
                        let sub = first_diff(x, y);
                        if !sub.is_empty() {
                            return format!(".{k}{sub}");
                        }
                    }
                    (Some(_), None) => return format!(".{k} <missing in expected>"),
                    (None, Some(_)) => return format!(".{k} <missing in actual>"),
                    (None, None) => {}
                }
            }
            String::new()
        }
        (Value::Array(xa), Value::Array(xb)) => {
            if xa.len() != xb.len() {
                return format!("[len {} vs {}]", xa.len(), xb.len());
            }
            for (i, (x, y)) in xa.iter().zip(xb.iter()).enumerate() {
                let sub = first_diff(x, y);
                if !sub.is_empty() {
                    return format!("[{i}]{sub}");
                }
            }
            String::new()
        }
        _ => {
            if a == b {
                String::new()
            } else {
                format!(": {a} vs {b}")
            }
        }
    }
}

/* === fixture loading (single source: src/ai/__tests__/fixtures/) === */

fn fixture_files() -> Vec<std::path::PathBuf> {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../src/ai/__tests__/fixtures");
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .expect("fixtures dir")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            (name.starts_with("projection-cases") || name.starts_with("realdb-sample"))
                && name.ends_with(".json")
        })
        .collect();
    files.sort();
    files
}

fn case_events(case: &Value) -> Vec<AgentEvent> {
    case["events"]
        .as_array()
        .expect("events array")
        .iter()
        .map(|j| AgentEvent {
            event_id: j["eventId"].as_str().unwrap().into(),
            session_id: j["sessionId"].as_str().unwrap().into(),
            seq: j["seq"].as_i64().unwrap(),
            event_type: j["eventType"].as_str().unwrap().into(),
            created_at: j["createdAt"].as_str().unwrap().into(),
            workspace_id: j["workspaceId"].as_str().map(Into::into),
            product_id: j["productId"].as_str().map(Into::into),
            project_id: j["projectId"].as_str().map(Into::into),
            correlation_id: j["correlationId"].as_str().map(Into::into),
            payload: j["payload"].clone(),
        })
        .collect()
}

fn case_stream(case: &Value, events: &[AgentEvent]) -> Vec<AgentEvent> {
    if case["fork"].is_object() {
        let parent_id = case["fork"]["parentSessionId"].as_str().unwrap();
        let cut = case["fork"]["cutSeq"].as_i64().unwrap();
        let parent: Vec<AgentEvent> = events.iter().filter(|e| e.session_id == parent_id).cloned().collect();
        let child: Vec<AgentEvent> = events.iter().filter(|e| e.session_id != parent_id).cloned().collect();
        let built = crate::engine::fork::build_fork_event_stream(&parent, cut, &child);
        assert!(built.invalid.is_none(), "fork case invalid: {:?}", built.invalid);
        built.events
    } else {
        events.to_vec()
    }
}

/// Rust projection for one fixture case, as a comparable JSON Value
/// (array of {role, content} — the LLM-visible surface).
fn case_projection(case: &Value) -> Value {
    let events = case_events(case);
    let stream = case_stream(case, &events);
    let budget = case["budget"].as_i64().unwrap_or(DEFAULT_TOKEN_BUDGET);
    let llm = ChatSession::from_events(&stream, None, Some(budget)).get_messages_for_llm(DEFAULT_MAX_TURNS);
    Value::Array(
        llm.into_iter()
            .map(|m| json!({ "role": m.role.as_str(), "content": m.content }))
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Rule 2 lock: whitelisted timestamp/ID string fields become placeholders;
    /// modelText and other strings stay byte-identical (rule 5).
    #[test]
    fn normalize_replaces_whitelist_keys_with_placeholders() {
        let mut v = json!({
            "createdAt": "2026-08-19T07:23:06.932Z",
            "correlationId": "abc",
            "toolCallId": "tc-1",
            "modelText": "[tool_result listTasks] {\"createdAt\":\"raw\",\"ok\":true}",
            "nested": { "generatedAt": "x", "keep": "2026-08-19T07:23:06.932Z" }
        });
        normalize(&mut v);
        assert_eq!(v["createdAt"], json!("<ts>"));
        assert_eq!(v["nested"]["generatedAt"], json!("<ts>"));
        assert_eq!(v["correlationId"], json!("<uuid>"));
        assert_eq!(v["toolCallId"], json!("<uuid>"));
        // modelText is a string VALUE not a key — untouched, embedded JSON verbatim.
        assert_eq!(
            v["modelText"],
            json!("[tool_result listTasks] {\"createdAt\":\"raw\",\"ok\":true}")
        );
        assert_eq!(v["nested"]["keep"], json!("2026-08-19T07:23:06.932Z"));
    }

    /// Rules 1 + 3: key order is irrelevant; null vs missing key is a difference.
    #[test]
    fn diff_canonicalizes_key_order_and_rejects_null_vs_missing() {
        let a = json!({ "b": 1, "a": { "y": null, "x": 2 } });
        let b = json!({ "a": { "x": 2, "y": null }, "b": 1 });
        assert_eq!(diff(&a, &b), None);

        let c = json!({ "a": { "x": 2 }, "b": 1 });
        assert!(diff(&a, &c).unwrap().contains(".a.y"));
    }

    /// PERMANENT parity lock: every projection fixture (synthetic + realdb samples)
    /// replays through the Rust engine and matches the expected projection after
    /// canonical normalization. New semantic branch => add a fixture on BOTH sides.
    #[test]
    fn parity_projection_cases() {
        let files = fixture_files();
        assert!(!files.is_empty(), "no projection fixtures found");
        let mut ran = 0usize;
        for file in &files {
            let raw = std::fs::read_to_string(file).unwrap();
            let cases: Vec<Value> = serde_json::from_str(&raw).unwrap();
            for case in &cases {
                let name = case["name"].as_str().unwrap();
                let expected = case["expectedMessages"].clone();
                let got = case_projection(case);
                if let Some(path) = diff(&got, &expected) {
                    panic!(
                        "parity mismatch {} / {}: first diff at {path}\nexpected: {}\ngot: {}",
                        file.file_name().unwrap().to_str().unwrap(),
                        name,
                        canonical_string(&expected),
                        canonical_string(&got),
                    );
                }
                ran += 1;
            }
        }
        assert!(ran >= 8, "expected >=8 projection cases, ran {ran}");
    }
}
