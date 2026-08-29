use std::cmp::Reverse;
use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// 只读取文件开头这么多字节来提取元信息。
/// 会话文件可能有几十 MB，为了侧栏列表去整体解析是不可接受的；
/// header 与首条用户消息都在文件最前面，这个窗口足够。
const HEAD_BYTES: usize = 64 * 1024;

/// 侧栏单条会话
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    pub path: String,
    pub title: String,
    pub timestamp: String,
    pub modified_ms: u64,
}

/// 侧栏的项目分组
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroup {
    pub cwd: String,
    pub name: String,
    pub sessions: Vec<SessionMeta>,
    pub latest_ms: u64,
}

/// 扫描全部会话并按真实工作目录分组。
///
/// 注意不能用目录名反推路径：存储目录是把 `/` 替换成 `-` 得到的，
/// 该变换有损——`--Users-haha-Desktop-xinlian-h5-live-streaming--`
/// 的真实 cwd 其实是 `/Users/haha/Desktop/xinlian/h5-live-streaming`
/// （两级目录），反解会得到错误路径。真实 cwd 只能从文件头里读。
pub fn scan() -> Result<Vec<ProjectGroup>, String> {
    let root = dirs::home_dir()
        .ok_or("无法定位用户主目录")?
        .join(".pi/agent/sessions");

    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut groups: BTreeMap<String, ProjectGroup> = BTreeMap::new();

    let dirs_iter = std::fs::read_dir(&root).map_err(|e| e.to_string())?;
    for dir in dirs_iter.filter_map(Result::ok) {
        if !dir.path().is_dir() {
            continue;
        }
        let files = match std::fs::read_dir(dir.path()) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for file in files.filter_map(Result::ok) {
            let path = file.path();
            if path.extension().is_none_or(|e| e != "jsonl") {
                continue;
            }
            if let Some((cwd, meta)) = parse_session_head(&path) {
                let group = groups.entry(cwd.clone()).or_insert_with(|| ProjectGroup {
                    name: project_name_of(&cwd),
                    cwd,
                    sessions: Vec::new(),
                    latest_ms: 0,
                });
                group.latest_ms = group.latest_ms.max(meta.modified_ms);
                group.sessions.push(meta);
            }
        }
    }

    let mut result: Vec<ProjectGroup> = groups.into_values().collect();
    for group in &mut result {
        group.sessions.sort_by_key(|s| Reverse(s.modified_ms));
    }
    result.sort_by_key(|g| Reverse(g.latest_ms));
    Ok(result)
}

fn project_name_of(cwd: &str) -> String {
    Path::new(cwd)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| cwd.to_string())
}

/// 读取文件头部，提取 cwd 与会话元信息。
fn parse_session_head(path: &PathBuf) -> Option<(String, SessionMeta)> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; HEAD_BYTES];
    let n = file.read(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf[..n]);

    let modified_ms = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut cwd = None;
    let mut id = String::new();
    let mut timestamp = String::new();
    let mut explicit_name = None;
    let mut first_user_text = None;

    // 最后一行可能被 HEAD_BYTES 截断，跳过解析失败的行即可
    for line in text.lines() {
        let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        match entry.get("type").and_then(|t| t.as_str()) {
            Some("session") => {
                cwd = entry.get("cwd").and_then(|c| c.as_str()).map(str::to_string);
                id = entry.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                timestamp = entry
                    .get("timestamp")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
            }
            // 用户显式命名优先于从首条消息推断，取最后一次命名
            Some("session_info") => {
                if let Some(name) = entry.get("name").and_then(|n| n.as_str()) {
                    explicit_name = Some(name.to_string());
                }
            }
            Some("message") if first_user_text.is_none() => {
                first_user_text = extract_user_text(&entry);
            }
            _ => {}
        }
    }

    let title = explicit_name
        .or(first_user_text)
        .unwrap_or_else(|| "新对话".to_string());

    Some((
        cwd?,
        SessionMeta {
            id,
            path: path.to_string_lossy().into_owned(),
            title: truncate_title(&title),
            timestamp,
            modified_ms,
        },
    ))
}

/// 从 message 条目里取用户消息的纯文本。content 可能是字符串或内容块数组。
fn extract_user_text(entry: &serde_json::Value) -> Option<String> {
    let message = entry.get("message")?;
    if message.get("role")?.as_str()? != "user" {
        return None;
    }
    let content = message.get("content")?;

    if let Some(text) = content.as_str() {
        return non_empty(text);
    }

    content
        .as_array()?
        .iter()
        .find(|block| block.get("type").and_then(|t| t.as_str()) == Some("text"))
        .and_then(|block| block.get("text"))
        .and_then(|t| t.as_str())
        .and_then(non_empty)
}

fn non_empty(text: &str) -> Option<String> {
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// 侧栏一行放不下太长的标题，截断到合理长度；换行会破坏单行布局，一并压平。
fn truncate_title(title: &str) -> String {
    let flat = title.replace(['\n', '\r'], " ");
    let flat = flat.trim();
    let limit = 60;
    if flat.chars().count() <= limit {
        return flat.to_string();
    }
    flat.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::truncate_title;

    #[test]
    fn flattens_newlines_into_spaces() {
        assert_eq!(truncate_title("第一行\n第二行"), "第一行 第二行");
    }

    /// 按字符而非字节截断，否则中文标题会被切出半个字
    #[test]
    fn truncates_by_chars_not_bytes() {
        let title = "标".repeat(80);
        assert_eq!(truncate_title(&title).chars().count(), 60);
    }

    #[test]
    fn keeps_short_title_intact() {
        assert_eq!(truncate_title("  修复登录问题  "), "修复登录问题");
    }
}
