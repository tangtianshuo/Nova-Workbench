// src-tauri/src/engine/fs_ops.rs
// Phase 23 (23-03) — native fs tools. Boundary policy (23-CONTEXT):
// reads inside the workspace run free (fs_list/fs_read); writes inside the
// workspace become fs_write HITL candidates (fs_write/fs_mkdir/fs_delete/
// fs_move); anything resolving outside the workspace root is rejected as an
// arg_error — no HITL for escapes. Path safety mirrors file_ops::resolve_in_root
// (canonicalize + starts_with; .. segments refused before resolution) with a
// deep variant (resolve_deep) for mkdir/write into missing parents.
// The confirmed write is executed by the Rust command engine_fs_apply (TOOL-04).

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::engine::confirmations;
use crate::engine::tools::{ToolCtx, ToolOutcome};

/// fs_read hard cap — files over 1MB are arg_errors, not artifact payloads.
pub const MAX_READ_BYTES: u64 = 1024 * 1024;
pub const CANDIDATE_KIND: &str = "fs_write";

const CONFIRMATION_REQUIRED_FS: &str = "Explicit confirmation is required before writing files.";

fn escape_error() -> ToolOutcome {
    ToolOutcome::Failed { message: "path escapes workspace".into(), arg_error: true }
}

/// resolve_in_root tolerates one missing leaf; fs tools (mkdir/write into
/// missing parents) need arbitrary depth. Walks segment by segment,
/// canonicalizing each existing level (symlink escapes stay caught) and
/// appending missing leaves.
fn resolve_deep(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let root_canon = root.canonicalize().map_err(|e| format!("workspace root invalid: {e}"))?;
    if rel.split(['/', '\\']).any(|s| s == "..") {
        return Err("path escapes workspace".into());
    }
    let rel_path = Path::new(rel);
    if rel_path.has_root() || rel_path.components().any(|c| matches!(c, std::path::Component::Prefix(_))) {
        return Err("path escapes workspace".into());
    }
    let mut current = root_canon;
    for seg in rel.split(['/', '\\']).filter(|s| !s.is_empty()) {
        current.push(seg);
        if let Ok(c) = current.canonicalize() {
            current = c;
        }
    }
    if !current.starts_with(root.canonicalize().map_err(|e| format!("workspace root invalid: {e}"))?) {
        return Err("path escapes workspace".into());
    }
    Ok(current)
}

/// Resolve a rel path inside the ctx workspace root, mapping boundary
/// violations to the plan-mandated ToolOutcome failures.
fn resolve(ctx: &ToolCtx<'_>, rel: &str) -> Result<PathBuf, ToolOutcome> {
    let Some(root) = ctx.workspace_root.as_deref() else {
        return Err(ToolOutcome::Failed { message: "no workspace root".into(), arg_error: false });
    };
    // 32-07: a workspace root that cannot be resolved is an environment
    // problem (32-06 mock workspace 假路径) — surface it honestly as a
    // non-arg error; escapes stay the model-argument error they always were.
    resolve_deep(root, rel).map_err(|e| {
        if e.starts_with("workspace root invalid") {
            ToolOutcome::Failed { message: e, arg_error: false }
        } else {
            escape_error()
        }
    })
}

fn str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty())
}

/* === Reads (free inside the workspace) === */

pub fn fs_list(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let rel = str_arg(args, "path").unwrap_or("");
    let dir = match resolve(ctx, rel) {
        Ok(p) => p,
        Err(o) => return o,
    };
    let entries = match std::fs::read_dir(&dir) {
        Ok(iter) => iter,
        Err(e) => return ToolOutcome::Failed { message: format!("read_dir failed: {e}"), arg_error: false },
    };
    let mut list: Vec<Value> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        list.push(json!({ "name": name, "isDir": is_dir, "size": size }));
    }
    list.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    ToolOutcome::Executed(json!({ "path": rel, "entries": list }))
}

pub fn fs_read(args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(rel) = str_arg(args, "path") else {
        return ToolOutcome::Failed {
            message: "Tool \"fs_read\" arg validation failed: path must be a non-empty string".into(),
            arg_error: true,
        };
    };
    let path = match resolve(ctx, rel) {
        Ok(p) => p,
        Err(o) => return o,
    };
    let len = match std::fs::metadata(&path) {
        Ok(m) => m.len(),
        Err(e) => return ToolOutcome::Failed { message: format!("stat failed: {e}"), arg_error: false },
    };
    if len > MAX_READ_BYTES {
        return ToolOutcome::Failed {
            message: format!("Tool \"fs_read\" arg validation failed: file is {len} bytes, over the {MAX_READ_BYTES} limit"),
            arg_error: true,
        };
    }
    match std::fs::read_to_string(&path) {
        // >4KB payloads are artifact-ized by event_log::prepare_tool_result in the loop.
        Ok(content) => ToolOutcome::Executed(json!({ "path": rel, "content": content })),
        Err(e) => ToolOutcome::Failed { message: format!("read failed: {e}"), arg_error: false },
    }
}

/* === Writes (fs_write candidates → engine_fs_apply) === */

/// Candidate params carry the workspace root (like exec's cwd) so the apply
/// command can re-resolve paths without engine state.
fn write_candidate(
    conn: &Connection,
    ctx: &ToolCtx<'_>,
    params: Value,
    summary: String,
) -> ToolOutcome {
    match confirmations::create_candidate(conn, CANDIDATE_KIND, &params, Some(&summary), Some(ctx.session_id)) {
        Ok(candidate) => ToolOutcome::AwaitConfirmation {
            candidate: json!({
                "kind": CANDIDATE_KIND,
                "confirmationToken": candidate.confirmation_token,
                "summary": candidate.summary,
                "args": params,
            }),
            wait_key: "error",
            wait_value: CONFIRMATION_REQUIRED_FS.into(),
        },
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn root_str(ctx: &ToolCtx<'_>) -> String {
    ctx.workspace_root.as_deref().unwrap_or_else(|| Path::new("")).to_string_lossy().to_string()
}

pub fn fs_write(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (Some(rel), Some(content)) = (str_arg(args, "path"), args.get("content").and_then(|v| v.as_str())) else {
        return ToolOutcome::Failed {
            message: "Tool \"fs_write\" arg validation failed: path and content must be non-empty strings".into(),
            arg_error: true,
        };
    };
    if let Err(o) = resolve(ctx, rel) {
        return o;
    }
    let summary = format!("write {rel} ({} bytes)", content.len());
    write_candidate(
        conn,
        ctx,
        json!({ "operation": "write", "path": rel, "content": content, "root": root_str(ctx) }),
        summary,
    )
}

pub fn fs_mkdir(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(rel) = str_arg(args, "path") else {
        return ToolOutcome::Failed {
            message: "Tool \"fs_mkdir\" arg validation failed: path must be a non-empty string".into(),
            arg_error: true,
        };
    };
    if let Err(o) = resolve(ctx, rel) {
        return o;
    }
    write_candidate(conn, ctx, json!({ "operation": "mkdir", "path": rel, "root": root_str(ctx) }), format!("mkdir {rel}"))
}

pub fn fs_delete(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(rel) = str_arg(args, "path") else {
        return ToolOutcome::Failed {
            message: "Tool \"fs_delete\" arg validation failed: path must be a non-empty string".into(),
            arg_error: true,
        };
    };
    if let Err(o) = resolve(ctx, rel) {
        return o;
    }
    write_candidate(conn, ctx, json!({ "operation": "delete", "path": rel, "root": root_str(ctx) }), format!("delete {rel}"))
}

pub fn fs_move(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (Some(src), Some(dest)) = (str_arg(args, "src"), str_arg(args, "dest")) else {
        return ToolOutcome::Failed {
            message: "Tool \"fs_move\" arg validation failed: src and dest must be non-empty strings".into(),
            arg_error: true,
        };
    };
    if let Err(o) = resolve(ctx, src) {
        return o;
    }
    if let Err(o) = resolve(ctx, dest) {
        return o;
    }
    write_candidate(
        conn,
        ctx,
        json!({ "operation": "move", "src": src, "dest": dest, "root": root_str(ctx) }),
        format!("move {src} → {dest}"),
    )
}

/* === Confirmed apply (pure sync core; called by engine_fs_apply) === */

/// Execute a consumed fs_write candidate's params. Root re-resolution goes
/// through resolve_deep again — confirmed params are trusted input from the
/// candidates table, but the same boundary check costs nothing.
pub fn apply_operation(params: &Value) -> ToolOutcome {
    let root = params.get("root").and_then(|v| v.as_str()).map(Path::new).unwrap_or_else(|| Path::new(""));
    let rel = |key: &str| params.get(key).and_then(|v| v.as_str()).unwrap_or("");
    let resolve_param = |key: &str| -> Result<PathBuf, ToolOutcome> {
        resolve_deep(root, rel(key)).map_err(|_| escape_error())
    };
    let operation = params.get("operation").and_then(|v| v.as_str()).unwrap_or("");
    let io = |e: std::io::Error, what: &str| ToolOutcome::Failed { message: format!("{what} failed: {e}"), arg_error: false };
    match operation {
        "write" => {
            let path = match resolve_param("path") {
                Ok(p) => p,
                Err(o) => return o,
            };
            match std::fs::write(&path, params.get("content").and_then(|v| v.as_str()).unwrap_or("")) {
                Ok(()) => ToolOutcome::Executed(json!({ "operation": "write", "path": rel("path"), "written": true })),
                Err(e) => io(e, "write"),
            }
        }
        "mkdir" => {
            let path = match resolve_param("path") {
                Ok(p) => p,
                Err(o) => return o,
            };
            match std::fs::create_dir_all(&path) {
                Ok(()) => ToolOutcome::Executed(json!({ "operation": "mkdir", "path": rel("path"), "created": true })),
                Err(e) => io(e, "mkdir"),
            }
        }
        "delete" => {
            let path = match resolve_param("path") {
                Ok(p) => p,
                Err(o) => return o,
            };
            if !path.exists() {
                return ToolOutcome::Failed { message: "delete target does not exist".into(), arg_error: false };
            }
            let result = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
            match result {
                Ok(()) => ToolOutcome::Executed(json!({ "operation": "delete", "path": rel("path"), "deleted": true })),
                Err(e) => io(e, "delete"),
            }
        }
        "move" => {
            let src = match resolve_param("src") {
                Ok(p) => p,
                Err(o) => return o,
            };
            let dest = match resolve_param("dest") {
                Ok(p) => p,
                Err(o) => return o,
            };
            if !src.exists() {
                return ToolOutcome::Failed { message: "move source does not exist".into(), arg_error: false };
            }
            if dest.exists() {
                return ToolOutcome::Failed { message: "move destination already exists".into(), arg_error: false };
            }
            if src.is_dir() && dest.starts_with(&src) {
                return ToolOutcome::Failed { message: "cannot move a directory into itself".into(), arg_error: false };
            }
            match std::fs::rename(&src, &dest) {
                Ok(()) => ToolOutcome::Executed(json!({ "operation": "move", "src": rel("src"), "dest": rel("dest"), "moved": true })),
                Err(e) => io(e, "move"),
            }
        }
        other => ToolOutcome::Failed {
            message: format!("unknown fs operation: {other}"),
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
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root() -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "nova-fsops-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn ctx<'a>(root: Option<PathBuf>) -> ToolCtx<'a> {
        ToolCtx { session_id: "s1", product_id: None, workspace_root: root, repo_root: None, pm_writes_used: 0 }
    }

    // 32-07: workspace root invalid must surface honestly (not masked as an
    // escape arg_error) — directory invalid ≠ model argument error.
    #[test]
    fn invalid_workspace_root_reported_honestly_not_escape() {
        let bad = PathBuf::from("/definitely/not/a/real/nova-root");
        match fs_list(&json!({}), &ctx(Some(bad))) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.starts_with("workspace root invalid"), "{message}");
                assert!(!arg_error, "directory invalid is not a model argument error");
            }
            other => panic!("{other:?}"),
        }
        // Real root: escapes stay the distinct arg_error they always were.
        let d = temp_root();
        match fs_read(&json!({"path": "../x"}), &ctx(Some(d.clone()))) {
            ToolOutcome::Failed { message, arg_error } => {
                assert_eq!(message, "path escapes workspace");
                assert!(arg_error);
            }
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn fs_list_reads_freely() {
        let d = temp_root();
        fs::write(d.join("a.md"), b"hello").unwrap();
        fs::create_dir(d.join("sub")).unwrap();
        match fs_list(&json!({}), &ctx(Some(d.clone()))) {
            ToolOutcome::Executed(v) => {
                let names: Vec<&str> = v["entries"].as_array().unwrap().iter().map(|e| e["name"].as_str().unwrap()).collect();
                assert!(names.contains(&"a.md") && names.contains(&"sub"), "{names:?}");
                let a = v["entries"].as_array().unwrap().iter().find(|e| e["name"] == "a.md").unwrap();
                assert_eq!(a["isDir"], false);
                assert_eq!(a["size"], 5);
            }
            other => panic!("{other:?}"),
        }
        // subdir listing
        match fs_list(&json!({"path": "sub"}), &ctx(Some(d.clone()))) {
            ToolOutcome::Executed(v) => assert_eq!(v["entries"].as_array().unwrap().len(), 0),
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn fs_read_small_file_inline() {
        let d = temp_root();
        fs::write(d.join("a.md"), "hello world").unwrap();
        match fs_read(&json!({"path": "a.md"}), &ctx(Some(d.clone()))) {
            ToolOutcome::Executed(v) => assert_eq!(v["content"], "hello world"),
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn fs_read_over_1mb_is_arg_error() {
        let d = temp_root();
        fs::write(d.join("big.bin"), vec![b'x'; (MAX_READ_BYTES + 1) as usize]).unwrap();
        match fs_read(&json!({"path": "big.bin"}), &ctx(Some(d.clone()))) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("arg validation failed"));
                assert!(arg_error);
            }
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn escapes_rejected_as_arg_error_no_candidate() {
        let d = temp_root();
        let conn = mem_conn();
        let c = ctx(Some(d.clone()));
        for args in [
            json!({"path": "../escape.md"}),
            json!({"path": "a/../../escape.md"}),
            json!({"path": &d.parent().unwrap().to_string_lossy().to_string()}),
        ] {
            match fs_read(&args, &c) {
                ToolOutcome::Failed { message, arg_error } => {
                    assert_eq!(message, "path escapes workspace");
                    assert!(arg_error);
                }
                other => panic!("expected escape rejection for {args}, got {other:?}"),
            }
        }
        // write-side escape is also a direct error, never a candidate
        match fs_write(&conn, &json!({"path": "../out.md", "content": "x"}), &c) {
            ToolOutcome::Failed { message, arg_error } => {
                assert_eq!(message, "path escapes workspace");
                assert!(arg_error);
            }
            other => panic!("{other:?}"),
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0, "no candidate for escapes");
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn no_workspace_root_fails_without_arg_error() {
        let conn = mem_conn();
        let c = ctx(None);
        for (name, out) in [
            ("fs_list", fs_list(&json!({}), &c)),
            ("fs_read", fs_read(&json!({"path": "a"}), &c)),
            ("fs_write", fs_write(&conn, &json!({"path": "a", "content": "x"}), &c)),
        ] {
            match out {
                ToolOutcome::Failed { message, arg_error } => {
                    assert_eq!(message, "no workspace root", "{name}");
                    assert!(!arg_error);
                }
                other => panic!("{name}: {other:?}"),
            }
        }
    }

    #[test]
    fn writes_create_fs_write_candidates_and_wait() {
        let d = temp_root();
        let conn = mem_conn();
        let c = ctx(Some(d.clone()));
        for (name, out) in [
            ("fs_write", fs_write(&conn, &json!({"path": "a.md", "content": "C"}), &c)),
            ("fs_mkdir", fs_mkdir(&conn, &json!({"path": "sub"}), &c)),
            ("fs_delete", fs_delete(&conn, &json!({"path": "a.md"}), &c)),
            ("fs_move", fs_move(&conn, &json!({"src": "a.md", "dest": "b.md"}), &c)),
        ] {
            match out {
                ToolOutcome::AwaitConfirmation { candidate, wait_value, .. } => {
                    assert_eq!(candidate["kind"], "fs_write", "{name}");
                    assert_eq!(candidate["args"]["root"].as_str().unwrap(), d.to_string_lossy());
                    assert_eq!(wait_value, "Explicit confirmation is required before writing files.");
                }
                other => panic!("{name}: {other:?}"),
            }
        }
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn identical_write_params_dedup() {
        let d = temp_root();
        let conn = mem_conn();
        let c = ctx(Some(d.clone()));
        let args = json!({"path": "a.md", "content": "C"});
        let tok = |o: ToolOutcome| match o {
            ToolOutcome::AwaitConfirmation { candidate, .. } => candidate["confirmationToken"].as_str().unwrap().to_string(),
            other => panic!("{other:?}"),
        };
        assert_eq!(tok(fs_write(&conn, &args, &c)), tok(fs_write(&conn, &args, &c)));
    }

    #[test]
    fn apply_operation_executes_all_four_ops() {
        let d = temp_root();
        let root = d.to_string_lossy().to_string();
        // write
        match apply_operation(&json!({"operation": "write", "path": "a.md", "content": "C", "root": root})) {
            ToolOutcome::Executed(v) => assert_eq!(v["written"], true),
            other => panic!("{other:?}"),
        }
        assert_eq!(fs::read_to_string(d.join("a.md")).unwrap(), "C");
        // mkdir
        apply_operation(&json!({"operation": "mkdir", "path": "sub/deep", "root": &root})).unwrap_executed();
        assert!(d.join("sub/deep").is_dir());
        // move
        apply_operation(&json!({"operation": "move", "src": "a.md", "dest": "sub/b.md", "root": &root})).unwrap_executed();
        assert!(d.join("sub/b.md").exists() && !d.join("a.md").exists());
        // delete file then dir
        apply_operation(&json!({"operation": "delete", "path": "sub/b.md", "root": &root})).unwrap_executed();
        apply_operation(&json!({"operation": "delete", "path": "sub", "root": &root})).unwrap_executed();
        assert!(!d.join("sub").exists());
        // escape still rejected at apply time
        match apply_operation(&json!({"operation": "write", "path": "../x.md", "content": "x", "root": &root})) {
            ToolOutcome::Failed { message, arg_error } => {
                assert_eq!(message, "path escapes workspace");
                assert!(arg_error);
            }
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&d).ok();
    }

    // Tiny helper so tests read cleanly.
    trait UnwrapExecuted {
        fn unwrap_executed(&self);
    }
    impl UnwrapExecuted for ToolOutcome {
        fn unwrap_executed(&self) {
            assert!(matches!(self, ToolOutcome::Executed(_)), "{self:?}");
        }
    }
}
