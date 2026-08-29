use std::path::{Path, PathBuf};
use std::process::Command;

/// pi 的启动方式。
///
/// npm 全局安装的 `pi` 是一个指向 `dist/cli.js` 的符号链接，shebang 为
/// `#!/usr/bin/env node`。macOS 上双击启动的 .app **不继承 shell PATH**，
/// 因此直接 spawn "pi" 在打包后必定失败（`npm run tauri dev` 时反而正常，
/// 会掩盖这个问题）。这里把它拆成「node 绝对路径 + cli.js 绝对路径」，
/// 彻底摆脱对 PATH 和 `env node` 的依赖。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiLauncher {
    /// 实际执行的程序：node 解释器，或 pi 自身（若为原生二进制）
    pub program: PathBuf,
    /// 置于用户参数之前的参数：走 node 时为 cli.js 路径
    pub prefix_args: Vec<String>,
    /// 解析来源，用于设置页展示与排障
    pub source: String,
}

impl PiLauncher {
    /// 组装完整参数列表
    pub fn args_with(&self, extra: &[String]) -> Vec<String> {
        let mut args = self.prefix_args.clone();
        args.extend_from_slice(extra);
        args
    }
}

/// 按优先级解析 pi 的启动方式。
///
/// 顺序：用户手动指定 → login shell → 常见安装位置。
pub fn locate(user_override: Option<&str>) -> Option<PiLauncher> {
    if let Some(p) = user_override.filter(|s| !s.trim().is_empty()) {
        let path = PathBuf::from(p);
        if path.exists() {
            return build_launcher(&path, "用户指定");
        }
    }

    if let Some(path) = locate_via_login_shell() {
        return build_launcher(&path, "login shell");
    }

    locate_in_common_dirs().and_then(|path| build_launcher(&path, "常见安装位置"))
}

/// 通过 login shell 解析，这样能读到用户 profile 里的 nvm/fnm/volta 等配置。
fn locate_via_login_shell() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = Command::new(&shell)
        .args(["-lic", "command -v pi"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    // login shell 可能输出 profile 的额外内容，取最后一行非空结果
    let path = raw
        .lines()
        .map(str::trim)
        .rfind(|l| !l.is_empty())
        .map(PathBuf::from)?;

    path.exists().then_some(path)
}

/// 扫描常见安装位置。nvm 下有多个 node 版本时取最后一个（通常为最新）。
fn locate_in_common_dirs() -> Option<PathBuf> {
    let home = dirs::home_dir()?;

    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin/pi"),
        PathBuf::from("/usr/local/bin/pi"),
        home.join(".volta/bin/pi"),
        home.join(".bun/bin/pi"),
    ];

    // nvm / fnm 的多版本目录
    for base in [home.join(".nvm/versions/node"), home.join(".fnm/node-versions")] {
        if let Ok(entries) = std::fs::read_dir(&base) {
            let mut versions: Vec<PathBuf> = entries
                .filter_map(Result::ok)
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect();
            versions.sort();
            candidates.extend(versions.into_iter().flat_map(|v| {
                [v.join("bin/pi"), v.join("installation/bin/pi")]
            }));
        }
    }

    candidates.into_iter().rev().find(|p| p.exists())
}

/// 把一个 pi 路径转换成可靠的启动方式。
fn build_launcher(pi_path: &Path, source: &str) -> Option<PiLauncher> {
    // 解析符号链接，拿到 dist/cli.js 的真实位置
    let real = std::fs::canonicalize(pi_path).unwrap_or_else(|_| pi_path.to_path_buf());
    let is_js = real.extension().is_some_and(|e| e == "js" || e == "mjs" || e == "cjs");

    if !is_js {
        // 原生二进制（如 bun 编译版），直接执行
        return Some(PiLauncher {
            program: real,
            prefix_args: Vec::new(),
            source: source.to_string(),
        });
    }

    let node = find_node_for(pi_path)?;
    Some(PiLauncher {
        program: node,
        prefix_args: vec![real.to_string_lossy().into_owned()],
        source: source.to_string(),
    })
}

/// 找到能运行该 cli.js 的 node。
///
/// npm 全局安装布局下 `<prefix>/bin/pi` 与 `<prefix>/bin/node` 同级，
/// 优先取同级的那个，保证 node 版本与安装 pi 时一致。
fn find_node_for(pi_path: &Path) -> Option<PathBuf> {
    if let Some(sibling) = pi_path.parent().map(|d| d.join("node")) {
        if sibling.exists() {
            return Some(sibling);
        }
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let output = Command::new(&shell).args(["-lic", "command -v node"]).output().ok()?;
    let raw = String::from_utf8_lossy(&output.stdout);
    let path = raw
        .lines()
        .map(str::trim)
        .rfind(|l| !l.is_empty())
        .map(PathBuf::from)?;

    path.exists().then_some(path)
}
