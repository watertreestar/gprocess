mod admin;
mod assess;
mod kill;
mod snapshot;
mod tray;

use snapshot::SnapshotState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(SnapshotState::new())
        .invoke_handler(tauri::generate_handler![
            snapshot::snapshot,
            kill::kill_process,
            kill::kill_tree,
            assess::assess_process,
            admin::is_admin,
            admin::restart_as_admin,
        ])
        .setup(|app| {
            tray::setup_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
