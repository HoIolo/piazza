use base64::Engine;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

/// 可用于「打开位置」的应用。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalApp {
    /// 展示名
    pub name: String,
    /// .app 的绝对路径，作为 `open -a` 的参数
    pub path: String,
    /// 应用图标的 data URI（PNG）。取不到时为 None，前端退回占位图标
    pub icon: Option<String>,
}

/// 候选应用：(展示名, 可执行文件路径)。
///
/// 只做存在性检查而不去查系统注册表/LaunchServices——后者要引平台绑定，
/// 而这里只需要知道「装没装」，这些路径在各平台上足够稳定。
#[cfg(target_os = "macos")]
const CANDIDATES: [(&str, &str); 8] = [
    ("VS Code", "/Applications/Visual Studio Code.app"),
    ("Cursor", "/Applications/Cursor.app"),
    ("Zed", "/Applications/Zed.app"),
    ("Sublime Text", "/Applications/Sublime Text.app"),
    ("WebStorm", "/Applications/WebStorm.app"),
    ("Xcode", "/Applications/Xcode.app"),
    ("iTerm", "/Applications/iTerm.app"),
    ("Terminal", "/System/Applications/Utilities/Terminal.app"),
];

/// Windows 上编辑器的安装位置分散在 Program Files 与 LOCALAPPDATA 下，
/// 这里只列最主流的几个；注册表里那些就不扫了，够用即可。
#[cfg(target_os = "windows")]
const CANDIDATES: [(&str, &str); 5] = [
    (
        "VS Code",
        r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe",
    ),
    ("Cursor", r"%LOCALAPPDATA%\Programs\cursor\Cursor.exe"),
    (
        "Sublime Text",
        r"%PROGRAMFILES%\Sublime Text\sublime_text.exe",
    ),
    ("Zed", r"%LOCALAPPDATA%\Programs\Zed\Zed.exe"),
    (
        "Windows Terminal",
        r"%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe",
    ),
];

/// 把候选里的 %VAR% 展开成真实路径；macOS 上原样返回
fn expand(path: &str) -> String {
    if !cfg!(windows) {
        return path.to_string();
    }
    let mut out = path.to_string();
    for (name, value) in std::env::vars() {
        // 环境变量名本身就是大写，替换时按 %NAME% 精确匹配即可
        out = out.replace(&format!("%{name}%"), &value);
    }
    out
}

/// 列出本机已安装的可用应用。系统文件管理器始终可用，排在最前。
pub fn list_apps() -> Vec<ExternalApp> {
    #[cfg(target_os = "macos")]
    let (explorer_name, explorer_icon) = (
        "访达",
        icon_data_uri("/System/Library/CoreServices/Finder.app"),
    );
    #[cfg(target_os = "windows")]
    let (explorer_name, explorer_icon) = ("资源管理器", None);

    let mut apps = vec![ExternalApp {
        name: explorer_name.into(),
        // 留空表示交给系统默认处理
        path: String::new(),
        icon: explorer_icon,
    }];

    apps.extend(
        CANDIDATES
            .iter()
            .map(|(name, path)| ((*name).to_string(), expand(path)))
            .filter(|(_, path)| Path::new(path).exists())
            .map(|(name, path)| ExternalApp {
                name,
                icon: icon_data_uri(&path),
                path,
            }),
    );

    apps
}

/// 从 .app 里读出 CFBundleIconFile 指向的 icns 路径
#[cfg(target_os = "macos")]
fn icns_path(app_path: &str) -> Option<PathBuf> {
    let plist = Path::new(app_path).join("Contents/Info.plist");
    let output = Command::new("/usr/bin/plutil")
        .args(["-extract", "CFBundleIconFile", "raw", "-o", "-"])
        .arg(&plist)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let mut name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() {
        return None;
    }
    // CFBundleIconFile 允许省略扩展名
    if !name.ends_with(".icns") {
        name.push_str(".icns");
    }

    let path = Path::new(app_path).join("Contents/Resources").join(name);
    path.exists().then_some(path)
}

/// 应用图标转成 32px 的 PNG data URI。
///
/// 用 sips 而不是引图形库：只是为了把 icns 缩成一张小图，
/// 为此拉一个解码库进来不划算。取不到就返回 None，前端自有占位。
#[cfg(target_os = "macos")]
fn icon_data_uri(app_path: &str) -> Option<String> {
    let icns = icns_path(app_path)?;
    let tmp = std::env::temp_dir().join(format!(
        "piazza-icon-{}.png",
        icns.file_stem()?.to_string_lossy()
    ));

    let ok = Command::new("/usr/bin/sips")
        .args(["-s", "format", "png", "-Z", "64"])
        .arg(&icns)
        .arg("--out")
        .arg(&tmp)
        .output()
        .ok()?
        .status
        .success();
    if !ok {
        return None;
    }

    let bytes = std::fs::read(&tmp).ok()?;
    let _ = std::fs::remove_file(&tmp);
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// Windows 没有 open -a，也没有统一的 .app 概念：直接执行 exe，
/// 空路径就交给 explorer。
#[cfg(target_os = "windows")]
fn icon_data_uri(_app_path: &str) -> Option<String> {
    // 从 exe 里抠图标要调 Win32 的 ExtractIconEx，为一行占位图标不值当；
    // 前端已有兜底图标，这里直接返回 None
    None
}

/// 用指定应用打开路径。`app_path` 为空时交给系统默认处理（访达 / 资源管理器）。
#[cfg(target_os = "macos")]
pub fn open_with(app_path: &str, target: &str) -> Result<(), String> {
    let mut cmd = Command::new("/usr/bin/open");
    if !app_path.is_empty() {
        cmd.arg("-a").arg(app_path);
    }
    cmd.arg(target);

    let output = cmd.output().map_err(|e| format!("调用 open 失败：{e}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[cfg(target_os = "windows")]
pub fn open_with(app_path: &str, target: &str) -> Result<(), String> {
    let mut cmd = if app_path.is_empty() {
        // explorer 对参数里的 / 不买账，目录统一换成反斜杠
        let mut c = Command::new("explorer");
        c.arg(target.replace('/', "\\"));
        c
    } else {
        let mut c = Command::new(app_path);
        c.arg(target);
        c
    };
    let output = cmd.output().map_err(|e| format!("调用应用失败：{e}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

/// 目标路径是文件、目录，还是不存在。
///
/// 正文里的文件链接要按这个分流：目录给「在访达中显示」，文件才给「复制文件内容」。
/// 单独一个命令而不是让前端猜，是因为 `Piazza.app` 这类名字看起来像文件、
/// 实际是目录，光看扩展名会判错。
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathKind {
    /// file / dir / missing
    pub kind: String,
}

pub fn path_kind(path: &str) -> PathKind {
    let kind = match std::fs::metadata(expand_home(path)) {
        Ok(meta) if meta.is_dir() => "dir",
        Ok(_) => "file",
        Err(_) => "missing",
    };
    PathKind { kind: kind.into() }
}

/// `~/x` 与 `~` 展开成真实家目录。前端传来的路径可能带 `~`，
/// `std::fs` 不认这种写法。
pub fn expand_home(path: &str) -> std::path::PathBuf {
    if path == "~" || path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(path.trim_start_matches("~/").trim_start_matches('~'));
        }
    }
    std::path::PathBuf::from(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `.app` 看起来像文件，实际是目录——只看扩展名会判错
    #[test]
    fn distinguishes_dir_from_file() {
        let dir = std::env::temp_dir().join("piazza-path-kind");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.txt");
        std::fs::write(&file, "x").unwrap();

        assert_eq!(path_kind(dir.to_str().unwrap()).kind, "dir");
        assert_eq!(path_kind(file.to_str().unwrap()).kind, "file");
        assert_eq!(path_kind("/definitely/not/here").kind, "missing");
    }

    /// 前端传来的路径可能是 `~/x`，std::fs 不认这种写法
    #[test]
    fn expands_tilde() {
        let home = dirs::home_dir().expect("应当有家目录");
        assert_eq!(expand_home("~"), home);
        assert_eq!(expand_home("~/x/y"), home.join("x/y"));
        assert_eq!(expand_home("/abs"), std::path::PathBuf::from("/abs"));
    }

    /// 图标提取依赖 plutil + sips 的实际行为，只有真跑一遍才知道对不对
    #[test]
    fn extracts_finder_icon() {
        let uri =
            icon_data_uri("/System/Library/CoreServices/Finder.app").expect("访达图标应能取到");
        assert!(
            uri.starts_with("data:image/png;base64,"),
            "前缀不对：{}",
            &uri[..40.min(uri.len())]
        );
        // 一张 64px 的 PNG 不会只有几十字节
        assert!(
            uri.len() > 1000,
            "图标数据过小，可能是空文件：{} 字节",
            uri.len()
        );
    }
}
