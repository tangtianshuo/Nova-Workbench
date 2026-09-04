// src-tauri/src/engine/code_ops.rs
// Phase 32 (32-01) — repo scope lock boundary layer. Tool implementations
// (code_read/code_grep/code_write/code_edit) land in 32-03; this file owns
// the boundary every one of them will route through:
//   - detect_repo_root: pure fs upward walk for .git (no git binary)
//   - resolve_repo: fs_ops::resolve_deep-shaped segment-wise resolution with
//     dunce::canonicalize (no \\?\ verbatim prefix) + escape rejection
//   - within_repo: case-insensitive, separator-boundary prefix compare (Windows)
//   - is_nova_data_path: Nova app data dir is always off-limits
// plus workspace_repo_roots persistence (migration 0015).

use std::path::{Path, PathBuf};

use grep_regex::RegexMatcher;
use grep_searcher::{sinks, Searcher};
use rusqlite::Connection;
use serde_json::{json, Value};

use crate::engine::tools::{ToolCtx, ToolOutcome};

pub const CODE_EDIT_KIND: &str = "code_edit";
/// UI-locked copy (32-03 truth): all four code_* tools fail with this exact
/// text when the workspace has no repo binding.
pub const NO_REPO_MSG: &str = "未绑定代码仓库 — 请在设置中指定 repo 目录";
/// code_grep hard cap (MP-10) — beyond this the model must narrow pattern/path.
pub const MAX_GREP_RESULTS: usize = 200;
/// code_read default window (MP-10): head 2000 lines, paginate with offset/limit.
const DEFAULT_READ_LINES: usize = 2000;
/// Whole-file read ceiling for code_read — larger code files must paginate
/// (they still can, lines are cheap; this only stops pathological payloads).
const MAX_CODE_READ_BYTES: u64 = 4 * 1024 * 1024;

fn str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty())
}

fn arg_fail(tool: &str, why: &str) -> ToolOutcome {
    ToolOutcome::Failed {
        message: format!("Tool \"{tool}\" arg validation failed: {why}"),
        arg_error: true,
    }
}

fn repo_root_or_fail(ctx: &ToolCtx<'_>) -> Result<PathBuf, ToolOutcome> {
    ctx.repo_root
        .clone()
        .ok_or_else(|| ToolOutcome::Failed { message: NO_REPO_MSG.into(), arg_error: false })
}

/// Nova's own data dir guard, derived from the connection's DB file parent
/// (in-memory test connections have no path — guard skipped, fine).
fn nova_guard(conn: &Connection, path: &Path) -> Option<ToolOutcome> {
    let db_path = conn.path()?;
    if db_path.is_empty() {
        return None;
    }
    if is_nova_data_path(path, Path::new(db_path).parent()?) {
        Some(ToolOutcome::Failed {
            message: format!("路径超出仓库范围,已拒绝:{}", path.display()),
            arg_error: true,
        })
    } else {
        None
    }
}

/// Shared scope lock for every code_* tool: repo binding → resolve_repo →
/// nova-data-dir fallback rejection (32-RESEARCH Open Question 2 ruling).
fn resolve_code_target(conn: &Connection, ctx: &ToolCtx<'_>, rel: &str) -> Result<PathBuf, ToolOutcome> {
    let root = repo_root_or_fail(ctx)?;
    let path = resolve_repo(&root, rel)?;
    if let Some(o) = nova_guard(conn, &path) {
        return Err(o);
    }
    Ok(path)
}

/* === Reads (zero-confirmation inside the repo) === */

pub fn code_read(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(rel) = str_arg(args, "path") else {
        return arg_fail("code_read", "path must be a non-empty string");
    };
    let path = match resolve_code_target(conn, ctx, rel) {
        Ok(p) => p,
        Err(o) => return o,
    };
    let len = match std::fs::metadata(&path) {
        Ok(m) => m.len(),
        Err(e) => return ToolOutcome::Failed { message: format!("stat failed: {e}"), arg_error: false },
    };
    if len > MAX_CODE_READ_BYTES {
        return arg_fail("code_read", &format!("file is {len} bytes, over the {MAX_CODE_READ_BYTES} limit"));
    }
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) => return ToolOutcome::Failed { message: format!("read failed: {e}"), arg_error: false },
    };
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return arg_fail("code_read", "binary file (NUL byte in first 8KB) — not readable as text");
    }
    let Ok(content) = String::from_utf8(bytes) else {
        return arg_fail("code_read", "file is not valid UTF-8");
    };
    let lines: Vec<&str> = content.split('\n').collect();
    let total = lines.len();
    let offset = args.get("offset").and_then(|v| v.as_i64()).unwrap_or(1).max(1) as usize;
    let limit = args
        .get("limit")
        .and_then(|v| v.as_i64())
        .map(|n| n.clamp(1, DEFAULT_READ_LINES as i64) as usize)
        .unwrap_or(DEFAULT_READ_LINES);
    let start = (offset - 1).min(total);
    let end = (start + limit).min(total);
    ToolOutcome::Executed(json!({
        "path": rel,
        "offset": offset,
        "limit": limit,
        "totalLines": total,
        "hasNext": end < total,
        "content": lines[start..end].join("\n"),
    }))
}

pub fn code_grep(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let Some(pattern) = str_arg(args, "pattern") else {
        return arg_fail("code_grep", "pattern must be a non-empty string");
    };
    let path = match resolve_code_target(conn, ctx, str_arg(args, "path").unwrap_or("")) {
        Ok(p) => p,
        Err(o) => return o,
    };
    let max_results = args
        .get("max_results")
        .and_then(|v| v.as_i64())
        .map(|n| n.clamp(1, MAX_GREP_RESULTS as i64) as usize)
        .unwrap_or(MAX_GREP_RESULTS);
    let matcher = match RegexMatcher::new(&pattern) {
        Ok(m) => m,
        Err(e) => return arg_fail("code_grep", &format!("invalid regex pattern: {e}")),
    };
    let root = repo_root_or_fail(ctx).expect("resolve_code_target already checked");
    let rel_of = |p: &Path| -> String {
        p.strip_prefix(&root).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_else(|_| p.to_string_lossy().to_string())
    };
    let mut matches: Vec<Value> = Vec::new();
    let mut truncated = false;
    let mut searcher = Searcher::new();
    for entry in ignore::WalkBuilder::new(&path).build().flatten() {
        if !entry.file_type().map_or(false, |t| t.is_file()) {
            continue;
        }
        let file = entry.path();
        let mut file_hits = 0usize;
        let sink = sinks::UTF8(|line_num, line| {
            if matches.len() + file_hits >= max_results {
                truncated = true;
                return Ok(false);
            }
            matches.push(json!({
                "file": rel_of(file),
                "line": line_num,
                "text": line.trim_end_matches(['\n', '\r']),
            }));
            file_hits += 1;
            Ok(true)
        });
        // Invalid-UTF-8 / binary files: skipped, not failed. No early break:
        // the sink is what sets `truncated` when it refuses a hit.
        let _ = searcher.search_path(&matcher, file, sink);
    }
    ToolOutcome::Executed(json!({
        "pattern": pattern,
        "matches": matches,
        "truncated": truncated,
        "note": if truncated { Some("结果超过上限,请收窄 pattern 或指定 path 子目录") } else { None },
    }))
}

/// UI-SPEC locked copy (32-UI-SPEC): escape rejections use this exact text.
fn escape_error(path: &Path) -> ToolOutcome {
    ToolOutcome::Failed {
        message: format!("路径超出仓库范围,已拒绝:{}", path.display()),
        arg_error: true,
    }
}

/// Walk up from `start` looking for a `.git` entry; return the first git
/// root's parent (the repo directory), canonicalized via dunce. Pure fs —
/// never shells out to git.
pub fn detect_repo_root(start: &Path) -> Option<PathBuf> {
    let mut cur = dunce::canonicalize(start).ok()?;
    loop {
        if cur.join(".git").exists() {
            return Some(cur);
        }
        if !cur.pop() {
            return None;
        }
    }
}

/// Canonicalize `p`; if it doesn't exist yet (write targets), canonicalize
/// the parent and re-append the file name so case/symlink resolution still
/// applies to every existing segment.
fn canon_or_leaf(p: &Path) -> Option<PathBuf> {
    if let Ok(c) = dunce::canonicalize(p) {
        return Some(c);
    }
    let name = p.file_name()?;
    let mut c = dunce::canonicalize(p.parent()?).ok()?;
    c.push(name);
    Some(c)
}

/// Boundary check: is `resolved` inside `repo_root`? Both sides canonicalized;
/// Windows compares lowercase with a separator boundary so `C:\repo-evil`
/// never matches root `C:\repo`. Byte compare elsewhere (RESEARCH Code Ex 2).
pub fn within_repo(resolved: &Path, repo_root: &Path) -> bool {
    let (Some(a), Some(b)) = (canon_or_leaf(resolved), dunce::canonicalize(repo_root).ok()) else {
        return false;
    };
    prefix_contains(&b, &a)
}

fn prefix_contains(root: &Path, candidate: &Path) -> bool {
    #[cfg(windows)]
    {
        let r = root.to_string_lossy().to_lowercase();
        let c = candidate.to_string_lossy().to_lowercase();
        let rb = r.as_bytes();
        let cb = c.as_bytes();
        c.len() == r.len() && rb == cb
            || (c.len() > r.len() && cb[..r.len()] == *rb && cb[r.len()] == b'\\')
    }
    #[cfg(not(windows))]
    {
        candidate.starts_with(root)
            && (candidate.as_os_str().len() == root.as_os_str().len()
                || candidate
                    .as_os_str()
                    .as_encoded_bytes()
                    .get(root.as_os_str().len())
                    == Some(&b'/'))
    }
}

/// Resolve `rel` inside `repo_root` (fs_ops::resolve_deep shape, dunce-based).
/// Any escape — `..`, absolute rel, symlink/junction hop outside the repo —
/// maps to the UI-SPEC locked rejection.
pub fn resolve_repo(repo_root: &Path, rel: &str) -> Result<PathBuf, ToolOutcome> {
    let root_canon = dunce::canonicalize(repo_root)
        .map_err(|e| ToolOutcome::Failed { message: format!("repo root invalid: {e}"), arg_error: false })?;
    if rel.split(['/', '\\']).any(|s| s == "..") {
        return Err(escape_error(Path::new(rel)));
    }
    let rel_path = Path::new(rel);
    if rel_path.has_root()
        || rel_path
            .components()
            .any(|c| matches!(c, std::path::Component::Prefix(_)))
    {
        return Err(escape_error(rel_path));
    }
    let mut current = root_canon.clone();
    for seg in rel.split(['/', '\\']).filter(|s| !s.is_empty()) {
        current.push(seg);
        if let Ok(c) = dunce::canonicalize(&current) {
            current = c;
        }
    }
    // Final boundary check. within_repo canonicalizes both sides — but write
    // targets may have missing parent segments (root/a/new-file). The walk
    // above canonicalized every EXISTING segment, so `current` is either
    // fully canonical or canonical-root + not-yet-existing tail; the lexical
    // prefix check is safe for the latter (tail segments cannot be links).
    if !within_repo(&current, repo_root) && !prefix_contains(&root_canon, &current) {
        return Err(escape_error(&current));
    }
    Ok(current)
}

/// Nova's own app data dir (db path parent) is never a coding target — an
/// agent editing nova.db / event logs would be self-surgery.
pub fn is_nova_data_path(p: &Path, data_dir: &Path) -> bool {
    match (canon_or_leaf(p), dunce::canonicalize(data_dir)) {
        (Some(p), Ok(d)) => prefix_contains(&d, &p),
        _ => false,
    }
}

/* === workspace_repo_roots persistence (migration 0015) === */

pub fn bind_repo_root(conn: &Connection, workspace_id: &str, repo_root: Option<&str>) -> Result<(), String> {
    match repo_root {
        Some(root) => conn
            .execute(
                "INSERT INTO workspace_repo_roots (workspace_id, repo_root, updated_at) VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(workspace_id) DO UPDATE SET repo_root = ?2, updated_at = datetime('now')",
                rusqlite::params![workspace_id, root],
            )
            .map(|_| ())
            .map_err(|e| e.to_string()),
        None => {
            let _ = conn.execute("DELETE FROM workspace_repo_roots WHERE workspace_id = ?1", rusqlite::params![workspace_id]);
            Ok(())
        }
    }
}

pub fn get_repo_root(conn: &Connection, workspace_id: &str) -> Option<PathBuf> {
    conn.query_row(
        "SELECT repo_root FROM workspace_repo_roots WHERE workspace_id = ?1",
        rusqlite::params![workspace_id],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .map(PathBuf::from)
}

/* === Writes (code_edit HITL candidates → engine_code_apply) === */

const CONFIRMATION_REQUIRED_CODE: &str = "Explicit confirmation is required before editing code.";

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::Digest;
    let mut h = sha2::Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Unified diff (display field, NOT stored in params — CP-2). similar crate
/// with 3 lines of context, matching the plan's context_radius(3).
fn unified_diff(old: &str, new: &str) -> String {
    similar::udiff::unified_diff(similar::Algorithm::Myers, old, new, 3, Some(("old", "new")))
}

/// Read + hash the target file for proposal stamping. Fails for missing
/// files (edit), missing parents are fine for write (apply creates them).
fn read_for_proposal(path: &Path, must_exist: bool) -> Result<(Vec<u8>, String), ToolOutcome> {
    match std::fs::read(path) {
        Ok(bytes) => Ok((bytes.clone(), sha256_hex(&bytes))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !must_exist => {
            Ok((Vec::new(), sha256_hex(&[])))
        }
        Err(e) => Err(ToolOutcome::Failed { message: format!("read failed: {e}"), arg_error: false }),
    }
}

/// Shared candidate creation: params EXACTLY the CP-2 shape (operation/path/
/// old_string|new_content/new_string/root — no snapshot, no diff text);
/// base_hash rides the dedicated column; the diff is a display payload field.
fn code_candidate(
    conn: &Connection,
    ctx: &ToolCtx<'_>,
    params: Value,
    base_hash: &str,
    summary: &str,
    diff: Option<String>,
) -> ToolOutcome {
    match crate::engine::confirmations::create_candidate(
        conn,
        CODE_EDIT_KIND,
        &params,
        Some(summary),
        Some(ctx.session_id),
    ) {
        Ok(candidate) => {
            let _ = crate::engine::confirmations::stamp_base_hash(conn, &candidate.confirmation_token, base_hash);
            let mut payload = json!({
                "kind": CODE_EDIT_KIND,
                "confirmationToken": candidate.confirmation_token,
                "summary": candidate.summary,
                "args": params,
            });
            if let (Some(dst), Some(d)) = (payload.as_object_mut(), diff) {
                dst.insert("diff".into(), json!(d));
            }
            ToolOutcome::AwaitConfirmation {
                candidate: payload,
                wait_key: "error",
                wait_value: CONFIRMATION_REQUIRED_CODE.into(),
            }
        }
        Err(e) => ToolOutcome::Failed { message: e.to_string(), arg_error: false },
    }
}

fn root_str(ctx: &ToolCtx<'_>) -> String {
    ctx.repo_root.as_deref().unwrap_or_else(|| Path::new("")).to_string_lossy().to_string()
}

/// Byte-exact old_string match: all 1-based line numbers of matches
/// (Pitfall 3/MP-11 — only the path is normalized, content matches raw bytes).
fn match_lines(content: &str, needle: &str) -> Vec<usize> {
    let byte_start = content.as_bytes().windows(needle.len()).enumerate().filter(|(_, w)| *w == needle.as_bytes()).map(|(i, _)| i);
    byte_start
        .map(|i| content[..i].matches('\n').count() + 1)
        .collect()
}

pub fn code_edit(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (Some(rel), Some(old_string), Some(new_string)) =
        (str_arg(args, "path"), str_arg(args, "old_string"), args.get("new_string").and_then(|v| v.as_str()))
    else {
        return arg_fail("code_edit", "path, old_string and new_string must be non-empty strings");
    };
    let path = match resolve_code_target(conn, ctx, rel) {
        Ok(p) => p,
        Err(o) => return o,
    };
    let (bytes, base_hash) = match read_for_proposal(&path, true) {
        Ok(v) => v,
        Err(o) => return o,
    };
    let Ok(content) = String::from_utf8(bytes) else {
        return arg_fail("code_edit", "target file is not valid UTF-8");
    };
    let lines = match_lines(&content, old_string);
    match lines.len() {
        0 => {
            return ToolOutcome::Failed {
                message: format!(
                    "old_string not found in {rel} — re-read the file and retry with the exact current text"
                ),
                arg_error: true,
            }
        }
        1 => {}
        n => {
            return ToolOutcome::Failed {
                message: format!(
                    "old_string found {n} times in {rel} (lines: {:?}) — include more surrounding context so it matches exactly once",
                    lines
                ),
                arg_error: true,
            }
        }
    }
    let params = json!({
        "operation": "edit",
        "path": rel,
        "old_string": old_string,
        "new_string": new_string,
        "root": root_str(ctx),
    });
    let diff = unified_diff(old_string, new_string);
    code_candidate(conn, ctx, params, &base_hash, &format!("edit {rel} (line {})", lines[0]), Some(diff))
}

pub fn code_write(conn: &Connection, args: &Value, ctx: &ToolCtx<'_>) -> ToolOutcome {
    let (Some(rel), Some(new_content)) =
        (str_arg(args, "path"), args.get("new_content").and_then(|v| v.as_str()))
    else {
        return arg_fail("code_write", "path and new_content must be non-empty strings");
    };
    let path = match resolve_code_target(conn, ctx, rel) {
        Ok(p) => p,
        Err(o) => return o,
    };
    let (bytes, base_hash) = match read_for_proposal(&path, false) {
        Ok(v) => v,
        Err(o) => return o,
    };
    let params = json!({
        "operation": "write",
        "path": rel,
        "new_content": new_content,
        "root": root_str(ctx),
    });
    let diff = std::str::from_utf8(&bytes).ok().map(|old| unified_diff(old, new_content));
    code_candidate(conn, ctx, params, &base_hash, &format!("write {rel} ({} bytes)", new_content.len()), diff)
}

/* === Tests: boundary trio (junction / case / nova-data-path) === */

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::db::testing::mem_conn;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "nova-codeops-{tag}-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn make_repo(tag: &str) -> PathBuf {
        let repo = temp_dir(tag);
        fs::create_dir_all(repo.join(".git")).unwrap();
        fs::write(repo.join("a.txt"), "x").unwrap();
        repo
    }

    #[test]
    fn detect_repo_root_walks_up_to_git() {
        let repo = make_repo("detect");
        let deep = repo.join("src/engine");
        fs::create_dir_all(&deep).unwrap();
        assert_eq!(detect_repo_root(&deep), Some(dunce::canonicalize(&repo).unwrap()));
        assert_eq!(detect_repo_root(&temp_dir("detect-none")), None);
        fs::remove_dir_all(repo.parent().unwrap().join("nova-codeops-detect-none")).ok();
    }

    /// Trio 1: a junction/symlink INSIDE the repo pointing OUTSIDE must be
    /// rejected by resolve_repo (canonicalize resolves the link target).
    #[test]
    fn link_outside_repo_rejected() {
        let repo = make_repo("link");
        let outside = temp_dir("link-outside");
        fs::write(outside.join("secret.txt"), "s").unwrap();
        let link = repo.join("evil");
        #[cfg(windows)]
        let linked = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&link)
            .arg(&outside)
            .output()
            .expect("mklink /J runs");
        #[cfg(windows)]
        assert!(linked.status.success(), "junction creation failed: {:?}", linked);
        #[cfg(not(windows))]
        std::os::unix::fs::symlink(&outside, &link).expect("symlink");
        match resolve_repo(&repo, "evil/secret.txt") {
            Err(ToolOutcome::Failed { message, arg_error }) => {
                assert!(message.contains("路径超出仓库范围"), "{message}");
                assert!(arg_error);
            }
            other => panic!("expected escape rejection, got {other:?}"),
        }
        // in-repo path still resolves
        assert!(resolve_repo(&repo, "a.txt").is_ok());
    }

    /// Trio 2 (Windows): repo_root passed with different casing than the
    /// on-disk name must still bound correctly — both accept and reject.
    #[test]
    #[cfg(windows)]
    fn mixed_case_repo_root_consistent() {
        let repo = make_repo("case");
        let raw = repo.to_string_lossy().to_string();
        // Flip the case of every drive letter and alpha segment char.
        let mixed: String = raw
            .char_indices()
            .map(|(i, c)| if i == 0 { c.to_ascii_lowercase() } else { c.to_ascii_uppercase() })
            .collect();
        let mixed_root = PathBuf::from(&mixed);
        // in-repo resolve works under the mixed-case root…
        let ok = resolve_repo(&mixed_root, "a.txt").expect("mixed-case root accepts in-repo path");
        assert!(ok.ends_with("a.txt") || ok.to_string_lossy().to_lowercase().ends_with("a.txt"));
        // …and escape still rejected under the same mixed-case root.
        assert!(matches!(resolve_repo(&mixed_root, "../x.txt"), Err(ToolOutcome::Failed { .. })));
    }

    /// Trio 3: Nova's own data dir is never a valid target.
    #[test]
    fn nova_data_path_rejected() {
        let repo = make_repo("nova");
        let data_dir = temp_dir("nova-data");
        let db_file = data_dir.join("nova.db");
        fs::write(&db_file, b"db").unwrap();
        assert!(is_nova_data_path(&db_file, &data_dir));
        assert!(is_nova_data_path(&data_dir.join("agent_events.db-wal"), &data_dir));
        // repo paths inside a different tree are fine
        assert!(!is_nova_data_path(&repo.join("a.txt"), &data_dir));
    }

    #[test]
    fn bind_and_get_repo_root_roundtrip() {
        let conn = mem_conn();
        let repo = make_repo("bind");
        let root_str = dunce::canonicalize(&repo).unwrap().to_string_lossy().to_string();
        assert_eq!(get_repo_root(&conn, "w1"), None);
        bind_repo_root(&conn, "w1", Some(&root_str)).unwrap();
        assert_eq!(get_repo_root(&conn, "w1"), Some(PathBuf::from(&root_str)));
        // rebind overwrites
        bind_repo_root(&conn, "w1", Some("D:/other")).unwrap();
        assert_eq!(get_repo_root(&conn, "w1"), Some(PathBuf::from("D:/other")));
        // None clears
        bind_repo_root(&conn, "w1", None).unwrap();
        assert_eq!(get_repo_root(&conn, "w1"), None);
    }

    /* === 32-03: code_read / code_grep === */

    use serde_json::json;

    fn tool_ctx<'a>(repo: Option<PathBuf>) -> ToolCtx<'a> {
        ToolCtx { session_id: "s1", product_id: None, workspace_root: None, repo_root: repo, pm_writes_used: 0 }
    }

    fn write_lines(repo: &Path, rel: &str, n: usize) {
        let body: String = (1..=n).map(|i| format!("line {i}\n")).collect();
        fs::write(repo.join(rel), body).unwrap();
    }

    #[test]
    fn code_read_default_window_and_pagination() {
        let conn = mem_conn();
        let repo = make_repo("read");
        write_lines(&repo, "big.txt", 2005);
        let c = tool_ctx(Some(repo.clone()));
        // default: head 2000 lines + hasNext
        match code_read(&conn, &json!({"path": "big.txt"}), &c) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["totalLines"], 2006); // trailing newline → 2006 split parts
                assert_eq!(v["hasNext"], true);
                assert_eq!(v["offset"], 1);
                assert!(v["content"].as_str().unwrap().starts_with("line 1\n"));
            }
            other => panic!("{other:?}"),
        }
        // offset/limit window
        match code_read(&conn, &json!({"path": "big.txt", "offset": 2000, "limit": 10}), &c) {
            ToolOutcome::Executed(v) => {
                assert!(v["content"].as_str().unwrap().starts_with("line 2000"));
            }
            other => panic!("{other:?}"),
        }
        // tail window ends exactly
        match code_read(&conn, &json!({"path": "big.txt", "offset": 2004, "limit": 100}), &c) {
            ToolOutcome::Executed(v) => assert_eq!(v["hasNext"], false),
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn code_read_escape_and_nova_data_rejected() {
        let conn = mem_conn();
        let repo = make_repo("read-guard");
        let c = tool_ctx(Some(repo.clone()));
        match code_read(&conn, &json!({"path": "../outside.txt"}), &c) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("路径超出仓库范围"), "{message}");
                assert!(arg_error);
            }
            other => panic!("{other:?}"),
        }
        // Nova data dir fallback: bind repo_root INSIDE the (fake) data dir tree.
        let data_dir = temp_dir("read-nova");
        let nested_repo = data_dir.join("repo");
        fs::create_dir_all(nested_repo.join(".git")).unwrap();
        fs::write(nested_repo.join("a.txt"), "x").unwrap();
        let file_conn = crate::engine::db::testing::open_file(&data_dir.join("nova.db"));
        match code_read(&file_conn, &json!({"path": "a.txt"}), &tool_ctx(Some(nested_repo.clone()))) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("路径超出仓库范围"), "{message}");
                assert!(arg_error);
            }
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&repo).ok();
        fs::remove_dir_all(&data_dir).ok();
    }

    #[test]
    fn code_grep_hits_truncates_and_respects_gitignore() {
        let conn = mem_conn();
        let repo = make_repo("grep");
        fs::write(repo.join("keep.rs"), "fn alpha() {}\nfn beta() {}\n").unwrap();
        fs::create_dir_all(repo.join("sub")).unwrap();
        fs::write(repo.join("sub/mod.rs"), "fn alpha_twice() {}\n").unwrap();
        fs::write(repo.join("ignored.rs"), "fn alpha_ignored() {}\n").unwrap();
        fs::write(repo.join(".gitignore"), "ignored.rs\n").unwrap();
        let c = tool_ctx(Some(repo.clone()));
        match code_grep(&conn, &json!({"pattern": "alpha"}), &c) {
            ToolOutcome::Executed(v) => {
                let hits = v["matches"].as_array().unwrap();
                let files: Vec<&str> = hits.iter().map(|h| h["file"].as_str().unwrap()).collect();
                assert!(files.contains(&"keep.rs") && files.contains(&"sub/mod.rs"), "{files:?}");
                assert!(!files.contains(&"ignored.rs"), "gitignore must be respected: {files:?}");
                let keep = hits.iter().find(|h| h["file"] == "keep.rs").unwrap();
                assert_eq!(keep["line"], 1);
                assert_eq!(keep["text"], "fn alpha() {}");
                assert_eq!(v["truncated"], false);
            }
            other => panic!("{other:?}"),
        }
        // truncation + 收窄 hint
        match code_grep(&conn, &json!({"pattern": "alpha", "max_results": 1}), &c) {
            ToolOutcome::Executed(v) => {
                assert_eq!(v["matches"].as_array().unwrap().len(), 1);
                assert_eq!(v["truncated"], true);
                assert!(v["note"].as_str().unwrap().contains("收窄"), "{:?}", v["note"]);
            }
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn no_repo_binding_all_code_tools_fail_locked_message() {
        let conn = mem_conn();
        let c = tool_ctx(None);
        for (name, out) in [
            ("code_read", code_read(&conn, &json!({"path": "a.txt"}), &c)),
            ("code_grep", code_grep(&conn, &json!({"pattern": "x"}), &c)),
        ] {
            match out {
                ToolOutcome::Failed { message, arg_error } => {
                    assert_eq!(message, NO_REPO_MSG, "{name}");
                    assert!(!arg_error);
                }
                other => panic!("{name}: {other:?}"),
            }
        }
    }

    /* === 32-03: code_write / code_edit candidates === */

    fn edit_outcome(conn: &Connection, c: &ToolCtx, args: Value) -> ToolOutcome {
        code_edit(conn, &args, c)
    }

    fn candidate_payload(o: ToolOutcome) -> Value {
        match o {
            ToolOutcome::AwaitConfirmation { candidate, wait_value, .. } => {
                assert_eq!(wait_value, "Explicit confirmation is required before editing code.");
                candidate
            }
            other => panic!("{other:?}"),
        }
    }

    fn write_src(repo: &Path) {
        fs::write(repo.join("src.rs"), "fn main() {\n    let a = 1;\n}\n").unwrap();
    }

    #[test]
    fn code_edit_zero_match_fails_with_retry_guidance() {
        let conn = mem_conn();
        let repo = make_repo("edit0");
        write_src(&repo);
        let c = tool_ctx(Some(repo.clone()));
        match edit_outcome(&conn, &c, json!({"path": "src.rs", "old_string": "not there", "new_string": "x"})) {
            ToolOutcome::Failed { message, arg_error } => {
                assert!(message.contains("old_string not found in src.rs"), "{message}");
                assert!(message.contains("re-read the file and retry"), "{message}");
                assert!(arg_error);
            }
            other => panic!("{other:?}"),
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM agent_confirmation_candidates", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn code_edit_multi_match_fails_with_all_line_numbers() {
        let conn = mem_conn();
        let repo = make_repo("edit2");
        fs::write(repo.join("src.rs"), "dup\nkeep\ndup\n").unwrap();
        let c = tool_ctx(Some(repo.clone()));
        match edit_outcome(&conn, &c, json!({"path": "src.rs", "old_string": "dup", "new_string": "x"})) {
            ToolOutcome::Failed { message, .. } => {
                assert!(message.contains("found 2 times in src.rs"), "{message}");
                assert!(message.contains("lines: [1, 3]"), "{message}");
            }
            other => panic!("{other:?}"),
        }
        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn code_edit_unique_creates_candidate_exact_params_and_diff() {
        let conn = mem_conn();
        let repo = make_repo("edit1");
        write_src(&repo);
        let c = tool_ctx(Some(repo.clone()));
        let cand = candidate_payload(edit_outcome(
            &conn,
            &c,
            json!({"path": "src.rs", "old_string": "let a = 1;", "new_string": "let a = 2;"}),
        ));
        assert_eq!(cand["kind"], "code_edit");
        // CP-2: params EXACTLY the five keys — no snapshot, no diff text.
        let mut keys: Vec<&str> = cand["args"].as_object().unwrap().keys().map(|k| k.as_str()).collect();
        keys.sort();
        assert_eq!(keys, vec!["new_string", "old_string", "operation", "path", "root"]);
        assert_eq!(cand["args"]["operation"], "edit");
        assert_eq!(cand["args"]["root"].as_str().unwrap(), dunce::canonicalize(&repo).unwrap().to_string_lossy());
        // display diff present with both markers
        let diff = cand["diff"].as_str().unwrap();
        assert!(diff.contains("-let a = 1;") && diff.contains("+let a = 2;"), "{diff}");
        // base_hash column stamped
        let base: Option<String> = conn
            .query_row(
                "SELECT base_hash FROM agent_confirmation_candidates WHERE confirmation_token = ?1",
                rusqlite::params![cand["confirmationToken"].as_str().unwrap()],
                |r| r.get(0),
            )
            .unwrap();
        assert!(base.is_some());
        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn code_edit_cp2_two_edits_two_tokens_same_edit_same_token() {
        let conn = mem_conn();
        let repo = make_repo("cp2");
        write_src(&repo);
        let c = tool_ctx(Some(repo.clone()));
        let a = candidate_payload(edit_outcome(&conn, &c, json!({"path": "src.rs", "old_string": "let a = 1;", "new_string": "let a = 2;"})));
        let b = candidate_payload(edit_outcome(&conn, &c, json!({"path": "src.rs", "old_string": "let a = 1;", "new_string": "let a = 3;"})));
        assert_ne!(a["confirmationToken"], b["confirmationToken"], "different edits = different tokens");
        let again = candidate_payload(edit_outcome(&conn, &c, json!({"path": "src.rs", "old_string": "let a = 1;", "new_string": "let a = 2;"})));
        assert_eq!(a["confirmationToken"], again["confirmationToken"], "same params retry = same token");
        let hashes: Vec<String> = conn
            .prepare("SELECT params_hash FROM agent_confirmation_candidates ORDER BY rowid")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(hashes.len(), 2, "dedup kept two rows only");
        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn code_write_candidate_params_shape() {
        let conn = mem_conn();
        let repo = make_repo("cw");
        write_src(&repo);
        let c = tool_ctx(Some(repo.clone()));
        let cand = candidate_payload(code_write(&conn, &json!({"path": "src.rs", "new_content": "fn main() {}\n"}), &c));
        assert_eq!(cand["args"]["operation"], "write");
        assert_eq!(cand["args"]["new_content"], "fn main() {}\n");
        let mut keys: Vec<&str> = cand["args"].as_object().unwrap().keys().map(|k| k.as_str()).collect();
        keys.sort();
        assert_eq!(keys, vec!["new_content", "operation", "path", "root"]);
        // new file target also resolves (missing leaf OK)
        let new_file = candidate_payload(code_write(&conn, &json!({"path": "new/mod.rs", "new_content": "x\n"}), &c));
        assert_eq!(new_file["args"]["path"], "new/mod.rs");
        fs::remove_dir_all(&repo).ok();
    }

    #[test]
    fn reject_with_reason_lands_in_column() {
        let conn = mem_conn();
        let repo = make_repo("rej");
        write_src(&repo);
        let c = tool_ctx(Some(repo.clone()));
        let cand = candidate_payload(edit_outcome(&conn, &c, json!({"path": "src.rs", "old_string": "let a = 1;", "new_string": "let a = 2;"})));
        let token = cand["confirmationToken"].as_str().unwrap().to_string();
        assert!(crate::engine::confirmations::reject(&conn, &token, Some("改错了变量名")));
        let (status, reason): (String, Option<String>) = conn
            .query_row(
                "SELECT status, reject_reason FROM agent_confirmation_candidates WHERE confirmation_token = ?1",
                rusqlite::params![token],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "rejected");
        assert_eq!(reason.as_deref(), Some("改错了变量名"));
        fs::remove_dir_all(&repo).ok();
    }
}
