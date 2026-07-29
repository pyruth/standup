use crate::{settings::SettingsStore, timer::TimerEngine};
use std::sync::{
    atomic::AtomicBool,
    Mutex,
};

pub struct AppState {
    pub settings: Mutex<SettingsStore>,
    pub timer: Mutex<TimerEngine>,
    pub popup_visible: AtomicBool,
}

impl AppState {
    pub fn new(settings: SettingsStore) -> Self {
        let current = settings.get();
        Self {
            timer: Mutex::new(TimerEngine::new(
                current.reminder_interval_minutes,
                current.idle_threshold_minutes,
            )),
            settings: Mutex::new(settings),
            popup_visible: AtomicBool::new(false),
        }
    }
}
