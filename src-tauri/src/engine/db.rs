// src-tauri/src/engine/db.rs
// Phase 22 Wave 0 — rusqlite connection to the SAME nova.db that tauri-plugin-sql
// ("sqlite:nova.db") writes. WAL + busy_timeout(5s) keep the two writers
// (rusqlite: agent_* tables; sqlx: business tables) from blocking each other.
//
// DB path probe conclusion (RESEARCH.md risk #2):
// tauri-plugin-sql "sqlite:nova.db" resolves to the app CONFIG dir
// (`app_config_dir()/nova.db`, e.g. Windows %APPDATA%\com.nova.pm-workspace\nova.db).
// `probe_db_path` below is the executable verification: run with the NOVA_DB env
// pointing at the real dev DB; if schema_version >= 7 is readable there while the
// plugin reports the same data, both writers hit one file.

use rusqlite::Connection;
use std::path::PathBuf;
use std::time::Duration;

/// Absolute path of the shared nova.db for a given Tauri app handle.
/// Probe conclusion frozen as this constant behavior: app_config_dir.
pub fn db_path(app: &tauri::AppHandle) -> PathBuf {
    use tauri::Manager;
    app.path()
        .app_config_dir()
        .expect("app_config_dir resolvable")
        .join("nova.db")
}

/// Open the shared DB with engine-standard pragmas:
/// busy_timeout 5s (cross-writer contention with sqlx pool), WAL (persistent
/// since migration 0002 but re-issued harmlessly), foreign_keys on.
pub fn open(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_millis(5000))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    Ok(conn)
}

/// Assert the shared schema is at least v0.3.1 shape. tauri-plugin-sql runs
/// migrations 0001-0007 during plugin init (before engine ever sees a
/// connection); this replaces a second Rust-side migration suite.
pub fn assert_schema(conn: &Connection) -> Result<(), String> {
    let v: i64 = conn
        // meta is a kv table (migration 0001): key TEXT PK, value TEXT.
        .query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'schema_version'", [], |row| row.get(0))
        .map_err(|e| format!("engine: cannot read schema_version ({e}) — not the plugin-shared nova.db?"))?;
    if v < 7 {
        return Err(format!("engine: schema_version {v} < 7"));
    }
    Ok(())
}

/// UAT probe (ignored by default — needs the real dev DB):
/// `NOVA_DB=/abs/path/nova.db cargo test probe_db_path -- --ignored`
#[test]
#[ignore]
fn probe_db_path() {
    let path = std::env::var("NOVA_DB").expect("NOVA_DB must point at the real dev nova.db");
    let conn = open(std::path::Path::new(&path)).expect("open real DB");
    assert_schema(&conn).expect("real DB must be schema >= 7 (plugin-migrated)");
}
