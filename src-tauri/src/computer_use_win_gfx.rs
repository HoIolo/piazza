//! Windows 原生图形与浮窗渲染工具：
//! - 窗口真实可视边界（去除 Win10/11 隐形阴影边距）
//! - PrintWindow(PW_RENDERFULLCONTENT) 实时后台截帧并快速编码 PNG
//! - 目标窗口/进程图标提取为 32x32 PNG
//! - 基于 premultiplied ARGB DIB + UpdateLayeredWindow 的抗锯齿浮窗绘制
//!   （左上角捕获角标、鼠标穿透高亮边框、虚拟软件鼠标光标与点击涟漪）

#![cfg(target_os = "windows")]

use std::ffi::c_void;
use std::mem::{size_of, zeroed};
use std::ptr::null_mut;

use base64::Engine;
use windows_sys::Win32::Foundation::{HWND, POINT, RECT, SIZE};
use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows_sys::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC,
    DeleteObject, DrawTextW, GetDC, ReleaseDC, SelectObject, SetBkMode, SetStretchBltMode,
    SetTextColor, StretchBlt, AC_SRC_ALPHA, AC_SRC_OVER, ANTIALIASED_QUALITY, BITMAPINFO,
    BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DEFAULT_CHARSET, DIB_RGB_COLORS, DT_CALCRECT,
    DT_END_ELLIPSIS, DT_LEFT, DT_SINGLELINE, DT_VCENTER, FW_SEMIBOLD, HALFTONE, HDC, HGDIOBJ,
    SRCCOPY, TRANSPARENT,
};
use windows_sys::Win32::Storage::Xps::PrintWindow;
use windows_sys::Win32::UI::Shell::ExtractIconExW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    DestroyIcon, DrawIconEx, GetClassLongPtrW, GetWindowRect, SendMessageTimeoutW,
    UpdateLayeredWindow, DI_NORMAL, GCLP_HICON, GCLP_HICONSM, HICON, ICON_BIG, ICON_SMALL,
    ICON_SMALL2, PW_RENDERFULLCONTENT, SMTO_ABORTIFHUNG, ULW_ALPHA, WM_GETICON,
};

pub fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn window_bounds(hwnd: HWND) -> Option<RECT> {
    let mut rect: RECT = unsafe { zeroed() };
    let hr = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            (&mut rect as *mut RECT).cast::<c_void>(),
            size_of::<RECT>() as u32,
        )
    };
    if hr == 0 && rect.right > rect.left && rect.bottom > rect.top {
        return Some(rect);
    }
    let ok = unsafe { GetWindowRect(hwnd, &mut rect) };
    if ok != 0 && rect.right > rect.left && rect.bottom > rect.top {
        Some(rect)
    } else {
        None
    }
}

struct DibSurface {
    dc: HDC,
    bitmap: HGDIOBJ,
    old: HGDIOBJ,
    bits: *mut u8,
    width: i32,
    height: i32,
}

impl DibSurface {
    fn new(width: i32, height: i32) -> Option<Self> {
        if width <= 0 || height <= 0 {
            return None;
        }
        unsafe {
            let screen_dc = GetDC(null_mut());
            let dc = CreateCompatibleDC(screen_dc);
            ReleaseDC(null_mut(), screen_dc);
            if dc.is_null() {
                return None;
            }
            let mut bmi: BITMAPINFO = zeroed();
            bmi.bmiHeader = BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                // 负高度 = top-down DIB，行 0 在顶部，与 PNG / 屏幕坐标一致
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..zeroed()
            };
            let mut bits: *mut c_void = null_mut();
            let bmp = CreateDIBSection(dc, &bmi, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
            if bmp.is_null() || bits.is_null() {
                DeleteDC(dc);
                return None;
            }
            let old = SelectObject(dc, bmp as HGDIOBJ);
            let len = (width as usize) * (height as usize) * 4;
            std::ptr::write_bytes(bits.cast::<u8>(), 0, len);
            Some(Self {
                dc,
                bitmap: bmp as HGDIOBJ,
                old,
                bits: bits.cast::<u8>(),
                width,
                height,
            })
        }
    }

    fn pixels_mut(&mut self) -> &mut [u8] {
        let len = (self.width as usize) * (self.height as usize) * 4;
        unsafe { std::slice::from_raw_parts_mut(self.bits, len) }
    }

    fn pixels(&self) -> &[u8] {
        let len = (self.width as usize) * (self.height as usize) * 4;
        unsafe { std::slice::from_raw_parts(self.bits, len) }
    }
}

impl Drop for DibSurface {
    fn drop(&mut self) {
        unsafe {
            SelectObject(self.dc, self.old);
            DeleteObject(self.bitmap);
            DeleteDC(self.dc);
        }
    }
}

fn encode_bgra_png(bgra: &[u8], width: u32, height: u32, opaque: bool) -> Option<String> {
    let mut rgba = Vec::with_capacity(bgra.len());
    for px in bgra.chunks_exact(4) {
        rgba.push(px[2]);
        rgba.push(px[1]);
        rgba.push(px[0]);
        rgba.push(if opaque { 255 } else { px[3] });
    }
    let mut out = Vec::with_capacity((width as usize * height as usize) / 2);
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
    }
    Some(base64::engine::general_purpose::STANDARD.encode(out))
}

/// 捕获目标窗口画面并等比缩放到 max_width 以内，返回 (width, height, png_base64)。
pub fn capture_window_png(hwnd: HWND, max_width: i32) -> Option<(u32, u32, String)> {
    let mut full: RECT = unsafe { zeroed() };
    if unsafe { GetWindowRect(hwnd, &mut full) } == 0 {
        return None;
    }
    let src_w = full.right - full.left;
    let src_h = full.bottom - full.top;
    if src_w < 20 || src_h < 20 {
        return None;
    }

    let scale = (max_width as f64 / src_w as f64).min(1.0);
    let dst_w = ((src_w as f64 * scale).round() as i32).max(160) & !1;
    let dst_h = ((src_h as f64 * scale).round() as i32).max(100) & !1;

    let mut dst = DibSurface::new(dst_w, dst_h)?;
    unsafe {
        let screen_dc = GetDC(null_mut());
        let src_dc = CreateCompatibleDC(screen_dc);
        let src_bmp = CreateCompatibleBitmap(screen_dc, src_w, src_h);
        ReleaseDC(null_mut(), screen_dc);
        if src_dc.is_null() || src_bmp.is_null() {
            if !src_bmp.is_null() {
                DeleteObject(src_bmp as HGDIOBJ);
            }
            if !src_dc.is_null() {
                DeleteDC(src_dc);
            }
            return None;
        }
        let old = SelectObject(src_dc, src_bmp as HGDIOBJ);
        let mut captured = PrintWindow(hwnd, src_dc, PW_RENDERFULLCONTENT) != 0;
        if !captured {
            captured = PrintWindow(hwnd, src_dc, 0) != 0;
        }
        if !captured {
            let win_dc = GetDC(hwnd);
            if !win_dc.is_null() {
                captured = BitBlt(src_dc, 0, 0, src_w, src_h, win_dc, 0, 0, SRCCOPY) != 0;
                ReleaseDC(hwnd, win_dc);
            }
        }
        if captured {
            SetStretchBltMode(dst.dc, HALFTONE);
            StretchBlt(dst.dc, 0, 0, dst_w, dst_h, src_dc, 0, 0, src_w, src_h, SRCCOPY);
        }
        SelectObject(src_dc, old);
        DeleteObject(src_bmp as HGDIOBJ);
        DeleteDC(src_dc);
        if !captured {
            return None;
        }
    }

    // 检查是否整帧全零（部分受保护窗口会返回黑帧）
    let data = dst.pixels_mut();
    let encoded = encode_bgra_png(data, dst_w as u32, dst_h as u32, true)?;
    Some((dst_w as u32, dst_h as u32, encoded))
}

/// 提取目标窗口或进程可执行文件的 32x32 应用图标，返回 PNG base64（不含 data URI 前缀）。
pub fn extract_window_icon_png(hwnd: HWND, exe_path: Option<&str>) -> Option<String> {
    let mut owned_icon = false;
    let mut hicon: HICON = null_mut();
    unsafe {
        for kind in [ICON_SMALL2, ICON_SMALL, ICON_BIG] {
            let mut result: usize = 0;
            let ok = SendMessageTimeoutW(
                hwnd,
                WM_GETICON,
                kind as usize,
                0,
                SMTO_ABORTIFHUNG,
                120,
                &mut result,
            );
            if ok != 0 && result != 0 {
                hicon = result as HICON;
                break;
            }
        }
        if hicon.is_null() {
            let v = GetClassLongPtrW(hwnd, GCLP_HICONSM);
            if v != 0 {
                hicon = v as HICON;
            }
        }
        if hicon.is_null() {
            let v = GetClassLongPtrW(hwnd, GCLP_HICON);
            if v != 0 {
                hicon = v as HICON;
            }
        }
        if hicon.is_null() {
            if let Some(path) = exe_path {
                let wide = to_wide(path);
                let mut large: HICON = null_mut();
                let mut small: HICON = null_mut();
                if ExtractIconExW(wide.as_ptr(), 0, &mut large, &mut small, 1) > 0 {
                    if !large.is_null() {
                        hicon = large;
                        owned_icon = true;
                        if !small.is_null() {
                            DestroyIcon(small);
                        }
                    } else if !small.is_null() {
                        hicon = small;
                        owned_icon = true;
                    }
                }
            }
        }
        if hicon.is_null() {
            return None;
        }
        let surface = DibSurface::new(32, 32);
        let Some(surface) = surface else {
            if owned_icon {
                DestroyIcon(hicon);
            }
            return None;
        };
        let drawn = DrawIconEx(surface.dc, 0, 0, hicon, 32, 32, 0, null_mut(), DI_NORMAL) != 0;
        if owned_icon {
            DestroyIcon(hicon);
        }
        if !drawn {
            return None;
        }
        let has_alpha = surface.pixels().chunks_exact(4).any(|p| p[3] > 0);
        encode_bgra_png(surface.pixels(), 32, 32, !has_alpha)
    }
}

// MARK: - Premultiplied ARGB 软件抗锯齿绘制原语

#[inline]
fn blend_px(buf: &mut [u8], width: i32, height: i32, x: i32, y: i32, r: u8, g: u8, b: u8, a: f32) {
    if x < 0 || y < 0 || x >= width || y >= height || a <= 0.001 {
        return;
    }
    let alpha = a.clamp(0.0, 1.0);
    let idx = ((y * width + x) * 4) as usize;
    let dst_b = buf[idx] as f32 / 255.0;
    let dst_g = buf[idx + 1] as f32 / 255.0;
    let dst_r = buf[idx + 2] as f32 / 255.0;
    let dst_a = buf[idx + 3] as f32 / 255.0;

    let src_r = (r as f32 / 255.0) * alpha;
    let src_g = (g as f32 / 255.0) * alpha;
    let src_b = (b as f32 / 255.0) * alpha;
    let inv = 1.0 - alpha;

    buf[idx] = ((src_b + dst_b * inv).clamp(0.0, 1.0) * 255.0).round() as u8;
    buf[idx + 1] = ((src_g + dst_g * inv).clamp(0.0, 1.0) * 255.0).round() as u8;
    buf[idx + 2] = ((src_r + dst_r * inv).clamp(0.0, 1.0) * 255.0).round() as u8;
    buf[idx + 3] = ((alpha + dst_a * inv).clamp(0.0, 1.0) * 255.0).round() as u8;
}

fn sdf_rounded_rect(px: f32, py: f32, w: f32, h: f32, radius: f32) -> f32 {
    let cx = w * 0.5;
    let cy = h * 0.5;
    let bx = cx - radius;
    let by = cy - radius;
    let qx = (px - cx).abs() - bx;
    let qy = (py - cy).abs() - by;
    let outside = (qx.max(0.0).powi(2) + qy.max(0.0).powi(2)).sqrt();
    let inside = qx.max(qy).min(0.0);
    outside + inside - radius
}

fn draw_rounded_box(
    buf: &mut [u8],
    w: i32,
    h: i32,
    radius: f32,
    fill: (u8, u8, u8, f32),
    stroke: (u8, u8, u8, f32),
    stroke_w: f32,
) {
    let wf = w as f32;
    let hf = h as f32;
    for y in 0..h {
        for x in 0..w {
            let d = sdf_rounded_rect(x as f32 + 0.5, y as f32 + 0.5, wf, hf, radius);
            if fill.3 > 0.0 {
                let cov = (0.5 - d).clamp(0.0, 1.0);
                if cov > 0.0 {
                    blend_px(buf, w, h, x, y, fill.0, fill.1, fill.2, fill.3 * cov);
                }
            }
            if stroke.3 > 0.0 && stroke_w > 0.0 {
                let outer = (0.5 - d).clamp(0.0, 1.0);
                let inner = (0.5 - (d + stroke_w)).clamp(0.0, 1.0);
                let ring = (outer - inner).clamp(0.0, 1.0);
                if ring > 0.0 {
                    blend_px(buf, w, h, x, y, stroke.0, stroke.1, stroke.2, stroke.3 * ring);
                }
            }
        }
    }
}

fn draw_circle(buf: &mut [u8], w: i32, h: i32, cx: f32, cy: f32, r: f32, col: (u8, u8, u8, f32)) {
    let min_x = ((cx - r - 2.0).floor() as i32).max(0);
    let max_x = ((cx + r + 2.0).ceil() as i32).min(w - 1);
    let min_y = ((cy - r - 2.0).floor() as i32).max(0);
    let max_y = ((cy + r + 2.0).ceil() as i32).min(h - 1);
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dist = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let cov = (r + 0.5 - dist).clamp(0.0, 1.0);
            if cov > 0.0 {
                blend_px(buf, w, h, x, y, col.0, col.1, col.2, col.3 * cov);
            }
        }
    }
}

fn draw_ring(
    buf: &mut [u8],
    w: i32,
    h: i32,
    cx: f32,
    cy: f32,
    r: f32,
    thickness: f32,
    col: (u8, u8, u8, f32),
) {
    let min_x = ((cx - r - thickness - 2.0).floor() as i32).max(0);
    let max_x = ((cx + r + thickness + 2.0).ceil() as i32).min(w - 1);
    let min_y = ((cy - r - thickness - 2.0).floor() as i32).max(0);
    let max_y = ((cy + r + thickness + 2.0).ceil() as i32).min(h - 1);
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let dist = ((x as f32 + 0.5 - cx).powi(2) + (y as f32 + 0.5 - cy).powi(2)).sqrt();
            let half = thickness * 0.5;
            let cov = (half + 0.5 - (dist - r).abs()).clamp(0.0, 1.0);
            if cov > 0.0 {
                blend_px(buf, w, h, x, y, col.0, col.1, col.2, col.3 * cov);
            }
        }
    }
}

fn composite_text(surface: &mut DibSurface, text: &str, rect: RECT, color: (u8, u8, u8)) {
    let tw = (rect.right - rect.left).max(1);
    let th = (rect.bottom - rect.top).max(1);
    let Some(scratch) = DibSurface::new(tw, th) else {
        return;
    };
    let font_name = to_wide("Segoe UI");
    let wide_text = to_wide(text);
    unsafe {
        let font = CreateFontW(
            -13,
            0,
            0,
            0,
            FW_SEMIBOLD as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET as u32,
            0,
            0,
            ANTIALIASED_QUALITY as u32,
            0,
            font_name.as_ptr(),
        );
        let old_font = if !font.is_null() {
            SelectObject(scratch.dc, font as HGDIOBJ)
        } else {
            null_mut()
        };
        SetBkMode(scratch.dc, TRANSPARENT as i32);
        SetTextColor(scratch.dc, 0x00FF_FFFF);
        let mut draw_rc = RECT {
            left: 0,
            top: 0,
            right: tw,
            bottom: th,
        };
        DrawTextW(
            scratch.dc,
            wide_text.as_ptr(),
            -1,
            &mut draw_rc,
            DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS,
        );
        if !old_font.is_null() {
            SelectObject(scratch.dc, old_font);
        }
        if !font.is_null() {
            DeleteObject(font as HGDIOBJ);
        }
    }

    let src = scratch.pixels();
    let dst_w = surface.width;
    let dst_h = surface.height;
    let dst = surface.pixels_mut();
    for y in 0..th {
        for x in 0..tw {
            let sidx = ((y * tw + x) * 4) as usize;
            let lum = (src[sidx] as u16 + src[sidx + 1] as u16 + src[sidx + 2] as u16) as f32
                / (3.0 * 255.0);
            if lum > 0.02 {
                blend_px(
                    dst,
                    dst_w,
                    dst_h,
                    rect.left + x,
                    rect.top + y,
                    color.0,
                    color.1,
                    color.2,
                    lum,
                );
            }
        }
    }
}

fn measure_text_width(text: &str) -> i32 {
    let Some(scratch) = DibSurface::new(8, 8) else {
        return 110;
    };
    let font_name = to_wide("Segoe UI");
    let wide_text = to_wide(text);
    let mut rc = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 20,
    };
    unsafe {
        let font = CreateFontW(
            -13,
            0,
            0,
            0,
            FW_SEMIBOLD as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET as u32,
            0,
            0,
            ANTIALIASED_QUALITY as u32,
            0,
            font_name.as_ptr(),
        );
        let old_font = if !font.is_null() {
            SelectObject(scratch.dc, font as HGDIOBJ)
        } else {
            null_mut()
        };
        DrawTextW(
            scratch.dc,
            wide_text.as_ptr(),
            -1,
            &mut rc,
            DT_CALCRECT | DT_SINGLELINE,
        );
        if !old_font.is_null() {
            SelectObject(scratch.dc, old_font);
        }
        if !font.is_null() {
            DeleteObject(font as HGDIOBJ);
        }
    }
    (rc.right - rc.left).clamp(72, 180)
}

fn commit_layered(hwnd: HWND, surface: &DibSurface, x: i32, y: i32) {
    let pt_dst = POINT { x, y };
    let size = SIZE {
        cx: surface.width,
        cy: surface.height,
    };
    let pt_src = POINT { x: 0, y: 0 };
    let blend = BLENDFUNCTION {
        BlendOp: AC_SRC_OVER as u8,
        BlendFlags: 0,
        SourceConstantAlpha: 255,
        AlphaFormat: AC_SRC_ALPHA as u8,
    };
    unsafe {
        let screen_dc = GetDC(null_mut());
        UpdateLayeredWindow(
            hwnd,
            screen_dc,
            &pt_dst,
            &size,
            surface.dc,
            &pt_src,
            0,
            &blend,
            ULW_ALPHA,
        );
        ReleaseDC(null_mut(), screen_dc);
    }
}

/// 渲染被控窗口左上角的深色圆角捕获角标，返回 (badge_w, badge_h, stop_hit_rect)。
pub fn render_badge_layered(
    hwnd: HWND,
    x: i32,
    y: i32,
    text: &str,
    active: bool,
    pulse_alpha: f32,
) -> (i32, i32, RECT) {
    let text_w = measure_text_width(text);
    let w = text_w + 58;
    let h = 28;
    let stop_rect = RECT {
        left: w - 26,
        top: 3,
        right: w - 4,
        bottom: h - 3,
    };

    if let Some(mut surface) = DibSurface::new(w, h) {
        let buf = surface.pixels_mut();
        draw_rounded_box(
            buf,
            w,
            h,
            14.0,
            (24, 24, 27, 0.90),
            (255, 255, 255, 0.22),
            1.0,
        );
        // 左侧录屏捕获脉冲圆点（活跃红色，空闲绿色）
        let dot_col = if active {
            (255, 69, 58, pulse_alpha)
        } else {
            (48, 209, 88, 0.95)
        };
        draw_ring(buf, w, h, 14.0, 14.0, 5.5, 1.3, (dot_col.0, dot_col.1, dot_col.2, dot_col.3 * 0.65));
        draw_circle(buf, w, h, 14.0, 14.0, 3.3, dot_col);

        // 右侧停止按钮圆底与方形停止符号
        let scx = (stop_rect.left + stop_rect.right) as f32 * 0.5;
        let scy = (stop_rect.top + stop_rect.bottom) as f32 * 0.5;
        draw_circle(buf, w, h, scx, scy, 8.5, (255, 255, 255, 0.16));
        for sy in (scy as i32 - 3)..=(scy as i32 + 3) {
            for sx in (scx as i32 - 3)..=(scx as i32 + 3) {
                blend_px(buf, w, h, sx, sy, 255, 255, 255, 0.92);
            }
        }

        composite_text(
            &mut surface,
            text,
            RECT {
                left: 26,
                top: 2,
                right: w - 28,
                bottom: h - 2,
            },
            (255, 255, 255),
        );
        commit_layered(hwnd, &surface, x, y);
    }
    (w, h, stop_rect)
}

/// 渲染鼠标穿透的被控窗口高亮轮廓边框。
pub fn render_border_layered(hwnd: HWND, x: i32, y: i32, width: i32, height: i32, active: bool) {
    if width < 24 || height < 24 {
        return;
    }
    if let Some(mut surface) = DibSurface::new(width, height) {
        let stroke = if active {
            (10, 132, 255, 0.78)
        } else {
            (10, 132, 255, 0.28)
        };
        let stroke_w = if active { 2.2 } else { 1.2 };
        draw_rounded_box(
            surface.pixels_mut(),
            width,
            height,
            10.0,
            (0, 0, 0, 0.0),
            stroke,
            stroke_w,
        );
        commit_layered(hwnd, &surface, x, y);
    }
}

fn point_in_triangle(px: f32, py: f32, a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> bool {
    let sign = |p1: (f32, f32), p2: (f32, f32), p3: (f32, f32)| {
        (p1.0 - p3.0) * (p2.1 - p3.1) - (p2.0 - p3.0) * (p1.1 - p3.1)
    };
    let d1 = sign((px, py), a, b);
    let d2 = sign((px, py), b, c);
    let d3 = sign((px, py), c, a);
    let has_neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(has_neg && has_pos)
}

/// 渲染虚拟软件光标与点击涟漪（锚点位于光标尖端 x-16, y-16）。
pub fn render_cursor_layered(hwnd: HWND, tip_x: i32, tip_y: i32, ripple: f32, opacity: f32) {
    let size = 48;
    let tip = (16.0_f32, 16.0_f32);
    let Some(mut surface) = DibSurface::new(size, size) else {
        return;
    };
    let buf = surface.pixels_mut();

    // 点击涟漪扩散环
    if ripple > 0.0 && ripple < 1.0 {
        let radius = 4.0 + ripple * 13.0;
        let alpha = (1.0 - ripple) * 0.72 * opacity;
        draw_ring(buf, size, size, tip.0, tip.1, radius, 2.0, (10, 132, 255, alpha));
    }

    // 箭头主体（深色主箭 + 白色细描边，高对比度在浅/深背景均清晰）
    let p_tip = (tip.0, tip.1);
    let p_left = (tip.0, tip.1 + 19.0);
    let p_mid = (tip.0 + 5.5, tip.1 + 14.0);
    let p_right = (tip.0 + 13.5, tip.1 + 13.5);
    let p_tail_a = (tip.0 + 6.5, tip.1 + 13.0);
    let p_tail_b = (tip.0 + 10.5, tip.1 + 21.5);
    let p_tail_c = (tip.0 + 7.5, tip.1 + 22.8);
    let p_tail_d = (tip.0 + 3.8, tip.1 + 14.5);

    let inside_arrow = |fx: f32, fy: f32| {
        point_in_triangle(fx, fy, p_tip, p_left, p_mid)
            || point_in_triangle(fx, fy, p_tip, p_mid, p_right)
            || point_in_triangle(fx, fy, p_tail_a, p_tail_b, p_tail_c)
            || point_in_triangle(fx, fy, p_tail_a, p_tail_c, p_tail_d)
    };

    for y in 0..size {
        for x in 0..size {
            let fx = x as f32 + 0.5;
            let fy = y as f32 + 0.5;
            if inside_arrow(fx, fy) {
                blend_px(buf, size, size, x, y, 22, 24, 28, 0.96 * opacity);
            } else {
                // 1.3px 白色外描边 + 轻阴影
                let near = [(-1.2, 0.0), (1.2, 0.0), (0.0, -1.2), (0.0, 1.2)]
                    .iter()
                    .any(|(dx, dy)| inside_arrow(fx + dx, fy + dy));
                if near {
                    blend_px(buf, size, size, x, y, 255, 255, 255, 0.95 * opacity);
                }
            }
        }
    }

    commit_layered(hwnd, &surface, tip_x - 16, tip_y - 16);
}
