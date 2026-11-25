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
pub async fn scan_sessions() -> Result<Vec<ProjectGroup>, String> {
    tauri::async_runtime::spawn_blocking(sessions::scan)
        .await
        .map_err(|err| err.to_string())?
}

/// 把一条会话记录移进废纸篓
#[tauri::command]
pub fn trash_session(path: String) -> Result<(), String> {
    sessions::trash(&path)
}

/// 原地截断会话文件，只保留目标用户消息之前的历史，供编辑重发复用原会话
#[tauri::command]
pub async fn truncate_session_before(path: String, entry_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || sessions::truncate_before(&path, &entry_id))
        .await
        .map_err(|err| err.to_string())?
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

/// 列出本地与远程跟踪分支，供分支选择器展示
#[tauri::command]
pub async fn list_git_branches(cwd: String) -> Result<Vec<git::GitBranch>, String> {
    tauri::async_runtime::spawn_blocking(move || git::list_branches(&cwd))
        .await
        .map_err(|err| err.to_string())?
}

/// 拉取远程分支最新引用
#[tauri::command]
pub async fn fetch_git_remotes(cwd: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || git::fetch_remotes(&cwd))
        .await
        .map_err(|err| err.to_string())?
}

/// 切换或新建分支（支持直接检出远程跟踪分支）。会改动工作区，失败时把 git 的原始错误上报给用户
#[tauri::command]
pub async fn checkout_git_branch(
    cwd: String,
    branch: String,
    create: bool,
    remote: Option<bool>,
) -> Result<(), String> {
    let is_remote = remote.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || git::checkout_branch(&cwd, &branch, create, is_remote))
        .await
        .map_err(|err| err.to_string())?
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

/// 列出可选的终端 Shell，供设置界面做切换。
///
/// 探测放在 Rust 侧而不是前端：要看真实文件系统，还得顺着 PATH 反推 git 的
/// 安装位置，这些在前端都做不了。
#[tauri::command]
pub fn list_shells() -> Vec<crate::shells::ShellOption> {
    crate::shells::detect()
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

/* ---------- 内置记忆系统（全局 + 按项目隔离） ---------- */

#[tauri::command]
pub async fn list_memories(cwd: Option<String>) -> Result<crate::memory::MemoryOverview, String> {
    tauri::async_runtime::spawn_blocking(move || crate::memory::list(cwd.as_deref()))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn save_memory(
    cwd: Option<String>,
    input: crate::memory::SaveMemoryInput,
) -> Result<crate::memory::MemoryItem, String> {
    tauri::async_runtime::spawn_blocking(move || crate::memory::save(cwd.as_deref(), input))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn delete_memory(
    cwd: Option<String>,
    scope: String,
    id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::memory::delete(cwd.as_deref(), &scope, &id))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn clear_memories(cwd: Option<String>, scope: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::memory::clear(cwd.as_deref(), &scope))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn clear_memory_handoff(cwd: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || crate::memory::clear_handoff(&cwd))
        .await
        .map_err(|err| err.to_string())?
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
