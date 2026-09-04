// src-tauri/src/engine/exec.rs
// Phase 23 (23-02) — native exec tool: whitelist (default read-only set +
// kv_store-learned entries) → spawn, or exec_approval HITL candidate.
// Process management lives in spawn_core: tokio::process, kill_on_drop,
// timeout, CancellationToken, line-streamed stdout/stderr via
// EngineEvent::ToolOutput. No webview callback anywhere (TOOL-04).
//
// Phase 32 (32-02, CP-6) — four bypass surfaces closed:
//   1. which-based resolution against a repo-scrubbed PATH (no PATH hijack,
//      no bare-name shell tricks; resolved path inside the repo → Failed)
//   2. env scrub: no *KEY*/*TOKEN*/*SECRET*/*PASSWORD* var reaches the child
//   3. git dangerous-flag blacklist → straight Failed, never a HITL card
//   4. binary-pair learning (`npm install` ≠ `npm publish`) per workspace

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::engine::channel::EngineEvent;
use crate::engine::code_ops;
use crate::engine::confirmations;
use crate::engine::event_log;
use crate::engine::tools::{ToolCtx, ToolOutcome};

pub const WHITELIST_KEY: &str = "agent.exec.whitelist";
pub const DEFAULT_TIMEOUT_MS: u64 = 120_000;
pub const MAX_TIMEOUT_MS: u64 = 600_000;
/// Per-stream collection cap. The model sees ≤4KB via prepare_tool_result;
/// 64KB keeps the artifact head meaningful without unbounded memory.
const MAX_STREAM_BYTES: usize = 64 * 1024;

const EXEC_DESCRIPTION_NOTE: &str = "Explicit confirmation is required before running this command.";

/// CP-6: git flags that turn a read-only-looking call into arbitrary
/// command/transport execution. Case-insensitive arg prefix match.
const GIT_DANGEROUS_FLAGS: [&str; 5] = ["--output", "--upload-pack", "-c", "--exec", "--exec-path"];
/// CP-6: env var names containing any marker (uppercase compare) are stripped.
const SECRET_ENV_MARKERS: [&str; 4] = ["KEY", "TOKEN", "SECRET", "PASSWORD"];

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

/// argv[0] normalization: lowercase, strip path + .exe/.cmd/.bat suffix.
pub fn normalize_command(s: &str) -> String {
    let base = Path::new(s).file_name().and_then(|f| f.to_str()).unwrap_or(s).to_lowercase();
    for suffix in [".exe", ".cmd", ".bat"] {
        if let Some(stripped) = base.strip_suffix(suffix) {
            return stripped.to_string();
        }
    }
    base
}

/// CP-6: any arg prefixed (case-insensitive) by a dangerous git flag.
fn git_dangerous_flag(args: &[String]) -> Option<&'static str> {
    args.iter().find_map(|a| {
        let lower = a.to_lowercase();
        GIT_DANGEROUS_FLAGS.into_iter().find(|f| lower.starts_with(f))
    })
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

/// Workspace-scoped whitelist key (32-02 CP-6): `agent.exec.whitelist.{wid}`
/// from the session's workspace binding. Sessions without a workspace keep
/// the legacy shared key, so old rows still read.
pub fn whitelist_key_for_session(conn: &Connection, session_id: &str) -> String {
    let wid: Option<String> = conn
        .query_row(
            "SELECT workspace_id FROM sessions WHERE session_id = ?1",
            params![session_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    wid.map(|w| format!("{WHITELIST_KEY}.{w}")).unwrap_or_else(|| WHITELIST_KEY.to_string())
}

/// Default set + kv_store-learned entries (kv read failure → defaults only).
pub fn merged_whitelist(conn: &Connection, key: &str) -> Vec<WhitelistEntry> {
    let mut all = default_whitelist();
    if let Ok(raw) = conn.query_row(
        "SELECT value FROM kv_store WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    ) {
        if let Ok(learned) = serde_json::from_str::<Vec<WhitelistEntry>>(&raw) {
            all.extend(learned);
        }
    }
    all
}

/// HITL learning: append a command+first-arg pair (32-02 binary-pair
/// granularity — `npm install` learned ≠ `npm publish` allowed). Commands
/// executed with no args keep subcommands None (command-level allow).
pub fn add_command_to_whitelist(
    conn: &Connection,
    key: &str,
    command: &str,
    first_arg: Option<&str>,
) -> Result<(), rusqlite::Error> {
    let normalized = normalize_command(command);
    let pair = first_arg.map(|a| vec![a.to_string()]);
    let mut learned: Vec<WhitelistEntry> = conn
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![key],
            |r| r.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    let same_pair = |e: &WhitelistEntry| match (&e.subcommands, &pair) {
        (Some(a), Some(b)) => a.len() == b.len() && a[0].eq_ignore_ascii_case(&b[0]),
        (None, None) => true,
        _ => false,
    };
    if !learned.iter().any(|e| normalize_command(&e.command) == normalized && same_pair(e)) {
        learned.push(WhitelistEntry { command: normalized, subcommands: pair });
    }
    conn.execute(
        "INSERT INTO kv_store (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, serde_json::to_string(&learned).unwrap_or_default()],
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
    pub pid: Option<u32>,
    pub stdout: String,
    pub stderr: String,
}

/* === CP-6: resolution + env hygiene === */

fn is_secret_env(name: &str) -> bool {
    let upper = name.to_uppercase();
    SECRET_ENV_MARKERS.iter().any(|m| upper.contains(m))
}

fn path_is_under(p: &Path, root: &Path) -> bool {
    p.starts_with(root) || dunce::canonicalize(p).map(|c| c.starts_with(root)).unwrap_or(false)
}

/// System PATH minus entries under repo_root (PATH hijack surface removal).
fn sanitized_path(repo_root: Option<&Path>) -> std::ffi::OsString {
    let Some(raw) = std::env::var_os("PATH") else { return std::ffi::OsString::new() };
    let Some(root) = repo_root else { return raw };
    let kept: Vec<PathBuf> =
        std::env::split_paths(&raw).filter(|p| !path_is_under(p, root)).collect();
    std::env::join_paths(kept).unwrap_or(raw)
}

/// Resolve `command` via `which` against the (already scrubbed) PATH in cwd.
/// The resolved absolute path landing inside repo_root → hijack refusal.
pub fn resolve_in(
    path: &std::ffi::OsStr,
    command: &str,
    cwd: &Path,
    repo_root: Option<&Path>,
) -> std::io::Result<PathBuf> {
    let resolved = which::which_in(command, Some(path), cwd).map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::NotFound, format!("command not found: {command}"))
    })?;
    if let Some(root) = repo_root {
        if code_ops::within_repo(&resolved, root) {
            return Err(std::io::Error::other(format!(
                "refused: {command} resolves inside the bound repo (PATH hijack guard)"
            )));
        }
    }
    Ok(resolved)
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
/// CP-6: `command` is resolved via which against a repo-scrubbed PATH, the
/// child env is a secret-scrubbed copy of the parent env (PATH re-scrubbed),
/// and `on_pid` fires synchronously right after a successful spawn (before
/// any await — the CP-8 crash-recovery audit anchor).
pub async fn spawn_core(
    command: &str,
    args: &[String],
    cwd: &Path,
    timeout_ms: u64,
    cancel: CancellationToken,
    on_event: &(dyn Fn(EngineEvent) + Send + Sync),
    repo_root: Option<&Path>,
    on_pid: Option<&(dyn Fn(u32) + Send + Sync)>,
) -> std::io::Result<CoreResult> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let path = sanitized_path(repo_root);
    let resolved = resolve_in(&path, command, cwd, repo_root)?;
    let mut builder = tokio::process::Command::new(&resolved);
    builder
        .args(args)
        .current_dir(cwd)
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    for (k, v) in std::env::vars_os() {
        let name = k.to_string_lossy();
        if is_secret_env(&name) {
            // env() adds/overrides but never clears — remove explicitly.
            builder.env_remove(&k);
            continue;
        }
        if name.eq_ignore_ascii_case("PATH") {
            builder.env(k, &path);
        } else {
            builder.env(k, v);
        }
    }
    let mut child = builder.spawn()?;
    let pid = child.id();
    {
        // Scoped: on_pid must NOT live across the first await (keeps the
        // future Send/Sync-free of the &Connection the loop-path closure holds).
        if let (Some(cb), Some(pid)) = (on_pid, pid) {
            cb(pid);
        }
    }

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
            pid,
            stdout: out_buf,
            stderr: err_buf,
        });
    }
    Ok(CoreResult { kind, ok: false, exit_code: None, pid, stdout: out_buf, stderr: err_buf })
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

    // CP-6: git dangerous flags fail outright — no HITL card, no learning.
    if normalize_command(&parsed.command) == "git" {
        if let Some(flag) = git_dangerous_flag(&parsed.args) {
            return ToolOutcome::Failed { message: format!("已拒绝:git 危险操作({flag})"), arg_error: false };
        }
    }

    // 32-02 (Pitfall 8): exec cwd is the bound repo root when present; the
    // candidate params carry the same cwd so the confirmed replay matches.
    let cwd = ctx.repo_root.clone().unwrap_or(workspace_root);
    let key = whitelist_key_for_session(conn, ctx.session_id);
    if !whitelist_matches(&merged_whitelist(conn, &key), &parsed.command, &parsed.args) {
        let params = json!({
            "command": parsed.command,
            "args": parsed.args,
            "cwd": cwd.to_string_lossy(),
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

    // CP-8 anchor: pid lands in the session's in-flight exec tool_call payload
    // the moment the spawn succeeds (crash-mid-exec is exactly the case it is
    // for). The closure must be Send+Sync (spawn_core is also the Send-safe
    // confirmed-replay seam), so it opens its own Connection from the DB path
    // instead of capturing this &Connection (rusqlite is !Sync).
    // ponytail: per-spawn connection open; only reached for file-backed DBs —
    // :memory: test conns skip pid recording.
    let db_path = conn.path().filter(|p| !p.is_empty()).map(PathBuf::from);
    let pid_session = ctx.session_id.to_string();
    let on_pid = move |pid: u32| {
        let Some(path) = &db_path else { return };
        if let Ok(c) = crate::engine::db::open(path) {
            let _ = event_log::record_exec_pid(&c, &pid_session, pid);
        }
    };
    match spawn_core(&parsed.command, &parsed.args, &cwd, parsed.timeout_ms, cancel, on_event, ctx.repo_root.as_deref(), Some(&on_pid)).await {
        Ok(core) => core_to_outcome(core, &parsed.command, &parsed.args, parsed.timeout_ms),
        Err(e) => ToolOutcome::Failed {
            message: format!("spawn failed: {e}"),
            arg_error: false,
        },
    }
}

/// CoreResult → ToolOutcome (shared by run and execute_core).
fn core_to_outcome(core: CoreResult, command: &str, args: &[String], timeout_ms: u64) -> ToolOutcome {
    match core.kind {
        CoreOutcomeKind::Done => ToolOutcome::Executed(json!({
            "command": command,
            "args": args,
            "exitCode": core.exit_code,
            "ok": core.ok,
            "pid": core.pid,
            "stdout": core.stdout,
            "stderr": core.stderr,
        })),
        CoreOutcomeKind::Cancelled => ToolOutcome::Failed { message: "cancelled".into(), arg_error: false },
        CoreOutcomeKind::Timeout => ToolOutcome::Failed { message: format!("timeout after {timeout_ms}ms"), arg_error: false },
    }
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
    repo_root: Option<&Path>,
) -> ToolOutcome {
    // CP-6 blacklist re-check: covers the confirmed-replay seam too.
    if normalize_command(command) == "git" {
        if let Some(flag) = git_dangerous_flag(args) {
            return ToolOutcome::Failed { message: format!("已拒绝:git 危险操作({flag})"), arg_error: false };
        }
    }
    match spawn_core(command, args, cwd, timeout_ms, cancel, on_event, repo_root, None).await {
        Ok(core) => core_to_outcome(core, command, args, timeout_ms),
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
        ToolCtx { session_id: "s1", product_id: None, workspace_root: root, repo_root: None, pm_writes_used: 0 }
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
        add_command_to_whitelist(&conn, WHITELIST_KEY, "npm", None).unwrap();
        add_command_to_whitelist(&conn, WHITELIST_KEY, "NPM.EXE", None).unwrap(); // dedup
        add_command_to_whitelist(&conn, WHITELIST_KEY, "cargo", None).unwrap();
        let merged = merged_whitelist(&conn, WHITELIST_KEY);
        assert!(whitelist_matches(&merged, "npm", &["test".to_string()]));
        assert!(whitelist_matches(&merged, "cargo", &["build".to_string()]));
        assert!(!whitelist_matches(&merged, "rm", &[]));
    }

    #[test]
    fn learned_pair_scopes_first_arg() {
        let conn = mem_conn();
        add_command_to_whitelist(&conn, WHITELIST_KEY, "npm", Some("install")).unwrap();
        let merged = merged_whitelist(&conn, WHITELIST_KEY);
        assert!(whitelist_matches(&merged, "npm", &["install".to_string()]), "learned pair allowed");
        assert!(
            !whitelist_matches(&merged, "npm", &["publish".to_string()]),
            "same command, different first arg still escalates"
        );
        assert!(!whitelist_matches(&merged, "npm", &[]), "bare npm not covered by the pair");
    }

    #[test]
    fn whitelist_key_is_workspace_scoped() {
        let conn = mem_conn();
        event_log::upsert_session(&conn, "s1", Some("w9"), None, None, None, None).unwrap();
        assert_eq!(whitelist_key_for_session(&conn, "s1"), "agent.exec.whitelist.w9");
        assert_eq!(whitelist_key_for_session(&conn, "missing"), WHITELIST_KEY);
    }

    #[test]
    fn normalize_command_strips_cmd_and_bat() {
        assert_eq!(normalize_command("npm.cmd"), "npm");
        assert_eq!(normalize_command("NPM.CMD"), "npm");
        assert_eq!(normalize_command("C:\\x\\GIT.EXE"), "git");
        assert_eq!(normalize_command("run.bat"), "run");
        assert_eq!(normalize_command("cargo"), "cargo");
    }

    #[test]
    fn git_dangerous_flags_fail_without_candidate() {
        let conn = mem_conn();
        for args in [
            vec!["-c", "core.editor=evil"],
            vec!["--upload-pack", "x"],
            vec!["log", "--output=/tmp/x"],
        ] {
            let args: Vec<String> = args.into_iter().map(String::from).collect();
            match rt().block_on(run(
                &conn,
                &json!({"command": "git", "args": args}),
                &ctx(Some(tmp_root())),
                CancellationToken::new(),
                &noop(),
            )) {
                ToolOutcome::Failed { message, .. } => {
                    assert!(message.contains("已拒绝"), "{message}");
                }
                other => panic!("expected Failed for dangerous git args, got {other:?}"),
            }
        }
    }

    #[test]
    fn spawned_env_has_no_secret_marker_vars() {
        std::env::set_var("NOVA_TEST_API_KEY", "leak");
        std::env::set_var("NOVA_TEST_TOKEN", "leak");
        std::env::set_var("NOVA_TEST_PASSWORD", "leak");
        let (cmd, args): (&str, Vec<String>) = if cfg!(windows) {
            ("cmd", vec!["/c".into(), "set".into()]) // test-only env echo
        } else {
            ("env", vec![])
        };
        let outcome = rt().block_on(execute_core(
            cmd,
            &args,
            &tmp_root(),
            15_000,
            CancellationToken::new(),
            &noop(),
            None,
        ));
        match outcome {
            ToolOutcome::Executed(v) => {
                let out = format!("{}{}", v["stdout"].as_str().unwrap_or(""), v["stderr"].as_str().unwrap_or(""));
                assert!(out.contains("PATH"), "env echo ran: {out}");
                assert!(!out.contains("NOVA_TEST_API_KEY"), "KEY var leaked: {out}");
                assert!(!out.contains("NOVA_TEST_TOKEN"), "TOKEN var leaked: {out}");
                assert!(!out.contains("NOVA_TEST_PASSWORD"), "PASSWORD var leaked: {out}");
            }
            other => panic!("expected Executed, got {other:?}"),
        }
    }

    #[test]
    #[cfg(windows)]
    fn resolve_refuses_repo_path_hijack() {
        let repo = std::env::temp_dir().join(format!("nova-hijack-{}", std::process::id()));
        let bin = repo.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("npm.cmd"), "@echo fake").unwrap();
        // PATH with the repo bin FIRST — which would resolve the fake npm.
        let raw = std::env::var_os("PATH").unwrap();
        let path = std::env::join_paths(
            std::iter::once(bin.clone().into()).chain(std::env::split_paths(&raw)),
        )
        .unwrap();
        let err = resolve_in(&path, "npm.cmd", &std::env::temp_dir(), Some(&repo)).unwrap_err();
        assert!(err.to_string().contains("refused"), "{err}");
        // No repo binding → the same PATH is fine for names outside the repo.
        assert!(resolve_in(&path, "ping", &std::env::temp_dir(), None).is_ok());
        std::fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn resolve_missing_command_is_not_found() {
        let path = std::env::var_os("PATH").unwrap();
        let err = resolve_in(&path, "definitely-not-a-command-xyz", &std::env::temp_dir(), None).unwrap_err();
        assert!(err.to_string().contains("command not found"), "{err}");
    }

    #[test]
    fn run_whitelist_hit_executes() {
        let conn = mem_conn();
        let (cmd, args) = echo_pair();
        add_command_to_whitelist(&conn, WHITELIST_KEY, cmd, None).unwrap();
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
            None,
        ));
        match outcome {
            ToolOutcome::Failed { message, .. } => assert_eq!(message, "cancelled"),
            other => panic!("expected Failed(cancelled), got {other:?}"),
        }
    }

    #[test]
    fn spawn_timeout_fires() {
        let (cmd, args) = sleep_pair();
        let outcome = rt().block_on(execute_core(cmd, &args, &tmp_root(), 300, CancellationToken::new(), &noop(), None));
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
        let outcome = rt().block_on(execute_core(cmd, &args, &tmp_root(), 10_000, CancellationToken::new(), &on_event, None));
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
