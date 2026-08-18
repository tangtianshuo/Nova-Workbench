// Workspace folder scan — real filesystem listing for the File Archive tab.
// Depth/entry caps keep IPC payloads bounded; hidden entries and VCS/deps
// directories are skipped.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

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
}
