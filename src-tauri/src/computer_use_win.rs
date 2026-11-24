//! Windows 原生 Computer Use 悬浮控制层与实时画面采集引擎：
//! - 独立 Win32 GUI 线程维护被控窗口追踪、65ms 动画定时器与低开销后台截帧
//! - 被控窗口左上角非抢焦捕获角标（脉冲指示灯 + 状态文案 + 可点击停止按钮）
//! - 鼠标穿透高亮边框（跟随窗口移动/缩放、最小化自动隐藏）
//! - 可开关的原生虚拟软件光标（缓动滑行 + 点击涟漪 + 空闲淡出）

#![cfg(target_os = "windows")]

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use std::path::Path;
use std::ptr::{null, null_mut};
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use windows_sys::Win32::Foundation::{
    CloseHandle, BOOL, HMODULE, HWND, LPARAM, LRESULT, RECT, WPARAM,
};
use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, BringWindowToTop, CreateWindowExW, DefWindowProcW, DestroyWindow,
    DispatchMessageW, EnumWindows, GetMessageW, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, KillTimer, LoadCursorW,
    PostMessageW, PostQuitMessage, RegisterClassExW, SetCursor, SetForegroundWindow, SetTimer,
    SetWindowPos, ShowWindow, TranslateMessage, ASFW_ANY, HWND_MESSAGE, HWND_TOPMOST, IDC_HAND,
    MA_NOACTIVATE, MSG, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
    SW_RESTORE, SW_SHOWNOACTIVATE, WM_APP, WM_LBUTTONDOWN, WM_MOUSEACTIVATE, WM_SETCURSOR,
    WM_TIMER, WNDCLASSEXW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
    WS_EX_TRANSPARENT, WS_POPUP,
};

use crate::computer_use_win_gfx::{
    capture_window_png, extract_window_icon_png, render_badge_layered, render_border_layered,
    render_cursor_layered, to_wide, window_bounds,
};

const WM_WAKE: u32 = WM_APP + 1;
const TIMER_ID: usize = 1;
const TICK_MS: u32 = 65;
const ACTIVE_FRAME_INTERVAL: Duration = Duration::from_millis(180);
const IDLE_FRAME_INTERVAL: Duration = Duration::from_millis(900);
const SYNTHETIC_ID_BASE: u32 = 0x8000_0000;

const CLS_MSG: &str = "PiazzaOcuMsgWindow";
const CLS_BADGE: &str = "PiazzaOcuBadgeWindow";
const CLS_BORDER: &str = "PiazzaOcuBorderWindow";
const CLS_CURSOR: &str = "PiazzaOcuCursorWindow";

pub struct WinOverlayClient {
    cmd_tx: Sender<Value>,
    msg_hwnd: usize,
}

impl WinOverlayClient {
    pub fn start<F>(emit: F) -> Result<Self, String>
    where
        F: Fn(Value) + Send + Sync + 'static,
    {
        let (cmd_tx, cmd_rx) = mpsc::channel::<Value>();
        let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<usize, String>>(1);

        std::thread::Builder::new()
            .name("piazza-ocu-win-overlay".to_string())
            .spawn(move || {
                run_win_overlay_thread(cmd_rx, Box::new(emit), ready_tx);
            })
            .map_err(|e| format!("启动 Windows 悬浮控制线程失败：{e}"))?;

        let msg_hwnd = ready_rx
            .recv()
            .map_err(|_| "Windows 悬浮控制线程提前退出".to_string())??;

        Ok(Self { cmd_tx, msg_hwnd })
    }

    pub fn send(&self, cmd: Value) -> Result<(), String> {
        self.cmd_tx
            .send(cmd)
            .map_err(|_| "Windows 悬浮控制线程已关闭".to_string())?;
        unsafe {
            PostMessageW(self.msg_hwnd as HWND, WM_WAKE, 0, 0);
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        let _ = self.cmd_tx.send(json!({ "cmd": "shutdown" }));
        unsafe {
            PostMessageW(self.msg_hwnd as HWND, WM_WAKE, 0, 0);
        }
    }
}

impl Drop for WinOverlayClient {
    fn drop(&mut self) {
        self.shutdown();
    }
}

struct WatchedWin {
    target_hwnd: HWND,
    requested_app: String,
    title: String,
    label: String,
    active: bool,
    badge_hwnd: HWND,
    border_hwnd: HWND,
    stop_rect: RECT,
    last_bounds: Option<RECT>,
    last_frame_at: Instant,
    visible: bool,
}

struct VirtualCursor {
    hwnd: HWND,
    enabled: bool,
    visible: bool,
    curr_x: f32,
    curr_y: f32,
    start_x: f32,
    start_y: f32,
    target_x: f32,
    target_y: f32,
    move_started: Instant,
    move_dur_ms: f32,
    ripple_started: Option<Instant>,
    fade_started: Option<Instant>,
    opacity: f32,
    dirty: bool,
}

impl VirtualCursor {
    fn new(hwnd: HWND) -> Self {
        let now = Instant::now();
        Self {
            hwnd,
            enabled: true,
            visible: false,
            curr_x: 0.0,
            curr_y: 0.0,
            start_x: 0.0,
            start_y: 0.0,
            target_x: 0.0,
            target_y: 0.0,
            move_started: now,
            move_dur_ms: 200.0,
            ripple_started: None,
            fade_started: None,
            opacity: 0.0,
            dirty: false,
        }
    }

    fn hide_now(&mut self) {
        self.visible = false;
        self.fade_started = None;
        self.ripple_started = None;
        self.opacity = 0.0;
        self.dirty = false;
        if !self.hwnd.is_null() {
            unsafe {
                ShowWindow(self.hwnd, SW_HIDE);
            }
        }
    }

    fn move_to(&mut self, x: f32, y: f32, trigger_ripple: bool) {
        if !self.enabled || self.hwnd.is_null() {
            return;
        }
        let now = Instant::now();
        if !self.visible {
            self.curr_x = x;
            self.curr_y = y;
            self.start_x = x;
            self.start_y = y;
            self.visible = true;
            unsafe {
                ShowWindow(self.hwnd, SW_SHOWNOACTIVATE);
                SetWindowPos(
                    self.hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
            }
        } else {
            self.start_x = self.curr_x;
            self.start_y = self.curr_y;
        }
        self.target_x = x;
        self.target_y = y;
        self.move_started = now;
        let dist = ((x - self.start_x).powi(2) + (y - self.start_y).powi(2)).sqrt();
        self.move_dur_ms = (140.0 + dist * 0.22).clamp(140.0, 280.0);
        if trigger_ripple {
            self.ripple_started = Some(now);
        }
        self.fade_started = None;
        self.opacity = 1.0;
        self.dirty = true;
    }

    fn begin_fade_out(&mut self) {
        if self.visible && self.fade_started.is_none() {
            self.fade_started = Some(Instant::now());
            self.dirty = true;
        }
    }

    fn tick(&mut self) {
        if !self.visible || self.hwnd.is_null() {
            return;
        }
        if !self.enabled {
            self.hide_now();
            return;
        }
        let now = Instant::now();
        let mut animating = self.dirty;

        let t_move = (now.duration_since(self.move_started).as_secs_f32() * 1000.0
            / self.move_dur_ms)
            .clamp(0.0, 1.0);
        if t_move < 1.0 {
            animating = true;
        }
        // cubic ease-out: 1 - (1 - t)^3
        let eased = 1.0 - (1.0 - t_move).powi(3);
        self.curr_x = self.start_x + (self.target_x - self.start_x) * eased;
        self.curr_y = self.start_y + (self.target_y - self.start_y) * eased;

        let ripple = if let Some(rs) = self.ripple_started {
            let p = now.duration_since(rs).as_secs_f32() / 0.42;
            if p >= 1.0 {
                self.ripple_started = None;
                0.0
            } else {
                animating = true;
                p
            }
        } else {
            0.0
        };

        if let Some(fs) = self.fade_started {
            let p = now.duration_since(fs).as_secs_f32() / 0.28;
            if p >= 1.0 {
                self.hide_now();
                return;
            }
            self.opacity = 1.0 - p;
            animating = true;
        }

        if animating {
            render_cursor_layered(
                self.hwnd,
                self.curr_x.round() as i32,
                self.curr_y.round() as i32,
                ripple,
                self.opacity,
            );
            self.dirty = false;
        }
    }
}

struct WinThreadState {
    cmd_rx: Receiver<Value>,
    emit: Box<dyn Fn(Value) + Send + Sync>,
    hinstance: HMODULE,
    msg_hwnd: HWND,
    watched: HashMap<u32, WatchedWin>,
    badge_to_wid: HashMap<usize, u32>,
    cursor: VirtualCursor,
    started_at: Instant,
}

thread_local! {
    static THREAD_STATE: RefCell<Option<WinThreadState>> = const { RefCell::new(None) };
}

fn with_state<R>(f: impl FnOnce(&mut WinThreadState) -> R) -> Option<R> {
    THREAD_STATE.with(|cell| {
        let mut borrow = cell.borrow_mut();
        borrow.as_mut().map(f)
    })
}

fn register_class(
    hinstance: HMODULE,
    name: &str,
    wnd_proc: unsafe extern "system" fn(HWND, u32, WPARAM, LPARAM) -> LRESULT,
) -> bool {
    let wide = to_wide(name);
    let mut wc: WNDCLASSEXW = unsafe { zeroed() };
    wc.cbSize = size_of::<WNDCLASSEXW>() as u32;
    wc.lpfnWndProc = Some(wnd_proc);
    wc.hInstance = hinstance;
    wc.lpszClassName = wide.as_ptr();
    unsafe { RegisterClassExW(&wc) != 0 }
}

fn create_layered_window(hinstance: HMODULE, class_name: &str, click_through: bool) -> HWND {
    let wide = to_wide(class_name);
    let mut ex_style = WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_LAYERED;
    if click_through {
        ex_style |= WS_EX_TRANSPARENT;
    }
    unsafe {
        CreateWindowExW(
            ex_style,
            wide.as_ptr(),
            null(),
            WS_POPUP,
            0,
            0,
            1,
            1,
            null_mut(),
            null_mut(),
            hinstance,
            null(),
        )
    }
}

fn run_win_overlay_thread(
    cmd_rx: Receiver<Value>,
    emit: Box<dyn Fn(Value) + Send + Sync>,
    ready_tx: mpsc::SyncSender<Result<usize, String>>,
) {
    let hinstance = unsafe { GetModuleHandleW(null()) };
    register_class(hinstance, CLS_MSG, msg_wnd_proc);
    register_class(hinstance, CLS_BADGE, badge_wnd_proc);
    register_class(hinstance, CLS_BORDER, passive_wnd_proc);
    register_class(hinstance, CLS_CURSOR, passive_wnd_proc);

    let msg_cls = to_wide(CLS_MSG);
    let msg_hwnd = unsafe {
        CreateWindowExW(
            0,
            msg_cls.as_ptr(),
            null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            null_mut(),
            hinstance,
            null(),
        )
    };
    if msg_hwnd.is_null() {
        let _ = ready_tx.send(Err("创建 Windows 悬浮消息窗口失败".into()));
        return;
    }

    let cursor_hwnd = create_layered_window(hinstance, CLS_CURSOR, true);
    let state = WinThreadState {
        cmd_rx,
        emit,
        hinstance,
        msg_hwnd,
        watched: HashMap::new(),
        badge_to_wid: HashMap::new(),
        cursor: VirtualCursor::new(cursor_hwnd),
        started_at: Instant::now(),
    };
    THREAD_STATE.with(|cell| {
        *cell.borrow_mut() = Some(state);
    });

    unsafe {
        SetTimer(msg_hwnd, TIMER_ID, TICK_MS, None);
    }
    let _ = ready_tx.send(Ok(msg_hwnd as usize));

    let mut msg: MSG = unsafe { zeroed() };
    while unsafe { GetMessageW(&mut msg, null_mut(), 0, 0) } > 0 {
        unsafe {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    // 清理线程局部资源
    THREAD_STATE.with(|cell| {
        if let Some(mut st) = cell.borrow_mut().take() {
            st.clear_all();
            if !st.cursor.hwnd.is_null() {
                unsafe {
                    DestroyWindow(st.cursor.hwnd);
                }
            }
            unsafe {
                KillTimer(st.msg_hwnd, TIMER_ID);
                DestroyWindow(st.msg_hwnd);
            }
        }
    });
}

unsafe extern "system" fn msg_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_WAKE => {
            with_state(|st| st.drain_commands());
            0
        }
        WM_TIMER => {
            with_state(|st| st.on_tick());
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe extern "system" fn badge_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
        WM_SETCURSOR => {
            let hand = LoadCursorW(null_mut(), IDC_HAND);
            if !hand.is_null() {
                SetCursor(hand);
            }
            1
        }
        WM_LBUTTONDOWN => {
            let x = (lparam & 0xFFFF) as i16 as i32;
            let y = ((lparam >> 16) & 0xFFFF) as i16 as i32;
            with_state(|st| st.on_badge_click(hwnd, x, y));
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

unsafe extern "system" fn passive_wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_MOUSEACTIVATE {
        return MA_NOACTIVATE as LRESULT;
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

impl WinThreadState {
    fn drain_commands(&mut self) {
        let mut batch = Vec::new();
        while let Ok(cmd) = self.cmd_rx.try_recv() {
            batch.push(cmd);
        }
        for cmd in batch {
            self.handle_command(cmd);
        }
    }

    fn handle_command(&mut self, cmd: Value) {
        let kind = cmd.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
        match kind {
            "watch" => self.cmd_watch(&cmd),
            "set_active" => self.cmd_set_active(&cmd),
            "focus" => self.cmd_focus(&cmd),
            "unwatch" => {
                if let Some(wid) = cmd.get("windowId").and_then(|v| v.as_u64()) {
                    self.unwatch(wid as u32);
                }
            }
            "clear" => self.clear_all(),
            "shutdown" => {
                self.clear_all();
                unsafe {
                    PostQuitMessage(0);
                }
            }
            _ => {}
        }
    }

    fn cmd_watch(&mut self, cmd: &Value) {
        let requested_app = cmd
            .get("appName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let req_wid = cmd
            .get("windowId")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .filter(|&id| id > 0 && id < SYNTHETIC_ID_BASE);
        let label = cmd
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or("正在操作")
            .to_string();
        let active = cmd.get("active").and_then(|v| v.as_bool()).unwrap_or(true);
        let visual_cursor = cmd
            .get("visualCursor")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        self.cursor.enabled = visual_cursor;
        if !visual_cursor {
            self.cursor.hide_now();
        }

        let Some(found) = find_target_window(req_wid, &requested_app) else {
            return;
        };

        let wid = found.window_id;
        let is_new = !self.watched.contains_key(&wid);
        if is_new {
            let border_hwnd = create_layered_window(self.hinstance, CLS_BORDER, true);
            let badge_hwnd = create_layered_window(self.hinstance, CLS_BADGE, false);
            if !badge_hwnd.is_null() {
                self.badge_to_wid.insert(badge_hwnd as usize, wid);
            }
            self.watched.insert(
                wid,
                WatchedWin {
                    target_hwnd: found.hwnd,
                    requested_app: requested_app.clone(),
                    title: found.title.clone(),
                    label: label.clone(),
                    active,
                    badge_hwnd,
                    border_hwnd,
                    stop_rect: RECT {
                        left: 0,
                        top: 0,
                        right: 0,
                        bottom: 0,
                    },
                    last_bounds: None,
                    last_frame_at: Instant::now() - Duration::from_secs(10),
                    visible: false,
                },
            );
        } else if let Some(entry) = self.watched.get_mut(&wid) {
            entry.requested_app = requested_app.clone();
            entry.label = label.clone();
            entry.active = active;
            if !found.title.is_empty() {
                entry.title = found.title.clone();
            }
        }

        let bounds = window_bounds(found.hwnd).unwrap_or(found.rect);
        let icon = if is_new {
            extract_window_icon_png(found.hwnd, found.exe_path.as_deref())
        } else {
            None
        };

        let mut info = json!({
            "type": "window_info",
            "windowId": wid,
            "requestedApp": requested_app,
            "appName": found.app_name,
            "title": found.title,
            "bounds": {
                "x": bounds.left as f64,
                "y": bounds.top as f64,
                "width": (bounds.right - bounds.left) as f64,
                "height": (bounds.bottom - bounds.top) as f64,
            }
        });
        if let Some(icon_b64) = icon {
            info["appIcon"] = Value::String(icon_b64);
        }
        (self.emit)(info);

        let pulse = self.pulse_alpha();
        if let Some(entry) = self.watched.get_mut(&wid) {
            sync_overlay_geometry(entry, bounds, pulse, true);
        }

        // 立刻抓首帧，避免预览卡停在“正在连接画面流”
        if let Some((w, h, png)) = capture_window_png(found.hwnd, 520) {
            if let Some(entry) = self.watched.get_mut(&wid) {
                entry.last_frame_at = Instant::now();
            }
            (self.emit)(json!({
                "type": "frame",
                "windowId": wid,
                "mimeType": "image/png",
                "data": png,
                "width": w,
                "height": h,
            }));
        }

        if active && visual_cursor {
            self.update_cursor_for_action(bounds, cmd.get("coords"));
        }
    }

    fn update_cursor_for_action(&mut self, bounds: RECT, coords: Option<&Value>) {
        let bw = (bounds.right - bounds.left).max(1) as f32;
        let bh = (bounds.bottom - bounds.top).max(1) as f32;
        if let Some(c) = coords.and_then(|v| v.as_object()) {
            let rx = c
                .get("toX")
                .or_else(|| c.get("x"))
                .and_then(|v| v.as_f64())
                .map(|v| v as f32);
            let ry = c
                .get("toY")
                .or_else(|| c.get("y"))
                .and_then(|v| v.as_f64())
                .map(|v| v as f32);
            if let (Some(x), Some(y)) = (rx, ry) {
                let (sx, sy) = resolve_screen_point(bounds, x, y);
                self.cursor.move_to(sx, sy, true);
                return;
            }
        }
        // 无坐标操作（如观察界面 / 快捷键）时，把光标温和停留在目标窗内偏中心
        let cx = bounds.left as f32 + bw * 0.54;
        let cy = bounds.top as f32 + bh * 0.44;
        self.cursor.move_to(cx, cy, false);
    }

    fn cmd_set_active(&mut self, cmd: &Value) {
        let active = cmd.get("active").and_then(|v| v.as_bool()).unwrap_or(false);
        let wid_filter = cmd.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32);
        let new_label = cmd.get("label").and_then(|v| v.as_str());
        let pulse = self.pulse_alpha();

        for (&wid, entry) in self.watched.iter_mut() {
            if wid_filter.is_some_and(|target| target != wid) {
                continue;
            }
            entry.active = active;
            if let Some(l) = new_label {
                entry.label = l.to_string();
            }
            if let Some(bounds) = entry.last_bounds {
                sync_overlay_geometry(entry, bounds, pulse, true);
            }
        }

        if !self.watched.values().any(|w| w.active) {
            self.cursor.begin_fade_out();
        }
    }

    fn cmd_focus(&self, cmd: &Value) {
        let Some(wid) = cmd.get("windowId").and_then(|v| v.as_u64()).map(|v| v as u32) else {
            return;
        };
        let hwnd = self
            .watched
            .get(&wid)
            .map(|w| w.target_hwnd)
            .unwrap_or(wid as usize as HWND);
        if hwnd.is_null() || unsafe { IsWindow(hwnd) } == 0 {
            return;
        }
        unsafe {
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
            AllowSetForegroundWindow(ASFW_ANY);
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
        }
    }

    fn unwatch(&mut self, wid: u32) {
        if let Some(entry) = self.watched.remove(&wid) {
            if !entry.badge_hwnd.is_null() {
                self.badge_to_wid.remove(&(entry.badge_hwnd as usize));
                unsafe {
                    DestroyWindow(entry.badge_hwnd);
                }
            }
            if !entry.border_hwnd.is_null() {
                unsafe {
                    DestroyWindow(entry.border_hwnd);
                }
            }
        }
        if !self.watched.values().any(|w| w.active) {
            self.cursor.begin_fade_out();
        }
    }

    fn clear_all(&mut self) {
        let wids: Vec<u32> = self.watched.keys().copied().collect();
        for wid in wids {
            self.unwatch(wid);
        }
        self.cursor.hide_now();
    }

    fn on_badge_click(&mut self, badge_hwnd: HWND, x: i32, y: i32) {
        let Some(&wid) = self.badge_to_wid.get(&(badge_hwnd as usize)) else {
            return;
        };
        let hit = self.watched.get(&wid).is_some_and(|w| {
            let r = w.stop_rect;
            x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 4
        });
        if hit {
            self.unwatch(wid);
            (self.emit)(json!({
                "type": "badge_stop",
                "windowId": wid,
            }));
        }
    }

    fn pulse_alpha(&self) -> f32 {
        let secs = self.started_at.elapsed().as_secs_f32();
        0.55 + 0.45 * (secs * 4.2).sin().abs()
    }

    fn on_tick(&mut self) {
        let now = Instant::now();
        let pulse = self.pulse_alpha();
        let mut closed = Vec::new();
        let mut frames = Vec::new();

        for (&wid, entry) in self.watched.iter_mut() {
            if unsafe { IsWindow(entry.target_hwnd) } == 0 {
                closed.push(wid);
                continue;
            }
            if unsafe { IsIconic(entry.target_hwnd) } != 0
                || unsafe { IsWindowVisible(entry.target_hwnd) } == 0
            {
                if entry.visible {
                    hide_entry(entry);
                }
                continue;
            }

            if let Some(bounds) = window_bounds(entry.target_hwnd) {
                let moved = entry.last_bounds.map_or(true, |prev| !rect_eq(prev, bounds));
                if moved || !entry.visible || entry.active {
                    sync_overlay_geometry(entry, bounds, pulse, moved || !entry.visible);
                }
            }

            let interval = if entry.active {
                ACTIVE_FRAME_INTERVAL
            } else {
                IDLE_FRAME_INTERVAL
            };
            if now.duration_since(entry.last_frame_at) >= interval {
                entry.last_frame_at = now;
                if let Some((w, h, png)) = capture_window_png(entry.target_hwnd, 520) {
                    frames.push((wid, w, h, png));
                }
            }
        }

        for wid in closed {
            self.unwatch(wid);
            (self.emit)(json!({
                "type": "window_closed",
                "windowId": wid,
            }));
        }

        for (wid, w, h, png) in frames {
            (self.emit)(json!({
                "type": "frame",
                "windowId": wid,
                "mimeType": "image/png",
                "data": png,
                "width": w,
                "height": h,
            }));
        }

        self.cursor.tick();
    }
}

fn rect_eq(a: RECT, b: RECT) -> bool {
    a.left == b.left && a.top == b.top && a.right == b.right && a.bottom == b.bottom
}

fn hide_entry(entry: &mut WatchedWin) {
    entry.visible = false;
    unsafe {
        if !entry.badge_hwnd.is_null() {
            ShowWindow(entry.badge_hwnd, SW_HIDE);
        }
        if !entry.border_hwnd.is_null() {
            ShowWindow(entry.border_hwnd, SW_HIDE);
        }
    }
}

fn sync_overlay_geometry(entry: &mut WatchedWin, bounds: RECT, pulse: f32, redraw_border: bool) {
    let w = (bounds.right - bounds.left).max(0);
    let h = (bounds.bottom - bounds.top).max(0);
    if w < 40 || h < 40 {
        hide_entry(entry);
        return;
    }

    if !entry.border_hwnd.is_null() && redraw_border {
        render_border_layered(entry.border_hwnd, bounds.left, bounds.top, w, h, entry.active);
    }

    if !entry.badge_hwnd.is_null() {
        let bx = (bounds.left + 10).max(4);
        let by = (bounds.top + 10).max(4);
        let text = if entry.label.is_empty() {
            "控制中"
        } else {
            entry.label.as_str()
        };
        let (_bw, _bh, stop_rect) =
            render_badge_layered(entry.badge_hwnd, bx, by, text, entry.active, pulse);
        entry.stop_rect = stop_rect;
    }

    if !entry.visible {
        unsafe {
            if !entry.border_hwnd.is_null() {
                ShowWindow(entry.border_hwnd, SW_SHOWNOACTIVATE);
                SetWindowPos(
                    entry.border_hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
            }
            if !entry.badge_hwnd.is_null() {
                ShowWindow(entry.badge_hwnd, SW_SHOWNOACTIVATE);
                SetWindowPos(
                    entry.badge_hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
            }
        }
        entry.visible = true;
    }
    entry.last_bounds = Some(bounds);
}

fn resolve_screen_point(bounds: RECT, x: f32, y: f32) -> (f32, f32) {
    let left = bounds.left as f32;
    let top = bounds.top as f32;
    let right = bounds.right as f32;
    let bottom = bounds.bottom as f32;
    let bw = (right - left).max(1.0);
    let bh = (bottom - top).max(1.0);

    // 若本身就是落在该窗口内的屏幕绝对坐标，直接采用
    if x >= left && x <= right && y >= top && y <= bottom {
        return (x, y);
    }
    // 否则按窗口内相对坐标换算到屏幕坐标
    if x >= 0.0 && x <= bw && y >= 0.0 && y <= bh {
        return (left + x, top + y);
    }
    (x.clamp(left + 8.0, right - 8.0), y.clamp(top + 8.0, bottom - 8.0))
}

// MARK: - 窗口枚举与模糊匹配

struct EnumCandidate {
    hwnd: HWND,
    window_id: u32,
    app_name: String,
    exe_stem: String,
    exe_path: Option<String>,
    title: String,
    rect: RECT,
    iconic: bool,
}

fn read_window_title(hwnd: HWND) -> String {
    let len = unsafe { GetWindowTextLengthW(hwnd) };
    if len <= 0 {
        return String::new();
    }
    let mut buf = vec![0u16; (len as usize) + 1];
    let n = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..n as usize]).trim().to_string()
}

fn read_process_exe_path(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut buf = vec![0u16; 1024];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(handle);
        if ok == 0 || size == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..size as usize]))
    }
}

fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    let hr = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED as u32,
            (&mut cloaked as *mut u32).cast::<c_void>(),
            size_of::<u32>() as u32,
        )
    };
    hr == 0 && cloaked != 0
}

fn friendly_app_name(stem: &str) -> String {
    match stem.to_lowercase().as_str() {
        "chrome" => "Google Chrome".to_string(),
        "msedge" => "Microsoft Edge".to_string(),
        "firefox" => "Firefox".to_string(),
        "code" => "Visual Studio Code".to_string(),
        "wechat" | "weixin" => "WeChat".to_string(),
        "explorer" => "Explorer".to_string(),
        "notepad" => "Notepad".to_string(),
        "windowsterminal" => "Windows Terminal".to_string(),
        other if !other.is_empty() => {
            let mut chars = stem.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => "App".to_string(),
            }
        }
        _ => "App".to_string(),
    }
}

struct EnumCollector {
    self_pid: u32,
    items: Vec<EnumCandidate>,
}

unsafe extern "system" fn enum_windows_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let collector = &mut *(lparam as *mut EnumCollector);
    if IsWindowVisible(hwnd) == 0 || is_cloaked(hwnd) {
        return 1;
    }
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 || pid == collector.self_pid {
        return 1;
    }
    let Some(rect) = window_bounds(hwnd) else {
        return 1;
    };
    if rect.right - rect.left < 60 || rect.bottom - rect.top < 60 {
        return 1;
    }

    let title = read_window_title(hwnd);
    let exe_path = read_process_exe_path(pid);
    let exe_stem = exe_path
        .as_deref()
        .and_then(|p| Path::new(p).file_stem())
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if title.is_empty() && exe_stem.is_empty() {
        return 1;
    }

    let app_name = friendly_app_name(&exe_stem);
    collector.items.push(EnumCandidate {
        hwnd,
        window_id: (hwnd as usize) as u32,
        app_name,
        exe_stem,
        exe_path,
        title,
        rect,
        iconic: IsIconic(hwnd) != 0,
    });
    1
}

fn find_target_window(req_wid: Option<u32>, requested_app: &str) -> Option<EnumCandidate> {
    let mut collector = EnumCollector {
        self_pid: std::process::id(),
        items: Vec::new(),
    };
    unsafe {
        EnumWindows(
            Some(enum_windows_cb),
            (&mut collector as *mut EnumCollector) as LPARAM,
        );
    }

    if let Some(wid) = req_wid {
        if let Some(pos) = collector.items.iter().position(|c| c.window_id == wid) {
            return Some(collector.items.swap_remove(pos));
        }
    }

    let needle = requested_app
        .trim()
        .trim_end_matches(".exe")
        .trim_end_matches(".EXE")
        .to_lowercase();
    if needle.is_empty() {
        return None;
    }

    let mut best_idx: Option<usize> = None;
    let mut best_score: i64 = 0;
    for (idx, item) in collector.items.iter().enumerate() {
        let stem = item.exe_stem.to_lowercase();
        let app = item.app_name.to_lowercase();
        let title = item.title.to_lowercase();

        let mut score: i64 = 0;
        if stem == needle || app == needle {
            score = 1000;
        } else if !stem.is_empty() && (needle.contains(&stem) || stem.contains(&needle)) {
            score = 800;
        } else if app.contains(&needle) || needle.contains(&app) {
            score = 780;
        } else if title.contains(&needle) {
            score = 650;
        }
        if score == 0 {
            continue;
        }
        if !item.iconic {
            score += 120;
        }
        let area = ((item.rect.right - item.rect.left) as i64)
            * ((item.rect.bottom - item.rect.top) as i64);
        score += (area / 10_000).min(80);

        if score > best_score {
            best_score = score;
            best_idx = Some(idx);
        }
    }

    best_idx.map(|i| collector.items.swap_remove(i))
}
