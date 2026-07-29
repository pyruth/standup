use crate::{reminder, state::AppState};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    App, Manager,
};

pub fn create(app: &App) -> tauri::Result<()> {
    let status = MenuItem::with_id(
        app,
        "status",
        "StandUp is active",
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
        .text("settings", "Settings…")
        .separator()
        .text("quit", "Quit StandUp")
        .build()?;

    let mut builder = TrayIconBuilder::with_id("standup-tray")
        .tooltip("StandUp")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
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
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }

    builder.build(app)?;
    Ok(())
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
