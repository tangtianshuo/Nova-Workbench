// src-tauri/src/engine/event_log.rs
// Phase 22 (22-03) — port of src/ai/events/{eventStore,invariants,artifacts}.ts.
// Rust is the sole writer of agent_events / agent_artifacts / sessions (ENG-02).
//
// Parity locks (verbatim from TS):
// - seq is allocated SQL-side: `(SELECT COALESCE(MAX(seq), 0) + 1 ...)` — never in Rust.
// - created_at = ISO 8601 UTC with exactly 3 fractional digits.
// - modelText prefix `[tool_result <name>] ` and embedded JSON key order
//   (ok first) are semantic — hand-formatted, NOT serde-serialized objects.
// - the five invariant violation codes are byte-identical to invariants.ts.

use rusqlite::{params, Connection};
use serde_json::Value;

pub type Error = Box<dyn std::error::Error>;
type Result<T> = std::result::Result<T, Error>;

pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/* === Types === */

#[derive(Clone, Debug)]
pub struct EventInput {
    pub session_id: String,
    pub event_type: String,
    pub workspace_id: Option<String>,
    pub product_id: Option<String>,
    pub project_id: Option<String>,
    pub correlation_id: Option<String>,
    pub payload: Value,
}

#[derive(Clone, Debug)]
pub struct AgentEvent {
    pub event_id: String,
    pub session_id: String,
    pub seq: i64,
    pub event_type: String,
    pub created_at: String,
    pub workspace_id: Option<String>,
    pub product_id: Option<String>,
    pub project_id: Option<String>,
    pub correlation_id: Option<String>,
    pub payload: Value,
}

#[derive(Clone, Debug)]
pub struct SessionSummary {
    pub session_id: String,
    pub event_count: i64,
    pub max_seq: i64,
    pub last_event_at: String,
    pub product_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct AgentArtifact {
    pub artifact_id: String,
    pub session_id: String,
    pub tool_name: String,
    pub byte_size: i64,
    pub content: String,
    pub created_at: String,
}

pub const ARTIFACT_THRESHOLD_CHARS: usize = 4096;
pub const ARTIFACT_HEAD_CHARS: usize = 512;

pub struct ToolResultOutcome {
    pub model_text: String,
    pub artifact_id: Option<String>,
}

/* === append / list (eventStore.ts:141-256, SQL verbatim) === */

pub fn append(conn: &Connection, input: &EventInput) -> Result<i64> {
    let event_id = uuid::Uuid::new_v4().to_string();
    let created_at = now_iso();
    let payload_json = serde_json::to_string(&input.payload)?;
    conn.execute(
        "INSERT INTO agent_events
           (event_id, session_id, seq, event_type, created_at,
            workspace_id, product_id, project_id, correlation_id, payload_json)
         VALUES (?1, ?2, (SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_events WHERE session_id = ?2),
                 ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            event_id,
            input.session_id,
            input.event_type,
            created_at,
            input.workspace_id,
            input.product_id,
            input.project_id,
            input.correlation_id,
            payload_json
        ],
    )?;
    // Authoritative seq from the row (single-connection Mutex makes this race-free).
    let seq: i64 = conn.query_row(
        "SELECT seq FROM agent_events WHERE event_id = ?1",
        params![event_id],
        |r| r.get(0),
    )?;
    Ok(seq)
}

fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentEvent> {
    let payload_json: String = row.get(9)?;
    Ok(AgentEvent {
        event_id: row.get(0)?,
        session_id: row.get(1)?,
        seq: row.get(2)?,
        event_type: row.get(3)?,
        created_at: row.get(4)?,
        workspace_id: row.get(5)?,
        product_id: row.get(6)?,
        project_id: row.get(7)?,
        correlation_id: row.get(8)?,
        payload: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
    })
}

pub fn list_events(conn: &Connection, session_id: &str) -> Result<Vec<AgentEvent>> {
    let mut stmt = conn.prepare(
        "SELECT event_id, session_id, seq, event_type, created_at,
                workspace_id, product_id, project_id, correlation_id, payload_json
         FROM agent_events WHERE session_id = ?1 ORDER BY seq ASC",
    )?;
    let events = stmt
        .query_map(params![session_id], row_to_event)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(events)
}

pub fn list_sessions(conn: &Connection) -> Result<Vec<SessionSummary>> {
    let mut stmt = conn.prepare(
        "SELECT session_id,
                COUNT(*) AS event_count,
                MAX(seq) AS max_seq,
                MAX(created_at) AS last_event_at,
                (SELECT e2.product_id FROM agent_events e2
                  WHERE e2.session_id = e.session_id AND e2.product_id IS NOT NULL
                  ORDER BY e2.seq DESC LIMIT 1) AS product_id
         FROM agent_events e
         GROUP BY session_id
         ORDER BY last_event_at DESC, max_seq DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(SessionSummary {
                session_id: row.get(0)?,
                event_count: row.get(1)?,
                max_seq: row.get(2)?,
                last_event_at: row.get(3)?,
                product_id: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// sessions upsert (migration 0007 columns). Fire-and-forget semantics kept,
/// but synchronous here — sole-writer writes must not be lost.
pub fn upsert_session(
    conn: &Connection,
    session_id: &str,
    workspace_id: Option<&str>,
    title: Option<&str>,
    title_source: Option<&str>,
    parent_session_id: Option<&str>,
    fork_cut_seq: Option<i64>,
) -> Result<()> {
    let now = now_iso();
    conn.execute(
        "INSERT INTO sessions
           (session_id, workspace_id, title, title_source, parent_session_id, fork_cut_seq, created_at, last_active_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(session_id) DO UPDATE SET
           last_active_at = excluded.last_active_at,
           workspace_id = COALESCE(excluded.workspace_id, sessions.workspace_id),
           title = COALESCE(sessions.title, excluded.title)",
        params![session_id, workspace_id, title, title_source, parent_session_id, fork_cut_seq, now],
    )?;
    Ok(())
}

/* === artifacts (eventStore.ts:229-255) === */

pub fn save_artifact(conn: &Connection, artifact: &AgentArtifact) -> Result<()> {
    conn.execute(
        "INSERT INTO agent_artifacts (artifact_id, session_id, tool_name, byte_size, content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            artifact.artifact_id,
            artifact.session_id,
            artifact.tool_name,
            artifact.byte_size,
            artifact.content,
            artifact.created_at
        ],
    )?;
    Ok(())
}

pub fn get_artifact(conn: &Connection, artifact_id: &str) -> Result<Option<AgentArtifact>> {
    let found = conn
        .query_row(
            "SELECT artifact_id, session_id, tool_name, byte_size, content, created_at
             FROM agent_artifacts WHERE artifact_id = ?1",
            params![artifact_id],
            |row| {
                Ok(AgentArtifact {
                    artifact_id: row.get(0)?,
                    session_id: row.get(1)?,
                    tool_name: row.get(2)?,
                    byte_size: row.get(3)?,
                    content: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .ok();
    Ok(found)
}

/* === invariants (invariants.ts:8-83, 1:1, codes byte-identical) === */

#[derive(Clone, Debug, PartialEq)]
pub struct EventStreamIssue {
    pub code: &'static str,
    pub session_id: String,
    pub seq: Option<i64>,
    pub tool_call_id: Option<String>,
    pub detail: String,
}

pub fn event_stream_issues(events: &[AgentEvent]) -> Vec<EventStreamIssue> {
    let mut issues = Vec::new();
    let session_id = events
        .first()
        .map(|e| e.session_id.clone())
        .unwrap_or_else(|| "(unknown)".into());
    let mut sorted: Vec<&AgentEvent> = events.iter().collect();
    sorted.sort_by_key(|e| e.seq);

    // 1. seq contiguity: expect 1..N with no gaps.
    for (index, event) in sorted.iter().enumerate() {
        let expected = (index + 1) as i64;
        if event.seq != expected {
            issues.push(EventStreamIssue {
                code: "SEQ_GAP",
                session_id: session_id.clone(),
                seq: Some(event.seq),
                tool_call_id: None,
                detail: format!(
                    "expected seq {}, found {} (event {}, type {})",
                    expected, event.seq, event.event_id, event.event_type
                ),
            });
        }
    }

    // 2. tool pairing by payload.toolCallId.
    let mut open_calls: std::collections::HashMap<String, &AgentEvent> = std::collections::HashMap::new();
    let mut seen_results: std::collections::HashSet<String> = std::collections::HashSet::new();

    for event in &sorted {
        let tool_call_id = || {
            event
                .payload
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        };
        if event.event_type == "tool_call" {
            let Some(id) = tool_call_id() else {
                issues.push(EventStreamIssue {
                    code: "MISSING_TOOL_RESULT",
                    session_id: session_id.clone(),
                    seq: Some(event.seq),
                    tool_call_id: None,
                    detail: "tool_call event without payload.toolCallId".into(),
                });
                continue;
            };
            if open_calls.contains_key(&id) {
                issues.push(EventStreamIssue {
                    code: "DUPLICATE_TOOL_CALL",
                    session_id: session_id.clone(),
                    seq: Some(event.seq),
                    tool_call_id: Some(id.clone()),
                    detail: format!("duplicate tool_call for toolCallId {id}"),
                });
            } else {
                open_calls.insert(id, event);
            }
        }
        if event.event_type == "tool_result" {
            let Some(id) = tool_call_id() else {
                issues.push(EventStreamIssue {
                    code: "RESULT_BEFORE_CALL",
                    session_id: session_id.clone(),
                    seq: Some(event.seq),
                    tool_call_id: None,
                    detail: "tool_result event without payload.toolCallId".into(),
                });
                continue;
            };
            if seen_results.contains(&id) {
                issues.push(EventStreamIssue {
                    code: "DUPLICATE_TOOL_RESULT",
                    session_id: session_id.clone(),
                    seq: Some(event.seq),
                    tool_call_id: Some(id.clone()),
                    detail: format!("duplicate tool_result for toolCallId {id}"),
                });
            } else if !open_calls.contains_key(&id) {
                issues.push(EventStreamIssue {
                    code: "RESULT_BEFORE_CALL",
                    session_id: session_id.clone(),
                    seq: Some(event.seq),
                    tool_call_id: Some(id.clone()),
                    detail: format!("tool_result without matching tool_call for toolCallId {id}"),
                });
            } else {
                open_calls.remove(&id);
                seen_results.insert(id);
            }
        }
    }

    for (id, call_event) in open_calls {
        issues.push(EventStreamIssue {
            code: "MISSING_TOOL_RESULT",
            session_id: session_id.clone(),
            seq: Some(call_event.seq),
            tool_call_id: Some(id.clone()),
            detail: format!(
                "tool_call {} ({}) has no matching tool_result",
                id,
                call_event
                    .payload
                    .get("toolName")
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "'?'".into())
            ),
        });
    }
    issues
}

/// Throws-equivalent: Err carries the exact TS assert format
/// `[event-log] invariant violation: CODE@seqN[:toolCallId]; ...`
pub fn check_event_stream(events: &[AgentEvent]) -> std::result::Result<(), String> {
    let issues = event_stream_issues(events);
    if issues.is_empty() {
        return Ok(());
    }
    let rendered = issues
        .iter()
        .map(|i| {
            format!(
                "{}@seq{}{}",
                i.code,
                i.seq.map(|s| s.to_string()).unwrap_or_else(|| "?".into()),
                i.tool_call_id
                    .as_ref()
                    .map(|id| format!(":{id}"))
                    .unwrap_or_default()
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    Err(format!("[event-log] invariant violation: {rendered}"))
}

/* === prepare_tool_result (artifacts.ts:24-52) === */

/// `{"ok":true,"data":X}` — key order is semantic (ok first), hand-formatted.
fn ok_data_json(value: &Value) -> String {
    format!("{{\"ok\":true,\"data\":{}}}", value)
}

pub fn prepare_tool_result(
    conn: &Connection,
    session_id: &str,
    tool_name: &str,
    value: &Value,
) -> Result<ToolResultOutcome> {
    let json = ok_data_json(value);
    let char_len = json.chars().count();
    if char_len <= ARTIFACT_THRESHOLD_CHARS {
        return Ok(ToolResultOutcome {
            model_text: format!("[tool_result {tool_name}] {json}"),
            artifact_id: None,
        });
    }

    let artifact_id = uuid::Uuid::new_v4().to_string();
    let created_at = now_iso();
    save_artifact(
        conn,
        &AgentArtifact {
            artifact_id: artifact_id.clone(),
            session_id: session_id.to_string(),
            tool_name: tool_name.to_string(),
            byte_size: char_len as i64,
            content: json.clone(),
            created_at: created_at.clone(),
        },
    )?;

    // Reference JSON key order (ok, summary, artifactId, head) is semantic.
    let head: String = json.chars().take(ARTIFACT_HEAD_CHARS).collect();
    let summary = format!(
        "Tool result too large ({char_len} chars); full content stored as artifact {artifact_id}"
    );
    let head_json = serde_json::to_string(&head)?;
    let model_text = format!(
        "[tool_result {tool_name}] {{\"ok\":true,\"summary\":{},\"artifactId\":{},\"head\":{}}}",
        serde_json::to_string(&summary)?,
        serde_json::to_string(&artifact_id)?,
        head_json
    );
    Ok(ToolResultOutcome {
        model_text,
        artifact_id: Some(artifact_id),
    })
}

/* === Real transaction (ENG-02: append + artifact + candidate atomically) === */

/// Bundle of one turn's DB writes, committed atomically. No LLM/network inside.
pub struct TurnWrites<'a> {
    pub events: &'a [EventInput],
    pub artifacts: &'a [AgentArtifact],
    pub candidates: &'a [crate::engine::confirmations::NewCandidate],
}

pub fn commit_turn(conn: &mut Connection, writes: TurnWrites<'_>) -> Result<Vec<i64>> {
    let tx = conn.transaction()?;
    let mut seqs = Vec::new();
    for event in writes.events {
        seqs.push(append(&tx, event)?);
    }
    for artifact in writes.artifacts {
        save_artifact(&tx, artifact)?;
    }
    for candidate in writes.candidates {
        crate::engine::confirmations::insert_candidate_raw(&tx, candidate)?;
    }
    tx.commit()?;
    Ok(seqs)
}

/* === Tests === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::{file_conn, mem_conn};
    use serde_json::json;

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

    fn event(seq: i64, event_type: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: format!("e{seq}"),
            session_id: "s1".into(),
            seq,
            event_type: event_type.into(),
            created_at: now_iso(),
            workspace_id: None,
            product_id: None,
            project_id: None,
            correlation_id: None,
            payload,
        }
    }

    #[test]
    fn append_seq_contiguous_and_list_roundtrip() {
        let conn = mem_conn();
        for i in 0..3 {
            let seq = append(&conn, &input("s1", "user_message", json!({"i": i}))).unwrap();
            assert_eq!(seq, i + 1);
        }
        append(&conn, &input("s2", "user_message", json!({}))).unwrap();
        let events = list_events(&conn, "s1").unwrap();
        assert_eq!(events.iter().map(|e| e.seq).collect::<Vec<_>>(), vec![1, 2, 3]);
        assert_eq!(events[0].payload, json!({"i": 0}));
        assert!(events[0].created_at.ends_with('Z'));
        assert_eq!(events[0].created_at.split('.').next_back().unwrap().len(), 4); // ".3fZ" → 3 fractional digits
        let sessions = list_sessions(&conn).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn concurrent_append_same_session_no_gap() {
        // Engine design: single connection under Mutex serializes appends (the
        // rusqlite replacement for TS per-session enqueue chains).
        let conn = std::sync::Arc::new(std::sync::Mutex::new(mem_conn()));
        let mut handles = Vec::new();
        for _ in 0..2 {
            let conn = conn.clone();
            handles.push(std::thread::spawn(move || {
                for _ in 0..25 {
                    append(&conn.lock().unwrap(), &input("s1", "assistant_message", json!({}))).unwrap();
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let events = list_events(&conn.lock().unwrap(), "s1").unwrap();
        assert_eq!(events.len(), 50);
        for (i, e) in events.iter().enumerate() {
            assert_eq!(e.seq, i as i64 + 1, "no gaps, no UNIQUE conflicts");
        }
    }

    #[test]
    fn invariants_all_five_violation_codes() {
        // SEQ_GAP
        let err = check_event_stream(&[event(2, "user_message", json!({}))]).unwrap_err();
        assert!(err.contains("SEQ_GAP@seq2"), "{err}");

        // MISSING_TOOL_RESULT: orphan tool_call
        let err = check_event_stream(&[
            event(1, "user_message", json!({})),
            event(2, "tool_call", json!({"toolCallId": "t1", "toolName": "x"})),
        ])
        .unwrap_err();
        assert!(err.contains("MISSING_TOOL_RESULT@seq2:t1"), "{err}");

        // RESULT_BEFORE_CALL: tool_result without matching call
        let err = check_event_stream(&[
            event(1, "user_message", json!({})),
            event(2, "tool_result", json!({"toolCallId": "t1"})),
        ])
        .unwrap_err();
        assert!(err.contains("RESULT_BEFORE_CALL@seq2:t1"), "{err}");

        // DUPLICATE_TOOL_CALL
        let err = check_event_stream(&[
            event(1, "tool_call", json!({"toolCallId": "t1"})),
            event(2, "tool_call", json!({"toolCallId": "t1"})),
        ])
        .unwrap_err();
        assert!(err.contains("DUPLICATE_TOOL_CALL@seq2:t1"), "{err}");

        // DUPLICATE_TOOL_RESULT
        let err = check_event_stream(&[
            event(1, "tool_call", json!({"toolCallId": "t1"})),
            event(2, "tool_result", json!({"toolCallId": "t1"})),
            event(3, "tool_result", json!({"toolCallId": "t1"})),
        ])
        .unwrap_err();
        assert!(err.contains("DUPLICATE_TOOL_RESULT@seq3:t1"), "{err}");

        // legal stream passes
        let ok = vec![
            event(1, "session_created", json!({})),
            event(2, "user_message", json!({})),
            event(3, "tool_call", json!({"toolCallId": "t1"})),
            event(4, "tool_result", json!({"toolCallId": "t1"})),
            event(5, "assistant_message", json!({})),
        ];
        assert!(check_event_stream(&ok).is_ok());
    }

    #[test]
    fn prepare_tool_result_small_and_oversized() {
        let conn = mem_conn();
        let small = prepare_tool_result(&conn, "s1", "read_file", &json!("hi")).unwrap();
        assert!(small.artifact_id.is_none());
        assert_eq!(
            small.model_text,
            "[tool_result read_file] {\"ok\":true,\"data\":\"hi\"}"
        );

        let big_value = json!("x".repeat(5000));
        let big = prepare_tool_result(&conn, "s1", "read_file", &big_value).unwrap();
        let artifact_id = big.artifact_id.expect("oversized → artifact");
        let full = format!("{{\"ok\":true,\"data\":{}}}", serde_json::to_string(&big_value).unwrap());
        assert!(big.model_text.starts_with("[tool_result read_file] {\"ok\":true,\"summary\":\"Tool result too large"));
        assert!(big.model_text.contains(&artifact_id));
        let artifact = get_artifact(&conn, &artifact_id).unwrap().expect("row exists");
        assert_eq!(artifact.byte_size as usize, full.chars().count());
        assert_eq!(artifact.content, full);
        assert_eq!(artifact.tool_name, "read_file");
    }

    #[test]
    fn commit_turn_transactional() {
        let mut conn = mem_conn();
        let candidate = crate::engine::confirmations::NewCandidate {
            kind: "destructive_action".into(),
            params: json!({"toolName": "rm", "args": {}}),
            params_hash: crate::engine::params_hash::params_hash(&json!({"toolName": "rm", "args": {}})),
            summary: Some("rm".into()),
            session_id: Some("s1".into()),
        };
        let seqs = commit_turn(
            &mut conn,
            TurnWrites {
                events: &[
                    input("s1", "tool_call", json!({"toolCallId": "t1", "toolName": "rm"})),
                    input("s1", "tool_result", json!({"toolCallId": "t1"})),
                ],
                artifacts: &[AgentArtifact {
                    artifact_id: "a1".into(),
                    session_id: "s1".into(),
                    tool_name: "t".into(),
                    byte_size: 10,
                    content: "0123456789".into(),
                    created_at: now_iso(),
                }],
                candidates: &[candidate],
            },
        )
        .unwrap();
        assert_eq!(seqs, vec![1, 2]);
        assert!(get_artifact(&conn, "a1").unwrap().is_some());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get::<_, i64>(0)).unwrap(),
            1
        );
        // Stream stays valid after the transactional write.
        let events = list_events(&conn, "s1").unwrap();
        assert!(check_event_stream(&events).is_ok());
    }

    #[test]
    fn upsert_session_updates_last_active() {
        let conn = mem_conn();
        upsert_session(&conn, "s1", Some("w1"), None, None, None, None).unwrap();
        upsert_session(&conn, "s1", None, Some("t"), Some("llm"), None, None).unwrap();
        let (ws, title, count): (Option<String>, Option<String>, i64) = conn
            .query_row(
                "SELECT workspace_id, title, (SELECT COUNT(*) FROM sessions) FROM sessions WHERE session_id = 's1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(ws.as_deref(), Some("w1")); // COALESCE keeps existing workspace
        assert_eq!(title.as_deref(), Some("t"));
        assert_eq!(count, 1);
    }

    #[test]
    fn file_db_shared_schema() {
        // Sanity: the migration runner produces the engine-expected schema on a
        // real file DB too (used by the concurrent confirmation tests).
        let _conn = file_conn("event_log_file_sanity");
    }
}
