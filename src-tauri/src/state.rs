use crate::{
    reminder::PopupLifecycle, settings::SettingsStore, timer::TimerEngine, wellness::WellnessState,
};
use std::sync::{atomic::AtomicBool, Mutex};

pub struct AppState {
    pub settings: Mutex<SettingsStore>,
    pub timer: Mutex<TimerEngine>,
    pub popup: Mutex<PopupLifecycle>,
    pub wellness: Mutex<WellnessState>,
    pub sound_playing: AtomicBool,
}

impl AppState {
    pub fn new(settings: SettingsStore) -> Self {
        let current = settings.get();
        Self {
            timer: Mutex::new(TimerEngine::new(
                current.reminder_interval_minutes,
                current.idle_threshold_minutes,
                current.microbreak_enabled,
                current.microbreak_interval_minutes,
            )),
            settings: Mutex::new(settings),
            popup: Mutex::new(PopupLifecycle::default()),
            wellness: Mutex::new(WellnessState::default()),
            sound_playing: AtomicBool::new(false),
        }
    }
}
