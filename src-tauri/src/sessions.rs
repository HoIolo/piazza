use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use serde::Serialize;

/// 取标题时最多读到这么多字节。
///
/// 不能用「读前 N 字节再按行切」的老办法：一条带图的用户消息单行就能有
/// 200KB 以上，按字节窗口切开会把 JSON 从中间劈断，解析失败后标题退化成
/// 「新对话」，点进会话才被前端补上——表现就是「标题自己变了」。
/// 这里改成逐行流式读（与 pi 的 buildSessionInfo 一致），窗口只限制总量。
const TITLE_SCAN_BYTES: usize = 1024 * 1024;

/// 用户显式改名写在文件尾部，单独从末尾倒着找，避免为了一个名字扫全文。
const TAIL_BYTES: usize = 64 * 1024;

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
    let root = crate::data_dir::sessions_dir()?;

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
    let root = crate::data_dir::sessions_dir()?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target = Path::new(path).canonicalize().map_err(|e| e.to_string())?;

    if !target.starts_with(&root) || target.extension().is_none_or(|e| e != "jsonl") {
        return Err("只能删除会话记录文件".into());
    }

    let name = target.file_name().ok_or("会话路径无效")?;
    let trash = dirs::home_dir().ok_or("无法定位用户主目录")?.join(".Trash");
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

/// 原地截断会话文件，只保留 session 头与 `entry_id` 之前的祖先链路，
/// 用于「编辑用户消息后原地重发」而不像 fork 那样在侧栏多出一条新会话。
pub fn truncate_before(path: &str, entry_id: &str) -> Result<(), String> {
    let root = crate::data_dir::sessions_dir()?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target = Path::new(path).canonicalize().map_err(|e| e.to_string())?;

    if !target.starts_with(&root) || target.extension().is_none_or(|e| e != "jsonl") {
        return Err("只能编辑会话记录文件".into());
    }

    let raw = std::fs::read_to_string(&target).map_err(|e| e.to_string())?;
    let kept = filter_lines_before(&raw, entry_id)?;
    let tmp = target.with_extension("jsonl.tmp");
    std::fs::write(&tmp, kept.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &target).map_err(|e| e.to_string())
}

fn filter_lines_before(raw: &str, entry_id: &str) -> Result<String, String> {
    let mut header_line: Option<String> = None;
    let mut lines: Vec<(String, Option<String>, String)> = Vec::new();
    let mut by_id: HashMap<String, usize> = HashMap::new();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };
        if val.get("type").and_then(|v| v.as_str()) == Some("session") {
            if header_line.is_none() {
                header_line = Some(trimmed.to_string());
            }
            continue;
        }
        let Some(id) = val.get("id").and_then(|v| v.as_str()).map(str::to_string) else {
            continue;
        };
        let parent_id = val
            .get("parentId")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let idx = lines.len();
        by_id.insert(id.clone(), idx);
        lines.push((id, parent_id, trimmed.to_string()));
    }

    let header = header_line.ok_or("会话文件缺少 session 头")?;
    let &target_idx = by_id
        .get(entry_id)
        .ok_or_else(|| format!("找不到待编辑的会话节点：{entry_id}"))?;

    let mut ancestors: Vec<usize> = Vec::new();
    let mut cursor = lines[target_idx]
        .1
        .as_deref()
        .and_then(|p| by_id.get(p))
        .copied();
    let mut visited = 0usize;
    while let Some(idx) = cursor {
        ancestors.push(idx);
        visited += 1;
        if visited > lines.len() {
            break;
        }
        cursor = lines[idx].1.as_deref().and_then(|p| by_id.get(p)).copied();
    }
    ancestors.reverse();

    let mut out = String::new();
    out.push_str(&header);
    out.push('\n');
    for idx in ancestors {
        out.push_str(&lines[idx].2);
        out.push('\n');
    }
    Ok(out)
}

/// 从磁盘直接解析某条会话当前活跃分支的消息快照。
///
/// 与 pi 的 `buildSessionContext` 逻辑一致：沿 `parentId` 从最新叶节点回溯到根，
/// 遇到 compaction 时从 `firstKeptEntryId` 起保留，避免跨项目切换时苦等 pi 冷启。
pub fn read_snapshot(path: &str) -> Result<SessionSnapshot, String> {
    let root = crate::data_dir::sessions_dir()?
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
        match entries[cur_idx]
            .parent_id
            .as_deref()
            .and_then(|p| by_id.get(p))
        {
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
            if msg.get("role").and_then(|r| r.as_str()) == Some("system") {
                continue;
            }
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
                    if s.len() > MAX_TOOL_RESULT_CHARS && s.chars().count() > MAX_TOOL_RESULT_CHARS
                    {
                        let clipped: String = s.chars().take(MAX_TOOL_RESULT_CHARS).collect();
                        *text_val =
                            serde_json::Value::String(format!("{clipped}\n…[内容过长已截断]"));
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

/// 读一个会话文件的元信息：cwd、id、首条用户消息、显式命名。
///
/// 逐行流式读，不按字节窗口切：一条带图的用户消息可能有几百 KB，
/// 窗口一劈就解析失败，标题会退化成「新对话」。
/// 读到 `TITLE_SCAN_BYTES` 或拿到足够信息就停，几十 MB 的会话也不会拖慢列表。
fn parse_session_head(path: &PathBuf) -> Option<(String, SessionMeta)> {
    let file = std::fs::File::open(path).ok()?;
    let modified_ms = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut cwd = None;
    let mut id = String::new();
    let mut timestamp = String::new();
    let mut first_user_text = None;

    let mut reader = BufReader::new(file);
    let mut line = String::new();
    let mut scanned = 0usize;
    while scanned < TITLE_SCAN_BYTES {
        line.clear();
        // read_line 只认 LF，正好对应 JSONL 的分隔约定，也不会在 U+2028 处断开
        let Ok(n) = reader.read_line(&mut line) else {
            break;
        };
        if n == 0 {
            break;
        }
        scanned += n;
        let Ok(entry) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        match entry.get("type").and_then(|t| t.as_str()) {
            Some("session") => {
                cwd = entry
                    .get("cwd")
                    .and_then(|c| c.as_str())
                    .map(str::to_string);
                id = entry
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                timestamp = entry
                    .get("timestamp")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
            }
            Some("message") if first_user_text.is_none() => {
                first_user_text = extract_user_text(&entry);
            }
            _ => {}
        }
        // 头部信息齐了就不必再往下读——后面动辄几十 MB 的工具输出
        if cwd.is_some() && first_user_text.is_some() {
            break;
        }
    }

    // 改名发生在会话中途，只可能在文件尾部，单独倒着找一次
    let explicit_name = read_session_name(path);
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

/// 从文件尾部倒着找最后一次 `session_info` 的命名。
///
/// 取最后一次而不是第一次：用户可能改过好几次名字，也可能显式清空过。
fn read_session_name(path: &PathBuf) -> Option<String> {
    use std::io::{Seek, SeekFrom};

    let mut file = std::fs::File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    let start = size.saturating_sub(TAIL_BYTES as u64);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut tail = String::new();
    file.read_to_string(&mut tail).ok()?;

    let mut lines: Vec<&str> = tail.lines().collect();
    // 从中间截断时第一行是残的，跳过它
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    lines.iter().rev().find_map(|line| {
        let entry = serde_json::from_str::<serde_json::Value>(line).ok()?;
        if entry.get("type")?.as_str()? != "session_info" {
            return None;
        }
        let name = entry.get("name")?.as_str()?.trim();
        (!name.is_empty()).then(|| name.to_string())
    })
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

    use super::{filter_lines_before, parse_snapshot, truncate_title};
    use std::io::Write;

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

    /// 带图的首条提问单行可达几百 KB，按字节窗口切会把它劈断。
    /// 这里造一条 200KB 的行，确认标题仍能读出来。
    #[test]
    fn reads_title_from_a_very_long_first_line() {
        let dir = std::env::temp_dir().join("piazza-long-line");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("s.jsonl");

        let image = "A".repeat(200 * 1024);
        let long_text = format!("看看这张图\\n\\n[Image: {image}]");
        let lines = [
            r#"{"type":"session","id":"s1","timestamp":"2026-01-01T00:00:00Z","cwd":"/tmp/demo"}"#.to_string(),
            r#"{"type":"message","id":"m0","parentId":null,"message":{"role":"system","content":"sys"}}"#.to_string(),
            format!(
                r#"{{"type":"message","id":"m1","parentId":"m0","message":{{"role":"user","content":[{{"type":"text","text":"{long_text}"}},{{"type":"image","data":"{image}"}}]}}}}"#
            ),
        ];
        let mut file = std::fs::File::create(&path).unwrap();
        for line in &lines {
            writeln!(file, "{line}").unwrap();
        }
        drop(file);

        let (cwd, meta) = super::parse_session_head(&path).expect("应能解析");
        assert_eq!(cwd, "/tmp/demo");
        assert!(
            meta.title.starts_with("看看这张图"),
            "实际标题：{}",
            meta.title
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// 改名写在文件尾部，头部扫描看不到，必须从末尾找
    #[test]
    fn prefers_the_latest_explicit_name_from_the_tail() {
        let dir = std::env::temp_dir().join("piazza-tail-name");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("s.jsonl");

        let mut lines = vec![
            r#"{"type":"session","id":"s1","cwd":"/tmp/demo"}"#.to_string(),
            r#"{"type":"message","id":"m1","parentId":null,"message":{"role":"user","content":"第一句提问"}}"#.to_string(),
        ];
        // 中间塞够多的噪声，确保改名条目落在尾部窗口之外/之内都能被找到
        for i in 0..50 {
            lines.push(format!(
                r#"{{"type":"message","id":"n{i}","parentId":"m1","message":{{"role":"assistant","content":"{}"}}}}"#,
                "填充".repeat(200)
            ));
        }
        lines.push(
            r#"{"type":"session_info","id":"i1","parentId":"n1","name":"旧名字"}"#.to_string(),
        );
        lines.push(
            r#"{"type":"session_info","id":"i2","parentId":"i1","name":"修复登录重定向"}"#
                .to_string(),
        );

        let mut file = std::fs::File::create(&path).unwrap();
        for line in &lines {
            writeln!(file, "{line}").unwrap();
        }
        drop(file);

        let (_, meta) = super::parse_session_head(&path).expect("应能解析");
        assert_eq!(meta.title, "修复登录重定向");
        std::fs::remove_dir_all(&dir).unwrap();
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

    #[test]
    fn truncates_session_strictly_before_target_entry() {
        let jsonl = [
            r#"{"type":"session","id":"s1","cwd":"/tmp/demo"}"#,
            r#"{"type":"model_change","id":"mc1","parentId":null,"provider":"p","modelId":"m"}"#,
            r#"{"type":"message","id":"u1","parentId":"mc1","message":{"role":"user","content":"first"}}"#,
            r#"{"type":"message","id":"a1","parentId":"u1","message":{"role":"assistant","content":[]}}"#,
            r#"{"type":"message","id":"u2","parentId":"a1","message":{"role":"user","content":"second"}}"#,
        ]
        .join("\n");

        let before_u2 = filter_lines_before(&jsonl, "u2").unwrap();
        let snap2 = parse_snapshot(Cursor::new(before_u2.as_bytes()));
        assert_eq!(snap2.messages.len(), 2);
        assert_eq!(snap2.messages[0]["content"], "first");

        let before_u1 = filter_lines_before(&jsonl, "u1").unwrap();
        let snap1 = parse_snapshot(Cursor::new(before_u1.as_bytes()));
        assert!(snap1.messages.is_empty());
        assert!(before_u1.contains(r#""id":"mc1""#));
    }
}
