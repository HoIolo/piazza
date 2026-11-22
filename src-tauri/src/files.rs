use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// 不进入的目录。这些要么是构建产物、要么是依赖，命中了也不是用户想引用的文件。
const SKIP_DIRS: [&str; 14] = [
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
    ".cache",
    "coverage",
];

/// 遍历上限。大仓库全量走一遍会明显卡顿，而提及场景只需要靠前的若干条。
const MAX_VISITED: usize = 30_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    /// 相对项目根的路径
    pub path: String,
    /// 文件名，供列表加粗显示
    pub name: String,
    /// 所在目录的相对路径，根目录为空串
    pub dir: String,
}

/// 打分：越小越靠前。
///
/// 文件名命中优于路径中段命中，浅层目录优于深层——按 @ 提及的实际用法，
/// 用户想找的通常是自己刚写的那个文件，而不是深埋在子目录里的同名文件。
fn score(relative: &str, name: &str, query: &str) -> Option<usize> {
    if query.is_empty() {
        return Some(relative.matches('/').count());
    }

    let lower_name = name.to_lowercase();
    let lower_path = relative.to_lowercase();
    let depth = relative.matches('/').count();

    if let Some(pos) = lower_name.find(query) {
        return Some(pos + depth);
    }
    if lower_path.contains(query) {
        return Some(1000 + depth);
    }
    None
}

fn walk(
    root: &Path,
    dir: &Path,
    query: &str,
    visited: &mut usize,
    hits: &mut Vec<(usize, FileHit)>,
) {
    if *visited >= MAX_VISITED {
        return;
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.filter_map(Result::ok) {
        if *visited >= MAX_VISITED {
            return;
        }
        *visited += 1;

        let path = entry.path();
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            continue;
        };

        // 隐藏文件与忽略目录一并跳过；.pi 这类配置目录不是提及的目标
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }

        if path.is_dir() {
            walk(root, &path, query, visited, hits);
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .into_owned();

        if let Some(s) = score(&relative, &name, query) {
            let dir = relative
                .rsplit_once('/')
                .map(|(d, _)| d.to_string())
                .unwrap_or_default();
            hits.push((
                s,
                FileHit {
                    path: relative,
                    name,
                    dir,
                },
            ));
        }
    }
}

/// 在项目内搜索文件。query 为空时返回浅层文件，作为「刚打开菜单」的默认列表。
pub fn search_files(cwd: &str, query: &str, limit: usize) -> Vec<FileHit> {
    let root = Path::new(cwd);
    if !root.is_dir() {
        return Vec::new();
    }

    let query = query.trim().to_lowercase();
    let mut hits: Vec<(usize, FileHit)> = Vec::new();
    let mut visited = 0usize;
    walk(root, root, &query, &mut visited, &mut hits);

    hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.path.cmp(&b.1.path)));
    hits.into_iter().take(limit).map(|(_, hit)| hit).collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    name: String,
    path: String,
    directory: bool,
}

fn workspace_path(cwd: &str, path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(path);
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("只能访问项目内的相对路径".into());
    }
    let root = fs::canonicalize(cwd).map_err(|err| err.to_string())?;
    let resolved = fs::canonicalize(root.join(relative)).map_err(|err| err.to_string())?;
    if !resolved.starts_with(&root) {
        return Err("路径在项目目录之外".into());
    }
    Ok(resolved)
}

/// 浏览单层目录，点开子目录时再读取，避免大型项目一次性扫描。
pub fn list_workspace_dir(cwd: &str, path: &str) -> Result<Vec<WorkspaceEntry>, String> {
    let directory = workspace_path(cwd, path)?;
    let entries = fs::read_dir(directory).map_err(|err| err.to_string())?;
    let mut result = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() || kind.is_file() {
            let entry_path = Path::new(path).join(&name).to_string_lossy().into_owned();
            result.push(WorkspaceEntry {
                name,
                path: entry_path,
                directory: kind.is_dir(),
            });
        }
    }
    result.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(result)
}

pub fn preview_workspace_file(cwd: &str, path: &str) -> Result<String, String> {
    const MAX_BYTES: u64 = 512 * 1024;
    let file = workspace_path(cwd, path)?;
    read_utf8_file(&file, MAX_BYTES, "文件超过 512 KB，请使用系统应用打开")
}

/// 读取本地 HTML 文件供右侧内置浏览器预览（支持 `~/` 与绝对路径，限制 4 MB）。
pub fn read_html_preview(path: &str) -> Result<String, String> {
    const MAX_BYTES: u64 = 4 * 1024 * 1024;
    let expanded = if let Some(rest) = path.strip_prefix("~/") {
        dirs::home_dir()
            .ok_or_else(|| "无法定位用户主目录".to_string())?
            .join(rest)
    } else {
        PathBuf::from(path)
    };
    let resolved = fs::canonicalize(&expanded).map_err(|err| err.to_string())?;
    let is_html = resolved
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("html") || ext.eq_ignore_ascii_case("htm"));
    if !is_html {
        return Err("仅支持预览 HTML 文件".into());
    }
    read_utf8_file(
        &resolved,
        MAX_BYTES,
        "HTML 文件超过 4 MB，请使用系统浏览器打开",
    )
}

fn read_utf8_file(file: &Path, max_bytes: u64, too_large_msg: &str) -> Result<String, String> {
    if !file.is_file() {
        return Err("只能预览普通文件".into());
    }
    let mut data = Vec::new();
    File::open(file)
        .and_then(|f| f.take(max_bytes + 1).read_to_end(&mut data))
        .map_err(|err| err.to_string())?;
    if data.len() as u64 > max_bytes {
        return Err(too_large_msg.into());
    }
    if data.contains(&0) {
        return Err("该文件不是可预览文本".into());
    }
    String::from_utf8(data).map_err(|_| "该文件不是 UTF-8 文本".into())
}

#[cfg(test)]
mod tests {
    use super::{list_workspace_dir, preview_workspace_file, score};

    #[test]
    fn workspace_browses_and_previews_its_own_files() {
        let root = env!("CARGO_MANIFEST_DIR");
        let files = list_workspace_dir(root, "").unwrap();
        assert!(files
            .iter()
            .any(|entry| entry.path == "src" && entry.directory));
        let content = preview_workspace_file(root, "Cargo.toml").unwrap();
        assert!(content.starts_with("[package]"));
        assert!(preview_workspace_file(root, "src").is_err());
        assert!(preview_workspace_file(root, "../package.json").is_err());
        assert!(preview_workspace_file(root, "/etc/hosts").is_err());
    }

    #[test]
    fn ranks_filename_match_before_path_match() {
        let by_name = score("src/page.tsx", "page.tsx", "page").unwrap();
        let by_path = score("page/index.tsx", "index.tsx", "page").unwrap();
        assert!(by_name < by_path);
    }

    /// 同样命中文件名时，浅层的优先
    #[test]
    fn prefers_shallow_paths() {
        let shallow = score("app.ts", "app.ts", "app").unwrap();
        let deep = score("a/b/c/app.ts", "app.ts", "app").unwrap();
        assert!(shallow < deep);
    }

    #[test]
    fn returns_none_when_no_match() {
        assert!(score("src/page.tsx", "page.tsx", "zzz").is_none());
    }

    #[test]
    fn empty_query_ranks_by_depth() {
        assert!(score("a.ts", "a.ts", "").unwrap() < score("a/b/c.ts", "c.ts", "").unwrap());
    }
}
