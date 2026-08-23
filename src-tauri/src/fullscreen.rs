#[cfg(target_os = "windows")]
pub fn foreground_app_is_fullscreen() -> bool {
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        },
        UI::WindowsAndMessaging::{
            GetDesktopWindow, GetForegroundWindow, GetShellWindow, GetWindowRect, IsIconic,
        },
    };

    unsafe {
        let window = GetForegroundWindow();
        if window.is_null()
            || window == GetDesktopWindow()
            || window == GetShellWindow()
            || IsIconic(window) != 0
        {
            return false;
        }

        let monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST);
        if monitor.is_null() {
            return false;
        }

        let mut window_rect = RECT::default();
        let mut monitor_info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..MONITORINFO::default()
        };
        if GetWindowRect(window, &mut window_rect) == 0
            || GetMonitorInfoW(monitor, &mut monitor_info) == 0
        {
            return false;
        }

        let screen = monitor_info.rcMonitor;
        const TOLERANCE: i32 = 2;
        window_rect.left <= screen.left + TOLERANCE
            && window_rect.top <= screen.top + TOLERANCE
            && window_rect.right >= screen.right - TOLERANCE
            && window_rect.bottom >= screen.bottom - TOLERANCE
    }
}

#[cfg(not(target_os = "windows"))]
pub fn foreground_app_is_fullscreen() -> bool {
    // macOS does not expose another application's fullscreen state without
    // privacy-sensitive Accessibility access. StandUp deliberately avoids it.
    false
}
