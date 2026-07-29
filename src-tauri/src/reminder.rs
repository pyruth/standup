use crate::{
    settings::{ReminderPosition, Settings},
    state::AppState,
};
use serde::Serialize;
use std::{
    sync::atomic::Ordering,
    thread,
    time::Duration,
};
use tauri::{
    AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, Position, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

const POPUP_WIDTH: f64 = 272.0;
const POPUP_HEIGHT: f64 = 384.0;
const EDGE_MARGIN: f64 = 24.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorOption {
    pub fingerprint: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub primary: bool,
}

pub fn create_popup(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window("reminder") {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        "reminder",
        WebviewUrl::App("popup.html".into()),
    )
    .title("StandUp Reminder")
    .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .focusable(false)
    .focused(false)
    .visible(false)
    .build()?;

    window.set_ignore_cursor_events(true)?;
    Ok(window)
}

pub fn show(app: &AppHandle, preview: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state
        .popup_visible
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }

    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .get();
    let window = create_popup(app).map_err(|error| error.to_string())?;
    place_popup(app, &window, &settings)?;

    let position = serde_json::to_string(&settings.reminder_position)
        .map_err(|error| error.to_string())?;
    window
        .eval(&format!(
            "window.__standupRestartReminder?.({position});"
        ))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;

    if !preview {
        let mut timer = state
            .timer
            .lock()
            .map_err(|_| "timer state is unavailable".to_string())?;
        timer.mark_reminder_shown(now_ms());
    }

    let handle = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(8));
        if let Some(window) = handle.get_webview_window("reminder") {
            let _ = window.hide();
        }
        handle
            .state::<AppState>()
            .popup_visible
            .store(false, Ordering::SeqCst);
    });

    Ok(())
}

pub fn available_monitors(app: &AppHandle) -> Result<Vec<MonitorOption>, String> {
    let reference_window = app
        .get_webview_window("settings")
        .ok_or_else(|| "settings window is unavailable".to_string())?;
    let primary = reference_window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let monitors = reference_window
        .available_monitors()
        .map_err(|error| error.to_string())?;

    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| MonitorOption {
            fingerprint: fingerprint(monitor),
            name: monitor
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Monitor {}", index + 1)),
            width: monitor.size().width,
            height: monitor.size().height,
            scale_factor: monitor.scale_factor(),
            primary: primary
                .as_ref()
                .is_some_and(|candidate| same_monitor(candidate, monitor)),
        })
        .collect())
}

fn place_popup(
    app: &AppHandle,
    window: &WebviewWindow,
    settings: &Settings,
) -> Result<(), String> {
    let reference_window = app
        .get_webview_window("settings")
        .ok_or_else(|| "settings window is unavailable".to_string())?;
    let monitors = reference_window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary = reference_window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| monitors.first().cloned())
        .ok_or_else(|| "no monitor is available".to_string())?;

    let selected = if settings.selected_monitor == "primary" {
        primary
    } else {
        monitors
            .into_iter()
            .find(|monitor| fingerprint(monitor) == settings.selected_monitor)
            .unwrap_or(primary)
    };

    let scale = selected.scale_factor();
    let work_area = selected.work_area();
    let available_width = f64::from(work_area.size.width) / scale - EDGE_MARGIN * 2.0;
    let available_height = f64::from(work_area.size.height) / scale - EDGE_MARGIN * 2.0;
    let fit_scale = (available_width / POPUP_WIDTH)
        .min(available_height / POPUP_HEIGHT)
        .min(1.0)
        .max(0.25);
    let logical_width = POPUP_WIDTH * fit_scale;
    let logical_height = POPUP_HEIGHT * fit_scale;
    window
        .set_size(LogicalSize::new(logical_width, logical_height))
        .map_err(|error| error.to_string())?;

    let width = logical_width * scale;
    let height = logical_height * scale;
    let margin = EDGE_MARGIN * scale;
    let left = f64::from(work_area.position.x);
    let top = f64::from(work_area.position.y);
    let right = left + f64::from(work_area.size.width);
    let bottom = top + f64::from(work_area.size.height);

    let x = match settings.reminder_position {
        ReminderPosition::TopLeft
        | ReminderPosition::MiddleLeft
        | ReminderPosition::BottomLeft => left + margin,
        ReminderPosition::TopCenter
        | ReminderPosition::Center
        | ReminderPosition::BottomCenter => left + (right - left - width) / 2.0,
        ReminderPosition::TopRight
        | ReminderPosition::MiddleRight
        | ReminderPosition::BottomRight => right - width - margin,
    };
    let y = match settings.reminder_position {
        ReminderPosition::TopLeft
        | ReminderPosition::TopCenter
        | ReminderPosition::TopRight => top + margin,
        ReminderPosition::MiddleLeft
        | ReminderPosition::Center
        | ReminderPosition::MiddleRight => top + (bottom - top - height) / 2.0,
        ReminderPosition::BottomLeft
        | ReminderPosition::BottomCenter
        | ReminderPosition::BottomRight => bottom - height - margin,
    };

    window
        .set_position(Position::Physical(PhysicalPosition::new(
            x.round() as i32,
            y.round() as i32,
        )))
        .map_err(|error| error.to_string())
}

fn fingerprint(monitor: &Monitor) -> String {
    format!(
        "{}|{}x{}|{:.3}|{},{}",
        monitor.name().map(String::as_str).unwrap_or("unknown"),
        monitor.size().width,
        monitor.size().height,
        monitor.scale_factor(),
        monitor.position().x,
        monitor.position().y
    )
}

fn same_monitor(left: &Monitor, right: &Monitor) -> bool {
    left.name() == right.name()
        && left.size() == right.size()
        && left.position() == right.position()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_positions_are_stable_serialized_values() {
        assert_eq!(
            serde_json::to_string(&ReminderPosition::BottomRight).unwrap(),
            "\"bottom-right\""
        );
        assert_eq!(
            serde_json::to_string(&ReminderPosition::Center).unwrap(),
            "\"center\""
        );
    }
}
