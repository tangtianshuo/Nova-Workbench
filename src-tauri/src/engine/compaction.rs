// src-tauri/src/engine/compaction.rs
// Phase 22 (22-04) — port of src/ai/compaction.ts (Phase 14, CMP-01/CMP-02).
// Token-pressure compaction at pairing-balanced turn boundaries. Projection-only:
// agent_events is append-only; compaction appends compaction_started /
// compaction_completed and rebuilds the session projection. Split-point validity
// reuses 22-03's invariants (pairing + seq).
//
// Divergences accepted (noted in 22-02 too): serde_json Value objects are
// BTreeMap-ordered, so estimate_event_tokens(tool_call) counting
// JSON.stringify(args) can differ from TS on multi-key args objects whose key
// order differs — token-estimate only, never in persisted text.

use crate::engine::chat_session::{ChatSession, CompactionSummaryRecord};
use crate::engine::event_log::{self, AgentEvent, EventInput};
use crate::engine::fork;
use crate::engine::token_estimate::estimate_tokens;
use rusqlite::Connection;
use serde_json::{json, Value};

pub const COMPACTION_PRESSURE_RATIO: f64 = 0.8; // trigger: pressure >= 0.8 x context window
pub const COMPACTION_KEEP_RATIO: f64 = 0.5; // raw suffix kept after split <= 0.5 x window
pub const COMPACTION_TRANSCRIPT_MAX_CHARS: usize = 12_000;
pub const COMPACTION_SOURCE_MAX_CHARS: usize = 2_000;

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

/// Summarizer closure: transcript in, summary text out. Production wires the
/// LLM call (22-05 loop); tests inject a fake.
pub type CompactionSummarizer<'a> = dyn FnMut(&str) -> std::result::Result<String, String> + 'a;

pub fn token_pressure(session: &ChatSession) -> f64 {
    session.estimate_tokens() as f64 / session.token_budget as f64
}

fn estimate_event_tokens(event: &AgentEvent) -> i64 {
    let p = &event.payload;
    match event.event_type.as_str() {
        "user_message" | "assistant_message" => estimate_tokens(&opt_str(p, "content")),
        "tool_call" => {
            let args = p.get("args").cloned().unwrap_or_else(|| json!({}));
            estimate_tokens(&opt_str(p, "content")) + estimate_tokens(&serde_json::to_string(&args).unwrap_or_default())
        }
        "tool_result" => estimate_tokens(&opt_str(p, "modelText")),
        _ => 0,
    }
}

fn opt_str(payload: &Value, key: &str) -> String {
    match payload.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(v) if !v.is_null() => v.to_string(),
        _ => String::new(),
    }
}

fn chars_take(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// Largest seq S (on a turn_ended boundary) such that events[seq<=S] is fully
/// pairing-balanced, the suffix estimates <= keepTokenTarget, and the prefix
/// contains at least one turn_ended. Returns 0 when no split qualifies —
/// the caller then skips compaction rather than splitting inside a tool pair.
pub fn find_split_point(events: &[AgentEvent], keep_token_target: i64) -> i64 {
    let mut sorted: Vec<&AgentEvent> = events.iter().collect();
    sorted.sort_by_key(|e| e.seq);
    let n = sorted.len();
    let mut suffix_tokens: Vec<i64> = vec![0; n];
    let mut total: i64 = 0;
    for i in (0..n).rev() {
        total += estimate_event_tokens(sorted[i]);
        suffix_tokens[i] = total;
    }
    for i in (0..n).rev() {
        let candidate = sorted[i];
        if candidate.event_type != "turn_ended" {
            continue;
        }
        let suffix_after = if i + 1 < n { suffix_tokens[i + 1] } else { 0 };
        if suffix_after > keep_token_target {
            continue;
        }
        let prefix: Vec<AgentEvent> = sorted[..=i].iter().map(|e| (*e).clone()).collect();
        if !prefix.iter().any(|e| e.event_type == "turn_ended") {
            continue;
        }
        if !event_log::check_event_stream_issues_free(&prefix) {
            continue;
        }
        return candidate.seq;
    }
    0
}

/// Model-visible transcript of the prefix, each source line capped; an earlier
/// compaction_completed's summary is carried forward first so successive
/// compactions never drop the older summary.
pub fn build_transcript(prefix: &[AgentEvent]) -> String {
    let mut lines: Vec<String> = Vec::new();
    for event in prefix {
        let p = &event.payload;
        if event.event_type == "compaction_completed" && p.get("summaryText").map_or(false, |v| v.is_string()) {
            lines.push(format!(
                "[earlier compressed summary] {}",
                chars_take(&opt_str(p, "summaryText"), COMPACTION_SOURCE_MAX_CHARS)
            ));
        } else if event.event_type == "user_message" || event.event_type == "assistant_message" {
            lines.push(format!(
                "{}: {}",
                if event.event_type == "user_message" { "user" } else { "assistant" },
                chars_take(&opt_str(p, "content"), COMPACTION_SOURCE_MAX_CHARS)
            ));
        } else if event.event_type == "tool_call" {
            let args = p.get("args").cloned().unwrap_or_else(|| json!({}));
            let name = p.get("toolName").and_then(|v| v.as_str()).unwrap_or("?");
            lines.push(format!(
                "tool_call: {name} {}",
                chars_take(&serde_json::to_string(&args).unwrap_or_default(), COMPACTION_SOURCE_MAX_CHARS)
            ));
        } else if event.event_type == "tool_result" {
            lines.push(format!(
                "tool_result: {}",
                chars_take(&opt_str(p, "modelText"), COMPACTION_SOURCE_MAX_CHARS)
            ));
        }
    }
    let joined = lines.join("\n");
    if joined.chars().count() <= COMPACTION_TRANSCRIPT_MAX_CHARS {
        joined
    } else {
        format!("{}\n[transcript truncated]", chars_take(&joined, COMPACTION_TRANSCRIPT_MAX_CHARS))
    }
}

/// Compact when pressure >= COMPACTION_PRESSURE_RATIO (or force). Returns the
/// persisted record, or None when skipped. Append-only: original events untouched.
/// Fork-aware (Phase 20): compaction payloads persist in CHILD seq space
/// (forkOffset subtracted); build_fork_event_stream remaps back at resolve time.
pub fn maybe_compact_session(
    conn: &Connection,
    session: &mut ChatSession,
    provider: &str,
    ollama_model: Option<&str>,
    force: bool,
    summarizer: &mut CompactionSummarizer<'_>,
) -> Result<Option<CompactionSummaryRecord>> {
    if !force && token_pressure(session) < COMPACTION_PRESSURE_RATIO {
        return Ok(None);
    }
    let events = fork::resolve_session_events(conn, &session.session_id)?;
    if events.is_empty() {
        return Ok(None);
    }

    let keep_target = (session.token_budget as f64 * COMPACTION_KEEP_RATIO).floor() as i64;
    let split_seq = find_split_point(&events, keep_target);
    if split_seq <= 0 {
        return Ok(None);
    }

    let prefix: Vec<AgentEvent> = events.iter().filter(|e| e.seq <= split_seq).cloned().collect();
    let suffix: Vec<AgentEvent> = events.iter().filter(|e| e.seq > split_seq).cloned().collect();
    let fork_offset = events.iter().filter(|e| e.session_id != session.session_id).count() as i64;
    let started_at = event_log::now_iso();
    event_log::append(
        conn,
        &EventInput {
            session_id: session.session_id.clone(),
            event_type: "compaction_started".into(),
            workspace_id: None,
            product_id: None,
            project_id: None,
            correlation_id: None,
            payload: json!({
                "reason": "token_pressure",
                "pressure": token_pressure(session),
                "threshold": COMPACTION_PRESSURE_RATIO,
                "splitSeq": split_seq - fork_offset,
            }),
        },
    )?;

    let transcript = build_transcript(&prefix);
    let summary_text = summarizer(&transcript).map_err(|e| -> Error { e.into() })?;
    let generated_at = event_log::now_iso();
    let model = match (provider, ollama_model) {
        ("ollama", Some(m)) => format!("ollama:{m}"),
        _ => provider.to_string(),
    };

    let record = CompactionSummaryRecord {
        covered_seq_start: prefix[0].seq,
        covered_seq_end: split_seq,
        summary_text,
        model,
        generated_at,
    };
    event_log::append(
        conn,
        &EventInput {
            session_id: session.session_id.clone(),
            event_type: "compaction_completed".into(),
            workspace_id: None,
            product_id: None,
            project_id: None,
            correlation_id: None,
            payload: json!({
                "coveredSeqStart": record.covered_seq_start - fork_offset,
                "coveredSeqEnd": record.covered_seq_end - fork_offset,
                "summaryText": record.summary_text,
                "model": record.model,
                "generatedAt": record.generated_at,
                "coveredEventCount": prefix.len(),
                "tokenCountBefore": session.estimate_tokens(),
                "startedAt": started_at,
            }),
        },
    )?;

    session.apply_compaction_result(record.clone(), &suffix);
    Ok(Some(record))
}

/* === Tests (ported from phase14Compaction.test.ts + fork.test.ts round-trip) === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use crate::engine::event_log::append;

    fn input(session: &str, event_type: &str, payload: Value) -> EventInput {
        EventInput {
            session_id: session.into(),
            event_type: event_type.into(),
            workspace_id: None,
            product_id: None,
            project_id: None,
            correlation_id: None,
            payload,
        }
    }

    fn fake_summarizer(transcript: &str) -> std::result::Result<String, String> {
        Ok(format!("SUMMARY:{}", chars_take(transcript, 24)))
    }

    /// Append a full turn into the DB (user [+ tool pair] + assistant + turn_ended).
    fn append_turn(conn: &Connection, session: &str, user: &str, assistant: &str, tool: Option<(&str, &str)>) {
        append(conn, &input(session, "user_message", json!({"content": user}))).unwrap();
        if let Some((tool_name, tool_call_id)) = tool {
            append(conn, &input(session, "tool_call", json!({"toolCallId": tool_call_id, "toolName": tool_name, "args": {}, "content": ""}))).unwrap();
            append(conn, &input(session, "tool_result", json!({"toolCallId": tool_call_id, "toolName": tool_name, "modelText": "[tool_result x] ok"}))).unwrap();
        }
        append(conn, &input(session, "assistant_message", json!({"content": assistant}))).unwrap();
        append(conn, &input(session, "turn_ended", json!({"outcome": "completed"}))).unwrap();
    }

    fn live_session(conn: &Connection, session_id: &str, budget: i64) -> ChatSession {
        // 22-05 will own emission; here the live session is the from_events
        // projection of everything currently in the log (pressure uses it as-is).
        ChatSession::from_events(
            &fork::resolve_session_events(conn, session_id).unwrap(),
            Some(session_id.to_string()),
            Some(budget),
        )
    }

    #[test]
    fn no_compaction_below_threshold() {
        let conn = mem_conn();
        append(&conn, &input("cmp-below", "user_message", json!({"content": "中".repeat(799)}))).unwrap();
        let mut session = live_session(&conn, "cmp-below", 1000);
        let record = maybe_compact_session(&conn, &mut session, "deepseek", None, false, &mut fake_summarizer).unwrap();
        assert!(record.is_none());
        assert!(event_log::list_events(&conn, "cmp-below").unwrap().iter().all(|e| e.event_type != "compaction_started"));
    }

    #[test]
    fn compaction_triggers_and_log_is_append_only() {
        let conn = mem_conn();
        for _ in 0..3 {
            append_turn(&conn, "cmp-append", &"背景讨论".repeat(60), &"结论摘要".repeat(60), None);
        }
        let before = event_log::list_events(&conn, "cmp-append").unwrap();
        let mut session = live_session(&conn, "cmp-append", 1000);
        let record = maybe_compact_session(&conn, &mut session, "deepseek", None, false, &mut fake_summarizer).unwrap();
        assert!(record.is_some());
        let after = event_log::list_events(&conn, "cmp-append").unwrap();
        assert_eq!(after.len(), before.len() + 2, "exactly 2 new events");
        assert_eq!(after[before.len()].event_type, "compaction_started");
        assert_eq!(after[before.len() + 1].event_type, "compaction_completed");
    }

    #[test]
    fn provenance_covered_span_model_and_payload() {
        let conn = mem_conn();
        for _ in 0..3 {
            append_turn(&conn, "cmp-prov", &"背景讨论".repeat(60), &"结论摘要".repeat(60), None);
        }
        let mut session = live_session(&conn, "cmp-prov", 1000);
        let record = maybe_compact_session(&conn, &mut session, "deepseek", None, false, &mut fake_summarizer).unwrap().unwrap();
        assert_eq!(record.covered_seq_start, 1);
        assert!(record.covered_seq_end >= 1);
        assert_eq!(record.model, "deepseek");
        assert!(record.summary_text.starts_with("SUMMARY:"));
        let events = event_log::list_events(&conn, "cmp-prov").unwrap();
        let completed = events.iter().find(|e| e.event_type == "compaction_completed").unwrap();
        assert_eq!(completed.payload["coveredSeqEnd"], json!(record.covered_seq_end));
        assert!(completed.payload["coveredEventCount"].is_u64());
    }

    #[test]
    fn ollama_model_prefixed() {
        let conn = mem_conn();
        for _ in 0..3 {
            append_turn(&conn, "cmp-ollama", &"背景讨论".repeat(60), &"结论摘要".repeat(60), None);
        }
        let mut session = live_session(&conn, "cmp-ollama", 1000);
        let record = maybe_compact_session(&conn, &mut session, "ollama", Some("qwen3:8b"), false, &mut fake_summarizer)
            .unwrap()
            .unwrap();
        assert_eq!(record.model, "ollama:qwen3:8b");
    }

    #[test]
    fn split_lands_on_turn_boundary_and_keeps_unpaired_tail_in_suffix() {
        let conn = mem_conn();
        append_turn(&conn, "cmp-bal", &"背景讨论".repeat(60), &"结论摘要".repeat(60), Some(("listTasks", "t1")));
        append_turn(&conn, "cmp-bal", &"背景讨论".repeat(60), &"结论摘要".repeat(60), Some(("listTasks", "t2")));
        // Open tail: unpaired tool_call (no tool_result).
        append(&conn, &input("cmp-bal", "user_message", json!({"content": "继续处理"}))).unwrap();
        append(&conn, &input("cmp-bal", "tool_call", json!({"toolCallId": "t3", "toolName": "deleteTask", "args": {}, "content": ""}))).unwrap();
        append(&conn, &input("cmp-bal", "turn_ended", json!({"outcome": "tool_limit"}))).unwrap();
        let before = event_log::list_events(&conn, "cmp-bal").unwrap();
        let mut session = live_session(&conn, "cmp-bal", 1000);
        let record = maybe_compact_session(&conn, &mut session, "deepseek", None, true, &mut fake_summarizer).unwrap().unwrap();
        let end_event = before.iter().find(|e| e.seq == record.covered_seq_end).unwrap();
        assert_eq!(end_event.event_type, "turn_ended");
        let prefix: Vec<AgentEvent> = before.iter().filter(|e| e.seq <= record.covered_seq_end).cloned().collect();
        assert!(event_log::check_event_stream_issues_free(&prefix));
        let suffix: Vec<&AgentEvent> = before.iter().filter(|e| e.seq > record.covered_seq_end).collect();
        assert!(suffix.iter().any(|e| e.event_type == "tool_call" && e.payload["toolCallId"] == json!("t3")));
    }

    #[test]
    fn projection_after_compaction_leads_with_sourced_summary() {
        let conn = mem_conn();
        append_turn(&conn, "cmp-proj", &"背景讨论".repeat(60), &"结论摘要".repeat(60), Some(("listTasks", "t1")));
        append_turn(&conn, "cmp-proj", &"背景讨论".repeat(60), &"结论摘要".repeat(60), Some(("listTasks", "t2")));
        append(&conn, &input("cmp-proj", "user_message", json!({"content": "继续处理尾部"}))).unwrap();
        append(&conn, &input("cmp-proj", "tool_call", json!({"toolCallId": "t3", "toolName": "deleteTask", "args": {}, "content": ""}))).unwrap();
        append(&conn, &input("cmp-proj", "turn_ended", json!({"outcome": "tool_limit"}))).unwrap();
        let mut session = live_session(&conn, "cmp-proj", 1000);
        let record = maybe_compact_session(&conn, &mut session, "deepseek", None, true, &mut fake_summarizer).unwrap().unwrap();
        let messages = session.get_messages_for_llm(8);
        assert!(messages.len() >= 2);
        assert!(messages[0].content.contains("[历史压缩摘要"));
        assert!(messages[0].content.contains(&format!("seq {}-{}", record.covered_seq_start, record.covered_seq_end)));
        assert!(messages[0].content.contains("模型 deepseek"));
        assert!(messages[1..].iter().any(|m| m.content.contains("继续处理尾部")));
        assert_eq!(session.get_compaction(), Some(record));
    }

    #[test]
    fn replay_parity_across_compaction() {
        let conn = mem_conn();
        for _ in 0..3 {
            append_turn(&conn, "cmp-parity", &"背景讨论".repeat(60), &"结论摘要".repeat(60), None);
        }
        let mut session = live_session(&conn, "cmp-parity", 1000);
        maybe_compact_session(&conn, &mut session, "deepseek", None, false, &mut fake_summarizer).unwrap().unwrap();
        let events = event_log::list_events(&conn, "cmp-parity").unwrap();
        let rebuilt = ChatSession::from_events(&events, None, Some(1000));
        assert_eq!(rebuilt.get_messages_for_llm(8), session.get_messages_for_llm(8));
        assert_eq!(rebuilt.get_compaction(), session.get_compaction());
    }

    #[test]
    fn no_valid_split_log_untouched() {
        let conn = mem_conn();
        append(&conn, &input("cmp-no-split", "user_message", json!({"content": "中".repeat(500)}))).unwrap();
        append(&conn, &input("cmp-no-split", "assistant_message", json!({"content": "中".repeat(500)}))).unwrap();
        let mut session = live_session(&conn, "cmp-no-split", 400);
        let record = maybe_compact_session(&conn, &mut session, "deepseek", None, true, &mut fake_summarizer).unwrap();
        assert!(record.is_none());
        assert_eq!(event_log::list_events(&conn, "cmp-no-split").unwrap().len(), 2);
    }

    #[test]
    fn successive_compaction_carries_earlier_summary() {
        let conn = mem_conn();
        for _ in 0..3 {
            append_turn(&conn, "cmp-succ", &"第一轮讨论".repeat(60), &"第一轮摘要".repeat(60), None);
        }
        let mut session = live_session(&conn, "cmp-succ", 1000);
        maybe_compact_session(&conn, &mut session, "deepseek", None, false, &mut fake_summarizer).unwrap().unwrap();
        for _ in 0..2 {
            append_turn(&conn, "cmp-succ", &"第二轮讨论".repeat(80), &"第二轮摘要".repeat(80), None);
        }
        let mut session = live_session(&conn, "cmp-succ", 1000);
        let mut captured = String::new();
        let mut capturing = |t: &str| -> std::result::Result<String, String> {
            captured = t.to_string();
            Ok("SECOND".into())
        };
        let second = maybe_compact_session(&conn, &mut session, "deepseek", None, true, &mut capturing).unwrap().unwrap();
        assert_eq!(second.summary_text, "SECOND");
        assert!(captured.contains("[earlier compressed summary]"), "earlier summary carried forward");
    }

    #[test]
    fn fork_child_compaction_payloads_persist_in_child_space() {
        // fork.test.ts test 9 core: parent prefix enters the transcript; payload
        // seq fields are persisted in CHILD space (coveredSeq* - forkOffset).
        let conn = mem_conn();
        for _ in 0..3 {
            append_turn(&conn, "rt-parent", &"背景讨论甲".repeat(60), &"结论摘要甲".repeat(60), None);
        }
        let parent_events = event_log::list_events(&conn, "rt-parent").unwrap();
        let cut = fork::find_fork_cut_seq(&parent_events, 2).unwrap(); // after first assistant
        event_log::upsert_session(&conn, "rt-child", None, None, None, Some("rt-parent"), Some(cut)).unwrap();
        append(&conn, &input("rt-child", "session_forked", json!({"parentSessionId": "rt-parent", "parentCutSeq": cut}))).unwrap();
        for _ in 0..2 {
            append_turn(&conn, "rt-child", &"子代问题一".repeat(60), &"子代回答一".repeat(60), None);
        }
        let mut session = live_session(&conn, "rt-child", 1000);
        let mut captured = String::new();
        let mut capturing = |t: &str| -> std::result::Result<String, String> {
            captured = t.to_string();
            Ok("SUM".into())
        };
        let record = maybe_compact_session(&conn, &mut session, "deepseek", None, true, &mut capturing).unwrap().unwrap();
        assert!(captured.contains("背景讨论甲"), "parent prefix entered the transcript");
        assert!(record.covered_seq_end > cut, "coveredSeqEnd spans the parent prefix (normalized)");

        // Persisted payload is in CHILD space: child's own rows are
        // session_forked + 2 turns x 3 events = 7 rows when compaction ran.
        let own = event_log::list_events(&conn, "rt-child").unwrap();
        let completed = own.iter().find(|e| e.event_type == "compaction_completed").unwrap();
        let own_count_before = own.iter().filter(|e| e.event_type != "compaction_started" && e.event_type != "compaction_completed").count() as i64;
        assert!(completed.payload["coveredSeqEnd"].as_i64().unwrap() <= own_count_before, "child space");
        assert_eq!(completed.payload["coveredSeqEnd"], json!(record.covered_seq_end - cut));

        // Round-trip: resolve (remap +offset) restores the summary projection.
        let resolved = fork::resolve_session_events(&conn, "rt-child").unwrap();
        let restored = ChatSession::from_events(&resolved, None, Some(1000));
        assert!(restored.get_compaction().is_some());
        let llm = restored.get_messages_for_llm(8);
        assert!(llm[0].content.contains("历史压缩摘要"));
    }
}
