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

use rusqlite::Connection;

use crate::engine::tools::ToolOutcome;

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
    let mut current = root_canon;
    for seg in rel.split(['/', '\\']).filter(|s| !s.is_empty()) {
        current.push(seg);
        if let Ok(c) = dunce::canonicalize(&current) {
            current = c;
        }
    }
    if !within_repo(&current, repo_root) {
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
}
