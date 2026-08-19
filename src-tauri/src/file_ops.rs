// File operations for the Agent workspace file tree context menu —
// reveal/create/rename, all locked inside the workspace root via
// resolve_in_root (canonicalize + starts_with) and sanitize_file_name.

use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn sanitize_file_name(name: &str) -> Result<String, String> {
    if name.is_empty() {
        return Err("文件名不能为空".to_string());
    }
    if name.contains("..") || name.chars().any(|c| "\\/:*?\"<>|".contains(c)) {
        return Err("文件名包含非法字符".to_string());
    }
    Ok(name.to_string())
}

// Resolve rel against root, refusing anything that escapes the workspace.
// Non-existent targets (create/rename destination) canonicalize the parent
// then re-append the leaf so new items are covered too.
fn resolve_in_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let root_canon = root
        .canonicalize()
        .map_err(|e| format!("工作区根目录无效: {e}"))?;
    if rel.split(['/', '\\']).any(|seg| seg == "..") {
        return Err("路径超出工作区范围".to_string());
    }
    let joined = root.join(rel);
    let canonical = if joined.exists() {
        joined.canonicalize().map_err(|e| format!("路径解析失败: {e}"))?
    } else {
        let parent = joined
            .parent()
            .ok_or_else(|| "路径超出工作区范围".to_string())?;
        let parent_canon = parent
            .canonicalize()
            .map_err(|e| format!("路径解析失败: {e}"))?;
        let leaf = joined.file_name().ok_or_else(|| "路径超出工作区范围".to_string())?;
        parent_canon.join(leaf)
    };
    if !canonical.starts_with(&root_canon) {
        return Err("路径超出工作区范围".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "windows")]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("explorer");
        c.raw_arg(format!("/select,{}", path)); // /select, must stay one raw arg (commas in path)
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.args(["-R", &path]);
        c
    };
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut cmd = {
        let parent = Path::new(&path).parent().unwrap_or(Path::new(&path));
        let mut c = Command::new("xdg-open");
        c.arg(parent);
        c
    };
    let _ = cmd.status().map_err(|e| format!("打开资源管理器失败: {e}"))?;
    Ok(())
}

fn create_entry(
    root: String,
    parent_rel: String,
    name: String,
    is_dir: bool,
) -> Result<String, String> {
    let name = sanitize_file_name(&name)?;
    let parent = resolve_in_root(Path::new(&root), &parent_rel)?;
    let target = parent.join(&name);
    if target.exists() {
        return Err("已存在同名项".to_string());
    }
    if is_dir {
        fs::create_dir(&target).map_err(|e| format!("创建失败: {e}"))?;
    } else {
        fs::write(&target, b"").map_err(|e| format!("创建失败: {e}"))?;
    }
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub fn fs_create_dir(root: String, parent_rel: String, name: String) -> Result<String, String> {
    create_entry(root, parent_rel, name, true)
}

#[tauri::command]
pub fn fs_create_file(root: String, parent_rel: String, name: String) -> Result<String, String> {
    create_entry(root, parent_rel, name, false)
}

#[tauri::command]
pub fn fs_rename(root: String, rel: String, new_name: String) -> Result<String, String> {
    let new_name = sanitize_file_name(&new_name)?;
    let old = resolve_in_root(Path::new(&root), &rel)?;
    if !old.exists() {
        return Err("目标不存在".to_string());
    }
    let new_path = old
        .parent()
        .ok_or_else(|| "路径超出工作区范围".to_string())?
        .join(&new_name);
    if new_path.exists() {
        return Err("已存在同名项".to_string());
    }
    fs::rename(&old, &new_path).map_err(|e| format!("重命名失败: {e}"))?;
    Ok(new_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::UNIX_EPOCH;

    fn temp_subdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "nova-fileops-test-{}-{}",
            tag,
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn sanitize_rules() {
        assert!(sanitize_file_name("../x.md").is_err());
        assert!(sanitize_file_name("a/b.md").is_err());
        assert!(sanitize_file_name("a\\b.md").is_err());
        assert!(sanitize_file_name("").is_err());
        assert!(sanitize_file_name("a:b.md").is_err());
        assert!(sanitize_file_name("a?.md").is_err());
        assert!(sanitize_file_name("a<b").is_err());
        assert!(sanitize_file_name("a|b").is_err());
        assert!(sanitize_file_name("PRD v3.2.md").is_ok());
    }

    #[test]
    fn resolve_traversal_rejected() {
        let d = temp_subdir("trav");
        assert!(resolve_in_root(&d, "a/../../c").is_err());
        assert!(resolve_in_root(&d, "../x").is_err());
        fs::create_dir(d.join("a")).unwrap();
        assert!(resolve_in_root(&d, "a/b.md").is_ok()); // non-existent leaf, existing parent
        assert!(resolve_in_root(&d, "a").is_ok());
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn create_and_rename_roundtrip() {
        let d = temp_subdir("cr");
        let root = d.to_string_lossy().to_string();
        let dir_p = fs_create_dir(root.clone(), "".into(), "docs".into()).unwrap();
        assert!(Path::new(&dir_p).is_dir());
        let file_p = fs_create_file(root.clone(), "docs".into(), "a.md".into()).unwrap();
        assert_eq!(fs::read_to_string(&file_p).unwrap(), "");
        // collisions
        assert_eq!(fs_create_dir(root.clone(), "".into(), "docs".into()).unwrap_err(), "已存在同名项");
        assert!(fs_create_file(root.clone(), "docs".into(), "a.md".into()).is_err());
        // bad names
        assert!(fs_create_file(root.clone(), "docs".into(), "a:b".into()).is_err());
        assert!(fs_create_file(root.clone(), "docs".into(), "../x".into()).is_err());
        // rename same-dir only
        let renamed = fs_rename(root.clone(), "docs/a.md".into(), "b.md".into()).unwrap();
        assert!(renamed.ends_with("b.md"));
        assert!(!Path::new(&file_p).exists());
        assert_eq!(fs_rename(root.clone(), "docs/b.md".into(), "b.md".into()).unwrap_err(), "已存在同名项");
        assert!(fs_rename(root.clone(), "docs/nope.md".into(), "c.md".into()).is_err());
        // rename into escaped dir via new_name rejected
        assert!(fs_rename(root.clone(), "docs/b.md".into(), "sub/x.md".into()).is_err());
        fs::remove_dir_all(&d).ok();
    }
}
