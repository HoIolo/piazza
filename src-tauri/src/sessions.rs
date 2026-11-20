use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead, BufReader, Read};
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

/// 切换会话时的本地磁盘快照，让界面在 pi 冷启/切换前先秒开消息流
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub session_name: Option<String>,
    pub messages: Vec<serde_json::Value>,
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

/// 把一条会话移进废纸篓。
///
/// 移而不删：会话记录是用户的东西，手滑了还能从废纸篓捞回来。
/// 路径来自前端，必须先确认它确实是会话目录下的 .jsonl——
/// 否则这个命令就成了「把任意文件丢进废纸篓」的通道。
pub fn trash(path: &str) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("无法定位用户主目录")?;
    let root = home
        .join(".pi/agent/sessions")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target = Path::new(path).canonicalize().map_err(|e| e.to_string())?;

    if !target.starts_with(&root) || target.extension().is_none_or(|e| e != "jsonl") {
        return Err("只能删除会话记录文件".into());
    }

    let name = target.file_name().ok_or("会话路径无效")?;
    let trash = home.join(".Trash");
    let mut dest = trash.join(name);
    if dest.exists() {
        // 废纸篓里已有同名文件时补上时间戳，不覆盖先前删掉的那份
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis());
        dest = trash.join(format!("{stamp}-{}", name.to_string_lossy()));
    }
    std::fs::rename(&target, &dest).map_err(|e| e.to_string())
}

/// 从磁盘直接解析某条会话当前活跃分支的消息快照。
///
/// 与 pi 的 `buildSessionContext` 逻辑一致：沿 `parentId` 从最新叶节点回溯到根，
/// 遇到 compaction 时从 `firstKeptEntryId` 起保留，避免跨项目切换时苦等 pi 冷启。
pub fn read_snapshot(path: &str) -> Result<SessionSnapshot, String> {
    let home = dirs::home_dir().ok_or("无法定位用户主目录")?;
    let root = home
        .join(".pi/agent/sessions")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target = Path::new(path).canonicalize().map_err(|e| e.to_string())?;

    if !target.starts_with(&root) || target.extension().is_none_or(|e| e != "jsonl") {
        return Err("只能读取会话记录文件".into());
    }

    let file = std::fs::File::open(&target).map_err(|e| e.to_string())?;
    Ok(parse_snapshot(BufReader::new(file)))
}

struct RawEntry {
    id: String,
    parent_id: Option<String>,
    kind: String,
    message: Option<serde_json::Value>,
    first_kept_id: Option<String>,
    name: Option<String>,
}

fn parse_snapshot<R: BufRead>(reader: R) -> SessionSnapshot {
    let mut entries: Vec<RawEntry> = Vec::new();
    let mut by_id: HashMap<String, usize> = HashMap::new();

    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let Some(kind) = val.get("type").and_then(|v| v.as_str()).map(str::to_string) else {
            continue;
        };
        if kind == "session" {
            continue;
        }
        let Some(id) = val.get("id").and_then(|v| v.as_str()).map(str::to_string) else {
            continue;
        };
        let parent_id = val
            .get("parentId")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let first_kept_id = val
            .get("firstKeptEntryId")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let name = if kind == "session_info" {
            val.get("name").and_then(|v| v.as_str()).map(str::to_string)
        } else {
            None
        };
        let message = if kind == "message" {
            val.get_mut("message").map(serde_json::Value::take)
        } else {
            None
        };

        let idx = entries.len();
        by_id.insert(id.clone(), idx);
        entries.push(RawEntry {
            id,
            parent_id,
            kind,
            message,
            first_kept_id,
            name,
        });
    }

    let Some(mut cur_idx) = entries.len().checked_sub(1) else {
        return SessionSnapshot {
            session_name: None,
            messages: Vec::new(),
        };
    };

    // 沿 parentId 回溯出从根到叶的活跃分支
    let mut branch: Vec<usize> = Vec::new();
    let mut visited = 0usize;
    loop {
        branch.push(cur_idx);
        visited += 1;
        if visited > entries.len() {
            break;
        }
        match entries[cur_idx].parent_id.as_deref().and_then(|p| by_id.get(p)) {
            Some(&next) => cur_idx = next,
            None => break,
        }
    }
    branch.reverse();

    let mut session_name = None;
    let mut last_compaction: Option<(usize, Option<String>)> = None;
    for (pos, &idx) in branch.iter().enumerate() {
        let entry = &entries[idx];
        if entry.kind == "session_info" && entry.name.is_some() {
            session_name = entry.name.clone();
        }
        if entry.kind == "compaction" {
            last_compaction = Some((pos, entry.first_kept_id.clone()));
        }
    }

    let active_indices: Vec<usize> = match last_compaction {
        Some((comp_pos, Some(first_kept))) => {
            let mut kept = Vec::new();
            let mut found = false;
            for &idx in &branch[..comp_pos] {
                if entries[idx].id == first_kept {
                    found = true;
                }
                if found {
                    kept.push(idx);
                }
            }
            kept.extend_from_slice(&branch[comp_pos + 1..]);
            kept
        }
        Some((comp_pos, None)) => branch[comp_pos + 1..].to_vec(),
        None => branch,
    };

    let mut messages = Vec::new();
    for idx in active_indices {
        if let Some(mut msg) = entries[idx].message.take() {
            normalize_snapshot_message(&mut msg);
            messages.push(msg);
        }
    }

    SessionSnapshot {
        session_name,
        messages,
    }
}

/// 单条工具输出在前端快照中的最大字符数，避免几 MB 的文件读取结果卡住 IPC 序列化
const MAX_TOOL_RESULT_CHARS: usize = 24_000;

fn normalize_snapshot_message(msg: &mut serde_json::Value) {
    let Some(obj) = msg.as_object_mut() else {
        return;
    };
    if obj.get("content").is_none_or(|c| c.is_null()) {
        obj.insert("content".into(), serde_json::Value::Array(Vec::new()));
        return;
    }
    let is_tool = obj.get("role").and_then(|r| r.as_str()) == Some("toolResult");
    if !is_tool {
        return;
    }
    if let Some(blocks) = obj.get_mut("content").and_then(|c| c.as_array_mut()) {
        for block in blocks {
            if let Some(text_val) = block.get_mut("text") {
                if let Some(s) = text_val.as_str() {
                    if s.len() > MAX_TOOL_RESULT_CHARS && s.chars().count() > MAX_TOOL_RESULT_CHARS {
                        let clipped: String = s.chars().take(MAX_TOOL_RESULT_CHARS).collect();
                        *text_val = serde_json::Value::String(format!("{clipped}\n…[内容过长已截断]"));
                    }
                }
            }
        }
    }
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
    use std::io::Cursor;

    use super::{parse_snapshot, truncate_title};

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

    #[test]
    fn snapshot_follows_leaf_branch_and_compaction() {
        let jsonl = [
            r#"{"type":"session","id":"s1","cwd":"/tmp/demo"}"#,
            r#"{"type":"message","id":"m1","parentId":null,"message":{"role":"user","content":"old"}}"#,
            r#"{"type":"message","id":"m2","parentId":"m1","message":{"role":"assistant","content":[]}}"#,
            r#"{"type":"message","id":"m_fork","parentId":"m1","message":{"role":"user","content":"abandoned"}}"#,
            r#"{"type":"message","id":"m3","parentId":"m2","message":{"role":"user","content":"kept"}}"#,
            r#"{"type":"compaction","id":"c1","parentId":"m3","firstKeptEntryId":"m3","summary":"sum"}"#,
            r#"{"type":"session_info","id":"i1","parentId":"c1","name":"我的会话"}"#,
            r#"{"type":"message","id":"m4","parentId":"i1","message":{"role":"assistant","content":null}}"#,
        ]
        .join("\n");

        let snap = parse_snapshot(Cursor::new(jsonl.as_bytes()));
        assert_eq!(snap.session_name.as_deref(), Some("我的会话"));
        assert_eq!(snap.messages.len(), 2);
        assert_eq!(snap.messages[0]["content"], "kept");
        assert!(snap.messages[1]["content"].is_array());
    }
}
