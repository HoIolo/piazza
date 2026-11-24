use std::collections::{hash_map::RandomState, HashMap};
use std::hash::{BuildHasher, Hasher};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{sleep, timeout, Duration};

const EVENT_STATE: &str = "piazza://cu-state";
const EVENT_FRAME: &str = "piazza://cu-frame";
const EVENT_STOP_REQUESTED: &str = "piazza://cu-stop-requested";

const PERMISSION_TIMEOUT: Duration = Duration::from_secs(3);
const IDLE_CLEAR_AFTER: Duration = Duration::from_secs(60);
const STREAM_FALLBACK_GAP_MS: u64 = 2000;
const SYNTHETIC_ID_BASE: u32 = 0x8000_0000;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CuPermissions {
    pub supported: bool,
    pub accessibility: bool,
    pub screen_recording: bool,
    pub runtime_ready: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ControlledWindow {
    pub window_id: u32,
    pub app_name: String,
    pub title: String,
    pub app_icon: Option<String>,
    pub active: bool,
    pub last_action: String,
    pub updated_at: u64,
    pub bounds: Option<WindowBounds>,
    pub stream_error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FramePayload {
    pub window_id: u32,
    pub mime_type: String,
    pub data: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct StopRequestedPayload {
    window_id: u32,
}

#[derive(Default)]
struct CuData {
    windows: HashMap<u32, ControlledWindow>,
    app_to_window: HashMap<String, u32>,
    last_stream_frame_ms: HashMap<u32, u64>,
}

struct HelperHandle {
    child: Child,
    stdin: ChildStdin,
}

struct TelemetryEndpoint {
    port: u16,
    token: String,
}

pub struct ComputerUseState {
    data: Arc<Mutex<CuData>>,
    helper: Arc<Mutex<Option<HelperHandle>>>,
    perm_waiters: Arc<Mutex<Vec<oneshot::Sender<(bool, bool)>>>>,
    telemetry: Mutex<Option<TelemetryEndpoint>>,
    idle_gen: Arc<AtomicU64>,
}

impl Default for ComputerUseState {
    fn default() -> Self {
        Self::new()
    }
}

impl ComputerUseState {
    pub fn new() -> Self {
        Self {
            data: Arc::new(Mutex::new(CuData::default())),
            helper: Arc::new(Mutex::new(None)),
            perm_waiters: Arc::new(Mutex::new(Vec::new())),
            telemetry: Mutex::new(None),
            idle_gen: Arc::new(AtomicU64::new(0)),
        }
    }

    pub async fn ensure_telemetry(&self, app: &AppHandle) -> Result<(u16, String), String> {
        let mut guard = self.telemetry.lock().await;
        if let Some(ep) = guard.as_ref() {
            return Ok((ep.port, ep.token.clone()));
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("启动 Computer Use 遥测端口失败：{e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("读取遥测端口失败：{e}"))?
            .port();
        let token = generate_token();

        let ctx = TelemetryCtx {
            app: app.clone(),
            token: token.clone(),
            data: Arc::clone(&self.data),
            helper: Arc::clone(&self.helper),
            perm_waiters: Arc::clone(&self.perm_waiters),
            idle_gen: Arc::clone(&self.idle_gen),
        };
        tauri::async_runtime::spawn(run_telemetry_server(listener, ctx));

        *guard = Some(TelemetryEndpoint {
            port,
            token: token.clone(),
        });
        Ok((port, token))
    }

    pub async fn shutdown(&self) {
        self.idle_gen.fetch_add(1, Ordering::SeqCst);
        let mut guard = self.helper.lock().await;
        if let Some(mut h) = guard.take() {
            let _ = h.stdin.shutdown().await;
            let _ = h.child.kill().await;
        }
    }

    fn helper_ctx(&self, app: &AppHandle) -> HelperCtx {
        HelperCtx {
            app: app.clone(),
            data: Arc::clone(&self.data),
            helper: Arc::clone(&self.helper),
            perm_waiters: Arc::clone(&self.perm_waiters),
        }
    }

    async fn check_permissions(&self, app: &AppHandle) -> Result<CuPermissions, String> {
        let runtime_ready = resolve_runtime_dir(app)
            .map(|dir| dir.is_dir())
            .unwrap_or(false);
        if cfg!(not(target_os = "macos")) {
            return Ok(CuPermissions {
                supported: false,
                accessibility: false,
                screen_recording: false,
                runtime_ready,
            });
        }

        let (tx, rx) = oneshot::channel();
        self.perm_waiters.lock().await.push(tx);
        let ctx = self.helper_ctx(app);
        send_helper_cmd(&ctx, serde_json::json!({ "cmd": "check_permissions" })).await?;
        let (accessibility, screen_recording) = timeout(PERMISSION_TIMEOUT, rx)
            .await
            .map_err(|_| "查询 macOS 权限超时".to_string())?
            .map_err(|_| "权限查询通道已关闭".to_string())?;
        Ok(CuPermissions {
            supported: true,
            accessibility,
            screen_recording,
            runtime_ready,
        })
    }

    async fn request_permission(
        &self,
        app: &AppHandle,
        kind: &str,
    ) -> Result<CuPermissions, String> {
        let runtime_ready = resolve_runtime_dir(app)
            .map(|dir| dir.is_dir())
            .unwrap_or(false);
        if cfg!(not(target_os = "macos")) {
            return Ok(CuPermissions {
                supported: false,
                accessibility: false,
                screen_recording: false,
                runtime_ready,
            });
        }
        let (tx, rx) = oneshot::channel();
        self.perm_waiters.lock().await.push(tx);
        let ctx = self.helper_ctx(app);
        send_helper_cmd(
            &ctx,
            serde_json::json!({ "cmd": "request_permission", "kind": kind }),
        )
        .await?;
        let (accessibility, screen_recording) = timeout(PERMISSION_TIMEOUT, rx)
            .await
            .map_err(|_| "请求 macOS 权限超时".to_string())?
            .map_err(|_| "权限请求通道已关闭".to_string())?;
        Ok(CuPermissions {
            supported: true,
            accessibility,
            screen_recording,
            runtime_ready,
        })
    }
}

#[derive(Clone)]
struct HelperCtx {
    app: AppHandle,
    data: Arc<Mutex<CuData>>,
    helper: Arc<Mutex<Option<HelperHandle>>>,
    perm_waiters: Arc<Mutex<Vec<oneshot::Sender<(bool, bool)>>>>,
}

#[derive(Clone)]
struct TelemetryCtx {
    app: AppHandle,
    token: String,
    data: Arc<Mutex<CuData>>,
    helper: Arc<Mutex<Option<HelperHandle>>>,
    perm_waiters: Arc<Mutex<Vec<oneshot::Sender<(bool, bool)>>>>,
    idle_gen: Arc<AtomicU64>,
}

impl TelemetryCtx {
    fn helper_ctx(&self) -> HelperCtx {
        HelperCtx {
            app: self.app.clone(),
            data: Arc::clone(&self.data),
            helper: Arc::clone(&self.helper),
            perm_waiters: Arc::clone(&self.perm_waiters),
        }
    }
}

pub fn resolve_runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resolve("resources/ocu-runtime", BaseDirectory::Resource)
        .map_err(|e| format!("无法定位内置 Open Computer Use 运行时：{e}"))?;
    Ok(dunce::simplified(&dir).to_path_buf())
}

fn generate_token() -> String {
    let mut out = String::with_capacity(32);
    for idx in 0..4u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(idx);
        h.write_u64(now_ms());
        h.write_u32(std::process::id());
        out.push_str(&format!("{:08x}", h.finish() as u32));
    }
    out
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn synthetic_window_id(app_name: &str) -> u32 {
    let mut h = RandomState::new().build_hasher();
    for b in app_name.to_lowercase().as_bytes() {
        h.write_u8(*b);
    }
    SYNTHETIC_ID_BASE | ((h.finish() as u32) & 0x7fff_ffff)
}

fn sorted_windows(data: &CuData) -> Vec<ControlledWindow> {
    let mut list: Vec<ControlledWindow> = data.windows.values().cloned().collect();
    list.sort_by(|a, b| {
        b.active
            .cmp(&a.active)
            .then_with(|| b.updated_at.cmp(&a.updated_at))
            .then_with(|| a.window_id.cmp(&b.window_id))
    });
    list
}

fn emit_state(app: &AppHandle, data: &CuData) {
    let _ = app.emit(EVENT_STATE, sorted_windows(data));
}

async fn send_helper_cmd(ctx: &HelperCtx, cmd: serde_json::Value) -> Result<(), String> {
    if cfg!(not(target_os = "macos")) {
        return Ok(());
    }
    let mut guard = ctx.helper.lock().await;
    if guard.is_none() {
        let runtime_dir = resolve_runtime_dir(&ctx.app)?;
        let bin = runtime_dir.join("ocu-overlay-helper");
        if !bin.is_file() {
            return Err("缺少内置 macOS 悬浮预览助手（ocu-overlay-helper）".into());
        }
        let mut child = Command::new(bin)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("启动 macOS 悬浮预览助手失败：{e}"))?;
        let stdin = child.stdin.take().ok_or("无法取得 helper stdin")?;
        let stdout = child.stdout.take().ok_or("无法取得 helper stdout")?;
        let reader_ctx = ctx.clone();
        tauri::async_runtime::spawn(read_helper_stdout(reader_ctx, stdout));
        *guard = Some(HelperHandle { child, stdin });
    }

    let mut line = serde_json::to_vec(&cmd).map_err(|e| e.to_string())?;
    line.push(b'\n');

    let write_ok = if let Some(handle) = guard.as_mut() {
        handle.stdin.write_all(&line).await.is_ok() && handle.stdin.flush().await.is_ok()
    } else {
        false
    };

    if !write_ok {
        if let Some(mut dead) = guard.take() {
            let _ = dead.child.kill().await;
        }
        return Err("写入 macOS 悬浮预览助手失败".into());
    }
    Ok(())
}

async fn read_helper_stdout(ctx: HelperCtx, stdout: tokio::process::ChildStdout) {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        handle_helper_event(&ctx, msg).await;
    }

    let mut guard = ctx.helper.lock().await;
    if let Some(mut h) = guard.take() {
        let _ = h.child.kill().await;
    }
    let mut waiters = ctx.perm_waiters.lock().await;
    waiters.clear();
}

async fn handle_helper_event(ctx: &HelperCtx, msg: serde_json::Value) {
    let kind = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match kind {
        "permissions" => {
            let ax = msg
                .get("accessibility")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let sr = msg
                .get("screenRecording")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let waiters: Vec<_> = ctx.perm_waiters.lock().await.drain(..).collect();
            for tx in waiters {
                let _ = tx.send((ax, sr));
            }
        }
        "window_info" => {
            let Some(wid) = msg.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32) else {
                return;
            };
            let requested_app = msg
                .get("requestedApp")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            let app_name = msg
                .get("appName")
                .and_then(|v| v.as_str())
                .unwrap_or("App")
                .to_string();
            let title = msg
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let app_icon = msg
                .get("appIcon")
                .and_then(|v| v.as_str())
                .map(|s| format!("data:image/png;base64,{s}"));
            let bounds: Option<WindowBounds> = msg
                .get("bounds")
                .and_then(|v| serde_json::from_value(v.clone()).ok());

            let mut data = ctx.data.lock().await;
            let carried =
                clear_synthetic_windows(&mut data, wid, &[requested_app.as_str(), app_name.as_str()]);

            let entry = data.windows.entry(wid).or_insert_with(|| ControlledWindow {
                window_id: wid,
                app_name: app_name.clone(),
                title: title.clone(),
                app_icon: app_icon.clone(),
                active: carried.as_ref().map(|c| c.active).unwrap_or(true),
                last_action: carried
                    .as_ref()
                    .map(|c| c.last_action.clone())
                    .unwrap_or_else(|| "已连接窗口".to_string()),
                updated_at: carried.as_ref().map(|c| c.updated_at).unwrap_or_else(now_ms),
                bounds: bounds.clone(),
                stream_error: None,
            });
            entry.app_name = app_name;
            if !title.is_empty() {
                entry.title = title;
            }
            if app_icon.is_some() {
                entry.app_icon = app_icon;
            }
            if bounds.is_some() {
                entry.bounds = bounds;
            }
            entry.stream_error = None;
            emit_state(&ctx.app, &data);
        }
        "frame" => {
            let Some(wid) = msg.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32) else {
                return;
            };
            let Some(jpeg) = msg.get("jpeg").and_then(|v| v.as_str()) else {
                return;
            };
            let width = msg.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let height = msg.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            {
                let mut data = ctx.data.lock().await;
                data.last_stream_frame_ms.insert(wid, now_ms());
                if let Some(w) = data.windows.get_mut(&wid) {
                    w.stream_error = None;
                }
            }
            let _ = ctx.app.emit(
                EVENT_FRAME,
                FramePayload {
                    window_id: wid,
                    mime_type: "image/jpeg".to_string(),
                    data: jpeg.to_string(),
                    width,
                    height,
                },
            );
        }
        "stream_error" => {
            let Some(wid) = msg.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32) else {
                return;
            };
            let err = msg
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("屏幕录制权限未授予或窗口不可捕获")
                .to_string();
            let mut data = ctx.data.lock().await;
            if let Some(w) = data.windows.get_mut(&wid) {
                w.stream_error = Some(err);
                emit_state(&ctx.app, &data);
            }
        }
        "badge_stop" => {
            let Some(wid) = msg.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32) else {
                return;
            };
            {
                let mut data = ctx.data.lock().await;
                remove_window(&mut data, wid);
                emit_state(&ctx.app, &data);
            }
            let _ = ctx
                .app
                .emit(EVENT_STOP_REQUESTED, StopRequestedPayload { window_id: wid });
        }
        "window_closed" => {
            let Some(wid) = msg.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32) else {
                return;
            };
            let mut data = ctx.data.lock().await;
            if remove_window(&mut data, wid) {
                emit_state(&ctx.app, &data);
            }
        }
        _ => {}
    }
}

fn remove_window(data: &mut CuData, wid: u32) -> bool {
    let removed = data.windows.remove(&wid).is_some();
    data.last_stream_frame_ms.remove(&wid);
    data.app_to_window.retain(|_, &mut v| v != wid);
    removed
}

fn clear_synthetic_windows(
    data: &mut CuData,
    wid: u32,
    keys: &[&str],
) -> Option<ControlledWindow> {
    let normalized: Vec<String> = keys
        .iter()
        .map(|k| k.trim().to_lowercase())
        .filter(|k| !k.is_empty())
        .collect();

    let mut synthetic_ids: Vec<u32> = normalized
        .iter()
        .filter_map(|k| data.app_to_window.get(k).copied())
        .filter(|&id| id != wid && id >= SYNTHETIC_ID_BASE)
        .collect();

    for (&id, win) in &data.windows {
        if id >= SYNTHETIC_ID_BASE
            && id != wid
            && normalized.iter().any(|k| win.app_name.to_lowercase() == *k)
            && !synthetic_ids.contains(&id)
        {
            synthetic_ids.push(id);
        }
    }

    let mut carried: Option<ControlledWindow> = None;
    for old in &synthetic_ids {
        data.last_stream_frame_ms.remove(old);
        if let Some(removed) = data.windows.remove(old) {
            if carried
                .as_ref()
                .is_none_or(|prev| removed.updated_at >= prev.updated_at)
            {
                carried = Some(removed);
            }
        }
    }
    data.app_to_window
        .retain(|_, &mut v| !synthetic_ids.contains(&v));
    for key in normalized {
        data.app_to_window.insert(key, wid);
    }
    carried
}

async fn run_telemetry_server(listener: TcpListener, ctx: TelemetryCtx) {
    while let Ok((stream, _)) = listener.accept().await {
        let conn_ctx = ctx.clone();
        tauri::async_runtime::spawn(handle_telemetry_conn(stream, conn_ctx));
    }
}

async fn handle_telemetry_conn(stream: TcpStream, ctx: TelemetryCtx) {
    let mut lines = BufReader::new(stream).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let token = msg.get("token").and_then(|v| v.as_str()).unwrap_or("");
        if token != ctx.token {
            continue;
        }
        handle_telemetry_event(&ctx, msg).await;
    }
}

async fn handle_telemetry_event(ctx: &TelemetryCtx, msg: serde_json::Value) {
    let event = msg.get("event").and_then(|v| v.as_str()).unwrap_or("");
    let helper_ctx = ctx.helper_ctx();

    match event {
        "action_start" => {
            ctx.idle_gen.fetch_add(1, Ordering::SeqCst);
            let Some(app_name) = msg.get("appName").and_then(|v| v.as_str()).map(str::trim) else {
                return;
            };
            if app_name.is_empty() {
                return;
            }
            let req_wid = msg.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32);
            let label = msg
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("正在操作")
                .to_string();

            let watch_wid = {
                let mut data = ctx.data.lock().await;
                let key = app_name.to_lowercase();
                let wid = match req_wid {
                    Some(id) if id > 0 => {
                        clear_synthetic_windows(&mut data, id, &[app_name]);
                        id
                    }
                    _ => *data
                        .app_to_window
                        .entry(key)
                        .or_insert_with(|| synthetic_window_id(app_name)),
                };
                let entry = data.windows.entry(wid).or_insert_with(|| ControlledWindow {
                    window_id: wid,
                    app_name: app_name.to_string(),
                    title: String::new(),
                    app_icon: None,
                    active: true,
                    last_action: label.clone(),
                    updated_at: now_ms(),
                    bounds: None,
                    stream_error: None,
                });
                entry.active = true;
                entry.last_action = label.clone();
                entry.updated_at = now_ms();
                emit_state(&ctx.app, &data);
                if wid < SYNTHETIC_ID_BASE {
                    Some(wid)
                } else {
                    None
                }
            };

            let _ = send_helper_cmd(
                &helper_ctx,
                serde_json::json!({
                    "cmd": "watch",
                    "appName": app_name,
                    "windowId": watch_wid,
                    "label": label,
                    "active": true,
                }),
            )
            .await;
        }
        "action_end" => {
            let app_name = msg
                .get("appName")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .unwrap_or("");
            let req_wid = msg.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32);
            let label = msg
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("操作完成")
                .to_string();

            let (fallback_wid, need_watch) = {
                let mut data = ctx.data.lock().await;
                let key = app_name.to_lowercase();
                let (wid, watch_needed) = if let Some(id) = req_wid.filter(|&id| id > 0) {
                    let carried = clear_synthetic_windows(&mut data, id, &[app_name]);
                    let was_missing = !data.windows.contains_key(&id);
                    if let Some(c) = carried {
                        data.windows.entry(id).or_insert(ControlledWindow {
                            window_id: id,
                            ..c
                        });
                    }
                    (Some(id), was_missing)
                } else if !key.is_empty() {
                    (data.app_to_window.get(&key).copied(), false)
                } else {
                    (None, false)
                };

                if let Some(id) = wid {
                    if let Some(w) = data.windows.get_mut(&id) {
                        w.last_action = label.clone();
                        w.updated_at = now_ms();
                    }
                    emit_state(&ctx.app, &data);
                }
                (wid, watch_needed)
            };

            if need_watch {
                if let Some(wid) = fallback_wid {
                    let _ = send_helper_cmd(
                        &helper_ctx,
                        serde_json::json!({
                            "cmd": "watch",
                            "appName": app_name,
                            "windowId": wid,
                            "label": label,
                            "active": true,
                        }),
                    )
                    .await;
                }
            }

            if let (Some(wid), Some(shot)) = (fallback_wid, msg.get("screenshot")) {
                let data_str = shot.get("data").and_then(|v| v.as_str()).unwrap_or("");
                let mime = shot
                    .get("mimeType")
                    .and_then(|v| v.as_str())
                    .unwrap_or("image/png");
                if !data_str.is_empty() {
                    let recent_stream = {
                        let data = ctx.data.lock().await;
                        data.last_stream_frame_ms
                            .get(&wid)
                            .is_some_and(|&t| now_ms().saturating_sub(t) <= STREAM_FALLBACK_GAP_MS)
                    };
                    if !recent_stream {
                        let _ = ctx.app.emit(
                            EVENT_FRAME,
                            FramePayload {
                                window_id: wid,
                                mime_type: mime.to_string(),
                                data: data_str.to_string(),
                                width: 0,
                                height: 0,
                            },
                        );
                    }
                }
            }
        }
        "turn_end" => {
            {
                let mut data = ctx.data.lock().await;
                if data.windows.is_empty() {
                    return;
                }
                for w in data.windows.values_mut() {
                    w.active = false;
                }
                emit_state(&ctx.app, &data);
            }
            let _ = send_helper_cmd(
                &helper_ctx,
                serde_json::json!({ "cmd": "set_active", "active": false }),
            )
            .await;

            let gen = ctx.idle_gen.fetch_add(1, Ordering::SeqCst) + 1;
            let idle_ctx = ctx.clone();
            tauri::async_runtime::spawn(async move {
                sleep(IDLE_CLEAR_AFTER).await;
                if idle_ctx.idle_gen.load(Ordering::SeqCst) != gen {
                    return;
                }
                let mut data = idle_ctx.data.lock().await;
                if data.windows.values().any(|w| w.active) {
                    return;
                }
                data.windows.clear();
                data.app_to_window.clear();
                data.last_stream_frame_ms.clear();
                emit_state(&idle_ctx.app, &data);
                drop(data);
                let _ = send_helper_cmd(
                    &idle_ctx.helper_ctx(),
                    serde_json::json!({ "cmd": "clear" }),
                )
                .await;
            });
        }
        "reset" | "mcp_exit" => {
            ctx.idle_gen.fetch_add(1, Ordering::SeqCst);
            {
                let mut data = ctx.data.lock().await;
                data.windows.clear();
                data.app_to_window.clear();
                data.last_stream_frame_ms.clear();
                emit_state(&ctx.app, &data);
            }
            let _ = send_helper_cmd(&helper_ctx, serde_json::json!({ "cmd": "clear" })).await;
        }
        _ => {}
    }
}

#[tauri::command]
pub async fn cu_permissions(
    app: AppHandle,
    state: State<'_, ComputerUseState>,
) -> Result<CuPermissions, String> {
    state.check_permissions(&app).await
}

#[tauri::command]
pub async fn cu_request_permission(
    app: AppHandle,
    state: State<'_, ComputerUseState>,
    kind: String,
) -> Result<CuPermissions, String> {
    state.request_permission(&app, &kind).await
}

#[tauri::command]
pub async fn cu_focus_window(
    app: AppHandle,
    state: State<'_, ComputerUseState>,
    window_id: u32,
) -> Result<(), String> {
    let ctx = state.helper_ctx(&app);
    send_helper_cmd(&ctx, serde_json::json!({ "cmd": "focus", "windowId": window_id })).await
}

#[tauri::command]
pub async fn cu_unwatch_window(
    app: AppHandle,
    state: State<'_, ComputerUseState>,
    window_id: u32,
) -> Result<(), String> {
    {
        let mut data = state.data.lock().await;
        remove_window(&mut data, window_id);
        emit_state(&app, &data);
    }
    let ctx = state.helper_ctx(&app);
    send_helper_cmd(
        &ctx,
        serde_json::json!({ "cmd": "unwatch", "windowId": window_id }),
    )
    .await
}

#[tauri::command]
pub async fn cu_clear_all(
    app: AppHandle,
    state: State<'_, ComputerUseState>,
) -> Result<(), String> {
    state.idle_gen.fetch_add(1, Ordering::SeqCst);
    {
        let mut data = state.data.lock().await;
        data.windows.clear();
        data.app_to_window.clear();
        data.last_stream_frame_ms.clear();
        emit_state(&app, &data);
    }
    let ctx = state.helper_ctx(&app);
    send_helper_cmd(&ctx, serde_json::json!({ "cmd": "clear" })).await
}

#[tauri::command]
pub async fn cu_list_windows(
    state: State<'_, ComputerUseState>,
) -> Result<Vec<ControlledWindow>, String> {
    let data = state.data.lock().await;
    Ok(sorted_windows(&data))
}

#[cfg(test)]
mod tests {
    use super::{clear_synthetic_windows, synthetic_window_id, ControlledWindow, CuData};

    fn make_placeholder(id: u32, app_name: &str, action: &str, ts: u64) -> ControlledWindow {
        ControlledWindow {
            window_id: id,
            app_name: app_name.to_string(),
            title: String::new(),
            app_icon: None,
            active: true,
            last_action: action.to_string(),
            updated_at: ts,
            bounds: None,
            stream_error: None,
        }
    }

    #[test]
    fn window_info_replaces_synthetic_entry_when_requested_and_resolved_names_match() {
        let mut data = CuData::default();
        let syn_id = synthetic_window_id("Google Chrome");
        data.app_to_window.insert("google chrome".into(), syn_id);
        data.windows
            .insert(syn_id, make_placeholder(syn_id, "Google Chrome", "正在观察界面", 10));
        data.last_stream_frame_ms.insert(syn_id, 10);

        let real_wid = 104700;
        let carried = clear_synthetic_windows(&mut data, real_wid, &["Google Chrome", "Google Chrome"]);
        assert!(carried.is_some());
        assert_eq!(carried.unwrap().last_action, "正在观察界面");
        assert!(!data.windows.contains_key(&syn_id));
        assert!(!data.last_stream_frame_ms.contains_key(&syn_id));
        assert_eq!(data.app_to_window.get("google chrome").copied(), Some(real_wid));

        // 本地化应用名不一致时（如英文请求 "Calculator"、系统返回 "计算器"），也必须清掉旧占位
        let calc_syn = synthetic_window_id("Calculator");
        data.app_to_window.insert("calculator".into(), calc_syn);
        data.windows
            .insert(calc_syn, make_placeholder(calc_syn, "Calculator", "正在点击", 20));
        let calc_real = 200001;
        let calc_carried = clear_synthetic_windows(&mut data, calc_real, &["Calculator", "计算器"]);
        assert_eq!(calc_carried.unwrap().last_action, "正在点击");
        assert!(!data.windows.contains_key(&calc_syn));
        assert_eq!(data.app_to_window.get("calculator").copied(), Some(calc_real));
        assert_eq!(data.app_to_window.get("计算器").copied(), Some(calc_real));
    }
}
