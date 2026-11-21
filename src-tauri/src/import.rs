//! 首次启动时把 pi CLI 的配置搬进应用自有目录。
//!
//! 只读 `~/.pi/agent`，写 `<data_root>/agent`：搬完两边各写各的，
//! 不会出现「两个进程同时改 auth.json」这种互相打架的情况。
//! 会话是可选项——不搬就看不到终端里的历史，搬了则历史留在新目录。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 会从 pi 目录搬过来的条目。存在才复制，目录递归。
const ITEMS: [&str; 14] = [
    "auth.json",
    "models.json",
    "settings.json",
    "keybindings.json",
    "mcp.json",
    "AGENTS.md",
    "AGENTS.override.md",
    "CLAUDE.md",
    "SYSTEM.md",
    "APPEND_SYSTEM.md",
    "skills",
    "extensions",
    "prompts",
    "themes",
];

const SESSIONS: &str = "sessions";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    pub include_sessions: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOffer {
    pub source: String,
    pub target: String,
    /// 可导入的条目名，供界面列出来
    pub items: Vec<String>,
    pub session_count: usize,
}

/// 要不要弹导入框。
///
/// 三种情况不问：已经问过（有标记）、目标目录已经在用（有自己的配置）、
/// 来源根本不存在。改目录后第一次启动才会落到第一个分支。
pub fn offer() -> Result<Option<ImportOffer>, String> {
    offer_between(
        &crate::data_dir::cli_agent_dir()?,
        &crate::data_dir::agent_dir()?,
        &marker_path()?,
    )
}

fn offer_between(
    source: &Path,
    target: &Path,
    marker: &Path,
) -> Result<Option<ImportOffer>, String> {
    if marker.exists() {
        return Ok(None);
    }
    if !source.is_dir() || target_in_use(target) {
        return Ok(None);
    }
    let items = existing_items(source);
    let session_count = count_sessions(&source.join(SESSIONS))?;
    if items.is_empty() && session_count == 0 {
        return Ok(None);
    }
    Ok(Some(ImportOffer {
        source: source.to_string_lossy().into_owned(),
        target: target.to_string_lossy().into_owned(),
        items,
        session_count,
    }))
}

/// 执行导入。返回真正复制过去的条目名。
pub fn run(options: &ImportOptions) -> Result<Vec<String>, String> {
    let copied = copy_from(
        &crate::data_dir::cli_agent_dir()?,
        &crate::data_dir::agent_dir()?,
        options,
    )?;
    mark_done()?;
    Ok(copied)
}

fn copy_from(source: &Path, target: &Path, options: &ImportOptions) -> Result<Vec<String>, String> {
    std::fs::create_dir_all(target).map_err(|e| format!("创建 {target:?} 失败：{e}"))?;

    let mut copied = existing_items(source);
    for name in &copied {
        copy_entry(&source.join(name), &target.join(name))?;
    }
    let sessions = source.join(SESSIONS);
    if options.include_sessions && sessions.is_dir() {
        copy_entry(&sessions, &target.join(SESSIONS))?;
        copied.push(SESSIONS.to_string());
    }
    Ok(copied)
}

/// 用户选择「不用导入」。留个标记，下次启动不再问。
pub fn skip() -> Result<(), String> {
    mark_done()
}

fn target_in_use(target: &Path) -> bool {
    ["auth.json", "settings.json", "models.json"]
        .iter()
        .any(|name| target.join(name).exists())
}

fn existing_items(source: &Path) -> Vec<String> {
    ITEMS
        .iter()
        .filter(|name| source.join(name).exists())
        .map(|name| (*name).to_string())
        .collect()
}

fn count_sessions(dir: &Path) -> Result<usize, String> {
    if !dir.is_dir() {
        return Ok(0);
    }
    let mut count = 0;
    let groups = std::fs::read_dir(dir).map_err(|e| format!("读取 {dir:?} 失败：{e}"))?;
    for group in groups.filter_map(Result::ok) {
        let Ok(entries) = std::fs::read_dir(group.path()) else {
            continue;
        };
        count += entries
            .filter_map(Result::ok)
            .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "jsonl"))
            .count();
    }
    Ok(count)
}

fn marker_path() -> Result<PathBuf, String> {
    Ok(crate::data_dir::data_root()?.join(".pi-import-done"))
}

fn mark_done() -> Result<(), String> {
    let marker = marker_path()?;
    if let Some(parent) = marker.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 {parent:?} 失败：{e}"))?;
    }
    std::fs::write(&marker, b"").map_err(|e| format!("写入 {marker:?} 失败：{e}"))
}

/// 复制文件或目录。目标已存在的一律保留，不覆盖用户已经改过的东西。
fn copy_entry(from: &Path, to: &Path) -> Result<(), String> {
    if from.is_dir() {
        std::fs::create_dir_all(to).map_err(|e| format!("创建 {to:?} 失败：{e}"))?;
        let entries = std::fs::read_dir(from).map_err(|e| format!("读取 {from:?} 失败：{e}"))?;
        for entry in entries.filter_map(Result::ok) {
            copy_entry(&entry.path(), &to.join(entry.file_name()))?;
        }
        return Ok(());
    }
    if to.exists() {
        return Ok(());
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建 {parent:?} 失败：{e}"))?;
    }
    std::fs::copy(from, to).map_err(|e| format!("复制 {from:?} → {to:?} 失败：{e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{copy_entry, copy_from, count_sessions, offer_between, ImportOptions};

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("piazza-import-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("创建临时目录");
        dir
    }

    #[test]
    fn copies_nested_dirs_without_overwriting() {
        let root = temp_dir("nested");
        let from = root.join("src");
        let to = root.join("dst");
        std::fs::create_dir_all(from.join("skills/demo")).unwrap();
        std::fs::write(from.join("skills/demo/SKILL.md"), "new").unwrap();
        std::fs::create_dir_all(&to).unwrap();
        std::fs::write(to.join("keep.txt"), "keep").unwrap();

        copy_entry(&from.join("skills"), &to.join("skills")).unwrap();
        assert_eq!(
            std::fs::read_to_string(to.join("skills/demo/SKILL.md")).unwrap(),
            "new"
        );
        // 目标已有的文件不被覆盖
        std::fs::write(to.join("skills/demo/SKILL.md"), "edited").unwrap();
        copy_entry(&from.join("skills"), &to.join("skills")).unwrap();
        assert_eq!(
            std::fs::read_to_string(to.join("skills/demo/SKILL.md")).unwrap(),
            "edited"
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn offers_import_only_for_a_fresh_target() {
        let root = temp_dir("offer");
        let source = root.join("pi");
        let target = root.join("piazza/agent");
        let marker = root.join("piazza/.pi-import-done");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("auth.json"), "{}").unwrap();
        std::fs::create_dir_all(source.join("sessions/proj")).unwrap();
        std::fs::write(source.join("sessions/proj/a.jsonl"), "{}").unwrap();

        let offer = offer_between(&source, &target, &marker)
            .unwrap()
            .expect("应提示导入");
        assert_eq!(offer.session_count, 1);
        assert!(offer.items.iter().any(|item| item == "auth.json"));

        // 目标已经在用（有自己的配置）就不再问
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("auth.json"), "{}").unwrap();
        assert!(offer_between(&source, &target, &marker).unwrap().is_none());

        // 问过之后也不再问
        std::fs::remove_dir_all(&target).unwrap();
        std::fs::write(&marker, b"").unwrap();
        assert!(offer_between(&source, &target, &marker).unwrap().is_none());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn copies_sessions_only_when_asked() {
        let root = temp_dir("sessions-copy");
        let source = root.join("pi");
        let target = root.join("agent");
        std::fs::create_dir_all(source.join("sessions/proj")).unwrap();
        std::fs::write(source.join("sessions/proj/a.jsonl"), "{}").unwrap();
        std::fs::write(source.join("models.json"), "{}").unwrap();

        let copied = copy_from(
            &source,
            &target,
            &ImportOptions {
                include_sessions: false,
            },
        )
        .unwrap();
        assert!(copied.iter().any(|name| name == "models.json"));
        assert!(!target.join("sessions").exists());

        let copied = copy_from(
            &source,
            &target,
            &ImportOptions {
                include_sessions: true,
            },
        )
        .unwrap();
        assert!(copied.iter().any(|name| name == "sessions"));
        assert!(target.join("sessions/proj/a.jsonl").is_file());
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn counts_sessions_across_project_folders() {
        let root = temp_dir("sessions");
        std::fs::create_dir_all(root.join("proj-a")).unwrap();
        std::fs::create_dir_all(root.join("proj-b")).unwrap();
        std::fs::write(root.join("proj-a/one.jsonl"), "{}").unwrap();
        std::fs::write(root.join("proj-b/two.jsonl"), "{}").unwrap();
        std::fs::write(root.join("proj-b/notes.txt"), "").unwrap();
        assert_eq!(count_sessions(&root).unwrap(), 2);
        std::fs::remove_dir_all(&root).unwrap();
    }
}
