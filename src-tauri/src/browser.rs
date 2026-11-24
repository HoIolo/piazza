//! 内嵌浏览器面板。
//!
//! 为什么不是 `<iframe>`：绝大多数站点都发 `Content-Security-Policy: frame-ancestors`
//! 或 `X-Frame-Options`，明确禁止被别的来源嵌入，iframe 里永远是空白。
//! 这里改用 Tauri 的子 webview——真正的原生 WKWebView / WebView2，不受这些响应头约束。
//!
//! 为什么本地 `.html` 走本机回环 HTTP 而不是 `data:` URL：
//! 1. Tauri 2 默认禁用了 `data:` URL（未开启 `webview-data-url` feature 时 `add_child` 会直接报错）；
//! 2. `data:` URL 体积受限且无法解析同目录下的相对 CSS / JS / 图片资源。
//! 用只监听 `127.0.0.1:0` + 随机 token 的轻量只读预览服务，既跨平台又支持相对资源与刷新。

use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    webview::WebviewBuilder, window::Window, LogicalPosition, LogicalSize, Rect, Url, Webview,
    WebviewUrl,
};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;

/// 子 webview 的固定标签：整个应用只用一个，切页面靠导航复用
const LABEL: &str = "panel-browser";
const MAX_LOCAL_FILE_BYTES: u64 = 16 * 1024 * 1024;

/// 标准桌面浏览器 UA。
///
/// macOS WKWebView 默认 UA 不含 `Version/... Safari/...`，百度等站点会把它当成不支持
/// HTTPS 的老旧客户端，返回 `location.replace("http://...")`，又被 WebKit HSTS 升回
/// `https://`，形成每秒十几次的死循环重载与白屏。补齐标准 UA 后各大站点均正常渲染。
#[cfg(target_os = "macos")]
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
#[cfg(target_os = "windows")]
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Default)]
struct PreviewTarget {
    root_dir: Option<PathBuf>,
}

struct PreviewServer {
    port: u16,
    token: String,
    target: Arc<RwLock<PreviewTarget>>,
}

#[derive(Default)]
struct InnerState {
    /// 当前已导航键（含 revision，回车或刷新同一地址时也能重新导航）
    current_key: Option<String>,
    /// 本机 HTML 静态预览服务（按需启动，随进程退出）
    preview: Option<PreviewServer>,
}

pub struct BrowserState {
    inner: Mutex<InnerState>,
    /// 每次 hide 递增，阻止慢一步返回的 show 把视图重新盖到浮层/其他标签上
    visibility_gen: AtomicU64,
}

impl Default for BrowserState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(InnerState::default()),
            visibility_gen: AtomicU64::new(0),
        }
    }
}

/// 矩形以逻辑像素给出，原点在窗口内容区左上角
#[derive(serde::Deserialize, Clone, Copy)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn existing(window: &Window, label: &str) -> Option<Webview> {
    window.webviews().into_iter().find(|w| w.label() == label)
}

fn generate_token() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut out = String::with_capacity(32);
    for idx in 0..4u64 {
        let mut h = RandomState::new().build_hasher();
        h.write_u64(idx);
        h.write_u64(ts);
        h.write_u32(std::process::id());
        out.push_str(&format!("{:08x}", h.finish() as u32));
    }
    out
}

fn resolve_local_html(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    let expanded = if let Some(rest) = trimmed.strip_prefix("~/") {
        dirs::home_dir()
            .ok_or_else(|| "无法定位用户主目录".to_string())?
            .join(rest)
    } else {
        PathBuf::from(trimmed)
    };
    let canonical = fs::canonicalize(&expanded).map_err(|e| format!("无法打开 HTML 文件：{e}"))?;
    if !canonical.is_file() {
        return Err("只能预览普通 HTML 文件".into());
    }
    let is_html = canonical
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"));
    if !is_html {
        return Err("仅支持预览 .html / .htm 文件".into());
    }
    Ok(canonical)
}

async fn ensure_preview_server(inner: &mut InnerState) -> Result<(u16, String, Arc<RwLock<PreviewTarget>>), String> {
    if let Some(srv) = inner.preview.as_ref() {
        return Ok((srv.port, srv.token.clone(), Arc::clone(&srv.target)));
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("启动本地 HTML 预览服务失败：{e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("读取预览服务端口失败：{e}"))?
        .port();
    let token = generate_token();
    let target = Arc::new(RwLock::new(PreviewTarget::default()));

    let loop_token = token.clone();
    let loop_target = Arc::clone(&target);
    tauri::async_runtime::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let t = loop_token.clone();
            let tgt = Arc::clone(&loop_target);
            tauri::async_runtime::spawn(serve_preview_conn(stream, t, tgt));
        }
    });

    inner.preview = Some(PreviewServer {
        port,
        token: token.clone(),
        target: Arc::clone(&target),
    });
    Ok((port, token, target))
}

async fn serve_preview_conn(
    mut stream: TcpStream,
    token: String,
    target: Arc<RwLock<PreviewTarget>>,
) {
    let mut reader = BufReader::new(&mut stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).await.is_err() {
        return;
    }
    // 读完请求头，避免客户端提前收到 RST
    let mut header_line = String::new();
    for _ in 0..64 {
        header_line.clear();
        match reader.read_line(&mut header_line).await {
            Ok(0) | Err(_) => break,
            Ok(_) if header_line == "\r\n" || header_line == "\n" => break,
            Ok(_) => {}
        }
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("");
    if method != "GET" && method != "HEAD" {
        let _ = write_response(&mut stream, "405 Method Not Allowed", "text/plain", b"", true).await;
        return;
    }

    let path_only = raw_path.split('?').next().unwrap_or("");
    let prefix = format!("/{token}/");
    let Some(rel_encoded) = path_only.strip_prefix(&prefix) else {
        let _ = write_response(&mut stream, "404 Not Found", "text/plain", b"Not Found", method == "HEAD").await;
        return;
    };
    let rel_decoded = percent_decode(rel_encoded);
    let root_dir = target.read().ok().and_then(|g| g.root_dir.clone());
    let Some(root_dir) = root_dir else {
        let _ = write_response(&mut stream, "404 Not Found", "text/plain", b"No Preview Target", method == "HEAD").await;
        return;
    };

    let Some(file_path) = safe_join(&root_dir, &rel_decoded) else {
        let _ = write_response(&mut stream, "403 Forbidden", "text/plain", b"Forbidden", method == "HEAD").await;
        return;
    };

    let Ok(meta) = fs::metadata(&file_path) else {
        let _ = write_response(&mut stream, "404 Not Found", "text/plain", b"Not Found", method == "HEAD").await;
        return;
    };
    if !meta.is_file() || meta.len() > MAX_LOCAL_FILE_BYTES {
        let _ = write_response(&mut stream, "413 Payload Too Large", "text/plain", b"File Too Large", method == "HEAD").await;
        return;
    }

    let Ok(bytes) = fs::read(&file_path) else {
        let _ = write_response(&mut stream, "500 Internal Server Error", "text/plain", b"Read Error", method == "HEAD").await;
        return;
    };
    let mime = content_type_for(&file_path);
    let _ = write_response(&mut stream, "200 OK", mime, &bytes, method == "HEAD").await;
}

async fn write_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(header.as_bytes()).await?;
    if !head_only && !body.is_empty() {
        stream.write_all(body).await?;
    }
    stream.flush().await
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn percent_encode_segment(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for b in segment.as_bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(*b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

fn safe_join(root: &Path, rel: &str) -> Option<PathBuf> {
    let mut candidate = root.to_path_buf();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(part) => candidate.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    let canonical = fs::canonicalize(candidate).ok()?;
    canonical.starts_with(root).then_some(canonical)
}

fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .as_deref()
    {
        Some("html" | "htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js" | "mjs") => "application/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn apply_bounds(view: &Webview, bounds: &Bounds) -> Result<(), String> {
    view.set_bounds(Rect {
        position: LogicalPosition::new(bounds.x, bounds.y).into(),
        size: LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)).into(),
    })
    .map_err(|e| e.to_string())
}

/// 创建或复用子 webview，并把它摆到给定矩形。
///
/// 必须是 `async fn`：Windows 上 WebView2 的 `add_child` 若在同步 command（UI 线程）里调用会死锁；
/// 同时通过 `BrowserState::inner` 互斥锁串行化创建，避免首帧 `rAF` 与 `ResizeObserver` 竞态重复创建。
#[tauri::command]
pub async fn browser_show(
    window: Window,
    state: tauri::State<'_, BrowserState>,
    url: Option<String>,
    html_path: Option<String>,
    revision: Option<u64>,
    bounds: Bounds,
) -> Result<(), String> {
    if bounds.width < 1.0 || bounds.height < 1.0 {
        return browser_hide(window, state).await;
    }

    let my_gen = state.visibility_gen.load(Ordering::SeqCst);
    let mut inner = state.inner.lock().await;
    if state.visibility_gen.load(Ordering::SeqCst) != my_gen {
        return Ok(());
    }

    let rev = revision.unwrap_or(0);
    let (parsed, nav_key) = if let Some(path) = html_path.filter(|p| !p.trim().is_empty()) {
        let canonical = resolve_local_html(&path)?;
        let root_dir = canonical
            .parent()
            .ok_or_else(|| "无法读取 HTML 所在目录".to_string())?
            .to_path_buf();
        let file_name = canonical
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "HTML 文件名无效".to_string())?;
        let (port, token, target) = ensure_preview_server(&mut inner).await?;
        if let Ok(mut guard) = target.write() {
            guard.root_dir = Some(root_dir);
        }
        let encoded_name = percent_encode_segment(file_name);
        let local_url = format!("http://127.0.0.1:{port}/{token}/{encoded_name}?v={rev}");
        let parsed = Url::parse(&local_url).map_err(|e| format!("本地预览地址无效：{e}"))?;
        let key = format!("html:{}#{rev}", canonical.to_string_lossy());
        (parsed, key)
    } else if let Some(raw_url) = url.filter(|u| !u.trim().is_empty()) {
        let parsed = Url::parse(raw_url.trim()).map_err(|e| format!("地址无效：{e}"))?;
        if !matches!(parsed.scheme(), "http" | "https") {
            return Err("仅支持 HTTP / HTTPS 网址或本地 .html 文件".into());
        }
        let key = format!("url:{raw_url}#{rev}");
        (parsed, key)
    } else {
        return Err("缺少目标网址或本地 HTML 路径".into());
    };

    let (view, just_created) = match existing(&window, LABEL) {
        Some(view) => (view, false),
        None => {
            let win_for_new_tab = window.clone();
            #[allow(unused_mut)]
            let mut builder = WebviewBuilder::new(LABEL, WebviewUrl::External(parsed.clone()))
                .user_agent(BROWSER_USER_AGENT)
                .on_new_window(move |url, _features| {
                    // 百度搜索结果等 target="_blank" 链接在当前内嵌浏览器中打开，避免点击无反应
                    if matches!(url.scheme(), "http" | "https") {
                        if let Some(view) = existing(&win_for_new_tab, LABEL) {
                            let _ = view.navigate(url);
                        }
                    }
                    tauri::webview::NewWindowResponse::Deny
                });
            // macOS 上 wry 0.57 若设置 background_color 会把 WKWebView 的 drawsBackground 关掉，
            // 反而让无底色页面变透明；保持默认不透明白底，非 macOS 再显式填白底。
            #[cfg(not(target_os = "macos"))]
            {
                builder = builder.background_color(tauri::webview::Color(255, 255, 255, 255));
            }
            let view = window
                .add_child(
                    builder,
                    LogicalPosition::new(bounds.x, bounds.y),
                    LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
                )
                .map_err(|e| format!("创建内置浏览器视图失败：{e}"))?;
            (view, true)
        }
    };

    if state.visibility_gen.load(Ordering::SeqCst) != my_gen {
        let _ = view.hide();
        return Ok(());
    }

    if just_created {
        inner.current_key = Some(nav_key);
    } else if inner.current_key.as_deref() != Some(nav_key.as_str()) {
        view.navigate(parsed).map_err(|e| format!("页面跳转失败：{e}"))?;
        inner.current_key = Some(nav_key);
    }

    apply_bounds(&view, &bounds)?;
    view.show().map_err(|e| format!("显示内置浏览器失败：{e}"))
}

/// 只挪位置：面板拖宽、窗口缩放、侧栏展开/收起都走这里
#[tauri::command]
pub async fn browser_bounds(
    window: Window,
    state: tauri::State<'_, BrowserState>,
    bounds: Bounds,
) -> Result<(), String> {
    let _guard = state.inner.lock().await;
    if bounds.width < 1.0 || bounds.height < 1.0 {
        if let Some(view) = existing(&window, LABEL) {
            let _ = view.hide();
        }
        return Ok(());
    }
    match existing(&window, LABEL) {
        Some(view) => apply_bounds(&view, &bounds),
        None => Ok(()),
    }
}

/// 切到别的标签、打开查看器、面板收起时都要藏起来，
/// 否则这个原生视图会一直盖在 React 画的界面上面
#[tauri::command]
pub async fn browser_hide(
    window: Window,
    state: tauri::State<'_, BrowserState>,
) -> Result<(), String> {
    state.visibility_gen.fetch_add(1, Ordering::SeqCst);
    let _guard = state.inner.lock().await;
    if let Some(view) = existing(&window, LABEL) {
        view.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_reload(
    window: Window,
    state: tauri::State<'_, BrowserState>,
) -> Result<(), String> {
    let _guard = state.inner.lock().await;
    match existing(&window, LABEL) {
        Some(view) => view.reload().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::{content_type_for, percent_decode, percent_encode_segment, safe_join};
    use std::fs;
    use std::path::Path;

    #[test]
    fn encodes_and_decodes_unicode_filename() {
        let name = "测试 报告#1.html";
        let encoded = percent_encode_segment(name);
        assert!(!encoded.contains(' '));
        assert!(!encoded.contains('#'));
        assert_eq!(percent_decode(&encoded), name);
    }

    #[test]
    fn blocks_path_traversal_outside_root() {
        let dir = std::env::temp_dir().join("piazza_browser_preview_test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("index.html");
        fs::write(&file, "<h1>ok</h1>").unwrap();
        let root = fs::canonicalize(&dir).unwrap();

        assert!(safe_join(&root, "index.html").is_some());
        assert!(safe_join(&root, "../etc/passwd").is_none());
        assert!(safe_join(&root, "/etc/passwd").is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolves_common_mime_types() {
        assert_eq!(content_type_for(Path::new("a.html")), "text/html; charset=utf-8");
        assert_eq!(content_type_for(Path::new("a.css")), "text/css; charset=utf-8");
        assert_eq!(content_type_for(Path::new("a.js")), "application/javascript; charset=utf-8");
        assert_eq!(content_type_for(Path::new("a.png")), "image/png");
    }
}
