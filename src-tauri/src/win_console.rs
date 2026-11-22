//! 让 Windows 上启动的控制台程序不要弹窗口。
//!
//! 应用是 GUI 子系统（`windows_subsystem = "windows"`），**自身没有控制台**。
//! 这时 CreateProcess 启动一个控制台子系统程序（node.exe、git.exe 都是），
//! 系统会给它**新建一个控制台窗口**——于是切一次会话就闪出一个黑框，
//! 而且 worker 活得越久，那个框就在那儿摆多久。
//!
//! 唯一的解法是 spawn 时带 `CREATE_NO_WINDOW`（0x08000000）。
//! 不加这个标志，任何 `Command::new("node.exe")` 都会复现。

/// CREATE_NO_WINDOW，见 Win32 进程创建标志
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 给 std 的命令加隐藏窗口标志
#[cfg(windows)]
pub fn hide_console_std(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console_std(_command: &mut std::process::Command) {}

/// 给 tokio 的命令加隐藏窗口标志
#[cfg(windows)]
pub fn hide_console_tokio(command: &mut tokio::process::Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console_tokio(_command: &mut tokio::process::Command) {}
