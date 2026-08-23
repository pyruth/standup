use crate::{
    settings::{
        MelloBoardColor, MelloColor, MelloMotionStyle, ReminderPosition, ReminderVisual, Settings,
    },
    sound,
    state::AppState,
    wellness::SessionMood,
};
use serde::Serialize;
use std::{thread, time::Duration};
use tauri::{
    AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, Position, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use uuid::Uuid;

const POPUP_WIDTH: f64 = 640.0;
const POPUP_HEIGHT: f64 = 520.0;
const EDGE_MARGIN: f64 = 24.0;
const PREPARING_TIMEOUT: Duration = Duration::from_secs(8);
const DEFAULT_VISIBLE_MS: u64 = 8_000;
const INTERACTION_TIMEOUT: Duration = Duration::from_secs(120);

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
    purpose: ReminderPurpose,
    position: ReminderPosition,
    animation: ReminderAnimation,
    mello_motion_style: MelloMotionStyle,
    mello_reacts_to_pointer: bool,
    mello_keep_same_color: bool,
    mello_color: MelloColor,
    reminder_message: String,
    move_prompt: Option<String>,
    session_mood: SessionMood,
    mello_board_color: MelloBoardColor,
    follow_system_reduced_motion: bool,
    deadline_ms: u64,
    duration_ms: u64,
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
            mello_motion_style: session.mello_motion_style,
            mello_reacts_to_pointer: session.mello_reacts_to_pointer,
            mello_keep_same_color: session.mello_keep_same_color,
            mello_color: session.mello_color,
            reminder_message: session.reminder_message.clone(),
            move_prompt: session.move_prompt.clone(),
            purpose: session.purpose,
            session_mood: session.session_mood,
            duration_milliseconds: session.duration_ms,
            mello_board_color: session.mello_board_color,
            follow_system_reduced_motion: session.follow_system_reduced_motion,
        })
    }

    fn mark_visible(&mut self, label: &str) -> Option<PopupSession> {
        let session = self.current.as_mut()?;
        if session.label != label || session.phase != PopupPhase::Preparing {
            return None;
        }
        session.phase = PopupPhase::Visible;
        session.deadline_ms = now_ms() + session.duration_ms + 2_000;
        Some(session.clone())
    }

    fn set_interacting(&mut self, label: &str, active: bool) -> bool {
        let Some(session) = self.current.as_mut() else {
            return false;
        };
        if session.label != label || session.phase != PopupPhase::Visible {
            return false;
        }
        let timeout = if active {
            INTERACTION_TIMEOUT
        } else {
            Duration::from_millis(session.duration_ms + 2_000)
        };
        session.deadline_ms = now_ms() + timeout.as_millis() as u64;
        true
    }

    fn visible_deadline(&self, id: &str) -> Option<u64> {
        self.current.as_ref().and_then(|session| {
            (session.id == id && session.phase == PopupPhase::Visible)
                .then_some(session.deadline_ms)
        })
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
    animation: ReminderAnimation,
    mello_motion_style: MelloMotionStyle,
    mello_reacts_to_pointer: bool,
    mello_keep_same_color: bool,
    mello_color: MelloColor,
    reminder_message: String,
    move_prompt: Option<String>,
    purpose: ReminderPurpose,
    session_mood: SessionMood,
    duration_milliseconds: u64,
    mello_board_color: MelloBoardColor,
    follow_system_reduced_motion: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ReminderAnimation {
    Mello,
    OriginalGif,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReminderPurpose {
    Stand,
    Preview,
    Peek,
    Microbreak,
    Celebration,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorSample {
    x: f64,
    y: f64,
    inside: bool,
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
    show_kind(
        app,
        if preview {
            ReminderPurpose::Preview
        } else {
            ReminderPurpose::Stand
        },
    )
}

pub fn show_kind(app: &AppHandle, purpose: ReminderPurpose) -> Result<(), String> {
    let state = app.state::<AppState>();
    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .get();
    let id = Uuid::new_v4().simple().to_string();
    let label = format!("reminder-{id}");
    let (reminder_message, duration_ms) = match purpose {
        ReminderPurpose::Stand | ReminderPurpose::Preview => {
            (settings.reminder_message.clone(), DEFAULT_VISIBLE_MS)
        }
        ReminderPurpose::Peek => ("Break in one minute".into(), 3_500),
        ReminderPurpose::Microbreak => ("Tiny movement break".into(), 6_000),
        ReminderPurpose::Celebration => ("Nice break!".into(), 4_500),
    };
    let contextual = matches!(
        purpose,
        ReminderPurpose::Peek | ReminderPurpose::Microbreak | ReminderPurpose::Celebration
    );
    let (move_prompt, session_mood) = state
        .wellness
        .lock()
        .map(|mut wellness| {
            let prompt = if settings.mello_moves_enabled
                && matches!(
                    purpose,
                    ReminderPurpose::Stand | ReminderPurpose::Microbreak
                ) {
                wellness
                    .next_move(&settings.mello_move_categories)
                    .map(str::to_string)
            } else {
                None
            };
            (prompt, wellness.mood(settings.session_mood_enabled))
        })
        .unwrap_or((None, SessionMood::Neutral));
    let session = PopupSession {
        id: id.clone(),
        label: label.clone(),
        phase: PopupPhase::Preparing,
        purpose,
        position: settings.reminder_position,
        animation: match if contextual {
            ReminderVisual::Mello
        } else {
            settings.reminder_visual
        } {
            ReminderVisual::Mello => ReminderAnimation::Mello,
            ReminderVisual::OriginalGif => ReminderAnimation::OriginalGif,
        },
        mello_motion_style: settings.mello_motion_style,
        mello_reacts_to_pointer: settings.mello_reacts_to_pointer
            && !matches!(
                purpose,
                ReminderPurpose::Peek | ReminderPurpose::Celebration
            ),
        mello_keep_same_color: settings.mello_keep_same_color,
        mello_color: settings.mello_color,
        reminder_message,
        move_prompt,
        session_mood,
        mello_board_color: settings.mello_board_color,
        follow_system_reduced_motion: settings.follow_system_reduced_motion,
        deadline_ms: 0,
        duration_ms,
    };

    let replaced = {
        let mut lifecycle = state
            .popup
            .lock()
            .map_err(|_| "popup state is unavailable".to_string())?;
        if lifecycle.is_busy() {
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

pub fn cursor_sample(window: &WebviewWindow) -> Result<CursorSample, String> {
    let cursor = window
        .cursor_position()
        .map_err(|error| error.to_string())?;
    let origin = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    Ok(relative_cursor_sample(
        cursor.x,
        cursor.y,
        f64::from(origin.x),
        f64::from(origin.y),
        f64::from(size.width),
        f64::from(size.height),
    ))
}

pub fn set_cursor_capture(
    window: &WebviewWindow,
    state: &AppState,
    enabled: bool,
) -> Result<(), String> {
    let allowed = state
        .popup
        .lock()
        .map_err(|_| "popup state is unavailable".to_string())?
        .current
        .as_ref()
        .is_some_and(|session| {
            session.label == window.label()
                && session.phase == PopupPhase::Visible
                && session.mello_reacts_to_pointer
                && matches!(session.animation, ReminderAnimation::Mello)
        });
    if enabled && !allowed {
        return Err("cursor capture is unavailable for this popup".into());
    }
    window
        .set_ignore_cursor_events(!enabled)
        .map_err(|error| error.to_string())
}

pub fn set_interacting(
    window: &WebviewWindow,
    state: &AppState,
    active: bool,
) -> Result<(), String> {
    if state
        .popup
        .lock()
        .map_err(|_| "popup state is unavailable".to_string())?
        .set_interacting(window.label(), active)
    {
        Ok(())
    } else {
        Err("this popup session is no longer visible".into())
    }
}

fn relative_cursor_sample(
    cursor_x: f64,
    cursor_y: f64,
    origin_x: f64,
    origin_y: f64,
    width: f64,
    height: f64,
) -> CursorSample {
    let safe_width = width.max(1.0);
    let safe_height = height.max(1.0);
    let x = (cursor_x - origin_x) / safe_width;
    let y = (cursor_y - origin_y) / safe_height;
    CursorSample {
        x,
        y,
        inside: (0.0..=1.0).contains(&x) && (0.0..=1.0).contains(&y),
    }
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
    if matches!(
        session.purpose,
        ReminderPurpose::Stand | ReminderPurpose::Preview | ReminderPurpose::Microbreak
    ) {
        let _ = sound::play(app, reminder_sound);
    }

    let shown_at = now_ms();
    if session.purpose == ReminderPurpose::Stand {
        if let Ok(mut timer) = state.timer.lock() {
            timer.mark_reminder_shown(shown_at);
        } else {
            clear_session_by_label(app, window.label());
            return Err("timer state is unavailable".into());
        }
        let break_check_enabled = state
            .settings
            .lock()
            .map(|store| store.get().break_check_enabled)
            .unwrap_or(false);
        if let Ok(mut wellness) = state.wellness.lock() {
            wellness.reminder_shown(shown_at, break_check_enabled);
        }
    } else if session.purpose == ReminderPurpose::Microbreak {
        if let Ok(mut timer) = state.timer.lock() {
            timer.mark_microbreak_shown(shown_at);
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
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(250));
        let deadline = app
            .state::<AppState>()
            .popup
            .lock()
            .ok()
            .and_then(|lifecycle| lifecycle.visible_deadline(&id));
        let Some(deadline) = deadline else {
            break;
        };
        if now_ms() >= deadline {
            clear_session_by_id_and_phase(&app, &id, PopupPhase::Visible);
            break;
        }
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
            purpose: ReminderPurpose::Preview,
            position: ReminderPosition::BottomRight,
            animation: ReminderAnimation::Mello,
            mello_motion_style: MelloMotionStyle::Playful,
            mello_reacts_to_pointer: true,
            mello_keep_same_color: true,
            mello_color: MelloColor::Periwinkle,
            reminder_message: "Stand up\nmove a little".into(),
            move_prompt: None,
            session_mood: SessionMood::Neutral,
            mello_board_color: MelloBoardColor::Cream,
            follow_system_reduced_motion: true,
            deadline_ms: if phase == PopupPhase::Visible {
                now_ms() + DEFAULT_VISIBLE_MS + 2_000
            } else {
                0
            },
            duration_ms: DEFAULT_VISIBLE_MS,
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

    #[test]
    fn cursor_coordinates_are_relative_to_the_click_through_popup() {
        let inside = relative_cursor_sample(250.0, 300.0, 100.0, 100.0, 300.0, 400.0);
        assert!((inside.x - 0.5).abs() < f64::EPSILON);
        assert!((inside.y - 0.5).abs() < f64::EPSILON);
        assert!(inside.inside);

        let outside = relative_cursor_sample(50.0, 50.0, 100.0, 100.0, 300.0, 400.0);
        assert!(outside.x < 0.0);
        assert!(outside.y < 0.0);
        assert!(!outside.inside);
    }

    #[test]
    fn interaction_extends_and_release_restores_the_watchdog_deadline() {
        let mut lifecycle = PopupLifecycle {
            current: Some(popup_session("current", PopupPhase::Visible)),
        };
        let ordinary = lifecycle.visible_deadline("current").unwrap();
        assert!(lifecycle.set_interacting("reminder-current", true));
        let interacting = lifecycle.visible_deadline("current").unwrap();
        assert!(interacting > ordinary);
        assert!(lifecycle.set_interacting("reminder-current", false));
        let released = lifecycle.visible_deadline("current").unwrap();
        assert!(released < interacting);
    }
}
