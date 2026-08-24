// src-tauri/src/engine/exec.rs
// Phase 23 (23-02) — native exec tool: whitelist (default read-only set +
// kv_store-learned entries) → spawn, or exec_approval HITL candidate.
// Process management lives in spawn_core: tokio::process, kill_on_drop,
// timeout, CancellationToken, line-streamed stdout/stderr via
// EngineEvent::ToolOutput. No webview callback anywhere (TOOL-04).

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::engine::channel::EngineEvent;
use crate::engine::confirmations;
use crate::engine::tools::{ToolCtx, ToolOutcome};

pub const WHITELIST_KEY: &str = "agent.exec.whitelist";
pub const DEFAULT_TIMEOUT_MS: u64 = 120_000;
pub const MAX_TIMEOUT_MS: u64 = 600_000;
/// Per-stream collection cap. The model sees ≤4KB via prepare_tool_result;
/// 64KB keeps the artifact head meaningful without unbounded memory.
const MAX_STREAM_BYTES: usize = 64 * 1024;

const EXEC_DESCRIPTION_NOTE: &str = "Explicit confirmation is required before running this command.";

/* === Whitelist === */

/// Binary-pair whitelist entry: `command` (basename, case-insensitive) plus an
/// optional read-only subcommand restriction (blocks e.g. `git push`).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhitelistEntry {
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subcommands: Option<Vec<String>>,
}

pub fn default_whitelist() -> Vec<WhitelistEntry> {
    fn cmd(c: &str) -> WhitelistEntry {
        WhitelistEntry { command: c.into(), subcommands: None }
    }
    fn git() -> WhitelistEntry {
        WhitelistEntry {
            command: "git".into(),
            subcommands: Some(vec!["status", "diff", "log", "show", "branch"].into_iter().map(String::from).collect()),
        }
    }
    vec![git(), cmd("dir"), cmd("ls"), cmd("type"), cmd("cat"), cmd("rg"), cmd("grep"), cmd("findstr"), cmd("where"), cmd("pwd")]
}

/// argv[0] normalization: lowercase, strip path + .exe suffix.
fn normalize_command(s: &str) -> String {
    let base = Path::new(s).file_name().and_then(|f| f.to_str()).unwrap_or(s).to_lowercase();
    base.strip_suffix(".exe").unwrap_or(&base).to_string()
}

pub fn whitelist_matches(entries: &[WhitelistEntry], command: &str, args: &[String]) -> bool {
    let cmd = normalize_command(command);
    entries.iter().any(|e| {
        if normalize_command(&e.command) != cmd {
            return false;
        }
        match &e.subcommands {
            None => true,
            Some(subs) => args
                .first()
                .map(|a| subs.iter().any(|s| s.eq_ignore_ascii_case(a)))
                .unwrap_or(false),
        }
    })
}

/// Default set + kv_store-learned entries (kv read failure → defaults only).
pub fn merged_whitelist(conn: &Connection) -> Vec<WhitelistEntry> {
    let mut all = default_whitelist();
    if let Ok(raw) = conn.query_row(
        "SELECT value FROM kv_store WHERE key = ?1",
        params![WHITELIST_KEY],
        |r| r.get::<_, String>(0),
    ) {
        if let Ok(learned) = serde_json::from_str::<Vec<WhitelistEntry>>(&raw) {
            all.extend(learned);
        }
    }
    all
}

/// HITL learning: append a command-level entry (no subcommands) if absent.
pub fn add_command_to_whitelist(conn: &Connection, command: &str) -> Result<(), rusqlite::Error> {
    let normalized = normalize_command(command);
    let mut learned: Vec<WhitelistEntry> = conn
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![WHITELIST_KEY],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    if !learned.iter().any(|e| normalize_command(&e.command) == normalized) {
        learned.push(WhitelistEntry { command: normalized, subcommands: None });
    }
    conn.execute(
        "INSERT INTO kv_store (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![WHITELIST_KEY, serde_json::to_string(&learned).unwrap_or_default()],
    )?;
    Ok(())
}

/* === Pure spawn core (shared by exec::run and engine_exec_confirmed) === */

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CoreOutcomeKind {
    Done,
    Cancelled,
    Timeout,
}

pub struct CoreResult {
    pub kind: CoreOutcomeKind,
    pub ok: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

/// Tree-kill the child. kill_on_drop covers the normal paths; this is the
/// explicit kill for cancel/timeout.
fn kill_tree(child: &mut tokio::process::Child) {
    if let Some(pid) = child.id() {
        if cfg!(windows) {
            // ponytail: taskkill /T has a race window (grandchildren spawned
            // between kill and tree walk can leak); switch to a Windows Job
            // Object if real leaked processes ever show up.
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
            return;
        }
    }
    let _ = child.start_kill();
}

fn push_capped(buf: &mut String, line: &str) {
    if buf.len() >= MAX_STREAM_BYTES {
        return;
    }
    let mut remaining = MAX_STREAM_BYTES - buf.len();
    if !buf.is_empty() {
        buf.push('\n');
        remaining = remaining.saturating_sub(1);
    }
    if line.len() <= remaining {
        buf.push_str(line);
    } else {
        buf.push_str(&line[..remaining]);
    }
}

/// Spawn `command args` in `cwd` with no shell; stream each stdout/stderr line
/// through on_event as EngineEvent::ToolOutput; cancel/timeout tree-kill.
pub async fn spawn_core(
    command: &str,
    args: &[String],
    cwd: &Path,
    timeout_ms: u64,
    cancel: CancellationToken,
    on_event: &(dyn Fn(EngineEvent) + Send + Sync),
) -> std::io::Result<CoreResult> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut child = tokio::process::Command::new(command)
        .args(args)
        .current_dir(cwd)
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let mut out_lines = BufReader::new(stdout).lines();
    let mut err_lines = BufReader::new(stderr).lines();
    let emit_stdout = |line: &str| {
        on_event(EngineEvent::ToolOutput {
            name: "exec".into(),
            stream: format!("{line}\n"),
            is_stderr: false,
        });
    };
    let emit_stderr = |line: &str| {
        on_event(EngineEvent::ToolOutput {
            name: "exec".into(),
            stream: format!("{line}\n"),
            is_stderr: true,
        });
    };
    let mut out_buf = String::new();
    let mut err_buf = String::new();
    let mut out_done = false;
    let mut err_done = false;
    let deadline = tokio::time::sleep(std::time::Duration::from_millis(timeout_ms.max(1)));
    tokio::pin!(deadline);

    let kind = loop {
        tokio::select! {
            _ = cancel.cancelled() => {
                kill_tree(&mut child);
                break CoreOutcomeKind::Cancelled;
            }
            _ = &mut deadline => {
                kill_tree(&mut child);
                break CoreOutcomeKind::Timeout;
            }
            line = out_lines.next_line(), if !out_done => match line {
                Ok(Some(l)) => {
                    emit_stdout(&l);
                    push_capped(&mut out_buf, &l);
                }
                _ => out_done = true,
            },
            line = err_lines.next_line(), if !err_done => match line {
                Ok(Some(l)) => {
                    emit_stderr(&l);
                    push_capped(&mut err_buf, &l);
                }
                _ => err_done = true,
            },
        }
        if out_done && err_done {
            break CoreOutcomeKind::Done;
        }
    };

    if kind == CoreOutcomeKind::Done {
        let status = child.wait().await?;
        return Ok(CoreResult {
            kind,
            ok: status.success(),
            exit_code: status.code(),
            stdout: out_buf,
            stderr: err_buf,
        });
    }
    Ok(CoreResult { kind, ok: false, exit_code: None, stdout: out_buf, stderr: err_buf })
}

/* === exec::run (loop-facing; falls to exec_approval candidate) === */

struct ExecArgs {
    command: String,
    args: Vec<String>,
    timeout_ms: u64,
}

fn parse_args(args_json: &Value) -> Result<ExecArgs, ToolOutcome> {
    let Some(command) = args_json.get("command").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
        return Err(ToolOutcome::Failed {
            message: "Tool \"exec\" arg validation failed: command must be a non-empty string".into(),
            arg_error: true,
        });
    };
    let args = match args_json.get("args") {
        None => Vec::new(),
        Some(Value::Null) => Vec::new(),
        Some(v) if v.is_array() => v
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a.as_str().map(String::from).unwrap_or_default())
            .collect(),
        Some(_) => {
            return Err(ToolOutcome::Failed {
                message: "Tool \"exec\" arg validation failed: args must be an array of strings".into(),
                arg_error: true,
            })
        }
    };
    let timeout_ms = match args_json.get("timeoutMs").and_then(|v| v.as_u64()) {
        None => DEFAULT_TIMEOUT_MS,
        Some(t) if (1..=MAX_TIMEOUT_MS).contains(&t) => t,
        Some(t) => {
            return Err(ToolOutcome::Failed {
                message: format!("Tool \"exec\" arg validation failed: timeoutMs {t} out of range 1..={MAX_TIMEOUT_MS}"),
                arg_error: true,
            })
        }
    };
    Ok(ExecArgs { command: command.to_string(), args, timeout_ms })
}

pub async fn run(
    conn: &Connection,
    args_json: &Value,
    ctx: &ToolCtx<'_>,
    cancel: CancellationToken,
    on_event: &(dyn Fn(EngineEvent) + Send + Sync),
) -> ToolOutcome {
    let Some(workspace_root) = ctx.workspace_root.clone() else {
        return ToolOutcome::Failed { message: "no workspace root".into(), arg_error: false };
    };
    let parsed = match parse_args(args_json) {
        Ok(p) => p,
        Err(outcome) => return outcome,
    };

    if !whitelist_matches(&merged_whitelist(conn), &parsed.command, &parsed.args) {
        let params = json!({
            "command": parsed.command,
            "args": parsed.args,
            "cwd": workspace_root.to_string_lossy(),
        });
        let summary = format!("{} {}", parsed.command, parsed.args.join(" "));
        return match confirmations::create_candidate(conn, "exec_approval", &params, Some(&summary), Some(ctx.session_id)) {
            Ok(candidate) => ToolOutcome::AwaitConfirmation {
                candidate: json!({
                    "kind": "exec_approval",
                    "confirmationToken": candidate.confirmation_token,
                    "summary": candidate.summary,
                    "args": params,
                }),
                wait_key: "error",
                wait_value: EXEC_DESCRIPTION_NOTE.into(),
            },
            Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
        };
    }

    execute_core(&parsed.command, &parsed.args, &workspace_root, parsed.timeout_ms, cancel, on_event).await
}

/// Shared execution tail (spawn_core → ToolOutcome). Also the seam the
/// engine_exec_confirmed command uses — no conn/candidate dependency.
pub async fn execute_core(
    command: &str,
    args: &[String],
    cwd: &PathBuf,
    timeout_ms: u64,
    cancel: CancellationToken,
    on_event: &(dyn Fn(EngineEvent) + Send + Sync),
) -> ToolOutcome {
    match spawn_core(command, args, cwd, timeout_ms, cancel, on_event).await {
        Ok(core) => match core.kind {
            CoreOutcomeKind::Done => ToolOutcome::Executed(json!({
                "command": command,
                "args": args,
                "exitCode": core.exit_code,
                "ok": core.ok,
                "stdout": core.stdout,
                "stderr": core.stderr,
            })),
            CoreOutcomeKind::Cancelled => ToolOutcome::Failed { message: "cancelled".into(), arg_error: false },
            CoreOutcomeKind::Timeout => ToolOutcome::Failed { message: format!("timeout after {timeout_ms}ms"), arg_error: false },
        },
        Err(e) => ToolOutcome::Failed {
            // Matching a whitelist entry ≠ the binary exists; spawn errors go
            // straight back to the model (documented, non-defect).
            message: format!("spawn failed: {e}"),
            arg_error: false,
        },
    }
}

/* === Tests === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use serde_json::json;

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap()
    }
    fn noop() -> impl Fn(EngineEvent) + Send + Sync {
        |_| {}
    }
    fn tmp_root() -> PathBuf {
        std::env::temp_dir()
    }
    /// A whitelisted-able echo: seeded into kv_store as a learned entry.
    fn echo_pair() -> (&'static str, Vec<String>) {
        if cfg!(windows) {
            ("cmd", vec!["/c".into(), "echo hi".into()])
        } else {
            ("echo", vec!["hi".into()])
        }
    }
    /// Long-running command for cancel/timeout tests.
    fn sleep_pair() -> (&'static str, Vec<String>) {
        if cfg!(windows) {
            ("ping", vec!["-n".into(), "15".into(), "127.0.0.1".into()])
        } else {
            ("sleep", vec!["15".into()])
        }
    }

    fn ctx<'a>(root: Option<PathBuf>) -> ToolCtx<'a> {
        ToolCtx { session_id: "s1", product_id: None, workspace_root: root }
    }

    #[test]
    fn whitelist_defaults_and_subcommand_limits() {
        let wl = default_whitelist();
        assert!(whitelist_matches(&wl, "git", &["status".to_string()]));
        assert!(whitelist_matches(&wl, "GIT.EXE", &["log".to_string()]), "basename+lowercase normalized");
        assert!(!whitelist_matches(&wl, "git", &["push".to_string()]), "git push blocked");
        assert!(!whitelist_matches(&wl, "git", &[]), "bare git requires a whitelisted subcommand");
        for c in ["dir", "ls", "cat", "rg", "pwd"] {
            assert!(whitelist_matches(&wl, c, &[]), "{c} whitelisted");
        }
        assert!(!whitelist_matches(&wl, "rm", &["-rf".to_string()]));
        assert!(whitelist_matches(&wl, "C:\\Program Files\\Git\\bin\\git.exe", &["diff".to_string()]));
    }

    #[test]
    fn learned_whitelist_persists_and_dedups() {
        let conn = mem_conn();
        add_command_to_whitelist(&conn, "npm").unwrap();
        add_command_to_whitelist(&conn, "NPM.EXE").unwrap(); // dedup
        add_command_to_whitelist(&conn, "cargo").unwrap();
        let merged = merged_whitelist(&conn);
        assert!(whitelist_matches(&merged, "npm", &["test".to_string()]));
        assert!(whitelist_matches(&merged, "cargo", &["build".to_string()]));
        assert!(!whitelist_matches(&merged, "rm", &[]));
    }

    #[test]
    fn run_whitelist_hit_executes() {
        let conn = mem_conn();
        let (cmd, args) = echo_pair();
        add_command_to_whitelist(&conn, cmd).unwrap();
        let outcome = rt().block_on(run(
            &conn,
            &json!({"command": cmd, "args": args}),
            &ctx(Some(tmp_root())),
            CancellationToken::new(),
            &noop(),
        ));
        match outcome {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["ok"], true);
                assert!(v["stdout"].as_str().unwrap().contains("hi"));
            }
            other => panic!("expected Executed, got {other:?}"),
        }
    }

    #[test]
    fn run_no_workspace_root_fails() {
        let conn = mem_conn();
        let outcome = rt().block_on(run(
            &conn,
            &json!({"command": "ls"}),
            &ctx(None),
            CancellationToken::new(),
            &noop(),
        ));
        match outcome {
            ToolOutcome::Failed { message, arg_error } => {
                assert_eq!(message, "no workspace root");
                assert!(!arg_error);
            }
            other => panic!("expected Failed, got {other:?}"),
        }
    }

    #[test]
    fn run_off_whitelist_creates_exec_approval_candidate() {
        let conn = mem_conn();
        let outcome = rt().block_on(run(
            &conn,
            &json!({"command": "rm", "args": ["-rf", "/"]}),
            &ctx(Some(tmp_root())),
            CancellationToken::new(),
            &noop(),
        ));
        match outcome {
            ToolOutcome::AwaitConfirmation { candidate, wait_value, .. } => {
                assert_eq!(candidate["kind"], "exec_approval");
                assert_eq!(wait_value, EXEC_DESCRIPTION_NOTE);
                let token = candidate["confirmationToken"].as_str().unwrap();
                let stored = confirmations::get(&conn, token).unwrap().expect("row");
                assert_eq!(stored.kind, "exec_approval");
                assert_eq!(stored.params["command"], "rm");
            }
            other => panic!("expected AwaitConfirmation, got {other:?}"),
        }
    }

    #[test]
    fn exec_approval_dedups_identical_params() {
        let conn = mem_conn();
        let args = json!({"command": "cargo", "args": ["build"]});
        let root = Some(tmp_root());
        let a = rt().block_on(run(&conn, &args, &ctx(root.clone()), CancellationToken::new(), &noop()));
        let b = rt().block_on(run(&conn, &args, &ctx(root), CancellationToken::new(), &noop()));
        let tok = |o: ToolOutcome| match o {
            ToolOutcome::AwaitConfirmation { candidate, .. } => candidate["confirmationToken"].as_str().unwrap().to_string(),
            other => panic!("{other:?}"),
        };
        assert_eq!(tok(a), tok(b), "same params → same pending candidate");
    }

    #[test]
    fn spawn_cancel_kills_and_reports_cancelled() {
        let (cmd, args) = sleep_pair();
        let cancel = CancellationToken::new();
        cancel.cancel();
        let outcome = rt().block_on(execute_core(
            cmd,
            &args,
            &tmp_root(),
            DEFAULT_TIMEOUT_MS,
            cancel,
            &noop(),
        ));
        match outcome {
            ToolOutcome::Failed { message, .. } => assert_eq!(message, "cancelled"),
            other => panic!("expected Failed(cancelled), got {other:?}"),
        }
    }

    #[test]
    fn spawn_timeout_fires() {
        let (cmd, args) = sleep_pair();
        let outcome = rt().block_on(execute_core(cmd, &args, &tmp_root(), 300, CancellationToken::new(), &noop()));
        match outcome {
            ToolOutcome::Failed { message, .. } => assert!(message.starts_with("timeout after"), "{message}"),
            other => panic!("expected Failed(timeout), got {other:?}"),
        }
    }

    #[test]
    fn spawn_streams_lines_via_tool_output() {
        let (cmd, args) = echo_pair();
        let wires = std::sync::Arc::new(std::sync::Mutex::new(Vec::<Value>::new()));
        let on_event = {
            let wires = wires.clone();
            move |e: EngineEvent| {
                if let EngineEvent::ToolOutput { .. } = e {
                    wires.lock().unwrap().push(serde_json::to_value(&e).unwrap());
                }
            }
        };
        let outcome = rt().block_on(execute_core(cmd, &args, &tmp_root(), 10_000, CancellationToken::new(), &on_event));
        assert!(matches!(outcome, ToolOutcome::Executed(_)));
        let w = wires.lock().unwrap();
        assert!(w.iter().any(|e| e["kind"] == "tool_output" && e["data"]["name"] == "exec"), "{w:?}");
    }

    #[test]
    fn arg_validation_errors() {
        let conn = mem_conn();
        for bad in [json!({}), json!({"command": ""}), json!({"command": "ls", "args": "x"}), json!({"command": "ls", "timeoutMs": 999_999_999})] {
            match rt().block_on(run(&conn, &bad, &ctx(Some(tmp_root())), CancellationToken::new(), &noop())) {
                ToolOutcome::Failed { arg_error, .. } => assert!(arg_error, "{bad}"),
                other => panic!("expected arg Failed for {bad}, got {other:?}"),
            }
        }
    }
}
