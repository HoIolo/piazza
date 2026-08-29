use std::path::{Path, PathBuf};
use std::process::Command;

/// git 可执行文件的候选位置。
///
/// 与 pi 一样不能依赖 PATH——GUI 应用不继承 shell 环境。好在 git 的位置
/// 比 node 稳定得多：macOS 自带的 /usr/bin/git 由 Xcode CLT 提供，
/// 空环境下也能直接执行，homebrew 版本作为补充。
const GIT_CANDIDATES: [&str; 3] = ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];

fn git_bin() -> Option<&'static str> {
    GIT_CANDIDATES
        .into_iter()
        .find(|p| Path::new(p).is_file())
}

/// 列出本地分支名，当前分支排在最前。
pub fn list_branches(cwd: &str) -> Result<Vec<String>, String> {
    let git = git_bin().ok_or("未找到 git 可执行文件")?;
    let output = Command::new(git)
        .args(["branch", "--format=%(refname:short)"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let current = current_branch(cwd);
    let mut branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect();

    // 当前分支置顶，与 Codex 的分支菜单一致
    if let Some(name) = current {
        if let Some(pos) = branches.iter().position(|b| *b == name) {
            branches.swap(0, pos);
        }
    }
    Ok(branches)
}

/// 切换分支。`create` 为真时新建并检出。
///
/// 工作区有未提交更改且与目标分支冲突时 git 会拒绝切换，这里把它的
/// 原始错误原样上报——用户需要看到究竟是哪个文件挡住了。
pub fn checkout_branch(cwd: &str, branch: &str, create: bool) -> Result<(), String> {
    let git = git_bin().ok_or("未找到 git 可执行文件")?;
    let mut args = vec!["checkout"];
    if create {
        args.push("-b");
    }
    args.push(branch);

    let output = Command::new(git)
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;

    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

/// 工作区改动统计，用于右侧面板的「变更」一行。
pub fn diff_stat(cwd: &str) -> Option<(u32, u32)> {
    let git = git_bin()?;
    let output = Command::new(git)
        .args(["diff", "--numstat", "HEAD"])
        .current_dir(cwd)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let mut added = 0u32;
    let mut removed = 0u32;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut parts = line.split('\t');
        // 二进制文件的增删列是 "-"，跳过即可
        let a = parts.next().and_then(|v| v.parse::<u32>().ok());
        let r = parts.next().and_then(|v| v.parse::<u32>().ok());
        added += a.unwrap_or(0);
        removed += r.unwrap_or(0);
    }
    Some((added, removed))
}


/// 工作区完整 diff，供右侧面板的「审阅」视图渲染。
///
/// 用 `--no-color`：颜色由前端按行首字符上色，混进 ANSI 转义只会碍事。
/// 上限 2MB——超大 diff 渲染起来会卡死界面，且人也不会真去逐行看。
pub fn diff(cwd: &str) -> Result<String, String> {
    const MAX_BYTES: usize = 2 * 1024 * 1024;

    let git = git_bin().ok_or_else(|| "未找到 git".to_string())?;
    let output = Command::new(git)
        .args(["diff", "--no-color", "HEAD"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    if text.len() > MAX_BYTES {
        // 从字符边界处截断，避免把多字节字符切成两半
        let mut end = MAX_BYTES;
        while end > 0 && !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
        text.push_str("\n… diff 过长，已截断");
    }
    Ok(text)
}

/// 一个 git worktree
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: String,
    /// 是否为主工作区（仓库本体）
    pub is_main: bool,
}

/// 列出全部 worktree。
///
/// 解析 `git worktree list --porcelain`：它按空行分隔记录，每条形如
/// `worktree <path>` / `HEAD <sha>` / `branch refs/heads/<name>`。
pub fn list_worktrees(cwd: &str) -> Result<Vec<Worktree>, String> {
    let git = git_bin().ok_or("未找到 git 可执行文件")?;
    let output = Command::new(git)
        .args(["worktree", "list", "--porcelain"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut result = Vec::new();
    let mut path: Option<String> = None;
    let mut branch = String::new();

    for line in text.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            path = Some(p.to_string());
            branch.clear();
        } else if let Some(b) = line.strip_prefix("branch ") {
            branch = b.rsplit('/').next().unwrap_or(b).to_string();
        } else if line.is_empty() {
            if let Some(p) = path.take() {
                // 首条记录即主工作区，git 保证这个顺序
                let is_main = result.is_empty();
                result.push(Worktree { path: p, branch: std::mem::take(&mut branch), is_main });
            }
        }
    }
    // 最后一条记录后可能没有空行
    if let Some(p) = path {
        let is_main = result.is_empty();
        result.push(Worktree { path: p, branch, is_main });
    }

    Ok(result)
}

/// 新建 worktree。目录建在仓库同级的 `<仓库名>-<分支名>`，
/// 放在仓库内部会被 git 自己扫描到，造成嵌套仓库的困扰。
pub fn add_worktree(cwd: &str, branch: &str) -> Result<String, String> {
    let git = git_bin().ok_or("未找到 git 可执行文件")?;
    let base = Path::new(cwd);
    let repo_name = base
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "repo".into());
    let safe_branch = branch.replace('/', "-");
    let target = base
        .parent()
        .ok_or("无法定位仓库上级目录")?
        .join(format!("{repo_name}-{safe_branch}"));

    if target.exists() {
        return Err(format!("目录已存在：{}", target.to_string_lossy()));
    }

    let target_str = target.to_string_lossy().into_owned();
    let output = Command::new(git)
        .args(["worktree", "add", "-b", branch, &target_str])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;

    if output.status.success() {
        return Ok(target_str);
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

/// 读取工作目录当前的 git 分支名。
///
/// 直接解析 .git/HEAD 而不调用 git 命令：这是最高频的调用（每次切项目都要），
/// 只为一个展示用的分支名 spawn 进程不划算。
pub fn current_branch(cwd: &str) -> Option<String> {
    let git_path = Path::new(cwd).join(".git");
    let git_dir = resolve_git_dir(&git_path)?;
    let head = std::fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();

    if let Some(reference) = head.strip_prefix("ref: ") {
        return reference
            .rsplit('/')
            .next()
            .filter(|name| !name.is_empty())
            .map(str::to_string);
    }

    // 分离头指针状态：退回短 hash
    (head.len() >= 7).then(|| head[..7].to_string())
}

/// worktree 与子模块里 .git 是一个指向真实目录的文件，需要跟随一层
fn resolve_git_dir(git_path: &Path) -> Option<PathBuf> {
    if git_path.is_dir() {
        return Some(git_path.to_path_buf());
    }
    if !git_path.is_file() {
        return None;
    }

    let content = std::fs::read_to_string(git_path).ok()?;
    let target = content.trim().strip_prefix("gitdir: ")?;
    let target_path = PathBuf::from(target);

    Some(if target_path.is_absolute() {
        target_path
    } else {
        git_path.parent()?.join(target_path)
    })
}
