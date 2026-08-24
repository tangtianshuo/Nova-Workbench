// src-tauri/src/engine/channel.rs
// Phase 22 (22-05) — EngineEvent Channel message protocol (22-RESEARCH
// §Channel 消息协议设计). Mirrors the commands.rs StreamChunk wire shape
// (serde tag="kind", content="data"); the webview switches on msg.kind.
// Wiring into a Tauri command happens in 22-06.

use serde::Serialize;
use serde_json::Value;

/// ToolLoopResult 同形 (src/ai/toolLoop.ts ToolLoopResult).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EngineRunResult {
    pub content: String,
    pub iterations: u32,
    pub tool_calls_executed: u32,
    pub truncated: bool,
    /// HITL candidate JSON ({kind, confirmationToken, ...}) when the turn
    /// paused awaiting confirmation; covers both TS pendingConfirmation and
    /// pendingDestructiveConfirmation (kind discriminates).
    pub pending_confirmation: Option<Value>,
}

/// Engine channel protocol. Token is high-frequency; everything else is a
/// turn-level summary. EventCommitted carries {seq, event_type} so the webview
/// can refresh its projection from SQLite incrementally. ToolOutput (23-01)
/// streams exec stdout/stderr chunks; the webview may ignore unknown kinds.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "data")]
pub enum EngineEvent {
    #[serde(rename = "token")]
    Token { text: String },
    #[serde(rename = "tool_start")]
    ToolStart { name: String },
    #[serde(rename = "tool_end")]
    ToolEnd { name: String, ok: bool },
    #[serde(rename = "tool_output")]
    ToolOutput { name: String, stream: String, is_stderr: bool },
    #[serde(rename = "event")]
    EventCommitted { seq: i64, event_type: String },
    #[serde(rename = "confirmation")]
    Confirmation { candidate: Value },
    #[serde(rename = "done")]
    Done { result: EngineRunResult },
    #[serde(rename = "error")]
    Error { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_shape_kind_and_data_tags() {
        let event = EngineEvent::EventCommitted { seq: 3, event_type: "user_message".into() };
        let wire: Value = serde_json::to_value(&event).unwrap();
        assert_eq!(wire["kind"], "event");
        assert_eq!(wire["data"]["seq"], 3);
        assert_eq!(wire["data"]["event_type"], "user_message");

        let token = EngineEvent::Token { text: "你".into() };
        let wire: Value = serde_json::to_value(&token).unwrap();
        assert_eq!(wire["kind"], "token");
        assert_eq!(wire["data"]["text"], "你");
    }

    #[test]
    fn tool_output_serializes_with_own_kind() {
        let event = EngineEvent::ToolOutput {
            name: "exec".into(),
            stream: "hello\n".into(),
            is_stderr: false,
        };
        let wire: Value = serde_json::to_value(&event).unwrap();
        assert_eq!(wire["kind"], "tool_output");
        assert_eq!(wire["data"]["name"], "exec");
        assert_eq!(wire["data"]["stream"], "hello\n");
        assert_eq!(wire["data"]["is_stderr"], false);
    }

    #[test]
    fn result_camel_case_fields() {
        let result = EngineRunResult {
            content: "done".into(),
            iterations: 2,
            tool_calls_executed: 1,
            truncated: false,
            pending_confirmation: None,
        };
        let wire: Value = serde_json::to_value(&result).unwrap();
        assert_eq!(wire["toolCallsExecuted"], 1);
        assert_eq!(wire["pendingConfirmation"], Value::Null);
    }
}
