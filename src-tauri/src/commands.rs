//! Tauri IPC commands + the `StreamChunk` wire shape (RESEARCH.md §Pattern 1).
//!
//! Wave 1 (this file) ships ONLY the `StreamChunk` enum — `llm.rs` references it
//! for the `on_token.send(...)` parameter type, so the enum must exist for the
//! crate to compile. Wave 2 (plan 03-02) adds the `#[tauri::command]` fns:
//! `generate_project`, `cancel_generate_project`, `has_api_key`, `set_api_key`.

/// Streaming chunk sent from the Rust `generate_project` command to the JS
/// `Channel.onmessage` handler.
///
/// `#[serde(tag = "kind", content = "data")]` produces wire shape:
///   `{ "kind": "token", "data": { "text": "..." } }`
///   `{ "kind": "done",   "data": null }`
///   `{ "kind": "error",  "data": { "message": "..." } }`
///
/// Ponytail: enum-over-struct because `text` and `message` only make sense on
/// their own variant. The planner's D-02 spec was `{ kind, text, error }` flat;
/// the tag-and-content enum is the idiomatic Rust shape and the JS side branches
/// on `msg.kind` identically either way.
#[derive(serde::Serialize, Clone)]
#[serde(tag = "kind", content = "data")]
pub enum StreamChunk {
    #[serde(rename = "token")]
    Token { text: String },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn streamchunk_token_serializes_tagged() {
        let chunk = StreamChunk::Token {
            text: "hello".to_string(),
        };
        let json = serde_json::to_string(&chunk).unwrap();
        assert_eq!(json, r#"{"kind":"token","data":{"text":"hello"}}"#);
    }

    #[test]
    fn streamchunk_done_serializes_with_kind_only() {
        // serde omits the `data` field for unit variants even with
        // `content = "data"` (there's no content to serialize). JS branches
        // on msg.kind first, so the absence of `data` on the done variant is fine.
        let json = serde_json::to_string(&StreamChunk::Done).unwrap();
        assert_eq!(json, r#"{"kind":"done"}"#);
    }

    #[test]
    fn streamchunk_error_serializes_tagged() {
        let chunk = StreamChunk::Error {
            message: "rate limited".to_string(),
        };
        let json = serde_json::to_string(&chunk).unwrap();
        assert_eq!(json, r#"{"kind":"error","data":{"message":"rate limited"}}"#);
    }
}
