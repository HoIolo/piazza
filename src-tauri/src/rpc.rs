use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

/// 一条通道对应一个 pi 进程，各自往前端发一组事件。
///
/// 主会话与侧边聊天是两个互不相干的 pi：共用事件名的话，前端分不清一帧
/// 属于谁，侧边聊天的回答会直接灌进主会话。
#[derive(Clone, Copy)]
pub struct Channel {
    message: &'static str,
    stderr: &'static str,
    exit: &'static str,
}

/// 主会话。事件名需与 src/rpc/client.ts 保持一致
pub const MAIN: Channel = Channel {
    message: "pi://message",
    stderr: "pi://stderr",
    exit: "pi://exit",
};

/// 侧边聊天
pub const SIDE: Channel = Channel {
    message: "pi-side://message",
    stderr: "pi-side://stderr",
    exit: "pi-side://exit",
};

pub const ACCOUNTS: Channel = Channel {
    message: "pi-accounts://message",
    stderr: "pi-accounts://stderr",
    exit: "pi-accounts://exit",
};

/// 读取缓冲区大小。单帧可能远超此值（如大文件内容），
/// 分帧逻辑会跨多次读取持续累积，不受此值限制。
const READ_CHUNK: usize = 16 * 1024;

/// stderr 保留的段数。进程死因通常就在最后几段里，全量留着只会白占内存
const STDERR_TAIL_SEGMENTS: usize = 20;
/// 随退出事件带给前端的 stderr 上限，避免一条事件塞进几十 KB
const STDERR_TAIL_CHARS: usize = 2000;

/// stdout 关闭后等待进程退出的上限。
///
/// stdout 关闭不等于进程已经退出：pi 可能刚崩在写 stdout 上、也可能有子进程
/// 继承了管道。少一个退出码只是信息不全，卡住整条 RPC 链路则是灾难，
/// 所以宁可超时放弃。放弃后 Child 被丢弃，kill_on_drop 会保证进程不残留。
const EXIT_WAIT: Duration = Duration::from_secs(2);

/// 单条命令写入 stdin 的上限。
///
/// pi 若不再读 stdin，管道缓冲写满后 write_all 会一直挂着，而这期间会话锁
/// 正被握在手里——同样会让之后所有命令陪葬。
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    pub cwd: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub session_path: Option<String>,
    /// 临时会话：不落会话文件。侧边聊天用，它不该出现在会话列表里
    pub ephemeral: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ExitPayload {
    pub code: Option<i32>,
    /// 退出前的最后一段 stderr。正常退出时为空，异常退出时真正的死因在这里
    pub stderr: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SlotEvent<T> {
    slot_id: String,
    payload: T,
}

#[derive(Default)]
struct SlotHandle {
    inner: Arc<Mutex<Option<RunningSession>>>,
    /// 会话代号。每次 start/stop 递增，用于区分「主动切换导致的退出」与「意外退出」——
    /// 切换会话时会先 kill 旧进程，若不区分就会每切一次都误报一次进程退出。
    generation: Arc<AtomicU64>,
}

pub struct RpcState {
    channel: Channel,
    slots: Mutex<HashMap<String, Arc<SlotHandle>>>,
}

impl RpcState {
    pub fn new(channel: Channel) -> Self {
        Self {
            channel,
            slots: Mutex::default(),
        }
    }

    async fn get_or_create_slot(&self, slot_id: &str) -> Arc<SlotHandle> {
        let mut map = self.slots.lock().await;
        map.entry(slot_id.to_string())
            .or_insert_with(|| Arc::new(SlotHandle::default()))
            .clone()
    }

    async fn get_slot(&self, slot_id: &str) -> Option<Arc<SlotHandle>> {
        self.slots.lock().await.get(slot_id).cloned()
    }
}

/// stdout reader 收尾时要用的东西：判断是否意外退出、取退出码、取死因
struct ExitContext {
    channel: Channel,
    slot_id: String,
    generation: Arc<AtomicU64>,
    my_generation: u64,
    session: Arc<Mutex<Option<RunningSession>>>,
    stderr_tail: Arc<Mutex<VecDeque<String>>>,
}

struct RunningSession {
    child: Child,
    stdin: ChildStdin,
}

impl RpcState {
    /// 启动指定槽位的 pi RPC 进程。该槽位已有进程时先终止，其它槽位的进程互不干扰。
    pub async fn start(
        &self,
        app: AppHandle,
        opts: StartOptions,
        slot_id: &str,
    ) -> Result<(), String> {
        let handle = self.get_or_create_slot(slot_id).await;
        let mut slot = handle.inner.lock().await;
        let generation = handle.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(mut previous) = slot.take() {
            let _ = previous.child.kill().await;
        }

        let runtime = app
            .path()
            .resolve("resources/pi-runtime", BaseDirectory::Resource)
            .map_err(|e| format!("无法定位内置 Pi 运行时：{e}"))?;
        let bin = runtime.join("bin");
        // Windows 的 node 可执行文件带扩展名，路径拼错就变成「缺少内置运行时」
        let node = bin.join(if cfg!(windows) { "node.exe" } else { "node" });
        let worker = runtime.join("worker.mjs");
        if !node.is_file() || !worker.is_file() {
            return Err("Piazza 安装包缺少内置 Pi 运行时".into());
        }
        let inherited_path = std::env::var_os("PATH").unwrap_or_default();
        let path = std::env::join_paths(std::iter::once(bin).chain(std::env::split_paths(&inherited_path)))
            .map_err(|e| format!("无法设置内置运行时路径：{e}"))?;

        let mut extra: Vec<String> = Vec::new();
        if self.channel.message == ACCOUNTS.message {
            extra.push("--accounts".into());
        }
        if let Some(p) = opts.provider.filter(|s| !s.is_empty()) {
            extra.push("--provider".into());
            extra.push(p);
        }
        if let Some(m) = opts.model.filter(|s| !s.is_empty()) {
            extra.push("--model".into());
            extra.push(m);
        }
        if let Some(s) = opts.session_path.filter(|s| !s.is_empty()) {
            extra.push("--session".into());
            extra.push(s);
        }
        if self.channel.message == MAIN.message {
            extra.push("--auto-title".into());
            /*
             * 两个内置扩展：待办清单，以及 Codex 风格的提问工具。
             * 后者只提供「结构化问卷」的编码，具体长什么样由界面决定——
             * 用户在 ~/.piazza/agent/extensions 里放了同名扩展时，pi 只认先
             * 加载的那个（CLI 传入的优先），不会出现两个同名工具。
             */
            for name in ["task-plan.ts", "ask-user-question.ts"] {
                let extension = app
                    .path()
                    .resolve(format!("resources/{name}"), BaseDirectory::Resource)
                    .map_err(|e| format!("无法定位内置扩展 {name}：{e}"))?;
                extra.push("--extension".into());
                extra.push(extension.to_string_lossy().into_owned());
            }
        }
        if opts.ephemeral.unwrap_or(false) {
            extra.push("--no-session".into());
        }

        /*
         * 把 pi 的 agent 目录指到应用自己的位置：凭据、设置、技能、扩展与会话
         * 都跟 CLI 分开，两边同时跑不会互相覆写（对齐 PI-Desktop 的数据隔离）。
         * SDK 认这个环境变量，worker 里的 getAgentDir() 会自动跟上。
         */
        let agent_dir = crate::data_dir::agent_dir()?;
        let cwd = spawn_cwd(&opts.cwd)?;
        let mut command = Command::new(node);
        // Windows 上不给这个标志，切会话时就会弹出一个黑框窗口
        crate::win_console::hide_console_tokio(&mut command);
        command
            .arg(worker)
            .args(&extra)
            .env("PATH", path)
            .env("PI_CODING_AGENT_DIR", agent_dir)
            .env_remove("NODE_PATH")
            .env_remove("NODE_OPTIONS");
        if let Some(dir) = cwd {
            command.current_dir(dir);
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("启动内置 Pi SDK 失败：{e}"))?;

        let stdin = child.stdin.take().ok_or("无法取得 pi 的 stdin")?;
        let stdout = child.stdout.take().ok_or("无法取得 pi 的 stdout")?;
        let stderr = child.stderr.take().ok_or("无法取得 pi 的 stderr")?;

        // 每个进程单独保留 stderr 尾部，旧进程收尾时不会混入新会话。
        let stderr_tail = Arc::new(Mutex::new(VecDeque::new()));

        *slot = Some(RunningSession { child, stdin });
        spawn_frame_reader(
            app.clone(),
            stdout,
            ExitContext {
                channel: self.channel,
                slot_id: slot_id.to_string(),
                generation: Arc::clone(&handle.generation),
                my_generation: generation,
                session: Arc::clone(&handle.inner),
                stderr_tail: Arc::clone(&stderr_tail),
            },
        );
        spawn_stderr_reader(app, self.channel, slot_id.to_string(), stderr, stderr_tail);
        Ok(())
    }

    /// 发送一条 RPC 命令到指定槽位。协议要求每条命令占一行，以 LF 结尾。
    pub async fn send(&self, slot_id: &str, payload: &serde_json::Value) -> Result<(), String> {
        let handle = self.get_slot(slot_id).await.ok_or("pi 会话尚未启动")?;
        let mut guard = handle.inner.lock().await;
        let session = guard.as_mut().ok_or("pi 会话尚未启动")?;

        let mut line = serde_json::to_vec(payload).map_err(|e| e.to_string())?;
        line.push(b'\n');

        // 超时即报错返回，锁随 guard 一同释放，不把后续命令一起拖死
        match timeout(WRITE_TIMEOUT, write_line(&mut session.stdin, &line)).await {
            Ok(result) => result.map_err(|e| e.to_string()),
            Err(_) => Err("写入 pi 超时，它可能已经不再读取输入".into()),
        }
    }

    pub async fn stop(&self, slot_id: &str) -> Result<(), String> {
        let handle = {
            let mut map = self.slots.lock().await;
            map.remove(slot_id)
        };
        let Some(handle) = handle else {
            return Ok(());
        };
        // 先让代号前进，旧 reader 随后发现自己已过期，便不会把这次退出报成异常
        let taken = {
            let mut slot = handle.inner.lock().await;
            handle.generation.fetch_add(1, Ordering::SeqCst);
            slot.take()
        };
        if let Some(mut session) = taken {
            session.child.kill().await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub async fn is_running(&self, slot_id: &str) -> bool {
        let Some(handle) = self.get_slot(slot_id).await else {
            return false;
        };
        let running = handle.inner.lock().await.is_some();
        running
    }
}

/// 按 JSONL 严格分帧读取 stdout。
///
/// pi 的 RPC 协议明确规定：**只以 LF 作为记录分隔符**，并允许输入带
/// 可选的 CR。绝不能使用通用行读取器——Node 的 readline 会额外在
/// U+2028 / U+2029 处断行，而这两个字符在 JSON 字符串内是合法内容，
/// 那样会把一帧劈成两半导致解析失败。这里手工按字节扫描 0x0A。
/// 决定子进程的工作目录。
///
/// 空串必须当成「不用改」，不能直接交给 `Command::current_dir`：
/// 空路径会让 chdir 失败，整个 spawn 报 ENOENT——macOS 上是
/// "No such file or directory"，Windows 上是「系统找不到指定的文件」，
/// 用户看到的却只是「pi 进程找不到」。账号授权那条通道本来就不关心 cwd，
/// 传的就是空串。
///
/// 非空但目录已不存在（例如从 mac 导入的会话在 Windows 上打开），
/// 直接报清楚是哪个目录，比冒一句 ENOENT 强。
fn spawn_cwd(cwd: &str) -> Result<Option<&str>, String> {
    if cwd.is_empty() {
        return Ok(None);
    }
    if !std::path::Path::new(cwd).is_dir() {
        return Err(format!("项目目录不存在：{cwd}"));
    }
    Ok(Some(cwd))
}

fn spawn_frame_reader(app: AppHandle, stdout: tokio::process::ChildStdout, ctx: ExitContext) {
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut buf: Vec<u8> = Vec::with_capacity(READ_CHUNK);
        let mut chunk = vec![0u8; READ_CHUNK];

        loop {
            let n = match reader.read(&mut chunk).await {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };
            if ctx.generation.load(Ordering::SeqCst) != ctx.my_generation {
                return;
            }
            buf.extend_from_slice(&chunk[..n]);
            for frame in take_frames(&mut buf) {
                emit_frame(&app, ctx.channel, &ctx.slot_id, &frame);
            }
        }

        /*
         * 先把会话取出来、立刻放开锁，再去等退出码。
         *
         * 不能写成 `match ctx.session.lock().await.take() { ... }`：那样临时的
         * MutexGuard 会活到整个 match 结束，wait() 就是抱着锁在等。一旦 pi 关掉
         * stdout 却没真正退出，这把锁永远不放，之后每一次 start/stop/send 都会
         * 死锁——界面表现为永远停在启动中，而 Rust 侧看上去「空闲」，
         * 因为等锁的任务只是 parked，采样里根本看不到它。
         */
        let taken = {
            let mut slot = ctx.session.lock().await;
            // 代号已前进说明是主动切换，旧 reader 不能取走新进程。
            if ctx.generation.load(Ordering::SeqCst) != ctx.my_generation {
                return;
            }
            // 进程结束时可能还有一帧没有 LF。
            if !buf.is_empty() {
                emit_frame(&app, ctx.channel, &ctx.slot_id, &buf);
            }
            slot.take()
        };
        let code = match taken {
            Some(mut session) => wait_code(&mut session.child).await,
            None => None,
        };
        let stderr = tail_snapshot(&ctx.stderr_tail).await;
        if ctx.generation.load(Ordering::SeqCst) == ctx.my_generation {
            let _ = app.emit(
                ctx.channel.exit,
                SlotEvent {
                    slot_id: ctx.slot_id,
                    payload: ExitPayload { code, stderr },
                },
            );
        }
    });
}

/// 写一行并冲刷。抽出来是为了让 timeout 能一次性包住这两步
async fn write_line(stdin: &mut ChildStdin, line: &[u8]) -> std::io::Result<()> {
    stdin.write_all(line).await?;
    stdin.flush().await
}

/// 有上限地等一个已经关掉 stdout 的子进程退出，拿不到退出码就算了
async fn wait_code(child: &mut Child) -> Option<i32> {
    match timeout(EXIT_WAIT, child.wait()).await {
        Ok(Ok(status)) => status.code(),
        _ => None,
    }
}

/// 取 stderr 尾部快照
async fn tail_snapshot(tail: &Mutex<VecDeque<String>>) -> String {
    let joined: String = tail.lock().await.iter().cloned().collect();
    clip_tail(&joined)
}

/// 超长时只保留末尾——死因总在最后，开头多是启动噪声。
/// 按字符而非字节截断，否则会把多字节字符劈成乱码。
fn clip_tail(text: &str) -> String {
    let total = text.chars().count();
    if total <= STDERR_TAIL_CHARS {
        return text.to_string();
    }
    text.chars().skip(total - STDERR_TAIL_CHARS).collect()
}

/// 从缓冲区切出所有完整帧，未以 LF 收尾的尾部保留在 buf 中等待后续数据。
///
/// 只以 `0x0A` 分割，并剥离可选的尾随 CR。绝不能改用通用行读取器——
/// 例如 Node 的 readline 会额外在 U+2028 / U+2029 处断行，而这两个字符
/// 在 JSON 字符串内是合法内容，那样会把一帧劈成两半导致解析失败。
fn take_frames(buf: &mut Vec<u8>) -> Vec<Vec<u8>> {
    let mut frames = Vec::new();
    let mut start = 0usize;

    while let Some(offset) = buf[start..].iter().position(|&b| b == b'\n') {
        let end = start + offset;
        let raw = &buf[start..end];
        let raw = raw.strip_suffix(b"\r").unwrap_or(raw);
        if !raw.is_empty() {
            frames.push(raw.to_vec());
        }
        start = end + 1;
    }

    buf.drain(..start);
    frames
}

/// 解析并转发单帧。剥离可选的尾随 CR 以兼容 CRLF 输入。
fn emit_frame(app: &AppHandle, channel: Channel, slot_id: &str, raw: &[u8]) {
    let raw = raw.strip_suffix(b"\r").unwrap_or(raw);
    if raw.is_empty() {
        return;
    }
    match serde_json::from_slice::<serde_json::Value>(raw) {
        Ok(value) => {
            let _ = app.emit(
                channel.message,
                SlotEvent {
                    slot_id: slot_id.to_string(),
                    payload: value,
                },
            );
        }
        Err(e) => {
            let text = String::from_utf8_lossy(raw);
            let _ = app.emit(
                channel.stderr,
                SlotEvent {
                    slot_id: slot_id.to_string(),
                    payload: format!("帧解析失败：{e} | 原始内容：{text}"),
                },
            );
        }
    }
}

fn spawn_stderr_reader(
    app: AppHandle,
    channel: Channel,
    slot_id: String,
    stderr: tokio::process::ChildStderr,
    tail: Arc<Mutex<VecDeque<String>>>,
) {
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut chunk = vec![0u8; 4096];
        while let Ok(n) = reader.read(&mut chunk).await {
            if n == 0 {
                break;
            }
            let text = String::from_utf8_lossy(&chunk[..n]).into_owned();

            // 留一份滚动副本：转发出去的事件目前没人接，进程一死原因就没了
            {
                let mut guard = tail.lock().await;
                guard.push_back(text.clone());
                while guard.len() > STDERR_TAIL_SEGMENTS {
                    guard.pop_front();
                }
            }

            let _ = app.emit(
                channel.stderr,
                SlotEvent {
                    slot_id: slot_id.clone(),
                    payload: text,
                },
            );
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{clip_tail, spawn_cwd, take_frames, wait_code, EXIT_WAIT, STDERR_TAIL_CHARS};
    use std::process::Stdio;
    use tokio::process::Command;

    fn frames_of(input: &str) -> (Vec<String>, String) {
        let mut buf = input.as_bytes().to_vec();
        let frames = take_frames(&mut buf)
            .into_iter()
            .map(|f| String::from_utf8(f).unwrap())
            .collect();
        (frames, String::from_utf8(buf).unwrap())
    }

    #[test]
    fn splits_on_lf_only() {
        let (frames, rest) = frames_of("{\"a\":1}\n{\"b\":2}\n");
        assert_eq!(frames, vec!["{\"a\":1}", "{\"b\":2}"]);
        assert!(rest.is_empty());
    }

    #[test]
    fn strips_trailing_cr() {
        let (frames, _) = frames_of("{\"a\":1}\r\n");
        assert_eq!(frames, vec!["{\"a\":1}"]);
    }

    /// U+2028 / U+2029 在 JSON 字符串里合法，绝不能当作分隔符
    #[test]
    fn keeps_unicode_line_separators_intact() {
        let (frames, _) = frames_of("{\"t\":\"a\u{2028}b\u{2029}c\"}\n");
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0], "{\"t\":\"a\u{2028}b\u{2029}c\"}");
    }

    /// 未以 LF 收尾的尾部要留在缓冲区，等待下一次读取补齐
    #[test]
    fn keeps_incomplete_tail_in_buffer() {
        let (frames, rest) = frames_of("{\"a\":1}\n{\"partial\"");
        assert_eq!(frames, vec!["{\"a\":1}"]);
        assert_eq!(rest, "{\"partial\"");
    }

    #[test]
    fn reassembles_frame_across_reads() {
        let mut buf = b"{\"long\":\"".to_vec();
        assert!(take_frames(&mut buf).is_empty());

        buf.extend_from_slice(b"value\"}\n");
        let frames = take_frames(&mut buf);
        assert_eq!(frames.len(), 1);
        assert_eq!(String::from_utf8(frames[0].clone()).unwrap(), "{\"long\":\"value\"}");
        assert!(buf.is_empty());
    }

    /// 单帧远超读取块大小（如大文件内容）时不应被截断
    #[test]
    fn handles_oversized_frame() {
        let payload = "x".repeat(200_000);
        let frame = format!("{{\"d\":\"{payload}\"}}");
        let (frames, rest) = frames_of(&format!("{frame}\n"));
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0], frame);
        assert!(rest.is_empty());
    }

    #[test]
    fn skips_empty_lines() {
        let (frames, _) = frames_of("\n\n{\"a\":1}\n\n");
        assert_eq!(frames, vec!["{\"a\":1}"]);
    }

    #[test]
    fn keeps_short_stderr_intact() {
        assert_eq!(clip_tail("boom"), "boom");
    }

    /// 截断必须留下末尾：进程的死因写在最后，砍掉尾巴等于什么都没留
    #[test]
    fn clips_stderr_from_the_front() {
        let text = format!("{}DEATH", "x".repeat(STDERR_TAIL_CHARS + 500));
        let clipped = clip_tail(&text);
        assert_eq!(clipped.chars().count(), STDERR_TAIL_CHARS);
        assert!(clipped.ends_with("DEATH"));
    }

    /// 按字符截断，多字节字符不能被劈开
    #[test]
    fn clips_on_char_boundary() {
        let text = "错".repeat(STDERR_TAIL_CHARS + 10);
        let clipped = clip_tail(&text);
        assert_eq!(clipped.chars().count(), STDERR_TAIL_CHARS);
        assert!(clipped.chars().all(|c| c == '错'));
    }
    /// 子进程迟迟不退出时，wait_code 必须自己收手。
    ///
    /// 这是那次「界面永远停在启动中」的判据：只要这里会无限等下去，
    /// 调用点就会一直攥着会话锁，之后每一条 RPC 命令都被拖死。
    #[tokio::test]
    async fn gives_up_waiting_on_a_live_child() {
        let mut child = Command::new("sleep")
            .arg("30")
            .stdout(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .expect("spawn sleep");

        let started = std::time::Instant::now();
        let code = wait_code(&mut child).await;

        assert_eq!(code, None, "进程还活着，不该报出退出码");
        assert!(
            started.elapsed() < EXIT_WAIT * 2,
            "应当在上限附近放弃，实际等了 {:?}",
            started.elapsed()
        );
    }

    /// 正常退出的进程仍要能拿到真实退出码，别为了防挂起把功能也砍了
    #[tokio::test]
    async fn still_reports_a_real_exit_code() {
        let mut child = Command::new("sh")
            .args(["-c", "exit 7"])
            .stdout(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .expect("spawn sh");

        assert_eq!(wait_code(&mut child).await, Some(7));
    }

    /// 空串不能交给 current_dir：那会让 spawn 直接 ENOENT，
    /// 而账号授权通道正是这么传的（见 useProviderAccounts 的 start({ cwd: '' })）
    #[test]
    fn empty_cwd_means_leave_it_alone() {
        assert_eq!(spawn_cwd("").unwrap(), None);
    }

    #[test]
    fn existing_cwd_is_passed_through() {
        let dir = std::env::temp_dir();
        let dir = dir.to_string_lossy().into_owned();
        let resolved = spawn_cwd(&dir).unwrap();
        assert_eq!(resolved, Some(dir.as_str()));
    }

    /// 从别的平台导入的会话，cwd 在本机并不存在：要说清是哪个目录
    #[test]
    fn missing_cwd_names_the_directory() {
        let error = spawn_cwd("/definitely/not/a/real/directory").unwrap_err();
        assert!(error.contains("项目目录不存在"), "错误信息太含糊：{error}");
        assert!(error.contains("/definitely/not/a/real/directory"));
    }
}
