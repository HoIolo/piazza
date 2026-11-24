use std::path::PathBuf;

pub fn models_path() -> Result<PathBuf, String> {
    Ok(crate::data_dir::agent_dir()?.join("models.json"))
}

pub fn settings_path() -> Result<PathBuf, String> {
    Ok(crate::data_dir::agent_dir()?.join("settings.json"))
}

/// 读取 JSON 配置。文件不存在时返回空对象而非报错——首次使用属正常情况。
pub fn read_json(path: &PathBuf) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(path).map_err(|e| format!("读取 {path:?} 失败：{e}"))?;
    if text.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str(&text).map_err(|e| format!("解析 {path:?} 失败：{e}"))
}

/// 写入 JSON 配置。
///
/// 两项保护：写前把原文件备份为 `*.bak`；写入走「临时文件 + rename」，
/// 因为 rename 在同一文件系统内是原子的，中途崩溃也不会留下半截配置——
/// 而配置一旦损坏，pi 会整个起不来。
pub fn write_json(path: &PathBuf, value: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }

    if path.exists() {
        let backup = path.with_extension("json.bak");
        std::fs::copy(path, &backup).map_err(|e| format!("备份失败：{e}"))?;
    }

    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text.as_bytes()).map_err(|e| format!("写入临时文件失败：{e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("提交配置失败：{e}"))
}

/// 读 settings.json 里的项目信任档位。
///
/// 只认 pi 支持的三个值，其余（没设、写错）一律当作没指定，让 pi 用它自己的
/// 默认值。返回 Option 而不是默认值，是为了让「用户没表态」与「用户选了 ask」
/// 在调用处能区分开。
pub fn project_trust_level() -> Option<String> {
    level_of(&read_json(&settings_path().ok()?).ok()?)
}

/// 从设置对象里取出档位。抽成纯函数，测试不必碰真实文件系统。
fn level_of(settings: &serde_json::Value) -> Option<String> {
    let value = settings.get("defaultProjectTrust")?.as_str()?;
    matches!(value, "ask" | "always" | "never").then(|| value.to_string())
}

/// 读 settings.json 里的内置 Computer Use 配置：(是否启用内置 MCP, 是否显示虚拟光标)。
/// 两者默认均为 true，开箱即用。
pub fn computer_use_settings() -> (bool, bool) {
    let settings = settings_path()
        .ok()
        .and_then(|p| read_json(&p).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    computer_use_of(&settings)
}

fn computer_use_of(settings: &serde_json::Value) -> (bool, bool) {
    let cu = settings.get("computerUse");
    let enabled = cu
        .and_then(|v| v.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let visual_cursor = cu
        .and_then(|v| v.get("visualCursor"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    (enabled, visual_cursor)
}

/// 合并顶层键，保留原文件中我们不认识的字段。
///
/// GUI 只理解 models.json / settings.json 的一部分结构，用户手写的其他
/// 键（未来版本新增的、扩展自定义的）必须原样保留，否则一次保存就会
/// 悄悄抹掉用户的配置。
pub fn merge_top_level(
    original: &serde_json::Value,
    patch: &serde_json::Value,
) -> serde_json::Value {
    let (Some(base), Some(patch_map)) = (original.as_object(), patch.as_object()) else {
        return patch.clone();
    };

    let mut merged = base.clone();
    for (key, val) in patch_map {
        merged.insert(key.clone(), val.clone());
    }
    serde_json::Value::Object(merged)
}

#[cfg(test)]
mod tests {
    use super::{computer_use_of, level_of, merge_top_level, read_json, write_json};
    use serde_json::json;

    /// 信任档位只认 pi 支持的三值；写错或没写都当作没指定，让 pi 用自己的默认
    #[test]
    fn reads_project_trust_only_for_known_levels() {
        let cases = [
            (json!({ "defaultProjectTrust": "always" }), Some("always")),
            (json!({ "defaultProjectTrust": "never" }), Some("never")),
            (json!({ "defaultProjectTrust": "ask" }), Some("ask")),
            (json!({ "defaultProjectTrust": "whatever" }), None),
            (json!({ "defaultProjectTrust": 1 }), None),
            (json!({}), None),
        ];
        for (settings, expected) in cases {
            assert_eq!(level_of(&settings), expected.map(str::to_string));
        }
    }

    #[test]
    fn keeps_unknown_top_level_keys() {
        let original = json!({ "providers": { "a": {} }, "futureKey": 42 });
        let patch = json!({ "providers": { "b": {} } });
        let merged = merge_top_level(&original, &patch);

        // GUI 不认识的顶层键必须原样带过去
        assert_eq!(merged["futureKey"], 42);
        // 认识的键整个替换，由前端负责保全其内部字段
        assert!(merged["providers"].get("a").is_none());
        assert!(merged["providers"].get("b").is_some());
    }

    /// 顶层合并只有一层。嵌套字段的保全靠前端展开式更新，
    /// 这条测试把边界固定下来，避免有人误以为这里会做深合并。
    #[test]
    fn does_not_deep_merge() {
        let original = json!({ "providers": { "a": { "apiKey": "secret" } } });
        let patch = json!({ "providers": { "a": { "baseUrl": "x" } } });
        let merged = merge_top_level(&original, &patch);
        assert!(merged["providers"]["a"].get("apiKey").is_none());
    }

    #[test]
    fn patch_wins_over_original() {
        let original = json!({ "theme": "light" });
        let patch = json!({ "theme": "dark" });
        assert_eq!(merge_top_level(&original, &patch)["theme"], "dark");
    }

    /// 文件不存在或为空都属首次使用，应给出空对象而不是报错
    #[test]
    fn reads_missing_file_as_empty_object() {
        let path = std::env::temp_dir().join("piazza_absent_xyz.json");
        let _ = std::fs::remove_file(&path);
        assert_eq!(read_json(&path).unwrap(), json!({}));
    }

    /// 用真实的 models.json 走一遍完整读写路径，确认往返后逐字节一致。
    /// 会写用户文件，故默认跳过：`cargo test -- --ignored live_roundtrip`
    #[test]
    #[ignore = "会写入用户真实配置"]
    fn live_roundtrip_preserves_user_config() {
        let path = super::models_path().expect("定位配置失败");
        let before = read_json(&path).expect("读取失败");
        let merged = merge_top_level(&before, &before);
        write_json(&path, &merged).expect("写入失败");
        let after = read_json(&path).expect("回读失败");
        assert_eq!(before, after, "往返后配置内容发生变化");

        // 内容相等还不够：键顺序若被重排，用户手写配置的可读性就毁了，
        // 且 diff 会充满无关变更。这里比对序列化后的文本。
        let before_text = serde_json::to_string_pretty(&before).unwrap();
        let after_text = serde_json::to_string_pretty(&after).unwrap();
        assert_eq!(before_text, after_text, "往返后键顺序发生变化");
    }

    #[test]
    fn write_creates_backup_and_survives_reread() {
        let dir = std::env::temp_dir().join("piazza_cfg_test");
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("models.json");

        write_json(&path, &json!({ "v": 1 })).unwrap();
        // 首次写入时原文件不存在，不应产生备份
        assert!(!path.with_extension("json.bak").exists());

        write_json(&path, &json!({ "v": 2 })).unwrap();
        assert_eq!(read_json(&path).unwrap()["v"], 2);
        // 第二次写入前的内容应留在 .bak 里
        assert_eq!(read_json(&path.with_extension("json.bak")).unwrap()["v"], 1);

        // 临时文件必须已被 rename 消费掉，不能留在目录里
        assert!(!path.with_extension("json.tmp").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_computer_use_defaults_and_overrides() {
        assert_eq!(computer_use_of(&json!({})), (true, true));
        assert_eq!(
            computer_use_of(&json!({ "computerUse": { "enabled": false } })),
            (false, true)
        );
        assert_eq!(
            computer_use_of(&json!({ "computerUse": { "visualCursor": false } })),
            (true, false)
        );
    }
}
