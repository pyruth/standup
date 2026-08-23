use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use thiserror::Error;

pub const REMINDER_INTERVALS: [u16; 6] = [15, 30, 45, 60, 90, 120];
pub const IDLE_THRESHOLDS: [u16; 5] = [1, 2, 3, 5, 10];
pub const MICROBREAK_INTERVALS: [u16; 4] = [10, 15, 20, 30];

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

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReminderVisual {
    #[default]
    Mello,
    OriginalGif,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AppearanceTheme {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MelloMotionStyle {
    Calm,
    #[default]
    Playful,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MelloBoardColor {
    #[default]
    Cream,
    Lavender,
    Mint,
    Peach,
    Sunshine,
    Slate,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MelloColor {
    #[default]
    Periwinkle,
    Mint,
    Coral,
    Apricot,
    Blueberry,
    Grape,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum ScheduleDay {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum MoveCategory {
    Mobility,
    Eyes,
    Hydration,
    Walk,
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
    pub reminder_visual: ReminderVisual,
    pub appearance_theme: AppearanceTheme,
    pub mello_motion_style: MelloMotionStyle,
    pub mello_reacts_to_pointer: bool,
    pub mello_keep_same_color: bool,
    pub mello_color: MelloColor,
    pub reminder_message: String,
    pub mello_board_color: MelloBoardColor,
    pub follow_system_reduced_motion: bool,
    pub suppress_during_fullscreen: bool,
    pub schedule_enabled: bool,
    pub schedule_active_days: Vec<ScheduleDay>,
    pub schedule_start_minutes: u16,
    pub schedule_end_minutes: u16,
    pub break_check_enabled: bool,
    pub mello_moves_enabled: bool,
    pub mello_move_categories: Vec<MoveCategory>,
    pub peek_enabled: bool,
    pub microbreak_enabled: bool,
    pub microbreak_interval_minutes: u16,
    pub session_mood_enabled: bool,
    pub shortcut_toggle_pause: String,
    pub shortcut_preview: String,
    pub shortcut_snooze: String,
    pub onboarding_completed: bool,
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
            reminder_visual: ReminderVisual::Mello,
            appearance_theme: AppearanceTheme::System,
            mello_motion_style: MelloMotionStyle::Playful,
            mello_reacts_to_pointer: true,
            mello_keep_same_color: true,
            mello_color: MelloColor::Periwinkle,
            reminder_message: "Stand up\nmove a little".into(),
            mello_board_color: MelloBoardColor::Cream,
            follow_system_reduced_motion: true,
            suppress_during_fullscreen: true,
            schedule_enabled: false,
            schedule_active_days: vec![
                ScheduleDay::Monday,
                ScheduleDay::Tuesday,
                ScheduleDay::Wednesday,
                ScheduleDay::Thursday,
                ScheduleDay::Friday,
            ],
            schedule_start_minutes: 9 * 60,
            schedule_end_minutes: 18 * 60,
            break_check_enabled: true,
            mello_moves_enabled: true,
            mello_move_categories: vec![
                MoveCategory::Mobility,
                MoveCategory::Eyes,
                MoveCategory::Hydration,
                MoveCategory::Walk,
            ],
            peek_enabled: true,
            microbreak_enabled: false,
            microbreak_interval_minutes: 20,
            session_mood_enabled: true,
            shortcut_toggle_pause: String::new(),
            shortcut_preview: String::new(),
            shortcut_snooze: String::new(),
            onboarding_completed: false,
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
    pub reminder_visual: Option<ReminderVisual>,
    pub appearance_theme: Option<AppearanceTheme>,
    pub mello_motion_style: Option<MelloMotionStyle>,
    pub mello_reacts_to_pointer: Option<bool>,
    pub mello_keep_same_color: Option<bool>,
    pub mello_color: Option<MelloColor>,
    pub reminder_message: Option<String>,
    pub mello_board_color: Option<MelloBoardColor>,
    pub follow_system_reduced_motion: Option<bool>,
    pub suppress_during_fullscreen: Option<bool>,
    pub schedule_enabled: Option<bool>,
    pub schedule_active_days: Option<Vec<ScheduleDay>>,
    pub schedule_start_minutes: Option<u16>,
    pub schedule_end_minutes: Option<u16>,
    pub break_check_enabled: Option<bool>,
    pub mello_moves_enabled: Option<bool>,
    pub mello_move_categories: Option<Vec<MoveCategory>>,
    pub peek_enabled: Option<bool>,
    pub microbreak_enabled: Option<bool>,
    pub microbreak_interval_minutes: Option<u16>,
    pub session_mood_enabled: Option<bool>,
    pub shortcut_toggle_pause: Option<String>,
    pub shortcut_preview: Option<String>,
    pub shortcut_snooze: Option<String>,
    pub onboarding_completed: Option<bool>,
}

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("the reminder interval is not supported")]
    InvalidReminderInterval,
    #[error("the idle threshold is not supported")]
    InvalidIdleThreshold,
    #[error("the selected monitor identifier is invalid")]
    InvalidMonitor,
    #[error("the reminder message must contain 1 to 25 characters and at most two lines")]
    InvalidReminderMessage,
    #[error("the weekly schedule is invalid")]
    InvalidSchedule,
    #[error("the microbreak interval is not supported")]
    InvalidMicrobreakInterval,
    #[error("at least one Mello Moves category must be selected")]
    InvalidMoveCategories,
    #[error("a keyboard shortcut is invalid or duplicates another action")]
    InvalidShortcut,
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
        if let Some(value) = patch.reminder_visual {
            next.reminder_visual = value;
        }
        if let Some(value) = patch.appearance_theme {
            next.appearance_theme = value;
        }
        if let Some(value) = patch.mello_motion_style {
            next.mello_motion_style = value;
        }
        if let Some(value) = patch.mello_reacts_to_pointer {
            next.mello_reacts_to_pointer = value;
        }
        if let Some(value) = patch.mello_keep_same_color {
            next.mello_keep_same_color = value;
        }
        if let Some(value) = patch.mello_color {
            next.mello_color = value;
        }
        if let Some(value) = patch.reminder_message {
            if !valid_reminder_message(&value) {
                return Err(SettingsError::InvalidReminderMessage);
            }
            next.reminder_message = value;
        }
        if let Some(value) = patch.mello_board_color {
            next.mello_board_color = value;
        }
        if let Some(value) = patch.follow_system_reduced_motion {
            next.follow_system_reduced_motion = value;
        }
        if let Some(value) = patch.suppress_during_fullscreen {
            next.suppress_during_fullscreen = value;
        }
        if let Some(value) = patch.schedule_enabled {
            next.schedule_enabled = value;
        }
        if let Some(value) = patch.schedule_active_days {
            next.schedule_active_days = value;
        }
        if let Some(value) = patch.schedule_start_minutes {
            next.schedule_start_minutes = value;
        }
        if let Some(value) = patch.schedule_end_minutes {
            next.schedule_end_minutes = value;
        }
        if let Some(value) = patch.break_check_enabled {
            next.break_check_enabled = value;
        }
        if let Some(value) = patch.mello_moves_enabled {
            next.mello_moves_enabled = value;
        }
        if let Some(value) = patch.mello_move_categories {
            next.mello_move_categories = value;
        }
        if let Some(value) = patch.peek_enabled {
            next.peek_enabled = value;
        }
        if let Some(value) = patch.microbreak_enabled {
            next.microbreak_enabled = value;
        }
        if let Some(value) = patch.microbreak_interval_minutes {
            if !MICROBREAK_INTERVALS.contains(&value) {
                return Err(SettingsError::InvalidMicrobreakInterval);
            }
            next.microbreak_interval_minutes = value;
        }
        if let Some(value) = patch.session_mood_enabled {
            next.session_mood_enabled = value;
        }
        if let Some(value) = patch.shortcut_toggle_pause {
            next.shortcut_toggle_pause = value.trim().to_string();
        }
        if let Some(value) = patch.shortcut_preview {
            next.shortcut_preview = value.trim().to_string();
        }
        if let Some(value) = patch.shortcut_snooze {
            next.shortcut_snooze = value.trim().to_string();
        }
        if let Some(value) = patch.onboarding_completed {
            next.onboarding_completed = value;
        }

        if !valid_schedule(&next) {
            return Err(SettingsError::InvalidSchedule);
        }
        if next.mello_move_categories.is_empty() {
            return Err(SettingsError::InvalidMoveCategories);
        }
        if !MICROBREAK_INTERVALS.contains(&next.microbreak_interval_minutes) {
            return Err(SettingsError::InvalidMicrobreakInterval);
        }
        if !valid_shortcuts(&next) {
            return Err(SettingsError::InvalidShortcut);
        }

        self.save(&next)?;
        self.settings = next.clone();
        Ok((next, interval_changed))
    }

    pub fn restore(&mut self, settings: Settings) -> Result<(), SettingsError> {
        self.save(&settings)?;
        self.settings = settings;
        Ok(())
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
            && valid_reminder_message(&self.reminder_message)
            && valid_schedule(self)
            && !self.mello_move_categories.is_empty()
            && MICROBREAK_INTERVALS.contains(&self.microbreak_interval_minutes)
            && valid_shortcuts(self)
    }
}

fn valid_monitor_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control)
}

fn valid_reminder_message(value: &str) -> bool {
    let character_count = value.chars().count();
    (1..=25).contains(&character_count)
        && value.lines().count() <= 2
        && !value
            .chars()
            .any(|character| character.is_control() && character != '\n')
}

fn valid_schedule(settings: &Settings) -> bool {
    if settings.schedule_active_days.is_empty()
        || settings.schedule_start_minutes >= 24 * 60
        || settings.schedule_end_minutes >= 24 * 60
        || settings.schedule_start_minutes == settings.schedule_end_minutes
    {
        return false;
    }
    let unique = settings
        .schedule_active_days
        .iter()
        .copied()
        .collect::<std::collections::HashSet<_>>();
    unique.len() == settings.schedule_active_days.len()
}

fn valid_shortcuts(settings: &Settings) -> bool {
    let values = [
        settings.shortcut_toggle_pause.trim(),
        settings.shortcut_preview.trim(),
        settings.shortcut_snooze.trim(),
    ];
    if values
        .iter()
        .any(|value| value.len() > 64 || value.chars().any(char::is_control))
    {
        return false;
    }
    let nonempty = values
        .into_iter()
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>();
    let unique = nonempty.iter().collect::<std::collections::HashSet<_>>();
    unique.len() == nonempty.len()
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
        assert_eq!(settings.reminder_visual, ReminderVisual::Mello);
        assert_eq!(settings.appearance_theme, AppearanceTheme::System);
        assert_eq!(settings.mello_motion_style, MelloMotionStyle::Playful);
        assert!(settings.mello_reacts_to_pointer);
        assert!(settings.mello_keep_same_color);
        assert_eq!(settings.mello_color, MelloColor::Periwinkle);
        assert_eq!(settings.reminder_message, "Stand up\nmove a little");
        assert_eq!(settings.mello_board_color, MelloBoardColor::Cream);
        assert!(settings.follow_system_reduced_motion);
        assert!(settings.suppress_during_fullscreen);
        assert!(!settings.schedule_enabled);
        assert_eq!(settings.schedule_start_minutes, 540);
        assert_eq!(settings.schedule_end_minutes, 1080);
        assert_eq!(settings.schedule_active_days.len(), 5);
        assert!(settings.break_check_enabled);
        assert!(settings.mello_moves_enabled);
        assert_eq!(settings.mello_move_categories.len(), 4);
        assert!(settings.peek_enabled);
        assert!(!settings.microbreak_enabled);
        assert_eq!(settings.microbreak_interval_minutes, 20);
        assert!(settings.session_mood_enabled);
        assert!(!settings.onboarding_completed);
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

    #[test]
    fn validates_custom_reminder_message_length_and_lines() {
        assert!(valid_reminder_message("Stand up\nmove a little"));
        assert!(valid_reminder_message("Stretch now"));
        assert!(!valid_reminder_message(""));
        assert!(!valid_reminder_message("This reminder message is too long"));
        assert!(!valid_reminder_message("one\ntwo\nthree"));
    }

    #[test]
    fn rejects_empty_duplicate_and_zero_length_schedules() {
        let mut settings = Settings::default();
        settings.schedule_active_days.clear();
        assert!(!valid_schedule(&settings));
        settings.schedule_active_days = vec![ScheduleDay::Monday, ScheduleDay::Monday];
        assert!(!valid_schedule(&settings));
        settings.schedule_active_days = vec![ScheduleDay::Monday];
        settings.schedule_end_minutes = settings.schedule_start_minutes;
        assert!(!valid_schedule(&settings));
    }

    #[test]
    fn rejects_duplicate_shortcuts_and_invalid_microbreak_intervals() {
        let mut settings = Settings::default();
        settings.shortcut_preview = "Ctrl+Shift+P".into();
        settings.shortcut_snooze = "ctrl+shift+p".into();
        assert!(!valid_shortcuts(&settings));
        settings.shortcut_snooze.clear();
        assert!(valid_shortcuts(&settings));
        settings.microbreak_interval_minutes = 12;
        assert!(!settings.is_valid());
    }

    #[test]
    fn older_settings_files_receive_the_new_defaults() {
        let json = r#"{
          "reminderIntervalMinutes":45,
          "idleThresholdMinutes":3,
          "launchAtLogin":true,
          "selectedMonitor":"primary",
          "reminderMessage":"Stand up",
          "scheduleActiveDays":["monday"],
          "scheduleStartMinutes":540,
          "scheduleEndMinutes":1080
        }"#;
        let settings: Settings = serde_json::from_str(json).unwrap();
        assert!(settings.break_check_enabled);
        assert!(settings.peek_enabled);
        assert_eq!(settings.microbreak_interval_minutes, 20);
        assert_eq!(settings.mello_move_categories.len(), 4);
    }
}
