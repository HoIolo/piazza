mod attachments;
mod commands;
mod config;
mod external;
mod files;
mod git;
mod pi_locate;
mod rpc;
mod sessions;
mod terminal;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            attachments::read_attachment,
            attachments::store_attachment,
            commands::locate_pi,
            commands::rpc_start,
            commands::rpc_send,
            commands::rpc_stop,
            commands::rpc_is_running,
            commands::scan_sessions,
            commands::trash_session,
            commands::read_session_snapshot,
            commands::read_git_branch,
            commands::list_git_branches,
            commands::checkout_git_branch,
            commands::read_git_diff_stat,
            commands::read_git_diff,
            commands::terminal_open,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_close,
            commands::list_git_worktrees,
            commands::add_git_worktree,
            commands::search_project_files,
            commands::list_workspace_dir,
            commands::preview_workspace_file,
            commands::read_html_preview,
            commands::list_external_apps,
            commands::open_path_with,
            commands::read_models_config,
            commands::write_models_config,
            commands::read_app_settings,
            commands::write_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 应用启动失败");
}
