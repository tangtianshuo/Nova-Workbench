// src-tauri/src/notify.rs
// Phase 24 (24-03, SCHED-03) — background-gated desktop notifications.
// ONLY when the main window is hidden (hide-on-close) do we notify:
// run finished / run failed / run waiting for HITL confirmation.
// Foreground conversations never notify (user is already looking).
//
// Click-through: Windows toast click callbacks are unreliable with
// tauri-plugin-notification, so the fallback is focus-gated: the session id of
// the last notified run is recorded; when the window next gains focus
// (lib.rs WindowEvent::Focused) we emit tray-open-session for it — the same
// webview path the tray run list uses (24-02).
// ponytail: focused-fallback only; switch to Windows AppNotification API if
// precise click-per-notification semantics ever become a requirement.

use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Pure gate — unit-tested. `is_visible` false/Err (window gone) → notify.
pub fn should_notify(is_visible: bool) -> bool {
    !is_visible
}

/// Send an OS notification if (and only if) the main window is hidden.
/// Records `session_id` as the last-notified jump target.
pub fn notify_if_background(app: &AppHandle, title: &str, body: &str, session_id: &str) {
    let Some(win) = app.get_webview_window("main") else { return };
    let visible = win.is_visible().unwrap_or(true);
    if !should_notify(visible) {
        return;
    }
    if let Some(state) = app.try_state::<AppState>() {
        *state.last_notified_session.lock().unwrap() = Some(session_id.to_string());
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gate_notifies_only_when_hidden() {
        assert!(!should_notify(true), "foreground must not notify");
        assert!(should_notify(false), "hidden background must notify");
    }
}
