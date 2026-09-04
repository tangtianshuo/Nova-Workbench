// src-tauri/src/engine/restore.rs
// Phase 22 (22-06) — port of src/ai/sessionRestore.ts (Phase 14 EVT-04 / 19 SESS-03).
// Crash recovery semantics, read+append only, NEVER re-execute a tool:
//   1. Orphan tool_calls (crashed mid-tool) are settled by APPENDING an
//      interrupted tool_result marker — PORT-01 third state "unknown"
//      (model must verify before rerun), not an error.
//   2. Crash tail: the projection is cut to the last COMPLETE turn (cut_seq =
//      largest turn_ended seq). Events after stay in the append-only log;
//      they simply never reach the LLM projection.
// The marker modelText is hand-formatted — key order IS the protocol
// (ADR-0003 附则 A.2: status:"unknown" before interrupted).

use rusqlite::Connection;
use serde_json::json;

use crate::engine::event_log::{self, AgentEvent, EventInput};
use crate::engine::exec::normalize_command;
use crate::engine::fork;

pub const DEFAULT_RESTORE_TOKEN_BUDGET: i64 = 8_000;

/// Marker JSON body — key order locked (22-01 protocol). Raw string so the
/// `"status":"unknown"` bytes are literal (grep-asserted by the plan).
const MARKER_BODY: &str = r#"{"ok":false,"status":"unknown","interrupted":true,"reason":"app restarted before tool completion"}"#;

#[derive(Clone, Debug, PartialEq)]
pub struct RestoreReport {
    pub session_id: String,
    /// seq of the turn_ended the projection is cut to (0 = no complete turn).
    pub cut_seq: i64,
    /// Events excluded from the projection (crash tail + appended markers).
    pub trimmed_tail_event_count: i64,
    pub interrupted_tool_call_ids: Vec<String>,
    pub token_budget: i64,
}

/// Largest seq of a turn_ended event; 0 when no complete turn (sessionRestore.ts:36).
pub fn find_crash_tail_cut_seq(events: &[AgentEvent]) -> i64 {
    events
        .iter()
        .filter(|e| e.event_type == "turn_ended")
        .map(|e| e.seq)
        .max()
        .unwrap_or(0)
}

/// tool_call events whose toolCallId has no tool_result later in the stream
/// (sessionRestore.ts:47). Markers appended by an earlier restore count as
/// results, so the scan is idempotent — a second restore finds zero orphans.
pub fn find_orphan_tool_call_events(events: &[AgentEvent]) -> Vec<AgentEvent> {
    let mut sorted: Vec<&AgentEvent> = events.iter().collect();
    sorted.sort_by_key(|e| e.seq);
    let mut open = std::collections::BTreeMap::new(); // (seq order stable)
    let mut order: Vec<String> = Vec::new();
    for event in sorted {
        let id = event.payload.get("toolCallId").and_then(|v| v.as_str());
        if event.event_type == "tool_call" {
            if let Some(id) = id {
                if !open.contains_key(id) {
                    order.push(id.to_string());
                }
                open.insert(id.to_string(), event.clone());
            }
        } else if event.event_type == "tool_result" {
            if let Some(id) = id {
                open.remove(id);
            }
        }
    }
    order.into_iter().filter_map(|id| open.remove(&id)).collect()
}

/// Restore one session: settle orphans, verify the stream, report the cut.
/// Returns None when the session has no events (TS `null` semantic).
/// Fork-aware: orphans in the RESOLVED (parent+child) stream belong to the
/// child's logical history, so markers append to the given session_id.
pub fn restore_session(conn: &Connection, session_id: &str) -> Result<Option<RestoreReport>, String> {
    let mut events = fork::resolve_session_events(conn, session_id)
        .map_err(|e| format!("restore: list events failed: {e}"))?;
    if events.is_empty() {
        return Ok(None);
    }

    // 1) Orphan tool_calls → APPEND interrupted markers. Never re-execute.
    let orphans = find_orphan_tool_call_events(&events);
    let mut interrupted_tool_call_ids = Vec::new();
    for orphan in &orphans {
        let tool_call_id = orphan
            .payload
            .get("toolCallId")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let tool_name = orphan
            .payload
            .get("toolName")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        event_log::append(
            conn,
            &EventInput {
                session_id: session_id.to_string(),
                event_type: "tool_result".into(),
                workspace_id: orphan.workspace_id.clone(),
                product_id: orphan.product_id.clone(),
                project_id: None,
                correlation_id: orphan.correlation_id.clone(),
                payload: json!({
                    "toolCallId": tool_call_id,
                    "toolName": tool_name,
                    "ok": false,
                    "interrupted": true,
                    "status": "unknown", // PORT-01 third state — NOT error
                    "reason": "app-restart",
                    "modelText": format!("[tool_result {tool_name}] {MARKER_BODY}"),
                }),
            },
        )
        .map_err(|e| format!("restore: marker append failed: {e}"))?;
        interrupted_tool_call_ids.push(tool_call_id);
    }
    if !orphans.is_empty() {
        events = fork::resolve_session_events(conn, session_id)
            .map_err(|e| format!("restore: re-read failed: {e}"))?;
    }

    // Marker appends must leave the stream invariant-clean.
    event_log::check_event_stream(&events)?;

    // 3) CP-8 (32-02): orphaned exec processes — pids recorded in the orphan
    // tool_call payloads at spawn time — are killed and audited.
    reap_orphaned_execs(conn, session_id, &orphans)
        .map_err(|e| format!("restore: orphan exec reap failed: {e}"))?;

    // 2) Crash tail cut + budget (sessionRestore.ts:139-147).
    let cut_seq = find_crash_tail_cut_seq(&events);
    let trimmed_tail_event_count = events.iter().filter(|e| e.seq > cut_seq).count() as i64;
    let token_budget = events
        .iter()
        .find(|e| e.event_type == "session_created")
        .and_then(|e| e.payload.get("tokenBudget"))
        .and_then(|v| v.as_i64())
        .unwrap_or(DEFAULT_RESTORE_TOKEN_BUDGET);

    Ok(Some(RestoreReport {
        session_id: session_id.to_string(),
        cut_seq,
        trimmed_tail_event_count,
        interrupted_tool_call_ids,
        token_budget,
    }))
}

/// Startup path: restore the LATEST session (sessionRestore.ts no-arg path —
/// listSessions()[0] documented "latest" semantic). Other sessions restore
/// lazily when switched to (TS switchSession keeps its own restore).
pub fn restore_latest_session(conn: &Connection) -> Result<Option<RestoreReport>, String> {
    let sessions = event_log::list_sessions(conn)
        .map_err(|e| format!("restore: list sessions failed: {e}"))?;
    let Some(latest) = sessions.first() else {
        return Ok(None);
    };
    restore_session(conn, &latest.session_id)
}

/* === CP-8 (32-02): orphaned exec process reaping === */

/// (pid, command) pairs recorded in orphan exec tool_call payloads.
fn orphan_exec_pids(orphans: &[AgentEvent]) -> Vec<(u32, String)> {
    orphans
        .iter()
        .filter(|e| e.payload.get("toolName").and_then(|v| v.as_str()) == Some("exec"))
        .filter_map(|e| {
            let pid = e.payload.get("pid")?.as_u64()?;
            let command = e.payload.get("args")?.get("command")?.as_str()?.to_string();
            Some((pid as u32, command))
        })
        .collect()
}

/// Kill surviving orphan exec processes and append an `orphan_exec_killed`
/// audit event per orphan (killed, already dead, name mismatch — every
/// finding is audited). Never re-executes anything; never fails the restore
/// on an individual reap error.
pub fn reap_orphaned_execs(conn: &Connection, session_id: &str, orphans: &[AgentEvent]) -> Result<(), String> {
    for (pid, command) in orphan_exec_pids(orphans) {
        let action = {
            let mut sys = sysinfo::System::new_all();
            let base = normalize_command(&command);
            match sys.process(sysinfo::Pid::from_u32(pid)) {
                None => "not-running".to_string(),
                Some(proc) => {
                    let pname = proc.name().to_string_lossy().to_lowercase();
                    if !pname.contains(&base) {
                        // PID-reuse double check — never kill on pid alone.
                        "pid-reused-name-mismatch".to_string()
                    } else if kill_tree_by_pid(pid) {
                        "killed".to_string()
                    } else {
                        "kill-failed".to_string()
                    }
                }
            }
        };
        event_log::append(
            conn,
            &EventInput {
                session_id: session_id.to_string(),
                event_type: "orphan_exec_killed".into(),
                workspace_id: orphans.first().and_then(|o| o.workspace_id.clone()),
                product_id: None,
                project_id: None,
                correlation_id: orphans.first().and_then(|o| o.correlation_id.clone()),
                payload: json!({ "pid": pid, "command": command, "action": action }),
            },
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Tree-kill by PID (same taskkill /T /F shape exec::kill_tree uses).
/// macOS/Linux: TODO debt (32-02 plan) — kill(2) by pid needs libc; return
/// false so the audit records kill-failed instead of pretending.
fn kill_tree_by_pid(pid: u32) -> bool {
    #[cfg(windows)]
    {
        std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        // ponytail: posix kill via libc when a mac/linux crash-recovery UAT lands.
        let _ = pid;
        false
    }
}

/* === Tests (port shapes from sessionRestore.ts + phase14 restore tests) === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use crate::engine::event_log::now_iso;
    use serde_json::Value;

    fn push(conn: &Connection, event_type: &str, payload: Value) -> i64 {
        event_log::append(
            conn,
            &EventInput {
                session_id: "s1".into(),
                event_type: event_type.into(),
                workspace_id: None,
                product_id: None,
                project_id: None,
                correlation_id: Some("c1".into()),
                payload,
            },
        )
        .unwrap()
    }

    fn complete_turn(conn: &Connection) {
        push(conn, "user_message", json!({"content": "hi"}));
        push(conn, "assistant_message", json!({"content": "ok"}));
        push(conn, "turn_ended", json!({"outcome": "completed"}));
    }

    #[test]
    fn complete_turn_is_left_untouched() {
        let conn = mem_conn();
        complete_turn(&conn);
        let report = restore_session(&conn, "s1").unwrap().expect("report");
        assert_eq!(report.interrupted_tool_call_ids, Vec::<String>::new());
        assert_eq!(report.trimmed_tail_event_count, 0);
        assert_eq!(report.token_budget, 8_000); // no session_created → default
        // read+append only: no marker rows added
        assert_eq!(event_log::list_events(&conn, "s1").unwrap().len(), 3);
        let _ = now_iso(); // keep import honest alongside marker tests
    }

    #[test]
    fn crash_tail_is_cut_to_last_complete_turn() {
        let conn = mem_conn();
        complete_turn(&conn);
        push(&conn, "user_message", json!({"content": "crash mid turn"}));
        push(&conn, "assistant_message", json!({"content": "partial"}));
        let report = restore_session(&conn, "s1").unwrap().expect("report");
        assert_eq!(report.cut_seq, 3);
        assert_eq!(report.trimmed_tail_event_count, 2);
    }

    #[test]
    fn orphan_tool_call_gets_unknown_marker_exact_shape() {
        let conn = mem_conn();
        push(&conn, "session_created", json!({"sessionId": "s1", "tokenBudget": 12_000}));
        push(&conn, "user_message", json!({"content": "go"}));
        push(&conn, "tool_call", json!({"toolCallId": "t1", "toolName": "knowledge_write", "args": {"title": "T"}}));
        let report = restore_session(&conn, "s1").unwrap().expect("report");
        assert_eq!(report.interrupted_tool_call_ids, vec!["t1".to_string()]);
        assert_eq!(report.token_budget, 12_000);

        let events = event_log::list_events(&conn, "s1").unwrap();
        let marker = events.last().unwrap();
        assert_eq!(marker.event_type, "tool_result");
        let p = &marker.payload;
        assert_eq!(p["toolCallId"], "t1");
        assert_eq!(p["toolName"], "knowledge_write");
        assert_eq!(p["ok"], false);
        assert_eq!(p["interrupted"], true);
        assert_eq!(p["status"], "unknown");
        assert_eq!(p["reason"], "app-restart");
        assert_eq!(
            p["modelText"].as_str().unwrap(),
            "[tool_result knowledge_write] {\"ok\":false,\"status\":\"unknown\",\"interrupted\":true,\"reason\":\"app restarted before tool completion\"}"
        );
        assert_eq!(marker.correlation_id.as_deref(), Some("c1"));
        // marker append leaves the stream invariant-clean
        assert!(event_log::check_event_stream(&events).is_ok());
    }

    #[test]
    fn double_orphan_both_settled() {
        let conn = mem_conn();
        push(&conn, "user_message", json!({"content": "go"}));
        push(&conn, "tool_call", json!({"toolCallId": "t1", "toolName": "a"}));
        push(&conn, "tool_call", json!({"toolCallId": "t2", "toolName": "b"}));
        let report = restore_session(&conn, "s1").unwrap().expect("report");
        assert_eq!(report.interrupted_tool_call_ids.len(), 2);
        let events = event_log::list_events(&conn, "s1").unwrap();
        assert_eq!(events.iter().filter(|e| e.event_type == "tool_result").count(), 2);
        assert!(event_log::check_event_stream(&events).is_ok());
    }

    #[test]
    fn restore_is_idempotent_second_pass_finds_no_orphans() {
        let conn = mem_conn();
        push(&conn, "user_message", json!({"content": "go"}));
        push(&conn, "tool_call", json!({"toolCallId": "t1", "toolName": "a"}));
        restore_session(&conn, "s1").unwrap().expect("first");
        let second = restore_session(&conn, "s1").unwrap().expect("second");
        assert_eq!(second.interrupted_tool_call_ids, Vec::<String>::new());
        assert_eq!(event_log::list_events(&conn, "s1").unwrap().len(), 3);
    }

    #[test]
    fn empty_session_returns_none() {
        let conn = mem_conn();
        assert!(restore_session(&conn, "missing").unwrap().is_none());
    }

    #[test]
    fn latest_session_startup_path() {
        let conn = mem_conn();
        assert!(restore_latest_session(&conn).unwrap().is_none());
        complete_turn(&conn); // s1
        push(&conn, "tool_call", json!({"toolCallId": "t9", "toolName": "x"})); // still s1, latest
        let report = restore_latest_session(&conn).unwrap().expect("latest restored");
        assert_eq!(report.session_id, "s1");
        assert_eq!(report.interrupted_tool_call_ids.len(), 1);
    }

    /* === CP-8 (32-02): orphan exec reaping === */

    #[test]
    fn dead_orphan_exec_pid_audited_not_killed() {
        let conn = mem_conn();
        push(&conn, "user_message", json!({"content": "go"}));
        // pid 2_000_000_000 is never allocated — no kill, but an audit lands.
        push(
            &conn,
            "tool_call",
            json!({"toolCallId": "t1", "toolName": "exec", "args": {"command": "fakecmd"}, "pid": 2_000_000_000_u64}),
        );
        let report = restore_session(&conn, "s1").unwrap().expect("report");
        assert_eq!(report.interrupted_tool_call_ids, vec!["t1".to_string()]);
        let events = event_log::list_events(&conn, "s1").unwrap();
        let audit = events
            .iter()
            .find(|e| e.event_type == "orphan_exec_killed")
            .expect("audit event");
        assert_eq!(audit.payload["pid"], 2_000_000_000_u64);
        assert_eq!(audit.payload["command"], "fakecmd");
        assert_eq!(audit.payload["action"], "not-running");
        // marker (tool_result) + audit both present; stream stays clean
        assert!(event_log::check_event_stream(&events).is_ok());
    }

    #[test]
    fn orphan_exec_without_pid_or_non_exec_tool_skips_reap() {
        let conn = mem_conn();
        push(&conn, "user_message", json!({"content": "go"}));
        // exec orphan WITHOUT pid — nothing to reap, no audit
        push(&conn, "tool_call", json!({"toolCallId": "t1", "toolName": "exec", "args": {"command": "x"}}));
        // non-exec orphan with a pid — not an exec concern
        push(&conn, "tool_call", json!({"toolCallId": "t2", "toolName": "fs_read", "pid": 2_000_000_000_u64}));
        restore_session(&conn, "s1").unwrap().expect("report");
        let events = event_log::list_events(&conn, "s1").unwrap();
        assert!(!events.iter().any(|e| e.event_type == "orphan_exec_killed"));
        assert!(event_log::check_event_stream(&events).is_ok());
    }

    #[test]
    #[cfg(windows)]
    fn live_orphan_exec_process_is_killed_and_audited() {
        let conn = mem_conn();
        push(&conn, "user_message", json!({"content": "go"}));
        // Real short-lived-ish process: cmd /c ping (30s). Plan suggested
        // `cmd /c timeout`, but timeout.exe hard-fails under redirected stdin.
        let mut child = std::process::Command::new("cmd")
            .args(["/c", "ping", "-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id();
        std::thread::sleep(std::time::Duration::from_millis(600)); // visible to sysinfo
        push(
            &conn,
            "tool_call",
            json!({"toolCallId": "t1", "toolName": "exec", "args": {"command": "cmd", "args": ["/c", "ping"]}, "pid": pid}),
        );
        restore_session(&conn, "s1").unwrap().expect("report");
        let events = event_log::list_events(&conn, "s1").unwrap();
        let audit = events
            .iter()
            .find(|e| e.event_type == "orphan_exec_killed")
            .expect("audit event");
        assert_eq!(audit.payload["action"], "killed");
        std::thread::sleep(std::time::Duration::from_millis(600));
        assert!(child.try_wait().unwrap().is_some(), "orphan process was tree-killed");
        let _ = child.wait();
    }
}
