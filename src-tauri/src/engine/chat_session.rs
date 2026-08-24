// src-tauri/src/engine/chat_session.rs
// Phase 22 (22-04) — port of src/ai/chatSession.ts (Phase 13 Plan 02).
// ChatSession is a PROJECTION of the event log: from_events rebuilds, and
// get_messages_for_llm is the single derived LLM format (tool_call assistant
// rows collapsed, tool content verbatim). Event emission (addMessage dual-write,
// appendAuxEvent, lazy session_created) is implemented in 22-05's loop — here
// only the projection surface exists.
//
// Parity lock: format_compaction_summary must stay byte-identical to
// chatSession.ts:45-47 (spaces, 「|」, newline included).

use crate::engine::event_log::AgentEvent;
use crate::engine::token_estimate::estimate_tokens;
use serde_json::Value;

pub const DEFAULT_MAX_TURNS: usize = 8;
pub const DEFAULT_TOKEN_BUDGET: i64 = 8_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChatRole {
    User,
    Assistant,
    Tool,
}

impl ChatRole {
    pub fn as_str(self) -> &'static str {
        match self {
            ChatRole::User => "user",
            ChatRole::Assistant => "assistant",
            ChatRole::Tool => "tool",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
    pub timestamp: i64,
}

/// LLM-facing message. get_messages_for_llm output unit (parity comparison object).
#[derive(Clone, Debug, PartialEq)]
pub struct LlmMessage {
    pub role: ChatRole,
    pub content: String,
}

/// CMP-02 provenance: what the summary covers, when, by which model.
#[derive(Clone, Debug, PartialEq)]
pub struct CompactionSummaryRecord {
    pub covered_seq_start: i64,
    pub covered_seq_end: i64,
    pub summary_text: String,
    pub model: String,
    pub generated_at: String,
}

/// Byte-identical to chatSession.ts formatCompactionSummary. Do not reformat.
pub fn format_compaction_summary(record: &CompactionSummaryRecord) -> String {
    format!(
        "[历史压缩摘要 | 覆盖事件 seq {}-{} | 生成于 {} | 模型 {}]\n{}",
        record.covered_seq_start, record.covered_seq_end, record.generated_at, record.model, record.summary_text
    )
}

/* === projection helpers (chatSession.ts:54-111) === */

fn group_into_turns(messages: &[ChatMessage]) -> Vec<Vec<ChatMessage>> {
    let mut turns: Vec<Vec<ChatMessage>> = Vec::new();
    let mut current: Vec<ChatMessage> = Vec::new();
    for message in messages {
        current.push(message.clone());
        // Tool requests/results stay in the same turn as their exchange.
        if message.role == ChatRole::Assistant && message.tool_call_id.is_none() {
            turns.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        turns.push(current);
    }
    turns
}

fn turn_tokens(turn: &[ChatMessage]) -> i64 {
    turn.iter().map(|m| estimate_tokens(&m.content)).sum()
}

fn trim_to_budget(turns: Vec<Vec<ChatMessage>>, token_budget: i64) -> Vec<ChatMessage> {
    if token_budget <= 0 {
        return Vec::new();
    }
    let mut result = turns;
    let mut total: i64 = result.iter().map(|t| turn_tokens(t)).sum();

    // Keep newest exchanges; discard complete older turns first.
    while result.len() > 1 && total > token_budget {
        total -= turn_tokens(&result[0]);
        result.remove(0);
    }

    // A single oversized exchange is trimmed from the oldest side as a last resort.
    if total > token_budget {
        trim_oversized_turn(result.first().map(Vec::as_slice).unwrap_or(&[]), token_budget)
    } else {
        result.into_iter().flatten().collect()
    }
}

fn trim_oversized_turn(turn: &[ChatMessage], token_budget: i64) -> Vec<ChatMessage> {
    let mut result: Vec<ChatMessage> = turn.to_vec();
    let mut total = turn_tokens(&result);
    while !result.is_empty() && total > token_budget {
        total -= estimate_tokens(&result[0].content);
        result.remove(0);
    }
    result
}

/// One model response may request N tools => N assistant-with-toolCallId rows;
/// the LLM must see that response once. Collapse consecutive rows.
fn collapse_tool_call_assistants(messages: Vec<ChatMessage>) -> Vec<ChatMessage> {
    let mut out: Vec<ChatMessage> = Vec::new();
    for message in messages {
        let prev_is_tool_call_assistant = out
            .last()
            .map(|p| p.role == ChatRole::Assistant && p.tool_call_id.is_some())
            .unwrap_or(false);
        if message.role == ChatRole::Assistant
            && message.tool_call_id.is_some()
            && prev_is_tool_call_assistant
        {
            continue;
        }
        out.push(message);
    }
    out
}

/* === rebuild (chatSession.ts:252-287) === */

fn payload_str(payload: &Value, key: &str) -> String {
    match payload.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(v) if !v.is_null() => v.to_string(),
        _ => String::new(),
    }
}

fn payload_opt_str(payload: &Value, key: &str) -> Option<String> {
    payload.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// TS `Date.parse(createdAt) || Date.now()` — timestamp is not LLM-visible;
/// 0 fallback is fine (kept for struct completeness only).
fn event_timestamp(created_at: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(created_at)
        .map(|d| d.timestamp_millis())
        .unwrap_or(0)
}

/// session_created / turn_ended / compaction_started / compaction_completed
/// (and any aux event) carry no message.
pub fn rebuild_messages(events: &[AgentEvent]) -> Vec<ChatMessage> {
    let mut messages = Vec::new();
    for event in events {
        let p = &event.payload;
        let ts = event_timestamp(&event.created_at);
        match event.event_type.as_str() {
            "user_message" => messages.push(ChatMessage {
                role: ChatRole::User,
                content: payload_str(p, "content"),
                tool_call_id: None,
                tool_name: None,
                timestamp: ts,
            }),
            "assistant_message" => messages.push(ChatMessage {
                role: ChatRole::Assistant,
                content: payload_str(p, "content"),
                tool_call_id: None,
                tool_name: None,
                timestamp: ts,
            }),
            "tool_call" => messages.push(ChatMessage {
                role: ChatRole::Assistant,
                content: match p.get("content") {
                    Some(Value::String(s)) => s.clone(),
                    Some(v) if !v.is_null() => v.to_string(),
                    // TS: String(undefined ?? '[requesting tools]')
                    _ => "[requesting tools]".into(),
                },
                tool_call_id: payload_opt_str(p, "toolCallId"),
                tool_name: payload_opt_str(p, "toolName"),
                timestamp: ts,
            }),
            "tool_result" => messages.push(ChatMessage {
                role: ChatRole::Tool,
                content: payload_str(p, "modelText"),
                tool_call_id: payload_opt_str(p, "toolCallId"),
                tool_name: payload_opt_str(p, "toolName"),
                timestamp: ts,
            }),
            _ => {}
        }
    }
    messages
}

/* === ChatSession === */

pub struct ChatSession {
    pub session_id: String,
    pub token_budget: i64,
    messages: Vec<ChatMessage>,
    compaction: Option<CompactionSummaryRecord>,
}

impl ChatSession {
    pub fn new(session_id: String, token_budget: i64) -> Self {
        ChatSession {
            session_id,
            token_budget,
            messages: Vec::new(),
            compaction: None,
        }
    }

    pub fn get_compaction(&self) -> Option<CompactionSummaryRecord> {
        self.compaction.clone()
    }

    pub fn get_all_messages(&self) -> Vec<ChatMessage> {
        self.messages.clone()
    }

    /// Sum of per-message token estimates (compaction pressure input).
    pub fn estimate_tokens(&self) -> i64 {
        self.messages.iter().map(|m| estimate_tokens(&m.content)).sum()
    }

    /// CMP-01 (projection-only): replace the projection with [sourced summary] +
    /// suffix turns. Called by maybe_compact_session; the log is append-only.
    pub fn apply_compaction_result(&mut self, record: CompactionSummaryRecord, events_after_split: &[AgentEvent]) {
        self.compaction = Some(record);
        let mut sorted: Vec<AgentEvent> = events_after_split.to_vec();
        sorted.sort_by_key(|e| e.seq);
        self.messages = rebuild_messages(&sorted);
    }

    /// Rebuild as a pure projection of the event stream. Compaction-aware:
    /// when the log contains a compaction_completed, only events with
    /// seq > coveredSeqEnd replay; the summary is carried and prepended by
    /// get_messages_for_llm.
    pub fn from_events(events: &[AgentEvent], session_id: Option<String>, token_budget: Option<i64>) -> ChatSession {
        let session_id = session_id
            .or_else(|| events.first().map(|e| e.session_id.clone()))
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let mut sorted: Vec<AgentEvent> = events.to_vec();
        sorted.sort_by_key(|e| e.seq);

        let last_compaction = sorted
            .iter()
            .rev()
            .find(|e| e.event_type == "compaction_completed");
        let mut replay_owned: Option<Vec<AgentEvent>> = None;
        let mut compaction: Option<CompactionSummaryRecord> = None;
        if let Some(last) = last_compaction {
            let p = &last.payload;
            let covered_seq_end = p.get("coveredSeqEnd").and_then(|v| v.as_i64()).unwrap_or(-1);
            if covered_seq_end >= 0 && p.get("summaryText").map_or(false, |v| v.is_string()) {
                compaction = Some(CompactionSummaryRecord {
                    covered_seq_start: p.get("coveredSeqStart").and_then(|v| v.as_i64()).unwrap_or(1),
                    covered_seq_end,
                    summary_text: payload_str(p, "summaryText"),
                    model: match p.get("model") {
                        Some(Value::String(s)) => s.clone(),
                        _ => "unknown".into(),
                    },
                    generated_at: payload_str(p, "generatedAt"),
                });
                replay_owned = Some(
                    sorted
                        .iter()
                        .filter(|e| e.seq > covered_seq_end)
                        .cloned()
                        .collect::<Vec<_>>(),
                );
            }
        }
        let replay: &[AgentEvent] = replay_owned.as_deref().unwrap_or(&sorted);

        let mut session = ChatSession::new(session_id, token_budget.unwrap_or(DEFAULT_TOKEN_BUDGET));
        session.messages = rebuild_messages(replay);
        session.compaction = compaction;
        session
    }

    /// Newest complete exchanges; compaction summary prepended when present.
    pub fn get_messages_for_llm(&self, max_turns: usize) -> Vec<LlmMessage> {
        let turns = group_into_turns(&self.messages);
        let windowed: Vec<Vec<ChatMessage>> = if turns.len() > max_turns {
            turns[turns.len() - max_turns..].to_vec()
        } else {
            turns
        };
        let selected = trim_to_budget(windowed, self.token_budget);
        let derived: Vec<LlmMessage> = collapse_tool_call_assistants(selected)
            .into_iter()
            .map(|m| LlmMessage { role: m.role, content: m.content })
            .collect();
        match &self.compaction {
            Some(record) => {
                let mut out = vec![LlmMessage {
                    role: ChatRole::User,
                    content: format_compaction_summary(record),
                }];
                out.extend(derived);
                out
            }
            None => derived,
        }
    }

    /// Default 8-turn window (TS default parameter).
    pub fn get_messages_for_llm_default(&self) -> Vec<LlmMessage> {
        self.get_messages_for_llm(DEFAULT_MAX_TURNS)
    }
}

// NOTE (22-05 interface): addMessage dual-write (in-memory + event append with
// lazy once-guarded session_created ordered FIRST) and appendAuxEvent share the
// event queue ordering guarantee; the loop module owns emission. Projection here.

/* === Tests (ported from src/ai/__tests__/phase13ChatSessionProjection.test.ts) === */

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn event(seq: i64, event_type: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: format!("e{seq}"),
            session_id: "s1".into(),
            seq,
            event_type: event_type.into(),
            created_at: "2026-08-18T00:00:00.000Z".into(),
            workspace_id: None,
            product_id: None,
            project_id: None,
            correlation_id: None,
            payload,
        }
    }

    fn msg(role: ChatRole, content: &str) -> ChatMessage {
        ChatMessage { role, content: content.into(), tool_call_id: None, tool_name: None, timestamp: 0 }
    }

    fn tool_msg(role: ChatRole, content: &str, tool_call_id: &str) -> ChatMessage {
        ChatMessage { role, content: content.into(), tool_call_id: Some(tool_call_id.into()), tool_name: None, timestamp: 0 }
    }

    #[test]
    fn projection_collapses_consecutive_tool_call_assistant_rows() {
        let messages = vec![
            msg(ChatRole::User, "查两个工具"),
            tool_msg(ChatRole::Assistant, "thinking", "tc-a"),
            tool_msg(ChatRole::Assistant, "thinking", "tc-b"),
            tool_msg(ChatRole::Tool, "[tool_result listTasks] {\"ok\":true,\"data\":[]}", "tc-a"),
            tool_msg(ChatRole::Tool, "[tool_result listProducts] {\"ok\":true,\"data\":[]}", "tc-b"),
            msg(ChatRole::Assistant, "都查完了"),
        ];
        let session = ChatSession {
            session_id: "proj-3".into(),
            token_budget: 8000,
            messages,
            compaction: None,
        };
        let llm = session.get_messages_for_llm_default();
        assert_eq!(
            llm.iter().map(|m| m.content.as_str()).collect::<Vec<_>>(),
            vec![
                "查两个工具",
                "thinking",
                "[tool_result listTasks] {\"ok\":true,\"data\":[]}",
                "[tool_result listProducts] {\"ok\":true,\"data\":[]}",
                "都查完了",
            ]
        );
        assert_eq!(
            llm.iter().map(|m| m.role).collect::<Vec<_>>(),
            vec![
                ChatRole::User,
                ChatRole::Assistant,
                ChatRole::Tool,
                ChatRole::Tool,
                ChatRole::Assistant
            ]
        );
    }

    #[test]
    fn from_events_rebuilds_identical_projection() {
        let events = vec![
            event(1, "session_created", json!({"tokenBudget": 8000})),
            event(2, "user_message", json!({"content": "帮我处理"})),
            event(3, "tool_call", json!({"toolCallId": "tc-1", "toolName": "listTasks", "args": {"a": 1}, "content": "调用工具"})),
            event(4, "tool_result", json!({"toolCallId": "tc-1", "toolName": "listTasks", "modelText": "[tool_result listTasks] {\"ok\":true}"})),
            event(5, "assistant_message", json!({"content": "完成"})),
            event(6, "turn_ended", json!({"outcome": "completed", "iterations": 1})),
        ];
        let rebuilt = ChatSession::from_events(&events, None, None);
        let again = ChatSession::from_events(&events, None, None);
        assert_eq!(rebuilt.get_messages_for_llm_default(), again.get_messages_for_llm_default());
        assert_eq!(rebuilt.get_all_messages()[1].tool_call_id.as_deref(), Some("tc-1"));
        assert_eq!(
            rebuilt.get_messages_for_llm_default().iter().map(|m| m.content.clone()).collect::<Vec<_>>(),
            vec!["帮我处理", "调用工具", "[tool_result listTasks] {\"ok\":true}", "完成"]
        );
    }

    #[test]
    fn tool_call_missing_content_defaults_to_requesting_tools() {
        let events = vec![
            event(1, "user_message", json!({"content": "go"})),
            event(2, "tool_call", json!({"toolCallId": "t1", "toolName": "x"})),
        ];
        let session = ChatSession::from_events(&events, None, None);
        assert_eq!(session.get_all_messages()[1].content, "[requesting tools]");
    }

    #[test]
    fn cjk_budget_drops_oversized_chinese_turns() {
        // 60 CJK chars -> 60 tokens; budget 20 keeps only the second exchange.
        let messages = vec![
            msg(ChatRole::User, &"中文".repeat(30)),
            msg(ChatRole::Assistant, "好的"),
            msg(ChatRole::User, "新问题"),
            msg(ChatRole::Assistant, "回答"),
        ];
        let session = ChatSession { session_id: "proj-5".into(), token_budget: 20, messages, compaction: None };
        assert_eq!(
            session.get_messages_for_llm_default().iter().map(|m| m.content.clone()).collect::<Vec<_>>(),
            vec!["新问题", "回答"]
        );
    }

    #[test]
    fn eight_turn_window_and_tool_grouping_and_tiny_budget() {
        // Eight-turn window: 10 turns added, only newest 8 returned.
        let mut messages = Vec::new();
        for i in 1..=10 {
            messages.push(msg(ChatRole::User, &format!("user-{i}")));
            messages.push(msg(ChatRole::Assistant, &format!("assistant-{i}")));
        }
        let session = ChatSession { session_id: "w".into(), token_budget: 8000, messages, compaction: None };
        assert_eq!(
            session.get_messages_for_llm_default().iter().map(|m| m.content.clone()).collect::<Vec<_>>(),
            vec![
                "user-3", "assistant-3", "user-4", "assistant-4", "user-5", "assistant-5",
                "user-6", "assistant-6", "user-7", "assistant-7", "user-8", "assistant-8",
                "user-9", "assistant-9", "user-10", "assistant-10",
            ]
        );

        // Tool grouping: tool_call/tool_result stay with their exchange.
        let tool_messages = vec![
            msg(ChatRole::User, "安排任务"),
            tool_msg(ChatRole::Assistant, "我先查询任务", "call-1"),
            tool_msg(ChatRole::Tool, "{\"taskId\":\"task-1\"}", "call-1"),
            msg(ChatRole::Assistant, "任务已找到"),
            msg(ChatRole::User, "改到明天"),
            msg(ChatRole::Assistant, "已改到明天"),
        ];
        let tool_session = ChatSession { session_id: "t".into(), token_budget: 8000, messages: tool_messages, compaction: None };
        assert_eq!(
            tool_session.get_messages_for_llm_default().iter().map(|m| m.content.clone()).collect::<Vec<_>>(),
            vec!["安排任务", "我先查询任务", "{\"taskId\":\"task-1\"}", "任务已找到", "改到明天", "已改到明天"]
        );

        // Tiny budget: old exchanges dropped, newest retained.
        let budget_messages = vec![
            msg(ChatRole::User, &"old ".repeat(10)),
            msg(ChatRole::Assistant, &"old answer ".repeat(10)),
            msg(ChatRole::User, "new"),
            msg(ChatRole::Assistant, "new answer"),
        ];
        let budget_session = ChatSession { session_id: "b".into(), token_budget: 5, messages: budget_messages, compaction: None };
        assert_eq!(
            budget_session.get_messages_for_llm_default().iter().map(|m| m.content.clone()).collect::<Vec<_>>(),
            vec!["new", "new answer"]
        );
    }

    // Fixture parity moved to engine::parity (22-07): single permanent harness
    // globs ALL projection fixtures (synthetic + realdb samples), both sides.

    #[test]
    fn format_compaction_summary_verbatim() {
        let record = CompactionSummaryRecord {
            covered_seq_start: 3,
            covered_seq_end: 12,
            summary_text: "摘要正文".into(),
            model: "deepseek".into(),
            generated_at: "2026-08-18T00:00:00.000Z".into(),
        };
        assert_eq!(
            format_compaction_summary(&record),
            "[历史压缩摘要 | 覆盖事件 seq 3-12 | 生成于 2026-08-18T00:00:00.000Z | 模型 deepseek]\n摘要正文"
        );
    }

    #[test]
    fn from_events_compaction_aware_prefixes_summary() {
        let events = vec![
            event(1, "session_created", json!({})),
            event(2, "user_message", json!({"content": "旧问题"})),
            event(3, "assistant_message", json!({"content": "旧回答"})),
            event(4, "turn_ended", json!({"outcome": "completed"})),
            event(5, "compaction_completed", json!({
                "coveredSeqStart": 1, "coveredSeqEnd": 4, "summaryText": "早期摘要",
                "model": "deepseek", "generatedAt": "2026-08-18T00:00:00.000Z"
            })),
            event(6, "user_message", json!({"content": "压缩后的问题"})),
            event(7, "assistant_message", json!({"content": "压缩后的回答"})),
        ];
        let session = ChatSession::from_events(&events, None, None);
        let compaction = session.get_compaction().expect("compaction carried");
        assert_eq!(compaction.covered_seq_end, 4);
        let llm = session.get_messages_for_llm_default();
        assert_eq!(llm[0].role, ChatRole::User);
        assert!(llm[0].content.contains("[历史压缩摘要"));
        assert!(llm[0].content.contains("seq 1-4"));
        assert_eq!(llm[1].content, "压缩后的问题");
        assert_eq!(llm[2].content, "压缩后的回答");
        assert!(!llm.iter().any(|m| m.content.contains("旧问题")));
    }
}
