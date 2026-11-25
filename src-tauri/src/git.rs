use std::path::{Path, PathBuf};
use std::process::Command;

/// git 可执行文件的候选位置。
///
/// 与 pi 一样不能依赖 PATH——GUI 应用不继承 shell 环境。好在 git 的位置
/// 比 node 稳定得多：macOS 自带的 /usr/bin/git 由 Xcode CLT 提供，
/// 空环境下也能直接执行，homebrew 版本作为补充。
#[cfg(not(windows))]
const GIT_CANDIDATES: [&str; 3] = [
    "/usr/bin/git",
    "/opt/homebrew/bin/git",
    "/usr/local/bin/git",
];

#[cfg(not(windows))]
fn git_bin() -> Option<&'static str> {
    GIT_CANDIDATES.into_iter().find(|p| Path::new(p).is_file())
}

/// Windows 上 git 来自 Git for Windows，装在 Program Files 或经 winget/scoop 进 PATH。
/// 裸名字交给 CreateProcess 自己按 PATH 找，所以最后一个是 `git`。
#[cfg(windows)]
fn git_bin() -> Option<&'static str> {
    const CANDIDATES: [&str; 3] = [
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
        "git",
    ];
    CANDIDATES
        .into_iter()
        .find(|p| !p.contains('\\') || Path::new(p).is_file())
}

/// 所有 git 调用都从这里出去：Windows 上必须带 CREATE_NO_WINDOW，
/// 否则每读一次分支状态都会闪一个黑框
fn git_command(git: &str) -> Command {
    let mut command = Command::new(git);
    crate::win_console::hide_console_std(&mut command);
    command
}

/// 分支条目：区分本地分支与远程跟踪分支（含 `/` 的分支名也能准确区分）
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub remote: bool,
}

fn parse_for_each_ref(stdout: &str, current: Option<&str>) -> Vec<GitBranch> {
    let mut locals = Vec::new();
    let mut remotes = Vec::new();

    for line in stdout.lines() {
        let mut parts = line.split('\t');
        let Some(refname) = parts.next().map(str::trim) else {
            continue;
        };
        let Some(short) = parts.next().map(str::trim).filter(|s| !s.is_empty()) else {
            continue;
        };
        let symref = parts.next().map(str::trim).unwrap_or("");
        // 过滤 origin/HEAD 这类符号指针
        if !symref.is_empty() || short.ends_with("/HEAD") {
            continue;
        }
        if refname.starts_with("refs/heads/") {
            locals.push(GitBranch {
                name: short.to_string(),
                remote: false,
            });
        } else if refname.starts_with("refs/remotes/") && short.contains('/') {
            remotes.push(GitBranch {
                name: short.to_string(),
                remote: true,
            });
        }
    }

    // 当前本地分支置顶
    if let Some(name) = current {
        if let Some(pos) = locals.iter().position(|b| b.name == name) {
            let active = locals.remove(pos);
            locals.insert(0, active);
        }
    }

    locals.extend(remotes);
    locals
}

/// 列出本地与远程跟踪分支：本地分支在前（当前分支置顶），远程分支在后。
pub fn list_branches(cwd: &str) -> Result<Vec<GitBranch>, String> {
    let git = git_bin().ok_or("未找到 git 可执行文件")?;
    let output = git_command(git)
        .args([
            "for-each-ref",
            "--format=%(refname)%09%(refname:short)%09%(symref)",
            "refs/heads",
            "refs/remotes",
        ])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let current = current_branch(cwd);
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_for_each_ref(&stdout, current.as_deref()))
}

/// 同步远程仓库引用（非交互，避免弹窗/卡死凭证输入）
pub fn fetch_remotes(cwd: &str) -> Result<(), String> {
    let git = git_bin().ok_or("未找到 git 可执行文件")?;
    let output = git_command(git)
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(["fetch", "--all", "--prune"])
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;

    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

fn local_name_of_remote(git: &str, cwd: &str, remote_branch: &str) -> String {
    if let Ok(output) = git_command(git).args(["remote"]).current_dir(cwd).output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut remotes: Vec<&str> = text
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .collect();
            remotes.sort_by_key(|r| std::cmp::Reverse(r.len()));
            for remote_name in remotes {
                let prefix = format!("{remote_name}/");
                if let Some(rest) = remote_branch.strip_prefix(&prefix) {
                    if !rest.is_empty() {
                        return rest.to_string();
                    }
                }
            }
        }
    }
    remote_branch
        .split_once('/')
        .map_or_else(|| remote_branch.to_string(), |(_, rest)| rest.to_string())
}

fn local_branch_exists(git: &str, cwd: &str, local_name: &str) -> bool {
    let full_ref = format!("refs/heads/{local_name}");
    git_command(git)
        .args(["show-ref", "--verify", "--quiet", &full_ref])
        .current_dir(cwd)
        .status()
        .is_ok_and(|s| s.success())
}

/// 切换分支。
/// - `create` 为真：基于当前 HEAD 新建并检出本地分支；
/// - `remote` 为真：检出远程分支对应的本地跟踪分支（已有同名本地分支直接切换，
///   否则 `git checkout --track <remote_branch>`，避免落入分离头指针状态）。
pub fn checkout_branch(cwd: &str, branch: &str, create: bool, remote: bool) -> Result<(), String> {
    let git = git_bin().ok_or("未找到 git 可执行文件")?;
    let mut command = git_command(git);
    if create {
        command.args(["checkout", "-b", branch]);
    } else if remote {
        let local_name = local_name_of_remote(git, cwd, branch);
        if local_branch_exists(git, cwd, &local_name) {
            command.args(["checkout", &local_name]);
        } else {
            command.args(["checkout", "--track", branch]);
        }
    } else {
        command.args(["checkout", branch]);
    }

    let output = command
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
    let output = git_command(git)
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
pub fn diff(cwd: &str, path: Option<&str>) -> Result<String, String> {
    const MAX_BYTES: usize = 2 * 1024 * 1024;

    let git = git_bin().ok_or_else(|| "未找到 git".to_string())?;
    let mut command = git_command(git);
    command.args([
        "--literal-pathspecs",
        "diff",
        "--no-color",
        "--no-ext-diff",
        "HEAD",
    ]);
    if let Some(path) = path {
        command.args(["--", path]);
    }
    let mut output = command
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("执行 git 失败：{e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    if let Some(path) = path.filter(|_| output.stdout.is_empty()) {
        let untracked = git_command(git)
            .args([
                "--literal-pathspecs",
                "ls-files",
                "--others",
                "--exclude-standard",
                "--",
                path,
            ])
            .current_dir(cwd)
            .output()
            .map_err(|e| format!("执行 git 失败：{e}"))?;
        if untracked.status.success()
            && !untracked.stdout.is_empty()
            && Path::new(cwd).join(path).is_file()
        {
            output = git_command(git)
                .args([
                    "diff",
                    "--no-index",
                    "--no-color",
                    "--no-ext-diff",
                    "--",
                    "/dev/null",
                    path,
                ])
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("执行 git 失败：{e}"))?;
            if !output.status.success() && output.status.code() != Some(1) {
                return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
        }
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
    let output = git_command(git)
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
                result.push(Worktree {
                    path: p,
                    branch: std::mem::take(&mut branch),
                    is_main,
                });
            }
        }
    }
    // 最后一条记录后可能没有空行
    if let Some(p) = path {
        let is_main = result.is_empty();
        result.push(Worktree {
            path: p,
            branch,
            is_main,
        });
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
    let output = git_command(git)
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
        let name = reference
            .strip_prefix("refs/heads/")
            .or_else(|| reference.rsplit('/').next())
            .filter(|name| !name.is_empty());
        return name.map(str::to_string);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_local_and_remote_branches_and_filters_head_symref() {
        let raw = "\
refs/heads/dev\tdev\t
refs/heads/feat/login\tfeat/login\t
refs/heads/main\tmain\t
refs/remotes/origin/HEAD\torigin/HEAD\trefs/remotes/origin/main
refs/remotes/origin/main\torigin/main\t
refs/remotes/origin/release/v2\torigin/release/v2\t
";
        let branches = parse_for_each_ref(raw, Some("feat/login"));
        assert_eq!(
            branches,
            vec![
                GitBranch { name: "feat/login".into(), remote: false },
                GitBranch { name: "dev".into(), remote: false },
                GitBranch { name: "main".into(), remote: false },
                GitBranch { name: "origin/main".into(), remote: true },
                GitBranch { name: "origin/release/v2".into(), remote: true },
            ]
        );
    }
}
