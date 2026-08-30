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

/// 候选应用：(展示名, .app 路径)。
///
/// 只做存在性检查而不去查 LaunchServices——后者要引 objc 绑定，
/// 而这里只需要知道「装没装」，路径在 macOS 上足够稳定。
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

/// 列出本机已安装的可用应用。访达始终可用，排在最前。
pub fn list_apps() -> Vec<ExternalApp> {
    const FINDER: &str = "/System/Library/CoreServices/Finder.app";

    let mut apps = vec![ExternalApp {
        name: "访达".into(),
        // 留空表示交给系统默认处理，但图标仍取访达本体的
        path: String::new(),
        icon: icon_data_uri(FINDER),
    }];

    apps.extend(
        CANDIDATES
            .iter()
            .filter(|(_, path)| Path::new(path).exists())
            .map(|(name, path)| ExternalApp {
                name: (*name).to_string(),
                path: (*path).to_string(),
                icon: icon_data_uri(path),
            }),
    );

    apps
}

/// 从 .app 里读出 CFBundleIconFile 指向的 icns 路径
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

/// 用指定应用打开路径。`app_path` 为空时交给系统默认处理（即访达）。
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

#[cfg(test)]
mod tests {
    use super::*;

    /// 图标提取依赖 plutil + sips 的实际行为，只有真跑一遍才知道对不对
    #[test]
    fn extracts_finder_icon() {
        let uri = icon_data_uri("/System/Library/CoreServices/Finder.app")
            .expect("访达图标应能取到");
        assert!(uri.starts_with("data:image/png;base64,"), "前缀不对：{}", &uri[..40.min(uri.len())]);
        // 一张 64px 的 PNG 不会只有几十字节
        assert!(uri.len() > 1000, "图标数据过小，可能是空文件：{} 字节", uri.len());
    }
}
