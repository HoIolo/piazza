//! 内置终端：为每个标签页开一个真实 PTY。
//!
//! 用 PTY 而不是 `Command` + 管道，是因为管道下 shell 检测不到 tty，
//! 会关掉提示符、颜色与交互式行为——那样只是个命令执行器，不是终端。
//!
//! 输出以 base64 传给前端而非字符串：一次 read 很可能切在多字节字符中间，
//! 按 UTF-8 解码会产生替换字符且再也补不回来。原样传字节，交给 xterm 拼接。
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use base64::Engine;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use tauri::{AppHandle, Emitter};

pub const EVT_OUTPUT: &str = "terminal://output";
pub const EVT_EXIT: &str = "terminal://exit";

#[derive(Clone, serde::Serialize)]
pub struct OutputPayload {
    pub id: String,
    /// base64 编码的原始字节
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
pub struct ExitPayload {
    pub id: String,
}

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    /// 持有子进程句柄，drop 时才好主动结束它
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, Session>>,
}

/// 用户的登录 shell。取 $SHELL 是因为要的是「他平时那个 shell」，
/// 而不是某个写死的默认值。
fn user_shell() -> String {
    if cfg!(windows) {
        // Windows 没有「登录 shell」这一说：有 PowerShell 就用它，否则退回 COMSPEC
        let ps = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
        if std::path::Path::new(ps).exists() {
            return ps.to_string();
        }
        return std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
    }
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

/// shell 的启动参数。POSIX 下要 `-l`，用户的 profile 才会加载——
/// 提示符里的 git 分支、别名都靠它。Windows 上 PowerShell 用 `-NoLogo` 去掉横幅，
/// cmd.exe 不接受任何参数。
fn shell_args(shell: &str) -> &'static [&'static str] {
    if cfg!(windows) {
        let lower = shell.to_ascii_lowercase();
        if lower.ends_with("powershell.exe") || lower.ends_with("pwsh.exe") {
            return &["-NoLogo"];
        }
        return &[];
    }
    &["-l"]
}

/// 组装启动 shell 的命令。抽出来是为了让测试用与运行时完全相同的配置。
fn build_command(shell: &str, cwd: Option<String>) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(shell);
    for arg in shell_args(shell) {
        cmd.arg(arg);
    }
    if let Some(dir) = cwd.filter(|d| std::path::Path::new(d).is_dir()) {
        cmd.cwd(dir);
    }
    // 告诉 shell 这是什么终端，颜色与光标控制才正确
    cmd.env("TERM", "xterm-256color");
    cmd
}

impl TerminalState {
    pub fn open(
        &self,
        app: &AppHandle,
        id: String,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        if self.sessions.lock().unwrap().contains_key(&id) {
            return Ok(());
        }

        let pair = NativePtySystem::default()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("创建 PTY 失败：{e}"))?;

        let shell = user_shell();
        let cmd = build_command(&shell, cwd);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("启动 {shell} 失败：{e}"))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("获取 PTY 输入端失败：{e}"))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("获取 PTY 输出端失败：{e}"))?;

        self.sessions.lock().unwrap().insert(
            id.clone(),
            Session {
                writer,
                master: pair.master,
                child,
            },
        );

        let handle = app.clone();
        let engine = base64::engine::general_purpose::STANDARD;
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let payload = OutputPayload {
                            id: id.clone(),
                            data: engine.encode(&buf[..n]),
                        };
                        if handle.emit(EVT_OUTPUT, payload).is_err() {
                            break;
                        }
                    }
                }
            }
            let _ = handle.emit(EVT_EXIT, ExitPayload { id });
        });

        Ok(())
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(id).ok_or("终端不存在")?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("写入终端失败：{e}"))?;
        session.writer.flush().map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions.get(id).ok_or("终端不存在")?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("调整终端尺寸失败：{e}"))
    }

    pub fn close(&self, id: &str) {
        if let Some(mut session) = self.sessions.lock().unwrap().remove(id) {
            // 先杀子进程，读线程随之读到 EOF 自行退出
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    /// 真开一个 PTY 跑用户的 shell，写一条命令再把输出读回来。
    ///
    /// 这条链路（登录 shell 能起来、tty 可读可写、命令真的被执行）
    /// 光靠编译通过是验证不了的，而它恰好是内置终端能否用的全部前提。
    #[test]
    fn pty_round_trip() {
        let pair = NativePtySystem::default()
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("开 PTY");

        let shell = user_shell();
        let mut child = pair
            .slave
            .spawn_command(build_command(&shell, None))
            .expect("启动 shell");

        let mut writer = pair.master.take_writer().expect("取输入端");
        let mut reader = pair.master.try_clone_reader().expect("取输出端");

        let (tx, rx) = mpsc::channel::<String>();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                if tx
                    .send(String::from_utf8_lossy(&buf[..n]).into_owned())
                    .is_err()
                {
                    break;
                }
            }
        });

        writer.write_all(b"echo __pi_pty_ok__\n").expect("写入命令");
        writer.flush().expect("刷新");

        // 登录 shell 会先打印一堆自己的东西，标记未必在第一段里
        let mut seen = String::new();
        let deadline = Duration::from_secs(15);
        while let Ok(chunk) = rx.recv_timeout(deadline) {
            seen.push_str(&chunk);
            // 命令回显本身也含这个词，出现两次才说明它被真正执行了
            if seen.matches("__pi_pty_ok__").count() >= 2 {
                break;
            }
        }

        let _ = child.kill();
        let _ = child.wait();

        assert!(
            seen.matches("__pi_pty_ok__").count() >= 2,
            "PTY 未回传命令执行结果，实际读到：{seen}"
        );
    }
}
