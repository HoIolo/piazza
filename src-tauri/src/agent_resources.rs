use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::config;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionDoc {
    pub path: String,
    pub content: String,
    pub exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub dir_path: String,
    pub file_path: String,
    pub content: String,
    pub is_symlink: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
}

pub fn mcp_path() -> Result<PathBuf, String> {
    Ok(crate::data_dir::agent_dir()?.join("mcp.json"))
}

pub fn read_global_instructions() -> Result<InstructionDoc, String> {
    let dir = crate::data_dir::agent_dir()?;
    let override_path = dir.join("AGENTS.override.md");
    let default_path = dir.join("AGENTS.md");
    let target = if override_path.is_file() {
        override_path
    } else {
        default_path
    };
    let exists = target.is_file();
    let content = if exists {
        std::fs::read_to_string(&target).map_err(|e| format!("读取全局指令失败：{e}"))?
    } else {
        String::new()
    };
    Ok(InstructionDoc {
        path: target.to_string_lossy().into_owned(),
        content,
        exists,
    })
}

pub fn write_global_instructions(content: &str) -> Result<InstructionDoc, String> {
    let dir = crate::data_dir::agent_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败：{e}"))?;
    let override_path = dir.join("AGENTS.override.md");
    let target = if override_path.is_file() {
        override_path
    } else {
        dir.join("AGENTS.md")
    };
    let tmp = target.with_extension("md.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| format!("写入全局指令失败：{e}"))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("保存全局指令失败：{e}"))?;
    Ok(InstructionDoc {
        path: target.to_string_lossy().into_owned(),
        content: content.to_string(),
        exists: true,
    })
}

pub fn list_skills(cwd: Option<&str>) -> Result<Vec<SkillRecord>, String> {
    let mut records = Vec::new();
    let global_dir = crate::data_dir::agent_dir()?.join("skills");
    scan_skills_dir(&global_dir, "global", &mut records);
    if let Some(project_cwd) = cwd.filter(|c| !c.trim().is_empty()) {
        let project_dir = PathBuf::from(project_cwd).join(".pi/skills");
        scan_skills_dir(&project_dir, "project", &mut records);
    }
    records.sort_by(|a, b| a.scope.cmp(&b.scope).then_with(|| a.name.cmp(&b.name)));
    Ok(records)
}

fn scan_skills_dir(dir: &Path, scope: &str, out: &mut Vec<SkillRecord>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let is_symlink = entry.file_type().map(|ft| ft.is_symlink()).unwrap_or(false);
        if !path.is_dir() {
            continue;
        }
        let skill_file = path.join("SKILL.md");
        if !skill_file.is_file() {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&skill_file) else {
            continue;
        };
        let folder_id = entry.file_name().to_string_lossy().into_owned();
        let (fm_name, fm_desc) = parse_skill_frontmatter(&content);
        out.push(SkillRecord {
            id: folder_id.clone(),
            name: fm_name.unwrap_or(folder_id),
            description: fm_desc.unwrap_or_default(),
            scope: scope.to_string(),
            dir_path: path.to_string_lossy().into_owned(),
            file_path: skill_file.to_string_lossy().into_owned(),
            content,
            is_symlink,
        });
    }
}

pub fn save_skill(
    scope: &str,
    cwd: Option<&str>,
    slug: &str,
    content: &str,
) -> Result<SkillRecord, String> {
    let clean = slug.trim();
    validate_skill_slug(clean)?;
    let root = resolve_skills_root(scope, cwd)?;
    let skill_dir = root.join(clean);
    std::fs::create_dir_all(&skill_dir).map_err(|e| format!("创建技能目录失败：{e}"))?;
    let skill_file = skill_dir.join("SKILL.md");
    let tmp = skill_dir.join("SKILL.md.tmp");
    std::fs::write(&tmp, content.as_bytes()).map_err(|e| format!("写入 SKILL.md 失败：{e}"))?;
    std::fs::rename(&tmp, &skill_file).map_err(|e| format!("保存 SKILL.md 失败：{e}"))?;
    let is_symlink = std::fs::symlink_metadata(&skill_dir)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);
    let (fm_name, fm_desc) = parse_skill_frontmatter(content);
    Ok(SkillRecord {
        id: clean.to_string(),
        name: fm_name.unwrap_or_else(|| clean.to_string()),
        description: fm_desc.unwrap_or_default(),
        scope: scope.to_string(),
        dir_path: skill_dir.to_string_lossy().into_owned(),
        file_path: skill_file.to_string_lossy().into_owned(),
        content: content.to_string(),
        is_symlink,
    })
}

pub fn delete_skill(dir_path: &str, cwd: Option<&str>) -> Result<(), String> {
    let target = PathBuf::from(dir_path);
    let meta = std::fs::symlink_metadata(&target).map_err(|e| format!("找不到技能目录：{e}"))?;
    let allowed_global = crate::data_dir::agent_dir()?.join("skills");
    let allowed_project = cwd
        .filter(|c| !c.trim().is_empty())
        .map(|c| PathBuf::from(c).join(".pi/skills"));

    let parent = target.parent().ok_or("无效的技能路径")?;
    let is_allowed = parent == allowed_global || allowed_project.as_deref() == Some(parent);
    if !is_allowed {
        return Err("只能删除 agent 目录下 skills/ 或当前项目 .pi/skills 下的技能".into());
    }

    if meta.file_type().is_symlink() {
        std::fs::remove_file(&target).map_err(|e| format!("移除技能链接失败：{e}"))
    } else {
        let home = dirs::home_dir().ok_or("无法定位用户主目录")?;
        let name = target.file_name().ok_or("无效的技能目录名")?;
        let trash = home.join(".Trash");
        let mut dest = trash.join(name);
        if dest.exists() {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.as_millis());
            dest = trash.join(format!("{stamp}-{}", name.to_string_lossy()));
        }
        std::fs::rename(&target, &dest).map_err(|e| format!("移入废纸篓失败：{e}"))
    }
}

pub fn list_local_extensions() -> Result<Vec<ExtensionEntry>, String> {
    let dir = crate::data_dir::agent_dir()?.join("extensions");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut result = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().is_some_and(|m| m.is_dir());
        let size_bytes = meta.as_ref().map_or(0, |m| m.len());
        result.push(ExtensionEntry {
            name,
            path: path.to_string_lossy().into_owned(),
            is_dir,
            size_bytes,
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

/// 把本地扩展移进废纸篓。
///
/// 与删除技能同一套约束：路径必须落在 `<agent>/extensions` 下，
/// 免得这个命令变成「把任意文件丢进废纸篓」的通道。
/// 移动目录项本身，符号链接的目标保持原样。
pub fn delete_local_extension(path: &str) -> Result<(), String> {
    let agent = crate::data_dir::agent_dir()?;
    let root = agent.join("extensions");
    let root = root
        .canonicalize()
        .map_err(|e| format!("扩展目录不存在：{e}"))?;
    let target = Path::new(path);
    let name = target.file_name().ok_or("无效的扩展名")?;
    let parent = target.parent().ok_or("无效的扩展路径")?;
    let parent = parent
        .canonicalize()
        .map_err(|e| format!("找不到扩展：{e}"))?;
    if !parent.starts_with(&root) {
        return Err("只能删除 agent 目录下 extensions 里的扩展".into());
    }
    move_extension_to_trash(&parent.join(name), name, &agent)
}

#[cfg(windows)]
fn move_extension_to_trash(
    target: &Path,
    name: &std::ffi::OsStr,
    agent: &Path,
) -> Result<(), String> {
    // Windows 没有 ~/.Trash。同名扩展的每次删除各自占用一个恢复目录。
    let trash = agent.join(".Trash");
    std::fs::create_dir_all(&trash).map_err(|e| format!("创建 Piazza 废纸篓失败：{e}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let archived = trash.join(format!("{stamp}-{}", std::process::id()));
    std::fs::create_dir(&archived).map_err(|e| format!("创建扩展恢复目录失败：{e}"))?;
    if let Err(error) = std::fs::rename(target, archived.join(name)) {
        let _ = std::fs::remove_dir(&archived);
        return Err(format!("移入 Piazza 废纸篓失败：{error}"));
    }
    Ok(())
}

#[cfg(not(windows))]
fn move_extension_to_trash(
    target: &Path,
    name: &std::ffi::OsStr,
    _agent: &Path,
) -> Result<(), String> {
    let meta = std::fs::symlink_metadata(target).map_err(|e| format!("找不到扩展：{e}"))?;
    if meta.file_type().is_symlink() {
        return std::fs::remove_file(target).map_err(|e| format!("移除扩展链接失败：{e}"));
    }

    let home = dirs::home_dir().ok_or("无法定位用户主目录")?;
    let trash = home.join(".Trash");
    std::fs::create_dir_all(&trash).map_err(|e| format!("创建废纸篓失败：{e}"))?;
    let mut dest = trash.join(name);
    if dest.exists() {
        // 废纸篓里已有同名项时补上时间戳，不覆盖先前删掉的那份
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis());
        dest = trash.join(format!("{stamp}-{}", name.to_string_lossy()));
    }
    std::fs::rename(target, &dest).map_err(|e| format!("移入废纸篓失败：{e}"))
}

pub fn read_mcp_config() -> Result<serde_json::Value, String> {
    config::read_json(&mcp_path()?)
}

pub fn write_mcp_config(patch: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = mcp_path()?;
    let original = config::read_json(&path)?;
    let merged = config::merge_top_level(&original, &patch);
    config::write_json(&path, &merged)?;
    config::read_json(&path)
}

fn resolve_skills_root(scope: &str, cwd: Option<&str>) -> Result<PathBuf, String> {
    match scope {
        "global" => Ok(crate::data_dir::agent_dir()?.join("skills")),
        "project" => {
            let dir = cwd
                .filter(|c| !c.trim().is_empty())
                .ok_or("未选择当前项目，无法保存项目级技能")?;
            Ok(PathBuf::from(dir).join(".pi/skills"))
        }
        _ => Err("未知的技能作用域".into()),
    }
}

fn validate_skill_slug(slug: &str) -> Result<(), String> {
    if slug.is_empty() || slug.len() > 64 {
        return Err("技能目录名长度需在 1–64 个字符之间".into());
    }
    if slug.starts_with('.')
        || slug.contains("..")
        || slug.contains('/')
        || slug.contains('\\')
        || !slug
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("技能目录名仅支持英文字母、数字、连字符 (-) 和下划线 (_)".into());
    }
    Ok(())
}

/// 从 SKILL.md 顶部 YAML frontmatter 中解析 name 与 description
pub fn parse_skill_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    let trimmed = content.trim_start();
    let Some(rest) = trimmed.strip_prefix("---") else {
        return (None, None);
    };
    let Some(end) = rest.find("\n---") else {
        return (None, None);
    };
    let block = &rest[..end];
    let mut name = None;
    let mut description = None;
    for line in block.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("name:") {
            let v = unquote_yaml(val);
            if !v.is_empty() {
                name = Some(v);
            }
        } else if let Some(val) = line.strip_prefix("description:") {
            let v = unquote_yaml(val);
            if !v.is_empty() {
                description = Some(v);
            }
        }
    }
    (name, description)
}

fn unquote_yaml(raw: &str) -> String {
    let s = raw.trim();
    if (s.starts_with('"') && s.ends_with('"') && s.len() >= 2)
        || (s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2)
    {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_skill_frontmatter, validate_skill_slug};

    #[test]
    fn parses_frontmatter_name_and_description() {
        let md = "---\nname: \"my-skill\"\ndescription: 'Do something cool'\n---\n# Body";
        let (name, desc) = parse_skill_frontmatter(md);
        assert_eq!(name.as_deref(), Some("my-skill"));
        assert_eq!(desc.as_deref(), Some("Do something cool"));
    }

    #[test]
    fn rejects_unsafe_skill_slugs() {
        assert!(validate_skill_slug("good-skill_1").is_ok());
        assert!(validate_skill_slug("../evil").is_err());
        assert!(validate_skill_slug("a/b").is_err());
        assert!(validate_skill_slug(".hidden").is_err());
        assert!(validate_skill_slug("").is_err());
    }
}
