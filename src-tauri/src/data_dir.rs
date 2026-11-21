//! 应用自有数据根与 pi agent 目录。
//!
//! 与 pi CLI 隔离（对齐 PI-Desktop 的做法）：Piazza 的凭据、设置、技能、扩展、
//! MCP 与会话都放在自己的目录里，`~/.pi/agent` 只在首次导入时读一次。
//! 会话仍然是 pi 的原生 JSONL —— 只换目录，不换格式。
//!
//! 优先级：`PIAZZA_DATA_DIR` > `~/.piazza`。
//! 开发与正式版共用同一个目录：会话、凭据、技能都是同一份，
//! 想并行跑两套配置时用 `PIAZZA_DATA_DIR` 指到别处。

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

const ENV_DATA_DIR: &str = "PIAZZA_DATA_DIR";

/// 应用数据根。
pub fn data_root() -> Result<PathBuf, String> {
    Ok(resolve(&home()?, std::env::var_os(ENV_DATA_DIR).as_deref()))
}

/// 环境变量优先，空值视为没设。抽成纯函数便于测试，不靠改进程环境。
fn resolve(home: &Path, override_dir: Option<&OsStr>) -> PathBuf {
    match override_dir {
        Some(dir) if !dir.is_empty() => PathBuf::from(dir),
        _ => home.join(ROOT_NAME),
    }
}

/// pi 的 agent 目录。worker 通过 `PI_CODING_AGENT_DIR` 拿到同一个值。
pub fn agent_dir() -> Result<PathBuf, String> {
    Ok(data_root()?.join("agent"))
}

pub fn sessions_dir() -> Result<PathBuf, String> {
    Ok(agent_dir()?.join("sessions"))
}

/// pi CLI 自己的目录，只用于首次导入。
pub fn cli_agent_dir() -> Result<PathBuf, String> {
    Ok(home()?.join(".pi/agent"))
}

fn home() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "无法定位用户主目录".to_string())
}

const ROOT_NAME: &str = ".piazza";

#[cfg(test)]
mod tests {
    use super::{resolve, ROOT_NAME};
    use std::ffi::OsStr;
    use std::path::Path;

    #[test]
    fn data_root_defaults_to_dot_piazza() {
        // 开发与正式版共用一个目录，不再区分 -dev
        assert_eq!(ROOT_NAME, ".piazza");
        let home = Path::new("/Users/demo");
        assert_eq!(resolve(home, None), home.join(".piazza"));
        // 空值当作没设，否则空字符串会变成当前目录，数据就散到 cwd 里了
        assert_eq!(resolve(home, Some(OsStr::new(""))), home.join(".piazza"));
    }

    #[test]
    fn data_root_honours_the_override() {
        let home = Path::new("/Users/demo");
        let custom = Path::new("/Volumes/disk/piazza");
        assert_eq!(resolve(home, Some(custom.as_os_str())), custom);
    }
}
