use tauri::{Emitter, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

// Phase 3 modules. Wave 1 ships the substrate (error/keychain/state/llm + commands
// stub); Wave 2 (plan 03-02) wires #[tauri::command] fns into invoke_handler.
mod commands;
mod engine; // Phase 22: run engine (compiles + tests only; runtime wiring in 22-06)
mod error;
mod file_ops;
mod keychain;
mod notify;
mod llm;
mod state;
mod tray;
mod workspace_scan;

use state::AppState;

// Phase 2 persistence. Forward-only additive — no DROP/ALTER DROP in migrations/.
// Backstopped by JS-side sanity SELECT + meta.schema_version (PITFALLS Pitfall 2).
// ponytail: returns fresh Vec each call — tauri-plugin-sql's Migration does not impl Clone
// (add_migrations consumes Vec), so we cannot .to_vec() a const slice.
fn sql_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init_kv_store_and_meta",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "agent_events_and_artifacts",
            sql: include_str!("../migrations/0002_agent_events.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "agent_confirmation_candidates",
            sql: include_str!("../migrations/0003_confirmation_candidates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "memories_knowledge_fts",
            sql: include_str!("../migrations/0004_memories_knowledge_fts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "deliverable_source_event",
            sql: include_str!("../migrations/0005_deliverable_source_event.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "confirmation_kind_deliverable",
            sql: include_str!("../migrations/0006_confirmation_kind_deliverable.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "sessions metadata + backfill",
            sql: include_str!("../migrations/0007_sessions.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "confirmation kind exec_approval",
            sql: include_str!("../migrations/0008_confirmation_kind_exec.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "confirmation kind fs_write",
            sql: include_str!("../migrations/0009_confirmation_kind_fs.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

// Linux-only: read GNOME color-scheme via gsettings.
// Returns Some("'prefer-dark'") / Some("'default'") / Some("'prefer-light'") or None.
// JS side parses with .includes('dark') (NOT strict ===) to handle GVariant single-quotes.
// On Windows/macOS compiles to a stub returning None.
#[cfg(target_os = "linux")]
#[tauri::command]
fn get_gnome_color_scheme() -> Option<String> {
    use std::process::Command;
    let out = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

// Non-Linux stub: always returns None. Webview still sees the command registered.
#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn get_gnome_color_scheme() -> Option<String> {
    None
}

// 27-04: registry completeness — Rust unit tests run migrations by scanning the
// directory (db.rs testing::run_migrations), but production registers them here.
// If these two paths diverge, tests stay green while real devices are missing
// tables (the 27-04 root cause). This test makes a missing registration fail CI.
#[cfg(test)]
mod migration_registry_tests {
    use super::*;

    #[test]
    fn registry_matches_migration_files() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");
        let file_count = std::fs::read_dir(dir)
            .expect("migrations dir readable")
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "sql").unwrap_or(false))
            .count();

        let migrations = sql_migrations();
        assert_eq!(
            migrations.len(),
            file_count,
            "every migrations/*.sql must be registered in sql_migrations() — an unregistered migration = real-device schema gap (27-04 root cause)"
        );

        let mut versions: Vec<i64> = migrations.iter().map(|m| m.version).collect();
        assert!(versions.windows(2).all(|w| w[0] < w[1]), "versions strictly ascending");

        let max_file_prefix = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "sql").unwrap_or(false))
            .filter_map(|e| {
                e.file_name()
                    .to_str()?
                    .split('_')
                    .next()?
                    .parse::<i64>()
                    .ok()
            })
            .max()
            .expect("at least one migration file");
        assert_eq!(
            *versions.iter().max().unwrap(),
            max_file_prefix,
            "max registered version must equal max file prefix"
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nova.db", sql_migrations())
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_gnome_color_scheme,
            commands::generate_project,
            commands::cancel_generate_project,
            commands::has_api_key,
            commands::set_api_key,
            commands::chat,
            commands::cancel_chat,
            commands::list_providers,
            commands::set_active_provider,
            commands::get_active_provider,
            commands::set_provider,
            commands::get_provider,
            commands::has_provider_key,
            commands::set_provider_key,
            commands::ping_provider,
            workspace_scan::scan_workspace_folder,
            workspace_scan::read_workspace_file,
            workspace_scan::write_workspace_file,
            file_ops::reveal_in_explorer,
            file_ops::fs_create_dir,
            file_ops::fs_create_file,
            file_ops::fs_rename,
            file_ops::fs_move,
            engine::commands::engine_run,
            engine::commands::engine_cancel,
            engine::commands::engine_confirm_candidate,
            engine::commands::engine_reject_candidate,
            engine::commands::engine_append_tool_result,
            engine::commands::engine_exec_confirmed,
            engine::commands::engine_whitelist_add,
            engine::commands::engine_fs_apply,
            engine::commands::engine_commit_deliverable,
            engine::commands::engine_consume_memory,
            engine::commands::engine_consume_ingestion_batch,
            engine::commands::engine_ingest_pending_count,
            engine::commands::engine_reject_memory,
        ])
        // 24-02 hide-on-close (SCHED-02): closing the window hides it — runs
        // keep going; real exit is tray 「退出」 only.
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // 24-03 notification click fallback: the user came back (tray /
            // toast click) — jump to the last background-notified session via
            // the same tray-open-session path the tray list uses.
            tauri::WindowEvent::Focused(true) => {
                let target = window
                    .app_handle()
                    .state::<AppState>()
                    .last_notified_session
                    .lock()
                    .unwrap()
                    .take();
                if let Some(session_id) = target {
                    let _ = window.emit("tray-open-session", session_id);
                }
            }
            _ => {}
        })
        .setup(|app| {
            // Set minimum window size
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(1200, 760)));
                // 24-02 tray: resident icon + scheduler on_change → menu rebuild.
                tray::init(app.handle())?;
                let handle = app.handle().clone();
                app.state::<AppState>()
                    .scheduler
                    .set_on_change(Box::new(move |runs| tray::rebuild(&handle, runs)));
            }
            // Phase 22 (22-06) engine wiring: manage the sole-writer DB slot
            // synchronously (commands can resolve the state immediately), then
            // open + assert + crash-restore the latest session off the UI path.
            // tauri-plugin-sql migrations (0001-0007) already ran during plugin
            // init — before this setup hook (22-RESEARCH §风险#2 order check).
            use std::sync::Mutex;
            let db_path = engine::db::db_path(app.handle());
            // 24-01: the path is stored up-front so engine_run can open a
            // per-run Connection even before the shared conn finishes opening.
            app.manage(engine::commands::EngineDb(Mutex::new(None), Mutex::new(Some(db_path.clone()))));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let path = db_path;
                let opened = match engine::db::open(&path) {
                    Ok(conn) => engine::db::assert_schema(&conn).map(|_| conn),
                    Err(e) => Err(e.to_string()),
                };
                match opened {
                    Ok(conn) => {
                        match engine::restore::restore_latest_session(&conn) {
                            Ok(Some(report)) if !report.interrupted_tool_call_ids.is_empty() => eprintln!(
                                "[engine] restored session {} (interrupted tool_calls: {:?})",
                                report.session_id, report.interrupted_tool_call_ids
                            ),
                            Ok(_) => {}
                            Err(e) => eprintln!("[engine] startup restore failed: {e}"),
                        }
                        let db = handle.state::<engine::commands::EngineDb>();
                        *db.0.lock().unwrap() = Some(conn);
                    }
                    Err(e) => eprintln!("[engine] DB open/assert failed, engine commands disabled: {e}"),
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
