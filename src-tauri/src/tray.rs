use crate::{reminder, state::AppState};
use std::{
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    App, Manager,
};

pub fn create(app: &App) -> tauri::Result<()> {
    let status = MenuItem::with_id(
        app,
        "status",
        status_label(app.handle()),
        false,
        None::<&str>,
    )?;
    let menu = MenuBuilder::new(app)
        .item(&status)
        .separator()
        .text("pause-30", "Pause for 30 minutes")
        .text("pause-60", "Pause for 1 hour")
        .text("resume", "Resume")
        .separator()
        .text("preview", "Preview Reminder")
        .text("settings", "Settings...")
        .separator()
        .text("quit", "Quit StandUp")
        .build()?;

    let status_for_events = status.clone();
    let mut builder = TrayIconBuilder::with_id("standup-tray")
        .tooltip("StandUp")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "pause-30" => pause(app, 30),
                "pause-60" => pause(app, 60),
                "resume" => {
                    if let Ok(mut timer) = app.state::<AppState>().timer.lock() {
                        timer.resume(now_ms());
                    }
                }
                "preview" => {
                    let _ = reminder::show(app, true);
                }
                "settings" => show_settings(app),
                "quit" => {
                    app.exit(0);
                    return;
                }
                _ => {}
            }
            let _ = status_for_events.set_text(status_label(app));
        });

    #[cfg(target_os = "macos")]
    {
        let icon =
            tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon-template@2x.png"))?;
        builder = builder.icon(icon).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
    }

    builder.build(app)?;
    start_status_updates(app.handle().clone(), status);
    Ok(())
}

fn start_status_updates(app: tauri::AppHandle, status: MenuItem<tauri::Wry>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(5));
        let _ = status.set_text(status_label(&app));
    });
}

fn status_label(app: &tauri::AppHandle) -> String {
    let state = app.state::<AppState>();
    let (popup_busy, popup_visible) = state
        .popup
        .lock()
        .map(|lifecycle| (lifecycle.is_busy(), lifecycle.is_visible()))
        .unwrap_or((true, false));
    if popup_busy {
        return if popup_visible {
            "Reminder is showing".into()
        } else {
            "Reminder is preparing".into()
        };
    }
    let Ok(timer) = state.timer.lock() else {
        return "StandUp timer unavailable".into();
    };
    let status = timer.status(now_ms(), false);
    if status.reminder_pending {
        return "Reminder due - waiting for a suitable moment".into();
    }
    if status.is_paused {
        let remaining = status
            .pause_until
            .unwrap_or_default()
            .saturating_sub(now_ms());
        return format!("Paused - {}", format_duration(remaining));
    }
    format!(
        "Next reminder - {}",
        format_duration(status.remaining_milliseconds)
    )
}

fn format_duration(milliseconds: u64) -> String {
    if milliseconds == 0 {
        return "due now".into();
    }
    let total_minutes = milliseconds.div_ceil(60_000);
    if total_minutes < 60 {
        return format!(
            "{} {}",
            total_minutes,
            if total_minutes == 1 {
                "minute"
            } else {
                "minutes"
            }
        );
    }
    let hours = total_minutes / 60;
    let minutes = total_minutes % 60;
    if minutes == 0 {
        format!("{} {}", hours, if hours == 1 { "hour" } else { "hours" })
    } else {
        format!("{hours}h {minutes}m")
    }
}

fn pause(app: &tauri::AppHandle, minutes: u64) {
    if let Ok(mut timer) = app.state::<AppState>().timer.lock() {
        timer.pause_for(minutes * 60_000, now_ms());
    }
}

fn show_settings(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_tray_durations_for_minutes_and_hours() {
        assert_eq!(format_duration(1), "1 minute");
        assert_eq!(format_duration(45 * 60_000), "45 minutes");
        assert_eq!(format_duration(60 * 60_000), "1 hour");
        assert_eq!(format_duration(90 * 60_000), "1h 30m");
    }
}
