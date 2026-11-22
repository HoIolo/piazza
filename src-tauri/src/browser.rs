//! 内嵌浏览器面板。
//!
//! 为什么不是 `<iframe>`：绝大多数站点都发 `Content-Security-Policy: frame-ancestors`
//! 或 `X-Frame-Options`，明确禁止被别的来源嵌入，iframe 里永远是空白。
//! 这里改用 Tauri 的子 webview——一个真正的原生 WKWebView，不受这些响应头约束。
//!
//! 子 webview 是窗口里的一个原生子视图，盖在主 webview 之上，
//! 所以它自己不做布局：位置和尺寸全部由前端按面板里那块占位区域的
//! `getBoundingClientRect()` 算好再送进来（CSS px 与逻辑像素 1:1）。

use std::sync::Mutex;

use tauri::{
  webview::{Color, WebviewBuilder},
  window::Window,
  LogicalPosition, LogicalSize, Url, Webview, WebviewUrl,
};

/// 子 webview 的固定标签：整个应用只用一个，切页面靠导航复用
const LABEL: &str = "panel-browser";

#[derive(Default)]
pub struct BrowserState {
  /// 当前地址，用来判断「同样的 URL 不必重复导航」
  current: Mutex<Option<String>>,
}

/// 矩形以逻辑像素给出，原点在窗口内容区左上角
#[derive(serde::Deserialize)]
pub struct Bounds {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
}

fn existing(window: &Window, label: &str) -> Option<Webview> {
  window.webviews().into_iter().find(|w| w.label() == label)
}

/// 创建或复用子 webview，并把它摆到给定矩形
#[tauri::command]
pub fn browser_show(
  window: Window,
  state: tauri::State<'_, BrowserState>,
  url: String,
  bounds: Bounds,
) -> Result<(), String> {
  let parsed = Url::parse(&url).map_err(|e| format!("地址无效：{e}"))?;
  let view = match existing(&window, LABEL) {
    Some(view) => view,
    None => window
      .add_child(
        // 白底：不使用透明，网页自己排的颜色才不会被窗口底色影响
        WebviewBuilder::new(LABEL, WebviewUrl::External(parsed.clone()))
          .background_color(Color(255, 255, 255, 255)),
        LogicalPosition::new(bounds.x, bounds.y),
        LogicalSize::new(bounds.width, bounds.height),
      )
      .map_err(|e| e.to_string())?,
  };

  // 换地址才导航，避免每次窗口尺寸变化都重新加载页面、丢掉输入和滚动位置
  let already = state.current.lock().unwrap().as_deref() == Some(url.as_str());
  if !already {
    view.navigate(parsed).map_err(|e| e.to_string())?;
    *state.current.lock().unwrap() = Some(url);
  }

  apply_bounds(&view, &bounds)?;
  view.show().map_err(|e| e.to_string())
}

/// 只挪位置：面板拖宽、窗口缩放、切分屏都走这里
#[tauri::command]
pub fn browser_bounds(window: Window, bounds: Bounds) -> Result<(), String> {
  match existing(&window, LABEL) {
    Some(view) => apply_bounds(&view, &bounds),
    // 还没创建过就当作无事发生：前端挂载顺序不保证
    None => Ok(()),
  }
}

fn apply_bounds(view: &Webview, bounds: &Bounds) -> Result<(), String> {
  view
    .set_position(LogicalPosition::new(bounds.x, bounds.y))
    .map_err(|e| e.to_string())?;
  view
    .set_size(LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)))
    .map_err(|e| e.to_string())
}

/// 切到别的标签、打开查看器、面板收起时都要藏起来，
/// 否则这个原生视图会一直盖在 React 画的界面上面
#[tauri::command]
pub fn browser_hide(window: Window) -> Result<(), String> {
  if let Some(view) = existing(&window, LABEL) {
    view.hide().map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
pub fn browser_reload(window: Window) -> Result<(), String> {
  match existing(&window, LABEL) {
    Some(view) => view.reload().map_err(|e| e.to_string()),
    None => Ok(()),
  }
}
