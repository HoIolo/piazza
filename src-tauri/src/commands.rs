use tauri::{AppHandle, State};

use crate::agent_resources;
use crate::config;
use crate::data_dir;
use crate::external;
use crate::files;
use crate::git;
use crate::import;
use crate::rpc::{self, RpcState, StartOptions};
use crate::sessions::{self, ProjectGroup, SessionSnapshot};
use crate::terminal::TerminalState;

pub struct AppState {
    pub rpc: RpcState,
    /// 侧边聊天的 pi，与主会话各跑各的
    pub side_rpc: RpcState,
    pub accounts_rpc: RpcState,
    pub terminal: TerminalState,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            rpc: RpcState::new(rpc::MAIN),
            side_rpc: RpcState::new(rpc::SIDE),
            accounts_rpc: RpcState::new(rpc::ACCOUNTS),
            terminal: TerminalState::default(),
        }
    }
}

impl AppState {
    /// 取这次调用要操作的 pi。前端不传 side 时就是主会话
    fn channel(&self, side: Option<bool>, accounts: Option<bool>) -> &RpcState {
        if accounts.unwrap_or(false) {
            &self.accounts_rpc
        } else if side.unwrap_or(false) {
            &self.side_rpc
        } else {
            &self.rpc
        }
    }
}

const DEFAULT_SLOT: &str = "default";

#[tauri::command]
pub async fn rpc_start(
    app: AppHandle,
    state: State<'_, AppState>,
    mut opts: StartOptions,
    side: Option<bool>,
    accounts: Option<bool>,
    slot_id: Option<String>,
) -> Result<(), String> {
    let slot = slot_id.as_deref().unwrap_or(DEFAULT_SLOT);
    if accounts.unwrap_or(false) {
        opts.cwd = dirs::home_dir()
            .ok_or("无法定位用户主目录")?
            .to_string_lossy()
            .into_owned();
    }
    state.channel(side, accounts).start(app, opts, slot).await
}

#[tauri::command]
pub async fn rpc_send(
    state: State<'_, AppState>,
    payload: serde_json::Value,
    side: Option<bool>,
    accounts: Option<bool>,
    slot_id: Option<String>,
) -> Result<(), String> {
    let slot = slot_id.as_deref().unwrap_or(DEFAULT_SLOT);
    state.channel(side, accounts).send(slot, &payload).await
}

#[tauri::command]
pub async fn rpc_stop(
    state: State<'_, AppState>,
    side: Option<bool>,
    accounts: Option<bool>,
    slot_id: Option<String>,
) -> Result<(), String> {
    let slot = slot_id.as_deref().unwrap_or(DEFAULT_SLOT);
    state.channel(side, accounts).stop(slot).await
}

#[tauri::command]
pub async fn rpc_is_running(
    state: State<'_, AppState>,
    side: Option<bool>,
    accounts: Option<bool>,
    slot_id: Option<String>,
) -> Result<bool, String> {
    let slot = slot_id.as_deref().unwrap_or(DEFAULT_SLOT);
    Ok(state.channel(side, accounts).is_running(slot).await)
}

#[tauri::command]
pub fn scan_sessions() -> Result<Vec<ProjectGroup>, String> {
    sessions::scan()
}

/// 把一条会话记录移进废纸篓
#[tauri::command]
pub fn trash_session(path: String) -> Result<(), String> {
    sessions::trash(&path)
}

/// 原地截断会话文件，只保留目标用户消息之前的历史，供编辑重发复用原会话
#[tauri::command]
pub fn truncate_session_before(path: String, entry_id: String) -> Result<(), String> {
    sessions::truncate_before(&path, &entry_id)
}

/// 从磁盘直接读取会话消息快照，用于切换会话时先秒开内容
#[tauri::command]
pub async fn read_session_snapshot(path: String) -> Result<SessionSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || sessions::read_snapshot(&path))
        .await
        .map_err(|err| err.to_string())?
}

/// 读取工作目录的 git 分支，用于输入框上方的上下文条
#[tauri::command]
pub fn read_git_branch(cwd: String) -> Option<String> {
    git::current_branch(&cwd)
}

/// 列出本地分支，供分支选择器展示
#[tauri::command]
pub fn list_git_branches(cwd: String) -> Result<Vec<String>, String> {
    git::list_branches(&cwd)
}

/// 切换或新建分支。会改动工作区，失败时把 git 的原始错误上报给用户
#[tauri::command]
pub fn checkout_git_branch(cwd: String, branch: String, create: bool) -> Result<(), String> {
    git::checkout_branch(&cwd, &branch, create)
}

/// 工作区增删行数统计，用于右侧面板的「变更」
#[tauri::command]
pub fn read_git_diff_stat(cwd: String) -> Option<(u32, u32)> {
    git::diff_stat(&cwd)
}

/// 工作区完整 diff，供右侧面板的「审阅」视图
#[tauri::command]
pub async fn read_git_diff(cwd: String, path: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || git::diff(&cwd, path.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// 列出 git worktree，供「工作模式」切换
#[tauri::command]
pub fn list_git_worktrees(cwd: String) -> Result<Vec<git::Worktree>, String> {
    git::list_worktrees(&cwd)
}

/// 新建 worktree 并返回其路径
#[tauri::command]
pub fn add_git_worktree(cwd: String, branch: String) -> Result<String, String> {
    git::add_worktree(&cwd, &branch)
}

/// 在项目内搜索文件，供输入框的 @ 提及使用
#[tauri::command]
pub fn search_project_files(cwd: String, query: String) -> Vec<files::FileHit> {
    files::search_files(&cwd, &query, 40)
}

#[tauri::command]
pub async fn list_workspace_dir(
    cwd: String,
    path: String,
) -> Result<Vec<files::WorkspaceEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || files::list_workspace_dir(&cwd, &path))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn preview_workspace_file(cwd: String, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || files::preview_workspace_file(&cwd, &path))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn read_html_preview(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || files::read_html_preview(&path))
        .await
        .map_err(|err| err.to_string())?
}

/// 读取任意本地文件的内容，供正文文件链接的「复制文件内容」用
#[tauri::command]
pub async fn read_any_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || files::read_any_file(&path))
        .await
        .map_err(|err| err.to_string())?
}

/// 判断路径是文件、目录还是不存在
#[tauri::command]
pub fn path_kind(path: String) -> external::PathKind {
    external::path_kind(&path)
}

/// 列出可用于「打开位置」的应用
#[tauri::command]
pub fn list_external_apps() -> Vec<external::ExternalApp> {
    external::list_apps()
}

/// 用指定应用打开路径；appPath 为空表示交给访达
#[tauri::command]
pub fn open_path_with(app_path: String, target: String) -> Result<(), String> {
    external::open_with(&app_path, &target)
}

#[tauri::command]
pub fn read_models_config() -> Result<serde_json::Value, String> {
    config::read_json(&config::models_path()?)
}

/// 保存模型配置。与原文件做顶层合并，避免抹掉 GUI 不认识的用户手写字段。
#[tauri::command]
pub fn write_models_config(patch: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = config::models_path()?;
    let original = config::read_json(&path)?;
    let merged = config::merge_top_level(&original, &patch);
    config::write_json(&path, &merged)?;
    // 回读校验：确认落盘内容可被正常解析，而不是只相信写入成功
    config::read_json(&path)
}

#[tauri::command]
pub fn read_app_settings() -> Result<serde_json::Value, String> {
    config::read_json(&config::settings_path()?)
}

#[tauri::command]
pub fn write_app_settings(patch: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = config::settings_path()?;
    let original = config::read_json(&path)?;
    let merged = config::merge_top_level(&original, &patch);
    config::write_json(&path, &merged)?;
    config::read_json(&path)
}

#[tauri::command]
pub fn get_agent_dir() -> Result<String, String> {
    data_dir::agent_dir().map(|p| p.to_string_lossy().into_owned())
}

/// 首次启动是否需要提示从 pi CLI 导入配置
#[tauri::command]
pub fn pi_import_offer() -> Result<Option<import::ImportOffer>, String> {
    import::offer()
}

#[tauri::command]
pub fn pi_import(options: import::ImportOptions) -> Result<Vec<String>, String> {
    import::run(&options)
}

#[tauri::command]
pub fn pi_import_skip() -> Result<(), String> {
    import::skip()
}

#[tauri::command]
pub fn read_global_instructions() -> Result<agent_resources::InstructionDoc, String> {
    agent_resources::read_global_instructions()
}

#[tauri::command]
pub fn write_global_instructions(
    content: String,
) -> Result<agent_resources::InstructionDoc, String> {
    agent_resources::write_global_instructions(&content)
}

#[tauri::command]
pub fn list_agent_skills(cwd: Option<String>) -> Result<Vec<agent_resources::SkillRecord>, String> {
    agent_resources::list_skills(cwd.as_deref())
}

#[tauri::command]
pub fn save_agent_skill(
    scope: String,
    cwd: Option<String>,
    slug: String,
    content: String,
) -> Result<agent_resources::SkillRecord, String> {
    agent_resources::save_skill(&scope, cwd.as_deref(), &slug, &content)
}

#[tauri::command]
pub fn delete_agent_skill(dir_path: String, cwd: Option<String>) -> Result<(), String> {
    agent_resources::delete_skill(&dir_path, cwd.as_deref())
}

#[tauri::command]
pub fn list_local_extensions() -> Result<Vec<agent_resources::ExtensionEntry>, String> {
    agent_resources::list_local_extensions()
}

#[tauri::command]
pub fn delete_local_extension(path: String) -> Result<(), String> {
    agent_resources::delete_local_extension(&path)
}

#[tauri::command]
pub fn read_mcp_config() -> Result<serde_json::Value, String> {
    agent_resources::read_mcp_config()
}

#[tauri::command]
pub fn write_mcp_config(patch: serde_json::Value) -> Result<serde_json::Value, String> {
    agent_resources::write_mcp_config(patch)
}

/* ---------- 内置终端 ---------- */

/// 开一个终端标签。id 由前端生成并在后续读写中沿用
#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.terminal.open(&app, id, cwd, cols, rows)
}

/// 把键盘输入送进终端
#[tauri::command]
pub fn terminal_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    state.terminal.write(&id, &data)
}

/// 终端尺寸变化时同步给 PTY，否则换行位置会错
#[tauri::command]
pub fn terminal_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.terminal.resize(&id, cols, rows)
}

#[tauri::command]
pub fn terminal_close(state: State<'_, AppState>, id: String) {
    state.terminal.close(&id);
}
