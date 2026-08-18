use crate::{
    custom_animation,
    settings::{ReminderPosition, Settings},
    sound,
    state::AppState,
};
use serde::Serialize;
use std::{thread, time::Duration};
use tauri::{
    AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, Position, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use uuid::Uuid;

const POPUP_WIDTH: f64 = 272.0;
const POPUP_HEIGHT: f64 = 384.0;
const EDGE_MARGIN: f64 = 24.0;
const PREPARING_TIMEOUT: Duration = Duration::from_secs(8);
const VISIBLE_TIMEOUT: Duration = Duration::from_secs(9);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PopupPhase {
    Preparing,
    Visible,
}

#[derive(Debug, Clone)]
struct PopupSession {
    id: String,
    label: String,
    phase: PopupPhase,
    preview: bool,
    position: ReminderPosition,
    animation: custom_animation::ActiveAnimation,
}

#[derive(Debug, Default)]
pub struct PopupLifecycle {
    current: Option<PopupSession>,
}

impl PopupLifecycle {
    pub fn is_busy(&self) -> bool {
        self.current.is_some()
    }

    pub fn is_visible(&self) -> bool {
        self.current
            .as_ref()
            .is_some_and(|session| session.phase == PopupPhase::Visible)
    }

    fn configuration(&self, label: &str) -> Option<PopupConfiguration> {
        let session = self.current.as_ref()?;
        if session.label != label || session.phase != PopupPhase::Preparing {
            return None;
        }
        Some(PopupConfiguration {
            position: session.position,
            animation: session.animation.clone(),
        })
    }

    fn mark_visible(&mut self, label: &str) -> Option<PopupSession> {
        let session = self.current.as_mut()?;
        if session.label != label || session.phase != PopupPhase::Preparing {
            return None;
        }
        session.phase = PopupPhase::Visible;
        Some(session.clone())
    }

    fn finish_label(&mut self, label: &str) -> Option<PopupSession> {
        if self
            .current
            .as_ref()
            .is_some_and(|session| session.label == label)
        {
            self.current.take()
        } else {
            None
        }
    }

    fn finish_id_in_phase(&mut self, id: &str, phase: PopupPhase) -> Option<PopupSession> {
        if self
            .current
            .as_ref()
            .is_some_and(|session| session.id == id && session.phase == phase)
        {
            self.current.take()
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupConfiguration {
    position: ReminderPosition,
    animation: custom_animation::ActiveAnimation,
}

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

fn create_popup(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("popup.html".into()))
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
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .get();
    let id = Uuid::new_v4().simple().to_string();
    let label = format!("reminder-{id}");
    let session = PopupSession {
        id: id.clone(),
        label: label.clone(),
        phase: PopupPhase::Preparing,
        preview,
        position: settings.reminder_position,
        animation: custom_animation::active(app, &settings),
    };

    let replaced = {
        let mut lifecycle = state
            .popup
            .lock()
            .map_err(|_| "popup state is unavailable".to_string())?;
        if lifecycle.is_busy() && !preview {
            return Ok(());
        }
        lifecycle.current.replace(session)
    };
    if let Some(previous) = replaced {
        destroy_window(app, &previous.label);
    }

    let prepare_result = create_popup(app, &label)
        .map_err(|error| error.to_string())
        .and_then(|window| {
            if let Err(error) = place_popup(app, &window, &settings) {
                let _ = window.destroy();
                return Err(error);
            }
            Ok(())
        });
    if let Err(error) = prepare_result {
        clear_session_by_label(app, &label);
        return Err(error);
    }

    start_preparing_watchdog(app.clone(), id);
    Ok(())
}

pub fn configuration(
    window: &WebviewWindow,
    state: &AppState,
) -> Result<PopupConfiguration, String> {
    state
        .popup
        .lock()
        .map_err(|_| "popup state is unavailable".to_string())?
        .configuration(window.label())
        .ok_or_else(|| "this popup session is no longer active".to_string())
}

pub fn ready(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let lifecycle = state
            .popup
            .lock()
            .map_err(|_| "popup state is unavailable".to_string())?;
        if lifecycle.configuration(window.label()).is_none() {
            return Err("this popup session is no longer preparing".into());
        }
    }

    let reminder_sound = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .get()
        .reminder_sound;

    if let Err(error) = window.show() {
        clear_session_by_label(app, window.label());
        return Err(error.to_string());
    }

    let session = state
        .popup
        .lock()
        .map_err(|_| "popup state is unavailable".to_string())?
        .mark_visible(window.label())
        .ok_or_else(|| {
            let _ = window.destroy();
            "this popup session expired before it could become visible".to_string()
        })?;

    start_visible_watchdog(app.clone(), session.id.clone());
    let _ = sound::play(app, reminder_sound);

    if !session.preview {
        if let Ok(mut timer) = state.timer.lock() {
            timer.mark_reminder_shown(now_ms());
        } else {
            clear_session_by_label(app, window.label());
            return Err("timer state is unavailable".into());
        }
    }

    Ok(())
}

pub fn finished(app: &AppHandle, window: &WebviewWindow) {
    clear_session_by_label(app, window.label());
}

fn start_preparing_watchdog(app: AppHandle, id: String) {
    thread::spawn(move || {
        thread::sleep(PREPARING_TIMEOUT);
        clear_session_by_id_and_phase(&app, &id, PopupPhase::Preparing);
    });
}

fn start_visible_watchdog(app: AppHandle, id: String) {
    thread::spawn(move || {
        thread::sleep(VISIBLE_TIMEOUT);
        clear_session_by_id_and_phase(&app, &id, PopupPhase::Visible);
    });
}

fn clear_session_by_label(app: &AppHandle, label: &str) {
    let session = app
        .state::<AppState>()
        .popup
        .lock()
        .ok()
        .and_then(|mut lifecycle| lifecycle.finish_label(label));
    if let Some(session) = session {
        destroy_window(app, &session.label);
    }
}

fn clear_session_by_id_and_phase(app: &AppHandle, id: &str, phase: PopupPhase) {
    let session = app
        .state::<AppState>()
        .popup
        .lock()
        .ok()
        .and_then(|mut lifecycle| lifecycle.finish_id_in_phase(id, phase));
    if let Some(session) = session {
        destroy_window(app, &session.label);
    }
}

fn destroy_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.destroy();
    }
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

fn place_popup(app: &AppHandle, window: &WebviewWindow, settings: &Settings) -> Result<(), String> {
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
        .clamp(0.25, 1.0);
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
        ReminderPosition::TopLeft | ReminderPosition::MiddleLeft | ReminderPosition::BottomLeft => {
            left + margin
        }
        ReminderPosition::TopCenter | ReminderPosition::Center | ReminderPosition::BottomCenter => {
            left + (right - left - width) / 2.0
        }
        ReminderPosition::TopRight
        | ReminderPosition::MiddleRight
        | ReminderPosition::BottomRight => right - width - margin,
    };
    let y = match settings.reminder_position {
        ReminderPosition::TopLeft | ReminderPosition::TopCenter | ReminderPosition::TopRight => {
            top + margin
        }
        ReminderPosition::MiddleLeft | ReminderPosition::Center | ReminderPosition::MiddleRight => {
            top + (bottom - top - height) / 2.0
        }
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

    fn popup_session(id: &str, phase: PopupPhase) -> PopupSession {
        PopupSession {
            id: id.into(),
            label: format!("reminder-{id}"),
            phase,
            preview: true,
            position: ReminderPosition::BottomRight,
            animation: custom_animation::ActiveAnimation::Default,
        }
    }

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

    #[test]
    fn popup_only_becomes_visible_after_the_ready_checkpoint() {
        let mut lifecycle = PopupLifecycle {
            current: Some(popup_session("current", PopupPhase::Preparing)),
        };

        assert!(lifecycle.is_busy());
        assert!(!lifecycle.is_visible());
        assert!(lifecycle.configuration("reminder-current").is_some());

        lifecycle.mark_visible("reminder-current").unwrap();
        assert!(lifecycle.is_visible());
        assert!(lifecycle.configuration("reminder-current").is_none());
    }

    #[test]
    fn stale_watchdogs_cannot_finish_a_newer_popup() {
        let mut lifecycle = PopupLifecycle {
            current: Some(popup_session("new", PopupPhase::Visible)),
        };

        assert!(lifecycle
            .finish_id_in_phase("old", PopupPhase::Visible)
            .is_none());
        assert!(lifecycle.is_visible());
        assert!(lifecycle
            .finish_id_in_phase("new", PopupPhase::Preparing)
            .is_none());
        assert!(lifecycle.is_visible());
        assert!(lifecycle
            .finish_id_in_phase("new", PopupPhase::Visible)
            .is_some());
        assert!(!lifecycle.is_busy());
    }
}
