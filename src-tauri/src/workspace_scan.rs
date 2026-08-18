// Workspace folder scan — real filesystem listing for the File Archive tab.
// Depth/entry caps keep IPC payloads bounded; hidden entries and VCS/deps
// directories are skipped.

use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_DEPTH: usize = 3;
const MAX_FILES: usize = 500;

const IGNORED_DIRS: &[&str] = &["node_modules", ".git", "target"];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileDto {
    pub id: String,
    pub name: String,
    pub file_type: String,
    pub size: String,
    pub updated_at: String,
    pub path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files: Vec<WorkspaceFileDto>,
    pub truncated: bool,
}

fn ext_to_type(ext: &str) -> &'static str {
    match ext {
        "pdf" => "pdf",
        "xls" | "xlsx" | "csv" => "sheet",
        "ts" | "tsx" | "rs" | "py" | "js" | "json" => "code",
        "psd" | "fig" | "sketch" => "design",
        "zip" | "rar" | "7z" => "archive",
        _ => "doc", // md, doc, docx, everything else
    }
}

fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let units = ["KB", "MB", "GB"];
    let mut val = bytes as f64 / 1024.0;
    let mut unit = 0;
    while val >= 1024.0 && unit < units.len() - 1 {
        val /= 1024.0;
        unit += 1;
    }
    format!("{val:.1} {}", units[unit])
}

// Hand-rolled civil-from-days (Howard Hinnant's algorithm) — avoids adding chrono
// for one timestamp format. Local time offset is ignored (UTC); display-only.
fn format_unix_epoch(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02} {h:02}:{mi:02}:{s:02}")
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn scan_dir(dir: &Path, depth: usize, files: &mut Vec<WorkspaceFileDto>) -> bool {
    // returns false when caps hit (caller marks truncated)
    let Ok(entries) = fs::read_dir(dir) else {
        return true; // unreadable dir (permissions etc.) — skip silently
    };
    for entry in entries.flatten() {
        if files.len() >= MAX_FILES {
            return false;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if meta.is_dir() {
            if is_hidden(&name) || IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            if depth + 1 <= MAX_DEPTH && !scan_dir(&entry.path(), depth + 1, files) {
                return false;
            }
        } else if meta.is_file() && !is_hidden(&name) {
            let ext = Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let updated = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| format_unix_epoch(d.as_secs()))
                .unwrap_or_default();
            files.push(WorkspaceFileDto {
                id: entry.path().to_string_lossy().to_string(),
                name,
                file_type: ext_to_type(&ext).to_string(),
                size: format_size(meta.len()),
                updated_at: updated,
                path: entry.path().to_string_lossy().to_string(),
            });
        }
    }
    true
}

#[tauri::command]
pub fn scan_workspace_folder(folder_path: String) -> Result<ScanResult, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Ok(ScanResult { files: Vec::new(), truncated: false });
    }
    let mut files = Vec::new();
    let complete = scan_dir(root, 1, &mut files);
    files.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(ScanResult { files, truncated: !complete })
}

const TEXT_EXTS: &[&str] = &[
    "md", "txt", "json", "csv", "log", "yml", "yaml", "xml", "ts", "tsx", "js", "rs", "py",
];
const MAX_READ_BYTES: u64 = 200 * 1024;

#[tauri::command]
pub fn read_workspace_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("文件不存在: {path}"));
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !TEXT_EXTS.contains(&ext.as_str()) {
        return Err("仅支持读取文本类文件 (.md/.txt/.json 等)".to_string());
    }
    if p.metadata().map(|m| m.len()).unwrap_or(0) > MAX_READ_BYTES {
        return Err("文件超过 200KB 限制".to_string());
    }
    // ponytail: no workspace-prefix check; entry only offered on scanned rows — add prefix validation if exposed elsewhere
    match fs::read_to_string(p) {
        Ok(s) => Ok(s),
        Err(_) => fs::read(p)
            .map(|b| String::from_utf8_lossy(&b).to_string())
            .map_err(|e| format!("读取失败: {e}")),
    }
}

fn sanitize_file_name(name: &str) -> Result<String, String> {
    if name.is_empty() {
        return Err("文件名不能为空".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("文件名包含非法字符".to_string());
    }
    Ok(name.to_string())
}

#[tauri::command]
pub fn write_workspace_file(folder_path: String, file_name: String, content: String) -> Result<String, String> {
    let name = sanitize_file_name(&file_name)?;
    let dir = Path::new(&folder_path);
    if !dir.is_dir() {
        return Err(format!("文件夹不存在: {folder_path}"));
    }
    let mut target = dir.join(&name);
    if target.exists() {
        // same-name collision: append millis suffix, never overwrite user files
        let millis = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let stem = Path::new(&name).file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = Path::new(&name).extension().and_then(|e| e.to_str());
        let suffixed = match ext {
            Some(e) => format!("{stem}-{millis}.{e}"),
            None => format!("{stem}-{millis}"),
        };
        target = dir.join(suffixed);
    }
    fs::write(&target, content).map_err(|e| format!("写入失败: {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ext_mapping() {
        assert_eq!(ext_to_type("md"), "doc");
        assert_eq!(ext_to_type("docx"), "doc");
        assert_eq!(ext_to_type("pdf"), "pdf");
        assert_eq!(ext_to_type("xlsx"), "sheet");
        assert_eq!(ext_to_type("csv"), "sheet");
        assert_eq!(ext_to_type("tsx"), "code");
        assert_eq!(ext_to_type("rs"), "code");
        assert_eq!(ext_to_type("fig"), "design");
        assert_eq!(ext_to_type("7z"), "archive");
        assert_eq!(ext_to_type("xyz"), "doc");
    }

    #[test]
    fn size_formatting() {
        assert_eq!(format_size(0), "0 B");
        assert_eq!(format_size(512), "512 B");
        assert_eq!(format_size(1024), "1.0 KB");
        assert_eq!(format_size(2_867_200), "2.7 MB");
        assert_eq!(format_size(1_073_741_824), "1.0 GB");
    }

    #[test]
    fn ignored_and_hidden_names() {
        assert!(IGNORED_DIRS.contains(&"node_modules"));
        assert!(IGNORED_DIRS.contains(&".git"));
        assert!(IGNORED_DIRS.contains(&"target"));
        assert!(is_hidden(".DS_Store"));
        assert!(!is_hidden("docs"));
    }

    #[test]
    fn epoch_formatting() {
        assert_eq!(format_unix_epoch(0), "1970-01-01 00:00:00");
        // 2025-05-18 14:30:00 UTC = 1747578600
        assert_eq!(format_unix_epoch(1_747_578_600), "2025-05-18 14:30:00");
    }

    #[test]
    fn text_ext_whitelist() {
        assert!(TEXT_EXTS.contains(&"md"));
        assert!(TEXT_EXTS.contains(&"yaml"));
        assert!(TEXT_EXTS.contains(&"tsx"));
        assert!(!TEXT_EXTS.contains(&"exe"));
        assert!(!TEXT_EXTS.contains(&"png"));
    }

    #[test]
    fn sanitize_rules() {
        assert!(sanitize_file_name("../x.md").is_err());
        assert!(sanitize_file_name("a/b.md").is_err());
        assert!(sanitize_file_name("a\\b.md").is_err());
        assert!(sanitize_file_name("").is_err());
        assert!(sanitize_file_name("  ").is_ok()); // whitespace-only allowed; trimmed frontend-side
        assert_eq!(sanitize_file_name("PRD v3.2.md").unwrap(), "PRD v3.2.md");
    }

    fn temp_subdir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!(
            "nova-ws-test-{}-{}",
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
    fn read_write_roundtrip() {
        let d = temp_subdir("rw");
        let f = d.join("notes.md");
        fs::write(&f, "# hello 中文").unwrap();
        assert_eq!(read_workspace_file(f.to_string_lossy().to_string()).unwrap(), "# hello 中文");
        // non-text rejected
        let bin = d.join("img.png");
        fs::write(&bin, [0u8, 1, 2, 3]).unwrap();
        assert!(read_workspace_file(bin.to_string_lossy().to_string()).is_err());
        // missing file rejected
        assert!(read_workspace_file(d.join("nope.md").to_string_lossy().to_string()).is_err());
        fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn write_same_name_gets_suffix() {
        let d = temp_subdir("wr");
        let dir_s = d.to_string_lossy().to_string();
        let p1 = write_workspace_file(dir_s.clone(), "doc.md".into(), "v1".into()).unwrap();
        assert!(p1.ends_with("doc.md"));
        let p2 = write_workspace_file(dir_s.clone(), "doc.md".into(), "v2".into()).unwrap();
        assert!(!p2.ends_with("doc.md"), "collision must be renamed: {p2}");
        assert!(p2.contains("doc-"));
        // original untouched
        assert_eq!(fs::read_to_string(&p1).unwrap(), "v1");
        // bad folder rejected
        assert!(write_workspace_file(d.join("nope").to_string_lossy().to_string(), "x.md".into(), "y".into()).is_err());
        fs::remove_dir_all(&d).ok();
    }
}
