mod agent_resources;
mod attachments;
mod browser;
mod commands;
mod computer_use;
#[cfg(target_os = "windows")]
mod computer_use_win;
#[cfg(target_os = "windows")]
mod computer_use_win_gfx;
mod config;
mod data_dir;
mod external;
mod files;
mod git;
mod import;
mod rpc;
mod sessions;
mod shells;
mod terminal;
mod win_console;

use commands::AppState;
use tauri::Manager;

/// 运行平台。前端据此决定标题栏形态、快捷键文案与毛玻璃降级，比解析 UA 可靠。
#[tauri::command]
fn app_platform() -> &'static str {
    std::env::consts::OS
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .manage(browser::BrowserState::default())
        .manage(computer_use::ComputerUseState::new())
        .invoke_handler(tauri::generate_handler![
            attachments::read_attachment,
            browser::browser_show,
            browser::browser_bounds,
            browser::browser_hide,
            browser::browser_reload,
            attachments::store_attachment,
            commands::rpc_start,
            commands::rpc_send,
            commands::rpc_stop,
            commands::rpc_is_running,
            commands::scan_sessions,
            commands::trash_session,
            commands::truncate_session_before,
            commands::read_session_snapshot,
            commands::read_git_branch,
            commands::list_git_branches,
            commands::fetch_git_remotes,
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
            commands::path_kind,
            commands::read_any_file,
            commands::open_path_with,
            commands::read_models_config,
            commands::write_models_config,
            commands::read_app_settings,
            commands::list_shells,
            commands::write_app_settings,
            commands::get_agent_dir,
            commands::pi_import_offer,
            commands::pi_import,
            commands::pi_import_skip,
            commands::read_global_instructions,
            commands::write_global_instructions,
            commands::list_agent_skills,
            commands::save_agent_skill,
            commands::delete_agent_skill,
            commands::list_local_extensions,
            commands::delete_local_extension,
            app_platform,
            commands::read_mcp_config,
            commands::write_mcp_config,
            computer_use::cu_permissions,
            computer_use::cu_request_permission,
            computer_use::cu_focus_window,
            computer_use::cu_unwatch_window,
            computer_use::cu_clear_all,
            computer_use::cu_list_windows,
        ])
        .build(tauri::generate_context!())
        .expect("Tauri 应用初始化失败")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(cu) = app.try_state::<computer_use::ComputerUseState>() {
                    tauri::async_runtime::block_on(cu.shutdown());
                }
            }
        });
}
