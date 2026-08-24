// src-tauri/src/engine/fork.rs
// Phase 22 (22-04) — port of src/ai/fork.ts (Phase 20, FORK-02).
// Reference-style forking: the child stores ZERO copied parent events; its own
// agent_events rows start at seq 1. build_fork_event_stream concatenates the
// parent prefix with the child's rows (+offset) into a normalized 1..N stream,
// so fromEvents / crash-tail / orphan logic downstream stay untouched.

use crate::engine::event_log::{check_event_stream_issues_free, AgentEvent};
use rusqlite::{params, Connection};

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ForkInvalidReason {
    MidTurn,
    NoPrefixTurn,
    Unbalanced,
}

impl ForkInvalidReason {
    pub fn as_str(self) -> &'static str {
        match self {
            ForkInvalidReason::MidTurn => "MID_TURN",
            ForkInvalidReason::NoPrefixTurn => "NO_PREFIX_TURN",
            ForkInvalidReason::Unbalanced => "UNBALANCED",
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct ForkStreamResult {
    pub events: Vec<AgentEvent>,
    pub invalid: Option<ForkInvalidReason>,
}

/// The only payload fields in the event vocabulary that store seq numbers.
/// Two-case remap rule — never a general map:
/// prefix events: identity (parent space == normalized space for seq <= cut);
/// child events: += prefix.length (child space -> normalized space).
pub const SEQ_PAYLOAD_FIELDS: [&str; 3] = ["splitSeq", "coveredSeqStart", "coveredSeqEnd"];

/// Build the fork session's effective event stream. Pure.
pub fn build_fork_event_stream(
    parent_events: &[AgentEvent],
    cut_seq: i64,
    child_events: &[AgentEvent],
) -> ForkStreamResult {
    let prefix: Vec<AgentEvent> = parent_events.iter().filter(|e| e.seq <= cut_seq).cloned().collect();
    // Gate 2 first: the cut point must have at least one complete turn at/before it.
    if !prefix.iter().any(|e| e.event_type == "turn_ended") {
        return ForkStreamResult { events: Vec::new(), invalid: Some(ForkInvalidReason::NoPrefixTurn) };
    }
    // Gate 1: the cut event itself must exist and be a turn_ended boundary.
    let cut_is_boundary = prefix
        .iter()
        .any(|e| e.seq == cut_seq && e.event_type == "turn_ended");
    if !cut_is_boundary {
        return ForkStreamResult { events: Vec::new(), invalid: Some(ForkInvalidReason::MidTurn) };
    }
    // Gate 3: prefix pairing + seq invariants clean (no orphan tool_call enters the child).
    if !check_event_stream_issues_free(&prefix) {
        return ForkStreamResult { events: Vec::new(), invalid: Some(ForkInvalidReason::Unbalanced) };
    }

    // Normalization: prefix keeps 1..cut (identity), child rows shift by +prefix.length.
    let mut out: Vec<AgentEvent> = prefix
        .iter()
        .enumerate()
        .map(|(i, e)| {
            let mut e = e.clone();
            e.seq = i as i64 + 1;
            e
        })
        .collect();
    let offset = out.len() as i64;
    for (i, e) in child_events.iter().enumerate() {
        let mut e = e.clone();
        if let Some(payload) = e.payload.as_object_mut() {
            for field in SEQ_PAYLOAD_FIELDS {
                if let Some(n) = payload.get(field).and_then(|v| v.as_i64()) {
                    payload.insert(field.into(), (n + offset).into());
                }
            }
        }
        e.seq = offset + i as i64 + 1;
        out.push(e);
    }
    ForkStreamResult { events: out, invalid: None }
}

/// First turn_ended seq after the target assistant_message seq; None when the
/// assistant message has no completed turn yet (mid-turn).
pub fn find_fork_cut_seq(events: &[AgentEvent], assistant_seq: i64) -> Option<i64> {
    let mut sorted: Vec<&AgentEvent> = events.iter().collect();
    sorted.sort_by_key(|e| e.seq);
    sorted
        .into_iter()
        .find(|e| e.seq > assistant_seq && e.event_type == "turn_ended")
        .map(|e| e.seq)
}

/// Fork-aware listEvents: returns the session's own rows when it is not a fork,
/// otherwise recursively resolves the parent chain and merges at projection
/// time. Recursion handles fork-of-fork. Degrades to own events when the stored
/// fork cut is invalid — never errors mid-restore.
pub fn resolve_session_events(conn: &Connection, session_id: &str) -> Result<Vec<AgentEvent>> {
    let own = crate::engine::event_log::list_events(conn, session_id)?;
    let meta: Option<(Option<String>, Option<i64>)> = conn
        .query_row(
            "SELECT parent_session_id, fork_cut_seq FROM sessions WHERE session_id = ?1",
            params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let Some((Some(parent_session_id), Some(fork_cut_seq))) = meta else {
        return Ok(own);
    };
    let parent = resolve_session_events(conn, &parent_session_id)?;
    let result = build_fork_event_stream(&parent, fork_cut_seq, &own);
    if let Some(reason) = result.invalid {
        eprintln!("[fork] invalid cut for session {session_id}: {}; falling back to own events", reason.as_str());
        return Ok(own);
    }
    Ok(result.events)
}

/* === Tests (ported from src/ai/__tests__/fork.test.ts 1-8) === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use crate::engine::event_log::EventInput;
    use serde_json::json;

    fn ev(session_id: &str, seq: i64, event_type: &str, payload: serde_json::Value) -> AgentEvent {
        AgentEvent {
            event_id: format!("{session_id}-{seq}"),
            session_id: session_id.into(),
            seq,
            event_type: event_type.into(),
            created_at: "2026-08-18T00:00:00Z".into(),
            workspace_id: None,
            product_id: None,
            project_id: None,
            correlation_id: None,
            payload,
        }
    }

    fn parent_stream() -> Vec<AgentEvent> {
        vec![
            ev("p1", 1, "session_created", json!({"tokenBudget": 8000})),
            ev("p1", 2, "user_message", json!({"content": "帮我查任务"})),
            ev("p1", 3, "tool_call", json!({"toolCallId": "t1", "toolName": "listTasks", "args": {}})),
            ev("p1", 4, "tool_result", json!({"toolCallId": "t1", "toolName": "listTasks", "ok": true, "modelText": "[]"})),
            ev("p1", 5, "assistant_message", json!({"content": "没有任务"})),
            ev("p1", 6, "turn_ended", json!({"outcome": "completed"})),
            ev("p1", 7, "user_message", json!({"content": "再查日程"})),
            ev("p1", 8, "tool_call", json!({"toolCallId": "t2", "toolName": "listSchedule", "args": {}})),
            ev("p1", 9, "tool_result", json!({"toolCallId": "t2", "toolName": "listSchedule", "ok": true, "modelText": "[]"})),
            ev("p1", 10, "assistant_message", json!({"content": "日程为空"})),
            ev("p1", 11, "turn_ended", json!({"outcome": "completed"})),
            ev("p1", 12, "user_message", json!({"content": "总结一下"})),
            ev("p1", 13, "assistant_message", json!({"content": "一切为空"})),
            ev("p1", 14, "turn_ended", json!({"outcome": "completed"})),
        ]
    }

    fn child_stream() -> Vec<AgentEvent> {
        vec![
            ev("c1", 1, "session_forked", json!({"parentSessionId": "p1", "parentCutSeq": 6})),
            ev("c1", 2, "user_message", json!({"content": "换个话题"})),
            ev("c1", 3, "assistant_message", json!({"content": "好的"})),
            ev("c1", 4, "turn_ended", json!({"outcome": "completed"})),
        ]
    }

    fn input(session: &str, event_type: &str, payload: serde_json::Value) -> EventInput {
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

    #[test]
    fn normalized_fork_stream_passes_invariants() {
        let out = build_fork_event_stream(&parent_stream(), 11, &child_stream());
        assert_eq!(out.invalid, None);
        assert!(check_event_stream_issues_free(&out.events));
    }

    #[test]
    fn seq_normalization_prefix_identity_child_offset() {
        let parent = parent_stream();
        let out = build_fork_event_stream(&parent, 11, &child_stream());
        for (i, e) in out.events.iter().enumerate() {
            assert_eq!(e.seq, i as i64 + 1, "1..N no gaps");
        }
        for (i, e) in out.events.iter().take(11).enumerate() {
            assert_eq!(e.event_id, parent[i].event_id, "prefix identity");
            assert_eq!(e.seq, i as i64 + 1);
        }
        for (i, e) in out.events.iter().enumerate().skip(11) {
            assert_eq!(e.seq, 11 + i as i64 + 1 - 11);
        }
    }

    #[test]
    fn compaction_remap_child_plus_offset_prefix_identity() {
        let mut parent = parent_stream();
        parent[4] = ev("p1", 5, "compaction_completed", json!({"coveredSeqStart": 1, "coveredSeqEnd": 2, "summaryText": "s", "model": "x", "generatedAt": "t"}));
        let mut child = child_stream();
        child.push(ev("c1", 5, "compaction_started", json!({"splitSeq": 2})));
        child.push(ev("c1", 6, "compaction_completed", json!({"coveredSeqStart": 1, "coveredSeqEnd": 4, "summaryText": "s2", "model": "x", "generatedAt": "t"})));

        let out = build_fork_event_stream(&parent, 11, &child);
        assert_eq!(out.invalid, None);
        let prefix_compaction = &out.events[4]; // normalized seq 5
        assert_eq!(prefix_compaction.payload["coveredSeqStart"], json!(1), "prefix compaction identity");
        assert_eq!(prefix_compaction.payload["coveredSeqEnd"], json!(2));
        let child_started = out.events.iter().find(|e| e.event_type == "compaction_started").unwrap();
        let child_completed = out.events
            .iter()
            .find(|e| e.event_type == "compaction_completed" && e.payload["summaryText"] == json!("s2"))
            .unwrap();
        assert_eq!(child_started.payload["splitSeq"], json!(2 + 11), "splitSeq += prefix.length");
        assert_eq!(child_completed.payload["coveredSeqStart"], json!(1 + 11));
        assert_eq!(child_completed.payload["coveredSeqEnd"], json!(4 + 11));
    }

    #[test]
    fn replay_parity_fork_projection_matches_parent_prefix() {
        use crate::engine::chat_session::ChatSession;
        let parent = parent_stream();
        let cut = 11;
        let out = build_fork_event_stream(&parent, cut, &child_stream());
        let fork_projection = ChatSession::from_events(&out.events, None, None).get_messages_for_llm(1000);
        let parent_prefix: Vec<AgentEvent> = parent.iter().filter(|e| e.seq <= cut).cloned().collect();
        let parent_projection = ChatSession::from_events(&parent_prefix, None, None).get_messages_for_llm(1000);
        assert_eq!(fork_projection[..parent_projection.len()], parent_projection[..]);
        assert!(fork_projection.len() > parent_projection.len());
    }

    #[test]
    fn mid_turn_rejection() {
        let out = build_fork_event_stream(&parent_stream(), 8, &child_stream());
        assert_eq!(out.invalid, Some(ForkInvalidReason::MidTurn));
        let out = build_fork_event_stream(&parent_stream(), 99, &child_stream());
        assert_eq!(out.invalid, Some(ForkInvalidReason::MidTurn));
    }

    #[test]
    fn no_prefix_turn_and_unbalanced_rejection() {
        let incomplete = vec![
            ev("p2", 1, "session_created", json!({})),
            ev("p2", 2, "user_message", json!({"content": "hi"})),
            ev("p2", 3, "tool_call", json!({"toolCallId": "t9", "toolName": "x", "args": {}})),
        ];
        let out = build_fork_event_stream(&incomplete, 3, &[]);
        assert_eq!(out.invalid, Some(ForkInvalidReason::NoPrefixTurn));

        let unbalanced = vec![
            ev("p3", 1, "user_message", json!({"content": "hi"})),
            ev("p3", 2, "tool_call", json!({"toolCallId": "t8", "toolName": "x", "args": {}})),
            ev("p3", 3, "turn_ended", json!({"outcome": "completed"})),
        ];
        let out = build_fork_event_stream(&unbalanced, 3, &[]);
        assert_eq!(out.invalid, Some(ForkInvalidReason::Unbalanced));
    }

    #[test]
    fn fork_of_fork_resolved_child_serves_as_grandchild_prefix() {
        use crate::engine::chat_session::ChatSession;
        let parent = parent_stream();
        let child_resolved = build_fork_event_stream(&parent, 11, &child_stream()).events;
        let cut = child_resolved.iter().rev().find(|e| e.event_type == "turn_ended").unwrap().seq;
        let grandchild = vec![
            ev("g1", 1, "session_forked", json!({"parentSessionId": "c1", "parentCutSeq": cut})),
            ev("g1", 2, "user_message", json!({"content": "孙代"})),
            ev("g1", 3, "assistant_message", json!({"content": "好"})),
            ev("g1", 4, "turn_ended", json!({"outcome": "completed"})),
        ];
        let out = build_fork_event_stream(&child_resolved, cut, &grandchild);
        assert_eq!(out.invalid, None);
        assert!(check_event_stream_issues_free(&out.events));
        for (i, e) in out.events.iter().enumerate() {
            assert_eq!(e.seq, i as i64 + 1);
        }
        let proj = ChatSession::from_events(&out.events, None, None).get_messages_for_llm(1000);
        let child_prefix: Vec<AgentEvent> = child_resolved.iter().filter(|e| e.seq <= cut).cloned().collect();
        let child_proj = ChatSession::from_events(&child_prefix, None, None).get_messages_for_llm(1000);
        assert_eq!(proj[..child_proj.len()], child_proj[..]);
    }

    #[test]
    fn find_fork_cut_seq_first_turn_ended_after() {
        let parent = parent_stream();
        assert_eq!(find_fork_cut_seq(&parent, 5), Some(6));
        assert_eq!(find_fork_cut_seq(&parent, 10), Some(11));
        assert_eq!(find_fork_cut_seq(&parent, 13), Some(14));
        let open_tail: Vec<AgentEvent> = parent.into_iter().take(13).collect();
        assert_eq!(find_fork_cut_seq(&open_tail, 13), None);
    }

    #[test]
    fn resolve_session_events_recursive_through_db() {
        let conn = mem_conn();
        // parent
        for e in ["session_created", "user_message", "assistant_message", "turn_ended"] {
            crate::engine::event_log::append(&conn, &input("rp", e, json!({}))).unwrap();
        }
        // child forks at cut 4 (the parent turn_ended)
        crate::engine::event_log::upsert_session(&conn, "rc", None, None, None, Some("rp"), Some(4)).unwrap();
        crate::engine::event_log::append(&conn, &input("rc", "user_message", json!({"content": "子代"}))).unwrap();
        crate::engine::event_log::append(&conn, &input("rc", "turn_ended", json!({"outcome": "completed"}))).unwrap();
        // grandchild forks at child's turn_ended (resolved seq 6)
        let child_resolved = resolve_session_events(&conn, "rc").unwrap();
        let cut = child_resolved.iter().rev().find(|e| e.event_type == "turn_ended").unwrap().seq;
        crate::engine::event_log::upsert_session(&conn, "rg", None, None, None, Some("rc"), Some(cut)).unwrap();
        crate::engine::event_log::append(&conn, &input("rg", "user_message", json!({"content": "孙代"}))).unwrap();

        let grandchild = resolve_session_events(&conn, "rg").unwrap();
        assert!(check_event_stream_issues_free(&grandchild));
        for (i, e) in grandchild.iter().enumerate() {
            assert_eq!(e.seq, i as i64 + 1);
        }
        // invalid cut falls back to own events (never errors)
        crate::engine::event_log::upsert_session(&conn, "rbad", None, None, None, Some("rp"), Some(2)).unwrap();
        crate::engine::event_log::append(&conn, &input("rbad", "user_message", json!({"content": "x"}))).unwrap();
        let own = resolve_session_events(&conn, "rbad").unwrap();
        assert_eq!(own.len(), 1);
        assert_eq!(own[0].session_id, "rbad");
    }
}
