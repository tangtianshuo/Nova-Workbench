use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
