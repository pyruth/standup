use crate::{reminder, settings::Settings, state::AppState};
use std::str::FromStr;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShortcutAction {
    TogglePause,
    Preview,
    Snooze,
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let settings = app
                .state::<AppState>()
                .settings
                .lock()
                .map(|store| store.get())
                .ok();
            let Some(settings) = settings else {
                return;
            };
            let action = shortcut_pairs(&settings)
                .into_iter()
                .find_map(|(text, action)| {
                    Shortcut::from_str(text)
                        .ok()
                        .filter(|candidate| candidate == shortcut)
                        .map(|_| action)
                });
            match action {
                Some(ShortcutAction::TogglePause) => toggle_pause(app),
                Some(ShortcutAction::Preview) => {
                    let _ = reminder::show(app, true);
                }
                Some(ShortcutAction::Snooze) => pause_for(app, 30),
                None => {}
            }
        })
        .build()
}

pub fn register_configured(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let shortcuts = parse(settings)?;
    if shortcuts.is_empty() {
        return Ok(());
    }
    app.global_shortcut()
        .register_multiple(shortcuts)
        .map_err(|error| friendly_error(error.to_string()))
}

pub fn reconfigure(app: &AppHandle, previous: &Settings, next: &Settings) -> Result<(), String> {
    let next_shortcuts = parse(next)?;
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;
    if let Err(error) = app.global_shortcut().register_multiple(next_shortcuts) {
        let _ = app.global_shortcut().unregister_all();
        let _ = register_configured(app, previous);
        return Err(friendly_error(error.to_string()));
    }
    Ok(())
}

fn parse(settings: &Settings) -> Result<Vec<Shortcut>, String> {
    shortcut_pairs(settings).into_iter().filter_map(|(value, _)| {
        (!value.trim().is_empty()).then(|| Shortcut::from_str(value).map_err(|_| {
            format!("‘{value}’ is not a valid shortcut. Include a modifier and a key, for example Ctrl+Shift+P.")
        }))
    }).collect()
}

fn shortcut_pairs(settings: &Settings) -> [(&str, ShortcutAction); 3] {
    [
        (&settings.shortcut_toggle_pause, ShortcutAction::TogglePause),
        (&settings.shortcut_preview, ShortcutAction::Preview),
        (&settings.shortcut_snooze, ShortcutAction::Snooze),
    ]
}

fn toggle_pause(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(mut timer) = state.timer.lock() {
        let now = now_ms();
        if timer.status(now, false).is_paused {
            timer.resume(now);
        } else {
            timer.pause_for(30 * 60_000, now);
        }
    };
}

fn pause_for(app: &AppHandle, minutes: u64) {
    if let Ok(mut timer) = app.state::<AppState>().timer.lock() {
        timer.pause_for(minutes * 60_000, now_ms());
    };
}

fn friendly_error(error: String) -> String {
    format!("That keyboard shortcut could not be registered. It may already be used by another app. {error}")
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
    fn empty_shortcuts_are_valid_and_configured_shortcuts_parse() {
        let mut settings = Settings::default();
        assert!(parse(&settings).unwrap().is_empty());
        settings.shortcut_preview = "Ctrl+Shift+P".into();
        assert_eq!(parse(&settings).unwrap().len(), 1);
        settings.shortcut_snooze = "not a shortcut".into();
        assert!(parse(&settings).is_err());
    }
}
