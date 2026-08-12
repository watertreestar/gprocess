mod admin;
mod assess;
mod kill;
mod snapshot;

use snapshot::SnapshotState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(SnapshotState::new())
        .invoke_handler(tauri::generate_handler![
            snapshot::snapshot,
            kill::kill_process,
            kill::kill_tree,
            assess::assess_process,
            admin::is_admin,
            admin::restart_as_admin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
