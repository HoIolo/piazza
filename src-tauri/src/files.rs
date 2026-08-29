use std::path::Path;

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

fn walk(root: &Path, dir: &Path, query: &str, visited: &mut usize, hits: &mut Vec<(usize, FileHit)>) {
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
            hits.push((s, FileHit { path: relative, name, dir }));
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

#[cfg(test)]
mod tests {
    use super::score;

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
