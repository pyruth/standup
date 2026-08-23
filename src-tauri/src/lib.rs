mod fullscreen;
mod reminder;
mod schedule;
mod settings;
mod shortcuts;
mod sound;
mod state;
mod timer;
mod tray;
mod wellness;

use crate::{
    reminder::MonitorOption,
    settings::{Settings, SettingsPatch, SettingsStore},
    state::AppState,
    timer::{TickInput, TimerDecision, TimerStatus},
};
use std::{
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    state
        .settings
        .lock()
        .map(|store| store.get())
        .map_err(|_| "settings state is unavailable".to_string())
}

#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    patch: SettingsPatch,
) -> Result<Settings, String> {
    let requested_login_setting = patch.launch_at_login;
    let requested_idle_threshold = patch.idle_threshold_minutes;
    let requested_microbreak =
        patch.microbreak_enabled.is_some() || patch.microbreak_interval_minutes.is_some();
    let requested_shortcuts = patch.shortcut_toggle_pause.is_some()
        || patch.shortcut_preview.is_some()
        || patch.shortcut_snooze.is_some();
    let (previous, settings, interval_changed) = {
        let mut store = state
            .settings
            .lock()
            .map_err(|_| "settings state is unavailable".to_string())?;
        let previous = store.get();
        let (settings, interval_changed) =
            store.update(patch).map_err(|error| error.to_string())?;
        (previous, settings, interval_changed)
    };
    if requested_shortcuts {
        if let Err(error) = shortcuts::reconfigure(&app, &previous, &settings) {
            state
                .settings
                .lock()
                .map_err(|_| "settings state is unavailable".to_string())?
                .restore(previous)
                .map_err(|restore_error| restore_error.to_string())?;
            return Err(error);
        }
    }

    {
        let mut timer = state
            .timer
            .lock()
            .map_err(|_| "timer state is unavailable".to_string())?;
        if interval_changed {
            timer.set_reminder_interval(settings.reminder_interval_minutes, now_ms());
        }
        if requested_idle_threshold.is_some() {
            timer.set_idle_threshold(settings.idle_threshold_minutes);
        }
        if requested_microbreak {
            timer.configure_microbreak(
                settings.microbreak_enabled,
                settings.microbreak_interval_minutes,
                now_ms(),
            );
        }
    }

    if let Some(enabled) = requested_login_setting {
        apply_autostart(&app, enabled)?;
    }
    Ok(settings)
}

#[tauri::command]
fn get_timer_status(state: State<'_, AppState>) -> Result<TimerStatus, String> {
    let busy = state
        .popup
        .lock()
        .map_err(|_| "popup state is unavailable".to_string())?
        .is_busy();
    state
        .timer
        .lock()
        .map(|timer| timer.status(now_ms(), busy))
        .map_err(|_| "timer state is unavailable".to_string())
}

#[tauri::command]
fn pause_timer(state: State<'_, AppState>, minutes: u64) -> Result<(), String> {
    if ![30, 60, 120].contains(&minutes) {
        return Err("unsupported pause duration".into());
    }
    state
        .timer
        .lock()
        .map_err(|_| "timer state is unavailable".to_string())?
        .pause_for(minutes * 60_000, now_ms());
    Ok(())
}

#[tauri::command]
fn resume_timer(state: State<'_, AppState>) -> Result<(), String> {
    state
        .timer
        .lock()
        .map_err(|_| "timer state is unavailable".to_string())?
        .resume(now_ms());
    Ok(())
}

#[tauri::command]
fn preview_reminder(app: tauri::AppHandle) -> Result<(), String> {
    std::thread::spawn(move || {
        if let Err(error) = reminder::show(&app, true) {
            eprintln!("StandUp could not start the reminder preview: {error}");
        }
    });
    Ok(())
}

#[tauri::command]
fn popup_configuration(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<reminder::PopupConfiguration, String> {
    reminder::configuration(&window, &state)
}

#[tauri::command]
fn popup_ready(app: tauri::AppHandle, window: WebviewWindow) -> Result<(), String> {
    reminder::ready(&app, &window)
}

#[tauri::command]
fn popup_finished(app: tauri::AppHandle, window: WebviewWindow) {
    reminder::finished(&app, &window);
}

#[tauri::command]
fn popup_failed(app: tauri::AppHandle, window: WebviewWindow, message: String) {
    eprintln!("StandUp reminder failed before display: {message}");
    reminder::finished(&app, &window);
}

#[tauri::command]
fn preview_sound(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let configured_sound = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .get()
        .reminder_sound;
    sound::play(&app, configured_sound)
}

#[tauri::command]
fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorOption>, String> {
    reminder::available_monitors(&app)
}

#[tauri::command]
fn popup_cursor(window: WebviewWindow) -> Result<reminder::CursorSample, String> {
    reminder::cursor_sample(&window)
}

#[tauri::command]
fn pause_until_timer(state: State<'_, AppState>, mode: String) -> Result<u64, String> {
    pause_until_mode(&state, &mode)
}

fn pause_until_mode(state: &AppState, mode: &str) -> Result<u64, String> {
    use chrono::{Datelike, Local, TimeZone};
    let now = Local::now();
    let deadline = match mode {
        "tomorrow" => {
            let tomorrow = now
                .date_naive()
                .succ_opt()
                .ok_or("could not calculate tomorrow")?;
            Local
                .with_ymd_and_hms(tomorrow.year(), tomorrow.month(), tomorrow.day(), 8, 0, 0)
                .single()
                .ok_or("could not calculate tomorrow morning")?
        }
        "next-schedule" => {
            let settings = state
                .settings
                .lock()
                .map_err(|_| "settings state is unavailable".to_string())?
                .get();
            if !settings.schedule_enabled {
                return Err("Enable Weekly Schedule before pausing until the next period".into());
            }
            let minutes = schedule::minutes_until_next_active_period(&settings)
                .ok_or("no upcoming active schedule was found")?;
            now + chrono::Duration::minutes(i64::from(minutes))
        }
        _ => return Err("unsupported pause deadline".into()),
    };
    let deadline_ms = deadline.timestamp_millis().max(0) as u64;
    state
        .timer
        .lock()
        .map_err(|_| "timer state is unavailable".to_string())?
        .pause_until(deadline_ms, now_ms());
    Ok(deadline_ms)
}

#[tauri::command]
fn popup_capture(
    window: WebviewWindow,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    reminder::set_cursor_capture(&window, &state, enabled)
}

#[tauri::command]
fn popup_interaction(
    window: WebviewWindow,
    state: State<'_, AppState>,
    active: bool,
) -> Result<(), String> {
    reminder::set_interacting(&window, &state, active)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(shortcuts::plugin())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            get_timer_status,
            pause_timer,
            pause_until_timer,
            resume_timer,
            preview_reminder,
            popup_configuration,
            popup_cursor,
            popup_capture,
            popup_interaction,
            popup_ready,
            popup_finished,
            popup_failed,
            preview_sound,
            list_monitors,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_data_directory = app.path().app_data_dir()?;
            let settings_path = app_data_directory.join("settings.json");
            let store = SettingsStore::load(settings_path);
            let initial_settings = store.get();
            let launch_at_login = initial_settings.launch_at_login;
            let show_onboarding = !initial_settings.onboarding_completed;
            app.manage(AppState::new(store));

            #[cfg(target_os = "windows")]
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("settings"),
                app.default_window_icon(),
            ) {
                window.set_icon(icon.clone())?;
            }

            tray::create(app)?;
            if let Err(error) = shortcuts::register_configured(app.handle(), &initial_settings) {
                eprintln!("StandUp could not restore a global shortcut: {error}");
            }
            apply_autostart(app.handle(), launch_at_login).map_err(std::io::Error::other)?;
            start_timer(app.handle().clone());
            if show_onboarding {
                if let Some(window) = app.get_webview_window("settings") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("StandUp could not start");
}

fn start_timer(app: tauri::AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));
        let idle_seconds = system_idle_time::get_idle_time()
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        let state = app.state::<AppState>();
        let popup_busy = state
            .popup
            .lock()
            .map(|lifecycle| lifecycle.is_busy())
            .unwrap_or(true);
        let settings = state
            .settings
            .lock()
            .map(|store| store.get())
            .unwrap_or_default();
        let (fullscreen_blocked, schedule_blocked) = (
            settings.suppress_during_fullscreen && fullscreen::foreground_app_is_fullscreen(),
            !schedule::is_active_now(&settings),
        );
        if let Ok(mut wellness) = state.wellness.lock() {
            wellness.tick(now_ms(), idle_seconds, settings.break_check_enabled);
        }
        let show_celebration = state
            .wellness
            .lock()
            .map(|mut wellness| wellness.take_celebration(popup_busy))
            .unwrap_or(false);
        if show_celebration {
            let _ = reminder::show_kind(&app, reminder::ReminderPurpose::Celebration);
            continue;
        }
        let decision = state
            .timer
            .lock()
            .map(|mut timer| {
                timer.tick(TickInput {
                    now_ms: now_ms(),
                    idle_seconds,
                    blacklisted: false,
                    popup_visible: popup_busy,
                    system_blocked: fullscreen_blocked,
                    schedule_blocked,
                    peek_enabled: settings.peek_enabled,
                })
            })
            .unwrap_or(TimerDecision::None);

        let purpose = match decision {
            TimerDecision::None => None,
            TimerDecision::Peek => Some(reminder::ReminderPurpose::Peek),
            TimerDecision::Microbreak => Some(reminder::ReminderPurpose::Microbreak),
            TimerDecision::Stand => Some(reminder::ReminderPurpose::Stand),
        };
        if let Some(purpose) = purpose {
            let _ = reminder::show_kind(&app, purpose);
        }
    });
}

fn apply_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())
    } else {
        manager.disable().map_err(|error| error.to_string())
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
