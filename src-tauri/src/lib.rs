use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

// Phase 2 persistence. Forward-only additive — no DROP/ALTER DROP in migrations/.
// Backstopped by JS-side sanity SELECT + meta.schema_version (PITFALLS Pitfall 2).
// ponytail: returns fresh Vec each call — tauri-plugin-sql's Migration does not impl Clone
// (add_migrations consumes Vec), so we cannot .to_vec() a const slice.
fn sql_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "init_kv_store_and_meta",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }]
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nova.db", sql_migrations())
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_gnome_color_scheme])
        .setup(|app| {
            // Set minimum window size
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(1024, 680)));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
