mod custom_animation;
mod reminder;
mod settings;
mod sound;
mod state;
mod timer;
mod tray;

use crate::{
    reminder::MonitorOption,
    settings::{Settings, SettingsPatch, SettingsStore},
    state::AppState,
    timer::{TickInput, TimerStatus},
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
    let (settings, interval_changed) = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .update(patch)
        .map_err(|error| error.to_string())?;

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
    if ![30, 60].contains(&minutes) {
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
async fn choose_custom_animation(app: tauri::AppHandle) -> Result<Option<Settings>, String> {
    custom_animation::choose_and_import(app).await
}

#[tauri::command]
fn popup_cursor(window: WebviewWindow) -> Result<reminder::CursorSample, String> {
    reminder::cursor_sample(&window)
}

#[tauri::command]
fn reset_custom_animation(app: tauri::AppHandle) -> Result<Settings, String> {
    custom_animation::reset(&app)
}

pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("standup-animation", |context, request| {
            custom_animation::protocol_response(context, request)
        })
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
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            get_timer_status,
            pause_timer,
            resume_timer,
            preview_reminder,
            popup_configuration,
            popup_cursor,
            popup_ready,
            popup_finished,
            popup_failed,
            preview_sound,
            list_monitors,
            choose_custom_animation,
            reset_custom_animation
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let app_data_directory = app.path().app_data_dir()?;
            let settings_path = app_data_directory.join("settings.json");
            let custom_gif_path = app_data_directory.join("custom-animation.gif");
            let custom_lottie_path = app_data_directory.join("custom-animation.json");
            let mut store = SettingsStore::load(settings_path);
            let loaded_settings = store.get();
            if !custom_animation::stored_file_is_valid(
                &loaded_settings,
                &custom_gif_path,
                &custom_lottie_path,
            ) {
                store
                    .use_default_animation()
                    .map_err(|error| std::io::Error::other(error.to_string()))?;
            }
            let launch_at_login = store.get().launch_at_login;
            app.manage(AppState::new(store, custom_gif_path, custom_lottie_path));

            tray::create(app)?;
            apply_autostart(app.handle(), launch_at_login).map_err(std::io::Error::other)?;
            start_timer(app.handle().clone());
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
        let should_show = state
            .timer
            .lock()
            .map(|mut timer| {
                timer.tick(TickInput {
                    now_ms: now_ms(),
                    idle_seconds,
                    blacklisted: false,
                    popup_visible: popup_busy,
                    system_blocked: false,
                })
            })
            .unwrap_or(false);

        if should_show {
            let _ = reminder::show(&app, false);
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
