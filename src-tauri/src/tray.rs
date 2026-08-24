// src-tauri/src/tray.rs
// Phase 24 (24-02) — resident tray + hide-on-close (SCHED-02).
// Menu = dynamic run list (scheduler snapshot) + separator + 显示 Nova + 退出.
// Windows quirk: a menu attached to a tray icon makes LEFT-click open the
// menu by default — we set show_menu_on_left_click(false) so left-click
// shows the window instead (least surprising behavior); menu opens on right-click.

use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::engine::scheduler::RunEntry;
use crate::state::AppState;

pub const TRAY_ID: &str = "nova-tray";

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Tray menu item label for one run entry. Pure — unit-tested.
pub fn run_label(entry: &RunEntry) -> String {
    let title = if entry.title.is_empty() { &entry.run_id[..8.min(entry.run_id.len())] } else { &entry.title };
    format!("{title} — {}", entry.status.as_str())
}

/// Tooltip text. Pure — unit-tested.
pub fn tooltip(runs: &[RunEntry]) -> String {
    match runs.len() {
        0 => "Nova".into(),
        n => format!("Nova — {n} 个运行中"),
    }
}

/// Build and attach the tray icon with the static base menu. The dynamic run
/// list is layered on later via `rebuild` (scheduler on_change callback).
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let menu = base_menu(app)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().expect("default window icon").clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Nova")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            run_id => {
                // Dynamic run item: show window + jump to its session.
                let entry = app
                    .state::<AppState>()
                    .scheduler
                    .snapshot_detailed()
                    .into_iter()
                    .find(|e| e.run_id == run_id);
                if let Some(entry) = entry {
                    show_main(app);
                    let _ = app.emit("tray-open-session", entry.session_id.clone());
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn base_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "显示 Nova", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    MenuBuilder::new(app).items(&[&show, &quit]).build()
}

/// Rebuild the tray menu from the scheduler snapshot (runs first, then the
/// static entries). Called on every run lifecycle change — low-frequency
/// events, no debounce needed.
pub fn rebuild(app: &AppHandle, runs: &[RunEntry]) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    let mut builder = MenuBuilder::new(app);
    if !runs.is_empty() {
        let items: Vec<MenuItem<tauri::Wry>> = runs
            .iter()
            .map(|e| MenuItem::with_id(app, e.run_id.clone(), run_label(e), true, None::<&str>))
            .collect::<Result<Vec<_>, _>>()
            .ok() // malformed menu → fall back to base menu
            .unwrap_or_default();
        let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<_>).collect();
        if !refs.is_empty() {
            builder = builder.items(&refs).separator();
        }
    }
    let show = MenuItem::with_id(app, "show", "显示 Nova", true, None::<&str>);
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>);
    let menu = match (show, quit) {
        (Ok(show), Ok(quit)) => {
            let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = vec![&show, &quit];
            builder.items(&refs).build()
        }
        _ => base_menu(app),
    };
    if let Ok(menu) = menu {
        let _ = tray.set_menu(Some(menu));
    }
    let _ = tray.set_tooltip(Some(tooltip(runs)));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::scheduler::RunStatus;

    fn entry(run_id: &str, title: &str, status: RunStatus) -> RunEntry {
        RunEntry { run_id: run_id.into(), session_id: format!("s-{run_id}"), title: title.into(), status }
    }

    #[test]
    fn run_label_uses_title_and_status() {
        assert_eq!(run_label(&entry("r1", "写周报", RunStatus::Running)), "写周报 — running");
        assert_eq!(run_label(&entry("r2", "", RunStatus::Queued)), "r2 — queued");
    }

    #[test]
    fn tooltip_counts_runs() {
        assert_eq!(tooltip(&[]), "Nova");
        assert_eq!(tooltip(&[entry("r1", "a", RunStatus::Running)]), "Nova — 1 个运行中");
    }
}
