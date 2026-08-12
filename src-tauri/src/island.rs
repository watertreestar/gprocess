//! 刘海屏通知窗口：透明无边框置顶，主屏顶部居中，初始隐藏，告警时由前端 show

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const ISLAND_LABEL: &str = "island";
const WIDTH: f64 = 340.0;
const HEIGHT: f64 = 170.0;

pub fn setup_island(app: &AppHandle) -> tauri::Result<()> {
    // 主屏顶部居中（逻辑像素）；取不到主屏信息时回退到 1920 宽度假设
    let logical_width = app
        .primary_monitor()?
        .map(|m| m.size().width as f64 / m.scale_factor())
        .unwrap_or(1920.0);
    let x = (logical_width - WIDTH) / 2.0;

    let window = WebviewWindowBuilder::new(
        app,
        ISLAND_LABEL,
        WebviewUrl::App("index.html#/island".into()),
    )
    .title("gprocess-island")
    .inner_size(WIDTH, HEIGHT)
    .position(x, 8.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .maximizable(false)
    .visible(false)
    .focused(false)
    .build()?;

    // 关窗拦截转隐藏；退出只走托盘菜单（与主窗口一致）
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
        }
    });

    Ok(())
}
