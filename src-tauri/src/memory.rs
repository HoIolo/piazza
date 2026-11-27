use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const VALID_CATEGORIES: &[&str] = &[
    "preference",
    "decision",
    "gotcha",
    "workflow",
    "reference",
    "general",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryItem {
    pub id: String,
    pub scope: String,
    pub title: String,
    pub category: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub content: String,
    pub file_path: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryHandoff {
    pub content: String,
    pub file_path: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDreamState {
    pub last_run_at: Option<String>,
    #[serde(default)]
    pub sessions_since_dream: u32,
    #[serde(default)]
    pub last_summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryOverview {
    pub enabled: bool,
    pub memory_root: String,
    pub global_dir: String,
    pub project_dir: Option<String>,
    pub project_name: Option<String>,
    pub items: Vec<MemoryItem>,
    pub handoff: Option<MemoryHandoff>,
    pub dream: Option<MemoryDreamState>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMemoryInput {
    pub scope: String,
    pub id: Option<String>,
    pub title: String,
    pub category: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<Vec<String>>,
    pub content: String,
}

/// 记忆存储根目录：优先 `PIAZZA_MEMORY_DIR`（测试/自定义），默认 `<agent_dir>/memory`
pub fn memory_root() -> Result<PathBuf, String> {
    if let Ok(custom) = std::env::var("PIAZZA_MEMORY_DIR") {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    Ok(crate::data_dir::agent_dir()?.join("memory"))
}

/// 与 `pi-runtime/memory-store.mjs` 完全一致的跨平台路径规范化
pub fn normalize_cwd(cwd: &str) -> String {
    let mut s = cwd.trim().replace('\\', "/");
    while s.len() > 1 && s.ends_with('/') {
        s.pop();
    }
    let bytes = s.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_uppercase() {
        let mut chars: Vec<char> = s.chars().collect();
        chars[0] = chars[0].to_ascii_lowercase();
        s = chars.into_iter().collect();
    }
    s
}

/// 32-bit FNV-1a 哈希，与 JS 端 `fnv1a32Hex` 逐字节一致
pub fn fnv1a_32_hex(input: &str) -> String {
    let mut hash: u32 = 0x811c_9dc5;
    for &byte in input.as_bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    format!("{hash:08x}")
}

fn ascii_slug(raw: &str, max_len: usize) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
        if out.len() >= max_len {
            break;
        }
    }
    out.trim_matches('-').to_string()
}

/// 按规范化 `cwd` 生成稳定的项目记忆目录名：`<slug>-<fnv1a8>`
pub fn project_dir_key(cwd: &str) -> String {
    let normalized = normalize_cwd(cwd);
    let base = normalized
        .rsplit('/')
        .find(|seg| !seg.is_empty())
        .unwrap_or("project");
    let slug = ascii_slug(base, 24);
    let prefix = if slug.is_empty() { "project" } else { &slug };
    let hash = fnv1a_32_hex(&normalized);
    format!("{prefix}-{hash}")
}

fn project_display_name(cwd: &str) -> String {
    let normalized = normalize_cwd(cwd);
    normalized
        .rsplit('/')
        .find(|seg| !seg.is_empty())
        .unwrap_or(&normalized)
        .to_string()
}

fn validate_entry_id(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    let trimmed = trimmed
        .strip_suffix(".md")
        .or_else(|| trimmed.strip_suffix(".MD"))
        .unwrap_or(trimmed);
    if trimmed.is_empty()
        || trimmed.contains("..")
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err("记忆 ID 包含非法路径字符".into());
    }
    let slug = ascii_slug(trimmed, 64);
    if slug.is_empty() || matches!(slug.as_str(), "memory" | "handoff" | "project") {
        return Err("记忆 ID 不可使用保留名（MEMORY / handoff）".into());
    }
    Ok(slug)
}

fn normalize_title_key(title: &str) -> String {
    title
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn derive_entry_id(
    explicit: Option<&str>,
    title: &str,
    existing: &[MemoryItem],
) -> Result<String, String> {
    if let Some(id) = explicit.map(str::trim).filter(|s| !s.is_empty()) {
        return validate_entry_id(id);
    }
    let norm = normalize_title_key(title);
    if let Some(hit) = existing
        .iter()
        .find(|item| normalize_title_key(&item.title) == norm)
    {
        return Ok(hit.id.clone());
    }
    let from_title = ascii_slug(title, 40);
    if !from_title.is_empty() && !matches!(from_title.as_str(), "memory" | "handoff" | "project") {
        return Ok(from_title);
    }
    Ok(format!(
        "mem-{}",
        fnv1a_32_hex(if norm.is_empty() { "entry" } else { &norm })
    ))
}

fn normalize_category(raw: Option<&str>) -> String {
    let candidate = raw.unwrap_or("general").trim().to_ascii_lowercase();
    if VALID_CATEGORIES.contains(&candidate.as_str()) {
        candidate
    } else {
        "general".to_string()
    }
}

fn normalize_tags(tags: Option<Vec<String>>) -> Vec<String> {
    let mut out = Vec::new();
    for raw in tags.unwrap_or_default() {
        let cleaned = raw.trim().trim_start_matches('#').trim().to_string();
        if !cleaned.is_empty() && !out.contains(&cleaned) {
            out.push(cleaned);
        }
        if out.len() >= 12 {
            break;
        }
    }
    out
}

fn now_iso_utc() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs()) as i64;
    // Howard Hinnant civil_from_days 算法，零外部依赖输出 RFC3339 UTC
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    let rem = secs.rem_euclid(86_400);
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;
    format!("{year:04}-{m:02}-{d:02}T{hour:02}:{min:02}:{sec:02}Z")
}

fn yaml_scalar(value: &str) -> String {
    let clean = value.replace(['\r', '\n'], " ").trim().to_string();
    serde_json::to_string(&clean).unwrap_or_else(|_| "\"\"".to_string())
}

fn parse_yaml_scalar(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        if let Ok(parsed) = serde_json::from_str::<String>(trimmed) {
            return parsed;
        }
    }
    trimmed.trim_matches('\'').to_string()
}

fn parse_yaml_tags(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        if let Ok(list) = serde_json::from_str::<Vec<String>>(trimmed) {
            return normalize_tags(Some(list));
        }
        let inner = &trimmed[1..trimmed.len() - 1];
        let items = inner
            .split(',')
            .map(parse_yaml_scalar)
            .collect::<Vec<String>>();
        return normalize_tags(Some(items));
    }
    Vec::new()
}

pub fn format_memory_markdown(item: &MemoryItem) -> String {
    let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
    let body = item.content.trim();
    format!(
        "---\ntitle: {}\ncategory: {}\nsummary: {}\ntags: {}\nupdatedAt: {}\n---\n\n{}\n",
        yaml_scalar(&item.title),
        item.category,
        yaml_scalar(&item.summary),
        tags_json,
        item.updated_at,
        body
    )
}

pub fn parse_memory_markdown(
    id: &str,
    scope: &str,
    file_path: &Path,
    raw: &str,
) -> MemoryItem {
    let mut title = id.to_string();
    let mut category = "general".to_string();
    let mut summary = String::new();
    let mut tags = Vec::new();
    let mut updated_at = String::new();
    let mut body = raw.to_string();

    if let Some(rest) = raw.strip_prefix("---\n").or_else(|| raw.strip_prefix("---\r\n")) {
        if let Some(end_idx) = rest.find("\n---") {
            let header = &rest[..end_idx];
            let after = &rest[end_idx + 4..];
            body = after
                .strip_prefix("\r\n")
                .or_else(|| after.strip_prefix('\n'))
                .unwrap_or(after)
                .trim()
                .to_string();
            for line in header.lines() {
                let Some((k, v)) = line.split_once(':') else {
                    continue;
                };
                match k.trim() {
                    "title" => {
                        let parsed = parse_yaml_scalar(v);
                        if !parsed.is_empty() {
                            title = parsed;
                        }
                    }
                    "category" => category = normalize_category(Some(&parse_yaml_scalar(v))),
                    "summary" => summary = parse_yaml_scalar(v),
                    "tags" => tags = parse_yaml_tags(v),
                    "updatedAt" => updated_at = parse_yaml_scalar(v),
                    _ => {}
                }
            }
        }
    }

    if summary.is_empty() {
        summary = body
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty() && !l.starts_with('#'))
            .unwrap_or("")
            .chars()
            .take(120)
            .collect();
    }

    MemoryItem {
        id: id.to_string(),
        scope: scope.to_string(),
        title,
        category,
        summary,
        tags,
        content: body,
        file_path: file_path.to_string_lossy().into_owned(),
        updated_at,
    }
}

fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建记忆目录失败：{e}"))?;
    }
    let tmp = path.with_extension("md.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| format!("写入记忆文件失败：{e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("提交记忆文件失败：{e}"))
}

fn scan_scope_dir(dir: &Path, scope: &str) -> Vec<MemoryItem> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut items = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() || path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if stem.eq_ignore_ascii_case("MEMORY") || stem.eq_ignore_ascii_case("handoff") {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&path) else {
            continue;
        };
        items.push(parse_memory_markdown(stem, scope, &path, &raw));
    }
    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.id.cmp(&b.id)));
    items
}

fn rebuild_index(dir: &Path, scope: &str) -> Result<(), String> {
    let items = scan_scope_dir(dir, scope);
    let index_path = dir.join("MEMORY.md");
    if items.is_empty() {
        if index_path.exists() {
            let _ = std::fs::remove_file(&index_path);
        }
        return Ok(());
    }
    let heading = if scope == "global" {
        "# 全局记忆索引"
    } else {
        "# 项目记忆索引"
    };
    let mut out = format!("{heading}\n\n");
    for item in &items {
        let tags_str = if item.tags.is_empty() {
            String::new()
        } else {
            let joined = item
                .tags
                .iter()
                .map(|t| format!("#{t}"))
                .collect::<Vec<_>>()
                .join(" ");
            format!(" {joined}")
        };
        let summary = if item.summary.is_empty() {
            String::new()
        } else {
            format!(" — {}", item.summary)
        };
        out.push_str(&format!(
            "- [{}]({}.md) (id: {}, {}){}{}\n",
            item.title, item.id, item.id, item.category, tags_str, summary
        ));
    }
    atomic_write(&index_path, &out)
}

fn write_project_meta(dir: &Path, cwd: &str) {
    let meta = serde_json::json!({
        "cwd": normalize_cwd(cwd),
        "name": project_display_name(cwd),
        "updatedAt": now_iso_utc(),
    });
    if let Ok(text) = serde_json::to_string_pretty(&meta) {
        let _ = std::fs::write(dir.join(".project.json"), text.as_bytes());
    }
}

fn resolve_scope_dir(root: &Path, scope: &str, cwd: Option<&str>) -> Result<PathBuf, String> {
    match scope {
        "global" => Ok(root.join("global")),
        "project" => {
            let project_cwd = cwd
                .map(str::trim)
                .filter(|c| !c.is_empty())
                .ok_or("未选择项目，无法操作项目记忆")?;
            Ok(root.join("projects").join(project_dir_key(project_cwd)))
        }
        _ => Err(format!("无效的记忆作用范围：{scope}")),
    }
}

fn read_handoff(project_dir: &Path) -> Option<MemoryHandoff> {
    let path = project_dir.join("handoff.md");
    let raw = std::fs::read_to_string(&path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let content = if let Some(rest) = trimmed
        .strip_prefix("---\n")
        .or_else(|| trimmed.strip_prefix("---\r\n"))
    {
        if let Some(end_idx) = rest.find("\n---") {
            let after = &rest[end_idx + 4..];
            after
                .strip_prefix("\r\n")
                .or_else(|| after.strip_prefix('\n'))
                .unwrap_or(after)
                .trim()
                .to_string()
        } else {
            trimmed.to_string()
        }
    } else {
        trimmed.to_string()
    };
    if content.is_empty() {
        return None;
    }
    let updated_at = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default();
    Some(MemoryHandoff {
        content,
        file_path: path.to_string_lossy().into_owned(),
        updated_at,
    })
}

fn read_dream_state(root: &Path) -> Option<MemoryDreamState> {
    let raw = std::fs::read_to_string(root.join(".dream-state.json")).ok()?;
    serde_json::from_str::<MemoryDreamState>(&raw).ok()
}

pub fn list_in(root: &Path, cwd: Option<&str>) -> MemoryOverview {
    let global_dir = root.join("global");
    let mut items = scan_scope_dir(&global_dir, "global");

    let (project_dir, project_name, handoff) = match cwd.map(str::trim).filter(|c| !c.is_empty()) {
        Some(project_cwd) => {
            let dir = root.join("projects").join(project_dir_key(project_cwd));
            items.extend(scan_scope_dir(&dir, "project"));
            let ho = read_handoff(&dir);
            (
                Some(dir.to_string_lossy().into_owned()),
                Some(project_display_name(project_cwd)),
                ho,
            )
        }
        None => (None, None, None),
    };

    items.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then_with(|| a.id.cmp(&b.id)));
    MemoryOverview {
        enabled: crate::config::memory_enabled(),
        memory_root: root.to_string_lossy().into_owned(),
        global_dir: global_dir.to_string_lossy().into_owned(),
        project_dir,
        project_name,
        items,
        handoff,
        dream: read_dream_state(root),
    }
}

pub fn list(cwd: Option<&str>) -> Result<MemoryOverview, String> {
    let root = memory_root()?;
    Ok(list_in(&root, cwd))
}

pub fn save_in(root: &Path, cwd: Option<&str>, input: SaveMemoryInput) -> Result<MemoryItem, String> {
    let title = input.title.trim().to_string();
    let content = input.content.trim().to_string();
    if title.is_empty() {
        return Err("记忆标题不能为空".into());
    }
    if content.is_empty() {
        return Err("记忆内容不能为空".into());
    }
    let dir = resolve_scope_dir(root, &input.scope, cwd)?;
    let existing = scan_scope_dir(&dir, &input.scope);
    let id = derive_entry_id(input.id.as_deref(), &title, &existing)?;
    let file_path = dir.join(format!("{id}.md"));
    let summary = input
        .summary
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            content
                .lines()
                .map(str::trim)
                .find(|l| !l.is_empty() && !l.starts_with('#'))
                .unwrap_or(&title)
                .chars()
                .take(120)
                .collect()
        });
    let item = MemoryItem {
        id,
        scope: input.scope.clone(),
        title,
        category: normalize_category(input.category.as_deref()),
        summary,
        tags: normalize_tags(input.tags),
        content,
        file_path: file_path.to_string_lossy().into_owned(),
        updated_at: now_iso_utc(),
    };
    atomic_write(&file_path, &format_memory_markdown(&item))?;
    if input.scope == "project" {
        if let Some(project_cwd) = cwd.map(str::trim).filter(|c| !c.is_empty()) {
            write_project_meta(&dir, project_cwd);
        }
    }
    rebuild_index(&dir, &input.scope)?;
    Ok(item)
}

pub fn save(cwd: Option<&str>, input: SaveMemoryInput) -> Result<MemoryItem, String> {
    let root = memory_root()?;
    save_in(&root, cwd, input)
}

pub fn delete_in(root: &Path, cwd: Option<&str>, scope: &str, id: &str) -> Result<(), String> {
    let dir = resolve_scope_dir(root, scope, cwd)?;
    let safe_id = validate_entry_id(id)?;
    let file_path = dir.join(format!("{safe_id}.md"));
    if file_path.is_file() {
        std::fs::remove_file(&file_path).map_err(|e| format!("删除记忆失败：{e}"))?;
    }
    rebuild_index(&dir, scope)
}

pub fn delete(cwd: Option<&str>, scope: &str, id: &str) -> Result<(), String> {
    let root = memory_root()?;
    delete_in(&root, cwd, scope, id)
}

pub fn clear_in(root: &Path, cwd: Option<&str>, scope: &str) -> Result<(), String> {
    let dir = resolve_scope_dir(root, scope, cwd)?;
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| format!("读取记忆目录失败：{e}"))?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|e| e == "md") {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

pub fn clear(cwd: Option<&str>, scope: &str) -> Result<(), String> {
    let root = memory_root()?;
    clear_in(&root, cwd, scope)
}

pub fn clear_handoff(cwd: &str) -> Result<(), String> {
    let root = memory_root()?;
    let dir = resolve_scope_dir(&root, "project", Some(cwd))?;
    let path = dir.join("handoff.md");
    if path.is_file() {
        std::fs::remove_file(&path).map_err(|e| format!("清除交接快照失败：{e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "piazza_mem_test_{name}_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn project_dir_key_normalizes_paths_deterministically() {
        assert_eq!(
            project_dir_key("/Users/haha/Desktop/piazza/"),
            project_dir_key("/Users/haha/Desktop/piazza")
        );
        assert_eq!(
            project_dir_key(r"C:\Users\Dev\MyRepo\"),
            project_dir_key("c:/Users/Dev/MyRepo")
        );
        // 与 JS 端 memory-store.mjs 共享同一测试向量
        assert_eq!(
            project_dir_key("/Users/haha/Desktop/piazza"),
            format!("piazza-{}", fnv1a_32_hex("/Users/haha/Desktop/piazza"))
        );
        assert!(project_dir_key("/tmp/中文项目").starts_with("project-"));
    }

    #[test]
    fn crud_lifecycle_and_index_sync() {
        let root = temp_root("crud");
        let cwd = "/Users/haha/Desktop/piazza";

        let saved = save_in(
            &root,
            Some(cwd),
            SaveMemoryInput {
                scope: "project".into(),
                id: Some("pnpm-build".into()),
                title: "包管理器: pnpm".into(),
                category: Some("workflow".into()),
                summary: Some("统一使用 pnpm，禁止 npm".into()),
                tags: Some(vec!["#pnpm".into(), "build".into()]),
                content: "请始终使用 `pnpm install` 与 `pnpm typecheck`。".into(),
            },
        )
        .unwrap();
        assert_eq!(saved.id, "pnpm-build");
        assert_eq!(saved.tags, vec!["pnpm", "build"]);

        let overview = list_in(&root, Some(cwd));
        assert_eq!(overview.items.len(), 1);
        assert_eq!(overview.items[0].title, "包管理器: pnpm");
        assert_eq!(overview.items[0].category, "workflow");

        let index_path = root.join("projects").join(project_dir_key(cwd)).join("MEMORY.md");
        let index = std::fs::read_to_string(&index_path).unwrap();
        assert!(index.contains("[包管理器: pnpm](pnpm-build.md)"));
        assert!(index.contains("#pnpm #build"));

        delete_in(&root, Some(cwd), "project", "pnpm-build").unwrap();
        assert!(list_in(&root, Some(cwd)).items.is_empty());
        assert!(!index_path.exists());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_path_traversal_and_reserved_ids() {
        let root = temp_root("guard");
        for bad in ["../escape", "a/b", "MEMORY", "handoff"] {
            let err = save_in(
                &root,
                None,
                SaveMemoryInput {
                    scope: "global".into(),
                    id: Some(bad.into()),
                    title: "test".into(),
                    category: None,
                    summary: None,
                    tags: None,
                    content: "body".into(),
                },
            );
            assert!(err.is_err(), "should reject id={bad}");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn reads_dream_state_written_by_runtime() {
        let root = temp_root("dream");
        let json = r#"{
  "lastRunAt": "2026-11-26T13:30:00Z",
  "sessionsSinceDream": 3,
  "lastSummary": "整理完成：合并 1 组，清理 2 条"
}"#;
        std::fs::write(root.join(".dream-state.json"), json).unwrap();
        let overview = list_in(&root, None);
        let dream = overview.dream.expect("should parse .dream-state.json");
        assert_eq!(dream.last_run_at.as_deref(), Some("2026-11-26T13:30:00Z"));
        assert_eq!(dream.sessions_since_dream, 3);
        assert_eq!(dream.last_summary, "整理完成：合并 1 组，清理 2 条");
        let _ = std::fs::remove_dir_all(&root);
    }
}
