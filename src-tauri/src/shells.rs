use std::path::{Path, PathBuf};

/// 一种可选的终端 Shell。
///
/// `kind` 决定界面怎么显示和分组，`path` 是写进 settings.json 的 shellPath。
#[derive(serde::Serialize)]
pub struct ShellOption {
    pub kind: &'static str,
    pub label: String,
    pub path: String,
    /// 给用户看的一句话，说明这个选择的代价
    pub note: String,
}

/// 列出这台机器上真正可用的 Shell。
///
/// 只有 Windows 才有得选：macOS 和 Linux 上系统就那一个 shell，pi 自己解析得
/// 到，界面上摆一个下拉框只会让人以为还有别的选项。返回空列表，调用方据此
/// 整块不显示。
///
/// 顺序即推荐顺序：Git Bash 排在最前，因为它在 Windows 上访问本地磁盘走的是
/// Win32 API；WSL 的 bash 要经过 9p 协议跨虚拟机，同一个目录慢十几倍。
///
/// 只返回存在的路径——界面上不该出现一个选了就报错的选项。
pub fn detect() -> Vec<ShellOption> {
    if !cfg!(windows) {
        return Vec::new();
    }
    let mut found: Vec<ShellOption> = Vec::new();
    if let Some(path) = find_git_bash() {
        found.push(ShellOption {
            kind: "git-bash",
            label: "Git Bash".into(),
            path,
            note: "推荐。访问 C:/D: 盘走 Win32，比 WSL 快十几倍".into(),
        });
    }
    if let Some(path) = find_wsl_bash() {
        found.push(ShellOption {
            kind: "wsl",
            label: "WSL Bash".into(),
            path,
            note: "项目在 WSL 里时才选。访问 /mnt/c 要跨虚拟机，慢十几倍".into(),
        });
    }
    found
}

/// Git Bash 可能装在任何地方：官方安装包、Scoop、或者用户自己挪到了 D 盘。
///
/// 探测顺序：常见安装目录 → 从 PATH 上的 git.exe 反推。后者能覆盖绝大多数
/// 「装到别处」的情况——只要有 git 命令，它的同级目录里就有 bash。
fn find_git_bash() -> Option<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
        if let Ok(base) = std::env::var(var) {
            candidates.push(Path::new(&base).join("Git").join("bin").join("bash.exe"));
            candidates.push(
                Path::new(&base)
                    .join("Programs")
                    .join("Git")
                    .join("bin")
                    .join("bash.exe"),
            );
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        candidates.push(
            PathBuf::from(home)
                .join("scoop")
                .join("apps")
                .join("git")
                .join("current")
                .join("bin")
                .join("bash.exe"),
        );
    }
    candidates.extend(from_git_on_path());
    candidates.into_iter().find(|p| p.is_file()).map(display)
}

/// 顺着 PATH 上的 git.exe 找同装的 bash.exe。
///
/// Git for Windows 的布局是 `<root>\cmd\git.exe` 与 `<root>\bin\bash.exe`，
/// 所以从 git.exe 往上退两级再进 bin 即可。这样即使用户把 Git 装在 D 盘
/// 或者便携版目录里也能认出来。
fn from_git_on_path() -> Vec<PathBuf> {
    let mut found = Vec::new();
    let Some(path) = std::env::var_os("PATH") else {
        return found;
    };
    for dir in std::env::split_paths(&path) {
        for exe in ["git.exe", "git"] {
            if !dir.join(exe).is_file() {
                continue;
            }
            if let Some(root) = dir.parent() {
                found.push(root.join("bin").join("bash.exe"));
                found.push(root.join("usr").join("bin").join("bash.exe"));
            }
        }
    }
    found
}

/// WSL 的 bash 是系统自带的启动器，位置固定。
///
/// 装在 System32 说明它一定存在，但是否真装了发行版要跑起来才知道——
/// 这里只看文件在不在，选错了 pi 会给出明确报错，比这里猜更可靠。
fn find_wsl_bash() -> Option<String> {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    let path = Path::new(&root).join("System32").join("bash.exe");
    path.is_file().then(|| display(path))
}

/// 统一成 Windows 反斜杠路径，写进 JSON 时不必再转义正斜杠
fn display(path: PathBuf) -> String {
    path.to_string_lossy().replace('/', "\\")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_detected_shell_exists() {
        for shell in detect() {
            assert!(
                Path::new(&shell.path).is_file(),
                "{} 指向了不存在的路径 {}",
                shell.label,
                shell.path
            );
        }
    }

    #[test]
    fn detected_paths_use_backslashes() {
        for shell in detect() {
            assert!(!shell.path.contains('/'), "{} 含正斜杠：{}", shell.label, shell.path);
        }
    }

    /// 非 Windows 上一个都不该返回：那里没有「选哪个 shell」这回事
    #[test]
    fn only_windows_offers_choices() {
        if !cfg!(windows) {
            assert!(detect().is_empty());
        }
    }
}
