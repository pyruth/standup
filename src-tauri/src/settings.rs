use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use thiserror::Error;

pub const REMINDER_INTERVALS: [u16; 6] = [15, 30, 45, 60, 90, 120];
pub const IDLE_THRESHOLDS: [u16; 5] = [1, 2, 3, 5, 10];

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReminderPosition {
    TopLeft,
    TopCenter,
    TopRight,
    MiddleLeft,
    Center,
    MiddleRight,
    BottomLeft,
    BottomCenter,
    #[default]
    BottomRight,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReminderSound {
    #[default]
    Off,
    SystemBeep,
    SoftChime,
    GentleChime,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlacklistedApp {
    pub id: String,
    pub name: String,
    pub path: String,
    pub normalized_path: String,
    pub platform: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub reminder_interval_minutes: u16,
    pub idle_threshold_minutes: u16,
    pub launch_at_login: bool,
    pub blacklisted_apps: Vec<BlacklistedApp>,
    pub reminder_position: ReminderPosition,
    pub reminder_sound: ReminderSound,
    pub selected_monitor: String,
    pub use_custom_animation: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            reminder_interval_minutes: 45,
            idle_threshold_minutes: 3,
            launch_at_login: true,
            blacklisted_apps: Vec::new(),
            reminder_position: ReminderPosition::BottomRight,
            reminder_sound: ReminderSound::Off,
            selected_monitor: "primary".into(),
            use_custom_animation: false,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub reminder_interval_minutes: Option<u16>,
    pub idle_threshold_minutes: Option<u16>,
    pub launch_at_login: Option<bool>,
    pub reminder_position: Option<ReminderPosition>,
    pub reminder_sound: Option<ReminderSound>,
    pub selected_monitor: Option<String>,
}

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("the reminder interval is not supported")]
    InvalidReminderInterval,
    #[error("the idle threshold is not supported")]
    InvalidIdleThreshold,
    #[error("the selected monitor identifier is invalid")]
    InvalidMonitor,
    #[error("could not store settings: {0}")]
    Io(#[from] std::io::Error),
    #[error("could not serialize settings: {0}")]
    Json(#[from] serde_json::Error),
}

pub struct SettingsStore {
    path: PathBuf,
    settings: Settings,
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let settings = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Settings>(&bytes).ok())
            .filter(Settings::is_valid)
            .unwrap_or_default();

        Self { path, settings }
    }

    pub fn get(&self) -> Settings {
        self.settings.clone()
    }

    pub fn update(&mut self, patch: SettingsPatch) -> Result<(Settings, bool), SettingsError> {
        let mut next = self.settings.clone();
        let mut interval_changed = false;

        if let Some(value) = patch.reminder_interval_minutes {
            if !REMINDER_INTERVALS.contains(&value) {
                return Err(SettingsError::InvalidReminderInterval);
            }
            interval_changed = value != next.reminder_interval_minutes;
            next.reminder_interval_minutes = value;
        }

        if let Some(value) = patch.idle_threshold_minutes {
            if !IDLE_THRESHOLDS.contains(&value) {
                return Err(SettingsError::InvalidIdleThreshold);
            }
            next.idle_threshold_minutes = value;
        }

        if let Some(value) = patch.launch_at_login {
            next.launch_at_login = value;
        }
        if let Some(value) = patch.reminder_position {
            next.reminder_position = value;
        }
        if let Some(value) = patch.reminder_sound {
            next.reminder_sound = value;
        }
        if let Some(value) = patch.selected_monitor {
            if !valid_monitor_id(&value) {
                return Err(SettingsError::InvalidMonitor);
            }
            next.selected_monitor = value;
        }

        self.save(&next)?;
        self.settings = next.clone();
        Ok((next, interval_changed))
    }

    pub fn use_default_animation(&mut self) -> Result<Settings, SettingsError> {
        let mut next = self.settings.clone();
        next.use_custom_animation = false;
        self.save(&next)?;
        self.settings = next.clone();
        Ok(next)
    }

    pub fn use_custom_animation(&mut self) -> Result<Settings, SettingsError> {
        let mut next = self.settings.clone();
        next.use_custom_animation = true;
        self.save(&next)?;
        self.settings = next.clone();
        Ok(next)
    }

    fn save(&self, settings: &Settings) -> Result<(), SettingsError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }

        let bytes = serde_json::to_vec_pretty(settings)?;
        let temporary_path = temporary_path(&self.path);
        fs::write(&temporary_path, bytes)?;

        if self.path.exists() {
            fs::remove_file(&self.path)?;
        }
        fs::rename(temporary_path, &self.path)?;
        Ok(())
    }
}

impl Settings {
    fn is_valid(&self) -> bool {
        REMINDER_INTERVALS.contains(&self.reminder_interval_minutes)
            && IDLE_THRESHOLDS.contains(&self.idle_threshold_minutes)
            && valid_monitor_id(&self.selected_monitor)
    }
}

fn valid_monitor_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control)
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_the_product_specification() {
        let settings = Settings::default();
        assert_eq!(settings.reminder_interval_minutes, 45);
        assert_eq!(settings.idle_threshold_minutes, 3);
        assert!(settings.launch_at_login);
        assert_eq!(settings.reminder_position, ReminderPosition::BottomRight);
        assert_eq!(settings.reminder_sound, ReminderSound::Off);
        assert_eq!(settings.selected_monitor, "primary");
        assert!(!settings.use_custom_animation);
    }

    #[test]
    fn rejects_unsupported_intervals_before_writing() {
        let mut store = SettingsStore {
            path: PathBuf::from("unused.json"),
            settings: Settings::default(),
        };
        let result = store.update(SettingsPatch {
            reminder_interval_minutes: Some(20),
            ..SettingsPatch::default()
        });
        assert!(matches!(
            result,
            Err(SettingsError::InvalidReminderInterval)
        ));
    }
}
